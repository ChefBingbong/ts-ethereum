#!/usr/bin/env npx tsx

/**
 * Test script to create nonce gap scenarios in the transaction pool.
 *
 * This script intentionally sends transactions out of order to test
 * the pending/queued pool separation in the TxPool.
 *
 * Usage:
 *   npx tsx src/client/bin/test-nonce-gap.ts
 *   npx tsx src/client/bin/test-nonce-gap.ts --rpc http://127.0.0.1:8546
 *   npx tsx src/client/bin/test-nonce-gap.ts --scenario gap-then-fill
 *
 * Scenarios:
 *   simple-gap       Send tx with nonce+2 (skipping nonce+0 and nonce+1)
 *   gap-then-fill    Create gap, then fill it to test promotion
 *   multiple-gaps    Send nonces 0, 2, 4 to create multiple gaps
 *   all              Run all scenarios sequentially
 */

import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
	type Account,
	createWalletClient,
	defineChain,
	type Hex,
	http,
	parseEther,
	type PublicActions,
	publicActions,
	type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
function parseArgs(): Record<string, string> {
	const args = process.argv.slice(2);
	const parsed: Record<string, string> = {};

	for (let i = 0; i < args.length; i += 2) {
		const key = args[i]?.replace("--", "");
		const value = args[i + 1];
		if (key && value) {
			parsed[key] = value;
		}
	}

	return parsed;
}

// Load accounts from accounts.json
interface AccountInfo {
	index: number;
	address: string;
	privateKey: string;
	role: string;
}

function loadAccounts(): AccountInfo[] {
	const accountsPath = path.resolve(
		__dirname,
		"../../../test-network-data/accounts.json",
	);

	if (!existsSync(accountsPath)) {
		console.error(`Accounts file not found: ${accountsPath}`);
		console.error(
			"Make sure to run the test network first to generate accounts.",
		);
		process.exit(1);
	}

	const content = readFileSync(accountsPath, "utf8");
	return JSON.parse(content) as AccountInfo[];
}

// Get transaction count (nonce) via RPC
export async function getNonce(
	rpcUrl: string,
	address: string,
): Promise<bigint> {
	const response = await fetch(rpcUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			method: "eth_getTransactionCount",
			params: [address, "latest"],
			id: Date.now(),
		}),
	});

	const json = (await response.json()) as {
		result?: string;
		error?: { message: string };
	};

	if (json.error) {
		throw new Error(`RPC Error: ${json.error.message}`);
	}

	return BigInt(json.result || "0x0");
}

// Get txpool content via RPC
async function getTxPoolContent(rpcUrl: string): Promise<{
	pending: Record<string, Record<string, unknown>>;
	queued?: Record<string, Record<string, unknown>>;
}> {
	const response = await fetch(rpcUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			method: "txpool_content",
			params: [],
			id: Date.now(),
		}),
	});

	const json = (await response.json()) as {
		result?: {
			pending: Record<string, Record<string, unknown>>;
			queued?: Record<string, Record<string, unknown>>;
		};
		error?: { message: string };
	};

	if (json.error) {
		throw new Error(`RPC Error: ${json.error.message}`);
	}

	return json.result || { pending: {} };
}

// Get txpool status via RPC
async function getTxPoolStatus(rpcUrl: string): Promise<{
	pending: string;
	queued: string;
}> {
	const response = await fetch(rpcUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			method: "txpool_status",
			params: [],
			id: Date.now(),
		}),
	});

	const json = (await response.json()) as {
		result?: { pending: string; queued: string };
		error?: { message: string };
	};

	if (json.error) {
		// txpool_status might not be implemented yet
		return { pending: "0x0", queued: "0x0" };
	}

	return json.result || { pending: "0x0", queued: "0x0" };
}

// Display txpool state
async function displayTxPoolState(
	rpcUrl: string,
	label: string,
): Promise<void> {
	console.log("");
	console.log(`📦 TxPool State (${label}):`);
	console.log("-".repeat(50));

	try {
		const content = await getTxPoolContent(rpcUrl);
		const status = await getTxPoolStatus(rpcUrl);

		console.log(`  Status: pending=${status.pending}, queued=${status.queued}`);
		console.log("");

		// Display pending
		const pendingAddrs = Object.keys(content.pending || {});
		if (pendingAddrs.length > 0) {
			console.log("  PENDING:");
			for (const addr of pendingAddrs) {
				const txs = content.pending[addr];
				const nonces = Object.keys(txs).sort((a, b) => Number(a) - Number(b));
				console.log(
					`    ${addr.slice(0, 10)}...${addr.slice(-8)}: nonces [${nonces.join(", ")}]`,
				);
			}
		} else {
			console.log("  PENDING: (empty)");
		}

		// Display queued
		const queuedAddrs = Object.keys(content.queued || {});
		if (queuedAddrs.length > 0) {
			console.log("  QUEUED:");
			for (const addr of queuedAddrs) {
				const txs = content.queued![addr];
				const nonces = Object.keys(txs).sort((a, b) => Number(a) - Number(b));
				console.log(
					`    ${addr.slice(0, 10)}...${addr.slice(-8)}: nonces [${nonces.join(", ")}]`,
				);
			}
		} else {
			console.log("  QUEUED: (empty or not implemented)");
		}
	} catch (error) {
		console.log(`  Error fetching txpool: ${error}`);
	}
	console.log("");
}

// Send transaction with specific nonce (bypassing automatic nonce management)
async function sendTxWithNonce(
	client: WalletClient & PublicActions,
	account: Account,
	to: string,
	nonce: bigint,
	value: bigint,
): Promise<string> {
	console.log(`  📤 Sending tx with nonce ${nonce}...`);

	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const hash = await client.sendTransaction({
			account,
			to: to as Hex,
			value,
			nonce: Number(nonce),
			gasPrice: BigInt(1500000000), // 1.5 gwei
			gas: BigInt(21000),
			type: "legacy",
		} as any);

		console.log(`  Tx Hash: ${hash}`);
		console.log("");
		console.log("Waiting for receipt...");

		const receipt = await client.waitForTransactionReceipt({ hash });

		console.log(`  Block:   ${receipt.blockNumber}`);
		console.log(`  Status:  ${receipt.status}`);
		console.log(`  Gas Used: ${receipt.gasUsed}`);
		return hash;
	} catch (error) {
		console.error(`Transaction failed: ${error}`);
		process.exit(1);
	}
}

// Wait for user to press enter
async function waitForEnter(message: string): Promise<void> {
	console.log(`\n⏸️  ${message}`);
	console.log("   Press Enter to continue...\n");

	return new Promise((resolve) => {
		process.stdin.once("data", () => {
			resolve();
		});
	});
}

// Sleep helper
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// SCENARIOS
// ============================================================================

/**
 * Scenario 1: Simple Gap
 * Send a transaction with nonce+2, skipping nonce+0 and nonce+1
 * Expected: Transaction should go to QUEUED pool (nonce gap)
 */
async function scenarioSimpleGap(
	client: WalletClient & PublicActions,
	account: Account,
	rpcUrl: string,
	recipient: string,
	currentNonce: bigint,
): Promise<void> {
	console.log(`Current on-chain nonce: ${currentNonce}`);

	// Send tx with nonce+2 (skipping nonce and nonce+1)
	const gapNonce = currentNonce + 2n;
	console.log(
		`Sending tx with nonce ${gapNonce} (skipping ${currentNonce} and ${currentNonce + 1n}):`,
	);

	await sendTxWithNonce(
		client,
		account,
		recipient,
		gapNonce,
		parseEther("0.001"),
	);
}

/**
 * Scenario 2: Gap Then Fill
 * 1. Send tx with nonce+2 (creates gap, goes to queued)
 * 2. Send tx with nonce+0 (executable, goes to pending)
 * 3. Send tx with nonce+1 (fills gap, should promote nonce+2 to pending)
 */
async function scenarioGapThenFill(
	client: WalletClient & PublicActions,
	account: Account,
	rpcUrl: string,
	recipient: string,
	currentNonce: bigint,
): Promise<void> {
	console.log("\n" + "=".repeat(60));
	console.log("SCENARIO: Gap Then Fill (Test Promotion)");
	console.log("=".repeat(60));
	console.log("");
	console.log("This scenario:");
	console.log("  1. Sends tx with nonce+2 (should go to queued)");
	console.log("  2. Sends tx with nonce+0 (should go to pending)");
	console.log(
		"  3. Sends tx with nonce+1 (fills gap, should trigger promotion)",
	);
	console.log(`Current on-chain nonce: ${currentNonce}`);

	await displayTxPoolState(rpcUrl, "initial state");

	// Step 1: Send nonce+2 (gap)
	console.log("\n--- Step 1: Create gap by sending nonce+2 ---");
	try {
		await sendTxWithNonce(
			client,
			account,
			recipient,
			currentNonce + 2n,
			parseEther("0.001"),
		);
	} catch {
		console.log("     (tx may have been rejected - expected in current impl)");
	}
	await sleep(500);
	await displayTxPoolState(rpcUrl, "after nonce+2");

	// Step 2: Send nonce+0 (should be executable)
	console.log("\n--- Step 2: Send nonce+0 (executable) ---");
	try {
		await sendTxWithNonce(
			client,
			account,
			recipient,
			currentNonce,
			parseEther("0.001"),
		);
	} catch (e) {
		console.log(`     Error: ${e}`);
	}
	await sleep(500);
	await displayTxPoolState(rpcUrl, "after nonce+0");

	// Step 3: Send nonce+1 (fills the gap)
	console.log("\n--- Step 3: Fill gap by sending nonce+1 ---");
	try {
		await sendTxWithNonce(
			client,
			account,
			recipient,
			currentNonce + 1n,
			parseEther("0.001"),
		);
	} catch (e) {
		console.log(`     Error: ${e}`);
	}
	await sleep(500);
	await displayTxPoolState(rpcUrl, "after nonce+1 (gap filled)");

	console.log("\nExpected result after gap fill:");
	console.log(
		"  - All 3 txs should now be in PENDING (gap filled, promotion triggered)",
	);
}

/**
 * Scenario 3: Multiple Gaps
 * Send nonces 0, 2, 4 to create multiple gaps
 */
async function scenarioMultipleGaps(
	client: WalletClient & PublicActions,
	account: Account,
	rpcUrl: string,
	recipient: string,
	currentNonce: bigint,
): Promise<void> {
	console.log("\n" + "=".repeat(60));
	console.log("SCENARIO: Multiple Gaps");
	console.log("=".repeat(60));
	console.log("");
	console.log(
		"This scenario sends txs with nonces 0, 2, 4 (skipping 1 and 3).",
	);
	console.log(`Current on-chain nonce: ${currentNonce}`);

	await displayTxPoolState(rpcUrl, "initial state");

	const noncesToSend = [currentNonce, currentNonce + 2n, currentNonce + 4n];

	for (const nonce of noncesToSend) {
		console.log(`\n--- Sending nonce ${nonce} ---`);
		try {
			await sendTxWithNonce(
				client,
				account,
				recipient,
				nonce,
				parseEther("0.001"),
			);
		} catch {
			console.log("     (tx may have been rejected)");
		}
		await sleep(500);
	}

	await displayTxPoolState(rpcUrl, "after all txs");

	console.log("\nExpected result:");
	console.log(`  - PENDING: nonce ${currentNonce}`);
	console.log(`  - QUEUED: nonces ${currentNonce + 2n}, ${currentNonce + 4n}`);
}

/**
 * Scenario 4: Replacement in Pool
 * Send same nonce with higher gas price to test replacement
 */
async function scenarioReplacement(
	client: WalletClient & PublicActions,
	account: Account,
	rpcUrl: string,
	recipient: string,
	currentNonce: bigint,
): Promise<void> {
	console.log("\n" + "=".repeat(60));
	console.log("SCENARIO: Transaction Replacement");
	console.log("=".repeat(60));
	console.log("");
	console.log("This scenario tests tx replacement with higher gas price.");
	console.log(`Current on-chain nonce: ${currentNonce}`);

	await displayTxPoolState(rpcUrl, "initial state");

	// Send first tx
	console.log("\n--- Step 1: Send initial tx ---");
	try {
		await sendTxWithNonce(
			client,
			account,
			recipient,
			currentNonce,
			parseEther("0.001"),
		);
	} catch (e) {
		console.log(`     Error: ${e}`);
	}
	await sleep(500);
	await displayTxPoolState(rpcUrl, "after first tx");

	// Send replacement with higher gas price
	console.log(
		"\n--- Step 2: Send replacement tx with same nonce, higher gas ---",
	);
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const hash = await client.sendTransaction({
			account,
			to: recipient as Hex,
			value: parseEther("0.002"), // Different value to see which one
			nonce: Number(currentNonce),
			gasPrice: BigInt(2000000000), // Higher gas price (2 gwei vs 1.5 gwei)
			gas: BigInt(21000),
			type: "legacy",
		} as any);
		console.log(`     ✅ Replacement tx hash: ${hash}`);
	} catch (e: any) {
		console.log(`     ❌ Replacement failed: ${e.message || e}`);
	}
	await sleep(500);
	await displayTxPoolState(rpcUrl, "after replacement attempt");
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
	const args = parseArgs();

	// Config
	const rpcUrl = args.rpc || "http://127.0.0.1:8545";
	const chainId = parseInt(args.chainId || "12345", 10);
	const scenario = args.scenario || "all";
	const fromIndex = parseInt(args.from || "0", 10);
	const toIndex = parseInt(args.to || "1", 10);

	console.log("=".repeat(60));
	console.log("🧪 NONCE GAP TEST SCRIPT");
	console.log("=".repeat(60));
	console.log("");
	console.log("Configuration:");
	console.log(`  RPC URL:    ${rpcUrl}`);
	console.log(`  Chain ID:   ${chainId}`);
	console.log(`  Scenario:   ${scenario}`);
	console.log("");

	// Load accounts
	const accounts = loadAccounts();

	if (fromIndex < 0 || fromIndex >= accounts.length) {
		console.error(`Error: --from index ${fromIndex} is out of range`);
		process.exit(1);
	}
	if (toIndex < 0 || toIndex >= accounts.length) {
		console.error(`Error: --to index ${toIndex} is out of range`);
		process.exit(1);
	}

	const fromAccount = accounts[fromIndex];
	const toAccount = accounts[toIndex];

	console.log("Accounts:");
	console.log(`  From: ${fromAccount.address} (${fromAccount.role})`);
	console.log(`  To:   ${toAccount.address} (${toAccount.role})`);

	// Setup viem client
	const devnet = defineChain({
		id: chainId,
		name: "local-devnet",
		network: "local-devnet",
		nativeCurrency: {
			name: "TestETH",
			symbol: "TETH",
			decimals: 18,
		},
		rpcUrls: {
			default: { http: [rpcUrl] },
			public: { http: [rpcUrl] },
		},
	});

	const account = privateKeyToAccount(fromAccount.privateKey as Hex);

	const client = createWalletClient({
		account,
		chain: devnet,
		transport: http(rpcUrl),
	}).extend(publicActions);

	// Get current nonce
	let currentNonce: bigint;
	try {
		currentNonce = await getNonce(rpcUrl, fromAccount.address);
		console.log(`\n📊 Current on-chain nonce for sender: ${currentNonce}`);
	} catch (error) {
		console.error(`Failed to get nonce: ${error}`);
		console.error("Make sure the RPC server is running.");
		process.exit(1);
	}

	// Run selected scenario(s)
	const scenarios: Record<string, () => Promise<void>> = {
		"simple-gap": () =>
			scenarioSimpleGap(
				client,
				account,
				rpcUrl,
				toAccount.address,
				currentNonce,
			),
		"gap-then-fill": () =>
			scenarioGapThenFill(
				client,
				account,
				rpcUrl,
				toAccount.address,
				currentNonce,
			),
		"multiple-gaps": () =>
			scenarioMultipleGaps(
				client,
				account,
				rpcUrl,
				toAccount.address,
				currentNonce,
			),
		replacement: () =>
			scenarioReplacement(
				client,
				account,
				rpcUrl,
				toAccount.address,
				currentNonce,
			),
	};

	await scenarios[scenario]();
}

main().catch((err) => {
	console.error("Error:", err);
	process.exit(1);
});
