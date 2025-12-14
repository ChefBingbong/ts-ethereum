#!/usr/bin/env node

/**
 * Simple Two-Node Network Test
 *
 * Automatically starts:
 * - Node 0: Bootnode (non-miner) on port 8000
 * - Node 1: Miner on port 8001, connects to Node 0
 *
 * Includes verbose logging for debugging
 */

import debug from "debug";
import { createBlockchain } from "../../blockchain/constructors";
import { Config } from "../../client/config";
import { EthereumClient } from "../../client/index";
import { FullEthereumService } from "../../client/service/fullethereumservice";
import { getGenesis } from "../../genesis";
import { bytesToHex, MapDB } from "../../utils";

// Enable verbose logging
debug.enable("*");
process.env.DEBUG = "*";

interface TestNode {
	name: string;
	port: number;
	rpcPort: number;
	client: EthereumClient | null;
	mining: boolean;
}

const nodes: TestNode[] = [
	{ name: "Bootnode", port: 8000, rpcPort: 8545, client: null, mining: false },
	{ name: "Miner", port: 8001, rpcPort: 8546, client: null, mining: true },
];

function log(nodeName: string, message: string, ...args: any[]) {
	const timestamp = new Date().toISOString().split("T")[1].slice(0, -1);
	console.log(`[${timestamp}] [${nodeName}] ${message}`, ...args);
}

async function startNode(
	node: TestNode,
	bootnodeEnode?: string,
): Promise<EthereumClient> {
	log(node.name, `🚀 Starting ${node.name} on port ${node.port}...`);

	// Create config
	const config = new Config({
		chain: getChain("testnet"),
		common: getChain("testnet"),
		transports: ["rlpx"],
		port: node.port,
		rpcPort: node.rpcPort,
		mining: node.mining,
		accounts: [
			{
				address: "0xfd0bac1e8a12b48eb6d4d0dbc4b1228ef6bba84f",
				privateKey: "0x" + "1".repeat(64),
			},
		],
		chainId: 12345n,
		networkId: 12345n,
		maxPeers: 25,
		discV4: false, // Disable DHT for simplicity
	});

	// Enable verbose logging
	config.logger = {
		debug: (...args: any[]) => log(node.name, "[DEBUG]", ...args),
		info: (...args: any[]) => log(node.name, "[INFO]", ...args),
		warn: (...args: any[]) => log(node.name, "[WARN]", ...args),
		error: (...args: any[]) => log(node.name, "[ERROR]", ...args),
	};

	// Add bootnode if provided
	if (bootnodeEnode) {
		config.bootnodes = [bootnodeEnode];
		log(node.name, `📡 Using bootnode: ${bootnodeEnode}`);
	}

	// Create blockchain
	const chainDB = new MapDB();
	const stateDB = new MapDB();
	const metaDB = new MapDB();

	const genesis = getGenesis("testnet");
	const genesisState = genesis.genesisState;

	const consensusDict = {
		ethash: async () => {
			const { EthashConsensus } = await import(
				"../../blockchain/consensus/ethash"
			);
			return new EthashConsensus();
		},
	};

	const blockchain = await createBlockchain({
		genesisBlock: genesis.genesisBlock,
		chainDB,
		stateDB,
		metaDB,
		hardforkByBlockNumber: true,
		validateBlocks: false, // Skip PoW validation for local testing
		consensusDict,
		genesisState,
	});

	log(
		node.name,
		`⛓️  Genesis block hash: ${bytesToHex(blockchain.genesisBlock.hash())}`,
	);

	// Create client
	const client = await EthereumClient.create({
		config,
		blockchain,
		genesisState,
		chainDB,
		stateDB,
		metaDB,
	});

	await client.open();
	config.updateSynchronizedState(client.chain.headers.latest, true);

	// Ensure txPool is running
	const fullService = client.service as FullEthereumService;
	fullService.txPool?.checkRunState();

	await client.start();

	// Update sync status
	client.config.updateSynchronizedState(client.chain.headers.latest, true);

	// Open execution layer
	await fullService.execution.open();
	await fullService.execution.run(true);

	// Set up event listeners with verbose logging
	config.events.on(Event.PEER_CONNECTED, (peer) => {
		log(
			node.name,
			`🤝 PEER CONNECTED: ${peer.id?.slice(0, 16)}... from ${peer.address}`,
		);
		log(node.name, `   Total peers: ${fullService.pool.size}`);
	});

	config.events.on(Event.PEER_DISCONNECTED, (peer) => {
		log(node.name, `👋 PEER DISCONNECTED: ${peer.id?.slice(0, 16)}...`);
		log(node.name, `   Total peers: ${fullService.pool.size}`);
	});

	config.events.on(Event.PEER_ERROR, (error, peer) => {
		log(
			node.name,
			`❌ PEER ERROR: ${error.message} from ${peer.id?.slice(0, 16)}...`,
		);
	});

	config.events.on(Event.SERVER_ERROR, (error) => {
		log(node.name, `❌ SERVER ERROR: ${error.message}`);
	});

	// Log peer count periodically
	setInterval(() => {
		const peerCount = fullService.pool.size;
		const blockHeight = client.chain.headers.height;
		if (peerCount > 0 || blockHeight > 0) {
			log(
				node.name,
				`📊 Status: ${peerCount} peer(s) connected, block height: ${blockHeight}`,
			);
		}
	}, 10000); // Every 10 seconds

	log(node.name, `✅ ${node.name} started successfully!`);
	log(node.name, `   P2P port: ${node.port}`);
	log(node.name, `   RPC URL: http://127.0.0.1:${node.rpcPort}`);
	log(node.name, `   Mining: ${node.mining ? "YES" : "NO"}`);

	return client;
}

async function main() {
	console.log("╔═══════════════════════════════════════════════════════════╗");
	console.log("║          Simple Two-Node Network Test                     ║");
	console.log(
		"╚═══════════════════════════════════════════════════════════╝\n",
	);

	try {
		// Start bootnode first
		log("SYSTEM", "Starting bootnode (Node 0)...");
		const bootnodeClient = await startNode(nodes[0]);
		nodes[0].client = bootnodeClient;

		// Get bootnode enode
		const bootnodeInfo = bootnodeClient.service.pool.server.getRlpxInfo();
		const bootnodeEnode = bootnodeInfo.enode;
		log("SYSTEM", `Bootnode enode: ${bootnodeEnode}`);

		// Wait a bit for bootnode to be ready
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Start miner and connect to bootnode
		log("SYSTEM", "Starting miner (Node 1)...");
		const minerClient = await startNode(nodes[1], bootnodeEnode);
		nodes[1].client = minerClient;

		log("SYSTEM", "\n✅ Both nodes started successfully!");
		log("SYSTEM", "Press Ctrl+C to stop all nodes\n");

		// Keep running
		process.on("SIGINT", async () => {
			console.log("\n\n🛑 Shutting down nodes...");

			for (const node of nodes) {
				if (node.client) {
					try {
						log(node.name, "Stopping client...");
						await node.client.stop();
						log(node.name, "Client stopped");
					} catch (err: any) {
						log(node.name, `Error stopping: ${err.message}`);
					}
				}
			}

			console.log("✅ All nodes stopped. Goodbye!");
			process.exit(0);
		});

		// Keep process alive
		await new Promise(() => {});
	} catch (error: any) {
		console.error("❌ Fatal error:", error);
		process.exit(1);
	}
}

main().catch(console.error);
