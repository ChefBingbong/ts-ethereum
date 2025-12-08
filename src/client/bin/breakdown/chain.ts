#!/usr/bin/env node

import { multiaddr } from "@multiformats/multiaddr";
import type { AbstractLevel } from "abstract-level";
import { mkdirSync } from "fs";
import { Level } from "level";
import type { ConsensusDict } from "../../../blockchain/index.ts";
import {
	createBlockchain,
	EthashConsensus,
} from "../../../blockchain/index.ts";
import {
	Common,
	ConsensusAlgorithm,
	Hardfork,
} from "../../../chain-config/index.ts";
import { Ethash } from "../../../eth-hash/index.ts";
import { bytesToHex, bytesToUnprefixedHex } from "../../../utils/index.ts";
import { EthereumClient } from "../../client.ts";
import { Config, DataDirectory, SyncMode } from "../../config.ts";
import { LevelDB } from "../../execution/level.ts";
import { getLogger, type Logger } from "../../logging.ts";
import type { FullEthereumService } from "../../service/fullethereumservice.ts";
import { Event } from "../../types.ts";
import { setupMetrics } from "../../util/metrics.ts";
import {
	BOOTNODE_PORT,
	cleanDataDir,
	createGenesisState,
	customChainConfig,
	enodeToMultiaddr,
	generateAccounts,
	getDataDir,
	getNodeAccount,
	getNodeId,
	getNodeKey,
	readBootnodeInfo,
	saveAccountsToFile,
	writeBootnodeInfo,
} from "../network-utils.ts";

let logger: Logger | undefined;

async function startClient() {
	const port = parseInt(process.env.PORT || "8000", 10);
	const cleanStart = process.env.CLEAN === "true";
	const isMiner = [8002, 8001].includes(port);

	const isBootnode = port === BOOTNODE_PORT;

	console.log("\n" + "=".repeat(60));
	console.log(`🚀 Starting Ethereum Test Network Node`);
	console.log(`   Port: ${port}`);
	console.log(`   Is Bootnode: ${isBootnode}`);
	console.log(`   Clean Start: ${cleanStart}`);
	console.log("=".repeat(60) + "\n");

	if (cleanStart) {
		cleanDataDir(port);
	}

	const accounts = generateAccounts();

	if (isBootnode) {
		saveAccountsToFile(accounts);
	}

	const nodeAccount = getNodeAccount(accounts, port);
	const nodeAccountIndex = port - BOOTNODE_PORT;
	console.log(`\n👤 This node's account (index ${nodeAccountIndex}):`);
	console.log(`   Address:     ${nodeAccount[0]}`);
	console.log(`   Private Key: ${bytesToHex(nodeAccount[1])}`);
	if (isBootnode) {
		console.log(`   Role:        MINER (mining rewards go here)`);
	}

	const genesisState = createGenesisState(accounts);

	const nodeKey = getNodeKey(port);
	const nodeIdHex = bytesToUnprefixedHex(getNodeId(nodeKey));
	console.log(
		`\n🔑 Node ID: ${nodeIdHex.slice(0, 16)}...${nodeIdHex.slice(-16)}\n`,
	);

	let bootnodes: ReturnType<typeof multiaddr>[] = [];

	if (isBootnode) {
		writeBootnodeInfo(port, nodeKey);
	} else {
		// This is a peer node - read bootnode info
		const enodeUrl = readBootnodeInfo();
		if (enodeUrl) {
			const ma = enodeToMultiaddr(enodeUrl);
			if (ma) {
				bootnodes = [ma];
			}
		}
	}

	const common = new Common({
		chain: customChainConfig,
		hardfork: Hardfork.Chainstart,
		params: {
			minGasLimit: 5000,
			gasLimitBoundDivisor: 1024,
			maxExtraDataSize: 32,
			minimumDifficulty: 250,
			difficultyBoundDivisor: 2048,
			durationLimit: 13,
		},
	});

	const nodeLogger: Logger | undefined = getLogger();

	const config = new Config({
		accounts: [nodeAccount], // This node's account for signing
		bootnodes,
		common,
		datadir: getDataDir(port),
		prometheusMetrics: setupMetrics(),
		debugCode: true,
		discV4: true,
		execution: true,
		extIP: "127.0.0.1", // Use localhost IP for local test network
		isSingleNode: false,
		key: nodeKey, // Use deterministic node key
		logger: nodeLogger,
		maxFetcherJobs: 100,
		maxPeers: 25,
		maxPerRequest: 100,
		mine: isMiner,
		minerCoinbase: nodeAccount[0], // Mining rewards go to this node's account
		minPeers: 1,
		multiaddrs: [],
		port,
		saveReceipts: true,
		syncmode: SyncMode.Full,
	});

	const chainDataDir = config.getDataDirectory(DataDirectory.Chain);
	mkdirSync(chainDataDir, { recursive: true });
	const chainDB = new Level<string | Uint8Array, string | Uint8Array>(
		chainDataDir,
	) as unknown as AbstractLevel<
		string | Uint8Array,
		string | Uint8Array,
		string | Uint8Array
	>;

	const stateDataDir = config.getDataDirectory(DataDirectory.State);
	mkdirSync(stateDataDir, { recursive: true });
	const stateDB = new Level<string | Uint8Array, string | Uint8Array>(
		stateDataDir,
	) as unknown as AbstractLevel<
		string | Uint8Array,
		string | Uint8Array,
		string | Uint8Array
	>;

	const metaDataDir = config.getDataDirectory(DataDirectory.Meta);
	mkdirSync(metaDataDir, { recursive: true });
	const metaDB = new Level<string | Uint8Array, string | Uint8Array>(
		metaDataDir,
	) as unknown as AbstractLevel<
		string | Uint8Array,
		string | Uint8Array,
		string | Uint8Array
	>;

	// Create consensus with Ethash
	const consensusDict: ConsensusDict = {
		[ConsensusAlgorithm.Ethash]: new EthashConsensus(
			new Ethash(new LevelDB() as any),
		),
	};

	// Create blockchain with genesis state using our chainDB
	const blockchain = await createBlockchain({
		db: new LevelDB(chainDB),
		common,
		hardforkByHeadBlockNumber: true,
		validateBlocks: true,
		validateConsensus: true, // Skip PoW validation for local testing
		consensusDict,
		genesisState,
	});

	// Set fork hashes for proper peer handshake

	console.log(
		`⛓️  Genesis block hash: ${bytesToHex(blockchain.genesisBlock.hash())}\n`,
	);

	// Create and start client with databases
	const client = await EthereumClient.create({
		config,
		blockchain,
		genesisState,
		chainDB,
		stateDB,
		metaDB,
	});

	await client.open();

	// Update sync status
	client.config.updateSynchronizedState(client.chain.headers.latest, true);

	// Ensure txPool is running
	const fullService = client.service as FullEthereumService;
	fullService.txPool?.checkRunState();

	await client.start();

	// Add peer connection monitoring
	config.events.on(Event.PEER_CONNECTED, (peer) => {
		console.log(
			`\n🤝 PEER CONNECTED: ${peer.id?.slice(0, 16)}... from ${peer.address}`,
		);
		console.log(`   Total peers: ${client.service.pool.size}\n`);
	});

	config.events.on(Event.PEER_DISCONNECTED, (peer) => {
		console.log(`\n👋 PEER DISCONNECTED: ${peer.id?.slice(0, 16)}...`);
		console.log(`   Total peers: ${client.service.pool.size}\n`);
	});

	// Log peer count periodically
	setInterval(() => {
		const peerCount = client.service.pool.size;
		const blockHeight = client.chain.headers.height;
		if (peerCount > 0) {
			console.log(
				`📊 Status: ${peerCount} peer(s) connected, block height: ${blockHeight}`,
			);
		}
	}, 30000); // Every 30 seconds

	// Open execution layer FIRST (creates receiptsManager)
	const service = client.service;
	await service.execution.open();
	await service.execution.run(true);

	return { client };
}

const stopClient = async (
	clientStartPromise: Promise<{ client: EthereumClient } | null>,
) => {
	console.info(
		"\nCaught interrupt signal. Obtaining client handle for clean shutdown...",
	);
	console.info(
		"(This might take a little longer if client not yet fully started)",
	);

	let timeoutHandle: NodeJS.Timeout | undefined;
	if (clientStartPromise?.toString().includes("Promise") === true) {
		timeoutHandle = setTimeout(() => {
			console.warn("Client has become unresponsive while starting up.");
			console.warn("Check logging output for potential errors. Exiting...");
			process.exit(1);
		}, 30000);
	}

	const clientHandle = await clientStartPromise;
	if (clientHandle !== null) {
		console.info("Shutting down the client and the servers...");
		const { client } = clientHandle;
		await client.stop();
		console.info("Exiting.");
	} else {
		console.info("Client did not start properly, exiting...");
	}

	if (timeoutHandle) clearTimeout(timeoutHandle);
	process.exit();
};

async function run() {
	const clientStartPromise = startClient().catch((e) => {
		console.error("Error starting client", e);
		return null;
	});

	process.on("SIGINT", async () => {
		await stopClient(clientStartPromise);
	});

	process.on("SIGTERM", async () => {
		await stopClient(clientStartPromise);
	});

	process.on("uncaughtException", (err) => {
		console.error(`Uncaught error: ${err.message}`);
		console.error(err);
		void stopClient(clientStartPromise);
	});
}

run().catch((err) => {
	console.log(err);
	logger?.error(err.message.toString()) ?? console.error(err);
});
