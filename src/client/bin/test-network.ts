#!/usr/bin/env node

import { Multiaddr, multiaddr } from "@multiformats/multiaddr";
import type { AbstractLevel } from "abstract-level";
import { createHash } from "crypto";
import debug from "debug";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { Level } from "level";
import type { ConsensusDict } from "../../blockchain/index.ts";
import { createBlockchain, EthashConsensus } from "../../blockchain/index.ts";
import type { ChainConfig } from "../../chain-config";
import type { GenesisState } from "../../chain-config/index.ts";
import {
	Common,
	ConsensusAlgorithm,
	Hardfork,
} from "../../chain-config/index.ts";
import { Ethash } from "../../eth-hash/index.ts";
import { PeerInfo } from "../../kademlia/types.ts";
import { createP2PNode, dptDiscovery } from "../../p2p/libp2p/index.ts";
import type { ComponentLogger } from "../../p2p/libp2p/types.ts";
import { rlpx } from "../../p2p/transport/rlpx/index.ts";
import {
	Address,
	bytesToHex,
	bytesToUnprefixedHex,
	createAddressFromPrivateKey,
	hexToBytes,
} from "../../utils/index.ts";
import { EthereumClient } from "../client.ts";
import { Config } from "../config/index.ts";
import { DataDirectory, SyncMode } from "../config/types.ts";
import { LevelDB } from "../execution/level.ts";
import { getLogger, type Logger } from "../logging.ts";
import { ETH } from "../net/protocol/eth/eth.ts";
import { setupMetrics } from "../util/metrics.ts";

debug.enable("p2p:*");
export type Account = [address: Address, privateKey: Uint8Array];

let logger: Logger | undefined;

const ACCOUNT_SEEDS = [
	"testnet-account-seed-0",
	"testnet-account-seed-1",
	"testnet-account-seed-2",
	"testnet-account-seed-3",
	"testnet-account-seed-4",
];
const NODE_KEY_SEEDS: Record<number, string> = {
	8000: "testnet-node-key-seed-8000",
	8001: "testnet-node-key-seed-8001",
	8002: "testnet-node-key-seed-8002",
	8003: "testnet-node-key-seed-8003",
	8004: "testnet-node-key-seed-8004",
};

const BOOTNODE_PORT = 8000;

const RPC_BASE_PORT = 8545;

const SHARED_DIR = "../../test-network-data";

const ACCOUNTS_FILE = `${SHARED_DIR}/accounts.json`;

// Simplified chain config - only Chainstart/Frontier hardfork with PoW
export const customChainConfig: ChainConfig = {
	name: "testnet",
	chainId: 12345,
	defaultHardfork: "chainstart",
	consensus: {
		type: "pow",
		algorithm: "ethash",
	},
	genesis: {
		gasLimit: 10485760,
		difficulty: 1,
		nonce: "0xbb00000000000000",
		extraData:
			"0xcc000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
	},
	hardforks: [{ name: "chainstart", block: 0 }],
	bootstrapNodes: [],
};

function derivePrivateKey(seed: string): Uint8Array {
	return createHash("sha256").update(seed).digest();
}

function generateDeterministicAccount(seed: string, index: number): Account {
	const privKey = derivePrivateKey(seed);
	const address = createAddressFromPrivateKey(privKey);

	console.log("=".repeat(60));
	console.log(`Account ${index} (deterministic):`);
	console.log(`  Address:     ${address}`);
	console.log(`  Private key: ${bytesToHex(privKey)}`);
	console.log("=".repeat(60));

	return [address, privKey];
}

function generateAccounts(): Account[] {
	console.log("\n📋 Generating deterministic accounts...\n");
	return ACCOUNT_SEEDS.map((seed, i) => generateDeterministicAccount(seed, i));
}

interface AccountInfo {
	index: number;
	address: string;
	privateKey: string;
	role: string;
}

function saveAccountsToFile(accounts: Account[]): void {
	mkdirSync(SHARED_DIR, { recursive: true });

	const accountsInfo: AccountInfo[] = accounts.map((account, i) => ({
		index: i,
		address: account[0].toString(),
		privateKey: bytesToHex(account[1]),
		role: i === 0 ? "miner (bootnode)" : `user ${i}`,
	}));

	writeFileSync(ACCOUNTS_FILE, JSON.stringify(accountsInfo, null, 2));
	console.log(`\n💾 Account keys saved to: ${ACCOUNTS_FILE}`);
}

function getNodeAccount(accounts: Account[], port: number): Account {
	const nodeIndex = port - BOOTNODE_PORT;
	const accountIndex = Math.min(nodeIndex, accounts.length - 1);
	return accounts[accountIndex];
}

function getNodeKey(port: number): Uint8Array {
	const seed = NODE_KEY_SEEDS[port];
	if (!seed) {
		// Fallback: derive from port number
		return derivePrivateKey(`testnet-node-key-seed-${port}`);
	}
	return derivePrivateKey(seed);
}

function getNodeId(privateKey: Uint8Array): Uint8Array {
	// Get uncompressed public key and remove the 0x04 prefix
	return secp256k1.getPublicKey(privateKey, false).slice(1);
}

function createGenesisState(accounts: Account[]): GenesisState {
	const genesisState: GenesisState = {};
	const initialBalance = "0x3635c9adc5dea00000"; // 1000 ETH in hex

	for (const account of accounts) {
		genesisState[account[0].toString()] = initialBalance;
	}

	console.log(
		`\n💰 Genesis state: ${accounts.length} accounts prefunded with 1000 ETH each\n`,
	);
	return genesisState;
}
function writeBootnodeInfo(port: number, nodeKey: Uint8Array): void {
	const nodeId = bytesToUnprefixedHex(getNodeId(nodeKey));
	const enodeUrl = `enode://${nodeId}@127.0.0.1:${port}`;
	const udpPort = port + 10000; // DPT uses separate UDP port

	mkdirSync(SHARED_DIR, { recursive: true });
	const infoPath = `${SHARED_DIR}/bootnode.txt`;
	writeFileSync(infoPath, enodeUrl);

	console.log(`\n🌐 Bootnode enode written to ${infoPath}`);
	console.log(`   ${enodeUrl}`);
	console.log(`   UDP port: ${udpPort} (for DPT discovery)\n`);
}

function readBootnodeInfo(): string | null {
	const infoPath = `${SHARED_DIR}/bootnode.txt`;

	if (!existsSync(infoPath)) {
		console.log(`\n⚠️  Bootnode info not found at ${infoPath}`);
		console.log("   Make sure the bootnode (port 8000) is started first!\n");
		return null;
	}

	const enodeUrl = readFileSync(infoPath, "utf-8").trim();
	console.log(`\n🔗 Using bootnode: ${enodeUrl}\n`);
	return enodeUrl;
}

function enodeToMultiaddr(
	enodeUrl: string,
): ReturnType<typeof multiaddr> | null {
	const match = enodeUrl.match(/^enode:\/\/([a-fA-F0-9]+)@([^:]+):(\d+)$/);
	if (!match) {
		console.error(`Invalid enode URL: ${enodeUrl}`);
		return null;
	}

	const [, _nodeId, ip, port] = match;
	return multiaddr(`/ip4/${ip}/tcp/${port}`);
}

/**
 * Convert enode URL to DPT PeerInfo format
 */
function enodeToDPTPeerInfo(enodeUrl: string): {
	id: Uint8Array;
	address: string;
	tcpPort: number;
	udpPort: number;
} | null {
	const match = enodeUrl.match(/^enode:\/\/([a-fA-F0-9]+)@([^:]+):(\d+)$/);
	if (!match) {
		console.error(`Invalid enode URL: ${enodeUrl}`);
		return null;
	}

	const [, nodeIdHex, ip, port] = match;
	const nodeId = hexToBytes("0x" + nodeIdHex);
	const tcpPort = parseInt(port, 10);
	// DPT uses UDP for discovery, use port + 10000 for UDP (same as we do for local nodes)
	const udpPort = tcpPort;

	return {
		id: nodeId,
		address: ip,
		tcpPort,
		udpPort,
	};
}

/**
 * Create component logger from config logger
 */
function createComponentLoggerFromLogger(
	logger: Logger | undefined,
	name: string,
): ComponentLogger {
	if (!logger) {
		return {
			forComponent: () =>
				({
					enabled: false,
					trace: () => {},
					debug: () => {},
					info: () => {},
					warn: () => {},
					error: () => {},
					newScope: () => ({
						enabled: false,
						trace: () => {},
						debug: () => {},
						info: () => {},
						warn: () => {},
						error: () => {},
						newScope: () => ({}) as any,
					}),
				}) as any,
		};
	}

	return {
		forComponent: (component: string) => {
			const scopeLogger = logger.newScope(`${name}:${component}`);
			return scopeLogger as any;
		},
	};
}

function getDataDir(port: number): string {
	return `${SHARED_DIR}/node-${port}`;
}

/**
 * Clean data directory for fresh start (optional)
 */
function cleanDataDir(port: number): void {
	const dataDir = getDataDir(port);
	if (existsSync(dataDir)) {
		console.log(`🧹 Cleaning data directory: ${dataDir}`);
		rmSync(dataDir, { recursive: true, force: true });
	}
}

function convertBootnodesToDPT(
	bootnodes: Multiaddr[] | string[] | string,
): PeerInfo[] {
	const result: PeerInfo[] = [];

	// Normalize to array
	const bootnodeArray: Multiaddr[] = [];
	if (typeof bootnodes === "string") {
		bootnodeArray.push(multiaddr(bootnodes));
	} else if (Array.isArray(bootnodes)) {
		for (const bn of bootnodes) {
			if (typeof bn === "string") {
				bootnodeArray.push(multiaddr(bn));
			} else {
				bootnodeArray.push(bn);
			}
		}
	}

	// Convert each bootnode
	for (const ma of bootnodeArray) {
		try {
			const peerInfo = this.multiaddrToDPTPeerInfo(ma);
			if (peerInfo) {
				result.push(peerInfo);
			}
		} catch (err) {
			// this.logger?.warn(`Failed to convert bootnode ${ma.toString()}: ${err}`);
		}
	}

	return result;
}

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
			minimumDifficulty: 10,
			difficultyBoundDivisor: 2048,
			durationLimit: 13,
		},
	});

	const nodeLogger: Logger | undefined = getLogger();

	// Convert bootnodes from enode format to DPT PeerInfo format
	const dptBootnodes: Array<{
		id: Uint8Array;
		address: string;
		tcpPort: number;
		udpPort: number;
	}> = [];
	if (!isBootnode) {
		// Read bootnode info and convert to DPT format
		const enodeUrl = readBootnodeInfo();
		if (enodeUrl) {
			const peerInfo = enodeToDPTPeerInfo(enodeUrl);
			if (peerInfo) {
				dptBootnodes.push(peerInfo);
			}
		}
	}

	// Create P2PNode instance
	// const componentLogger = createComponentLoggerFromLogger(
	// 	nodeLogger,
	// 	`node-${port}`,
	// );

	// DPT discovery uses UDP, so we use a separate UDP port
	// Use port + 10000 to avoid conflicts with TCP ports
	const udpPort = port;

	const p2pNode = await createP2PNode({
		privateKey: nodeKey,
		addresses: {
			listen: [`/ip4/127.0.0.1/tcp/${port}`],
		},
		transports: [
			(components) =>
				rlpx({
					privateKey: nodeKey,
					capabilities: [ETH.eth68],
					common,
					timeout: 10000,
					maxConnections: 25,
				})({
					logger: components.logger,
				}) as any,
		],
		peerDiscovery: [
			(components) =>
				dptDiscovery({
					privateKey: nodeKey,
					bindAddr: "127.0.0.1",
					bindPort: udpPort, // DPT uses separate UDP port
					bootstrapNodes: isBootnode ? undefined : dptBootnodes,
					autoDial: true,
					autoDialBootstrap: isBootnode ? false : true,
				})(components),
		],
		// logger: componentLogger as any,
		maxConnections: 25,
	} as any);

	const config = new Config({
		accounts: [nodeAccount], // This node's account for signing
		bootnodes: convertBootnodesToDPT(bootnodes),
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
		port,
		saveReceipts: true,
		syncmode: SyncMode.Full,
		node: p2pNode,
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

	await client.start();

	console.log("\n" + "=".repeat(60));
	console.log("✅ Node started successfully!");
	console.log(`   P2P port:  ${port}`);
	console.log(`   RPC URL:   http://127.0.0.1:${port + 300}`);
	console.log(`   Account:   ${nodeAccount[0]}`);
	if (isBootnode) {
		console.log(`   Mining:    YES (rewards → ${nodeAccount[0]})`);
	}
	console.log(`   Enode:     enode://${nodeIdHex}@127.0.0.1:${port}`);
	console.log("=".repeat(60) + "\n");

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
