#!/usr/bin/env node

import { multiaddr } from "@multiformats/multiaddr";
import { createHash } from "crypto";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import type { ChainConfig, GenesisState } from "../../chain-config/index.ts";
import {
	type Address,
	bytesToHex,
	bytesToUnprefixedHex,
	createAddressFromPrivateKey,
} from "../../utils/index.ts";

export type Account = [address: Address, privateKey: Uint8Array];

export const ACCOUNT_SEEDS = [
	"testnet-account-seed-0",
	"testnet-account-seed-1",
	"testnet-account-seed-2",
	"testnet-account-seed-3",
	"testnet-account-seed-4",
];
export const NODE_KEY_SEEDS: Record<number, string> = {
	8000: "testnet-node-key-seed-8000",
	8001: "testnet-node-key-seed-8001",
	8002: "testnet-node-key-seed-8002",
	8003: "testnet-node-key-seed-8003",
	8004: "testnet-node-key-seed-8004",
};

export const BOOTNODE_PORT = 8000;

export const RPC_BASE_PORT = 8545;

export const SHARED_DIR = "../../../test-network-data";

export const ACCOUNTS_FILE = `${SHARED_DIR}/accounts.json`;

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

export function derivePrivateKey(seed: string): Uint8Array {
	return createHash("sha256").update(seed).digest();
}

export function generateDeterministicAccount(
	seed: string,
	index: number,
): Account {
	const privKey = derivePrivateKey(seed);
	const address = createAddressFromPrivateKey(privKey);

	console.log("=".repeat(60));
	console.log(`Account ${index} (deterministic):`);
	console.log(`  Address:     ${address}`);
	console.log(`  Private key: ${bytesToHex(privKey)}`);
	console.log("=".repeat(60));

	return [address, privKey];
}

export function generateAccounts(): Account[] {
	console.log("\n📋 Generating deterministic accounts...\n");
	return ACCOUNT_SEEDS.map((seed, i) => generateDeterministicAccount(seed, i));
}

interface AccountInfo {
	index: number;
	address: string;
	privateKey: string;
	role: string;
}

export function saveAccountsToFile(accounts: Account[]): void {
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

export function getNodeAccount(accounts: Account[], port: number): Account {
	const nodeIndex = port - BOOTNODE_PORT;
	const accountIndex = Math.min(nodeIndex, accounts.length - 1);
	return accounts[accountIndex];
}

export function getNodeKey(port: number): Uint8Array {
	const seed = NODE_KEY_SEEDS[port];
	if (!seed) {
		// Fallback: derive from port number
		return derivePrivateKey(`testnet-node-key-seed-${port}`);
	}
	return derivePrivateKey(seed);
}

export function getNodeId(privateKey: Uint8Array): Uint8Array {
	// Get uncompressed public key and remove the 0x04 prefix
	return secp256k1.getPublicKey(privateKey, false).slice(1);
}

export function createGenesisState(accounts: Account[]): GenesisState {
	const genesisState = {} as GenesisState;
	const initialBalance = "0x3635c9adc5dea00000"; // 1000 ETH in hex

	for (const account of accounts) {
		genesisState[account[0].toString()] = initialBalance;
	}

	console.log(
		`\n💰 Genesis state: ${accounts.length} accounts prefunded with 1000 ETH each\n`,
	);
	return genesisState;
}
export function writeBootnodeInfo(port: number, nodeKey: Uint8Array): void {
	const nodeId = bytesToUnprefixedHex(getNodeId(nodeKey));
	const enodeUrl = `enode://${nodeId}@127.0.0.1:${port}`;

	mkdirSync(SHARED_DIR, { recursive: true });
	const infoPath = `${SHARED_DIR}/bootnode.txt`;
	writeFileSync(infoPath, enodeUrl);

	console.log(`\n🌐 Bootnode enode written to ${infoPath}`);
	console.log(`   ${enodeUrl}\n`);
}

export function readBootnodeInfo(): string | null {
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

export function enodeToMultiaddr(
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

export function getDataDir(port: number): string {
	return `${SHARED_DIR}/node-${port}`;
}

/**
 * Clean data directory for fresh start (optional)
 */
export function cleanDataDir(port: number): void {
	const dataDir = getDataDir(port);
	if (existsSync(dataDir)) {
		console.log(`🧹 Cleaning data directory: ${dataDir}`);
		rmSync(dataDir, { recursive: true, force: true });
	}
}
