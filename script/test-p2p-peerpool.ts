#!/usr/bin/env npx tsx

/**
 * Test script for Step 3: P2PPeerPool
 *
 * Tests:
 * 1. Creating P2PPeerPool with P2PNode
 * 2. Listening to connection events
 * 3. Creating P2PPeer instances from connections
 * 4. Managing peer pool (add, remove, contains, idle)
 * 5. Status exchange handling
 */

import type { ComponentLogger, Logger } from "@libp2p/interface";
import { createHash } from "crypto";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import { EventEmitter } from "eventemitter3";
import { Common, Hardfork } from "../src/chain-config/index.ts";
import { Config } from "../src/client/config.ts";
import { P2PPeerPool } from "../src/client/net/p2p-peerpool.ts";
import { Event } from "../src/client/types.ts";
import { ETH, type EthStatusOpts } from "../src/devp2p/protocol/eth.ts";
import { createP2PNode } from "../src/p2p/libp2p/index.ts";
import type { RLPxConnection } from "../src/p2p/transport/rlpx/connection.ts";
import { rlpx } from "../src/p2p/transport/rlpx/index.ts";
import { bytesToUnprefixedHex } from "../src/utils/index.ts";

/**
 * Derive a deterministic private key from a seed
 */
function derivePrivateKey(seed: string): Uint8Array {
	return createHash("sha256").update(seed).digest();
}

/**
 * Get node ID from private key
 */
function getNodeId(privateKey: Uint8Array): Uint8Array {
	return secp256k1.getPublicKey(privateKey, false).slice(1);
}

/**
 * Format node ID for logging
 */
function formatNodeId(nodeId: Uint8Array): string {
	const hex = bytesToUnprefixedHex(nodeId);
	return `${hex.slice(0, 8)}...${hex.slice(-8)}`;
}

/**
 * Create a simple logger
 */
function createSimpleLogger(component: string): Logger {
	const prefix = `[${component}]`;
	const log = (formatter: string, ...args: any[]) => {
		console.log(`${prefix} ${formatter}`, ...args);
	};
	log.enabled = true;
	log.trace = (formatter: string, ...args: any[]) => {};
	log.error = (formatter: string, ...args: any[]) => {
		console.error(`${prefix} ERROR: ${formatter}`, ...args);
	};
	log.newScope = (name: string) => createSimpleLogger(`${component}:${name}`);
	return log as Logger;
}

/**
 * Create a component logger
 */
function createComponentLogger(name: string): ComponentLogger {
	return {
		forComponent: (component: string) =>
			createSimpleLogger(`${name}:${component}`),
	};
}

// Simple chain config for testing
const customChainConfig = {
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
		extraData: "0x00",
	},
	hardforks: [{ name: "chainstart", block: 0 }],
	bootstrapNodes: [],
};

async function main() {
	console.log("\n" + "=".repeat(70));
	console.log("🔗 P2PPeerPool Test");
	console.log("=".repeat(70) + "\n");

	// Create Common instance
	const common = new Common({
		chain: customChainConfig as any,
		hardfork: Hardfork.Chainstart,
	});

	// Generate deterministic keys
	const nodeAPrivateKey = derivePrivateKey("p2p-peerpool-test-a");
	const nodeBPrivateKey = derivePrivateKey("p2p-peerpool-test-b");

	const nodeAId = getNodeId(nodeAPrivateKey);
	const nodeBId = getNodeId(nodeBPrivateKey);

	console.log("📋 Test Configuration:");
	console.log(`   Node A ID: ${formatNodeId(nodeAId)}`);
	console.log(`   Node B ID: ${formatNodeId(nodeBId)}\n`);

	// Create capabilities
	const capabilities = [ETH.eth68];

	// =========================================================================
	// Create Node A (Listener)
	// =========================================================================
	console.log("🚀 Creating Node A...\n");

	const nodeA = await createP2PNode({
		privateKey: nodeAPrivateKey,
		addresses: {
			listen: [`/ip4/127.0.0.1/tcp/30303`],
		},
		transports: [
			(components) =>
				rlpx({
					privateKey: nodeAPrivateKey,
					capabilities,
					common,
					timeout: 10000,
				})({
					logger: components.logger,
				}),
		],
		logger: createComponentLogger("node-a"),
	});

	await nodeA.start();
	console.log("✅ Node A started\n");

	// =========================================================================
	// Create Node B (Dialer)
	// =========================================================================
	console.log("🚀 Creating Node B...\n");

	const nodeB = await createP2PNode({
		privateKey: nodeBPrivateKey,
		transports: [
			(components) =>
				rlpx({
					privateKey: nodeBPrivateKey,
					capabilities,
					common,
					timeout: 10000,
				})({
					logger: components.logger,
				}),
		],
		logger: createComponentLogger("node-b"),
	});

	await nodeB.start();
	console.log("✅ Node B started\n");

	// =========================================================================
	// Create Config and P2PPeerPool
	// =========================================================================
	console.log("⚙️  Creating Config and P2PPeerPool...\n");

	const events = new EventEmitter();
	const config = new Config({
		common,
		syncmode: "none",
		events: events as any,
		maxPeers: 10,
	});

	const peerPool = new P2PPeerPool({
		config,
		node: nodeA, // Use Node A's pool
	});

	// Track events
	const eventsReceived: string[] = [];
	config.events.on(Event.PEER_CONNECTED, (peer) => {
		console.log(`   ✅ PEER_CONNECTED: ${peer.id.slice(0, 8)}...`);
		eventsReceived.push("PEER_CONNECTED");
	});
	config.events.on(Event.POOL_PEER_ADDED, (peer) => {
		console.log(`   ✅ POOL_PEER_ADDED: ${peer.id.slice(0, 8)}...`);
		eventsReceived.push("POOL_PEER_ADDED");
	});
	config.events.on(Event.PEER_DISCONNECTED, (peer) => {
		console.log(`   ❌ PEER_DISCONNECTED: ${peer.id.slice(0, 8)}...`);
		eventsReceived.push("PEER_DISCONNECTED");
	});
	config.events.on(Event.POOL_PEER_REMOVED, (peer) => {
		console.log(`   ❌ POOL_PEER_REMOVED: ${peer.id.slice(0, 8)}...`);
		eventsReceived.push("POOL_PEER_REMOVED");
	});

	await peerPool.open();
	await peerPool.start();
	console.log("✅ P2PPeerPool opened and started\n");

	// =========================================================================
	// Node B dials Node A
	// =========================================================================
	console.log("🔗 Node B dialing Node A...\n");

	const nodeAAddr = nodeA.getMultiaddrs()[0];
	const connection = await nodeB.dial(nodeAAddr, {
		remoteId: nodeAId,
	});

	console.log(`✅ Connection established: ${connection.id}\n`);

	// Wait for protocols to negotiate
	await new Promise((resolve) => setTimeout(resolve, 1000));

	// =========================================================================
	// Trigger Status Exchange
	// =========================================================================
	console.log("📨 Triggering ETH Status Exchange...\n");

	const nodeARLPxConn = (
		nodeA.getConnections()[0] as any
	)?.getRLPxConnection?.() as RLPxConnection | undefined;
	const nodeBRLPxConn = (connection as any).getRLPxConnection?.() as
		| RLPxConnection
		| undefined;

	if (nodeARLPxConn && nodeBRLPxConn) {
		const nodeAEth = nodeARLPxConn
			.getProtocols()
			.find((p) => p.constructor.name === "ETH") as ETH | undefined;
		const nodeBEth = nodeBRLPxConn
			.getProtocols()
			.find((p) => p.constructor.name === "ETH") as ETH | undefined;

		if (nodeAEth && nodeBEth) {
			const testGenesisHash = createHash("sha256")
				.update("test-genesis")
				.digest();
			const testBestHash = createHash("sha256")
				.update("test-best-block")
				.digest();

			const statusOpts: EthStatusOpts = {
				td: new Uint8Array([0x01]),
				bestHash: testBestHash,
				genesisHash: testGenesisHash,
			};

			nodeAEth.sendStatus(statusOpts);
			nodeBEth.sendStatus(statusOpts);

			console.log("   📤 Status sent from both sides\n");
		}
	}

	// Wait for peer to be added to pool
	console.log("⏳ Waiting for peer to be added to pool...\n");
	await new Promise((resolve) => setTimeout(resolve, 3000));

	// =========================================================================
	// Verify Pool State
	// =========================================================================
	console.log("🔍 Verifying Pool State...\n");

	console.log(`   Pool size: ${peerPool.size}`);
	console.log(`   Pool peers: ${peerPool.peers.length}`);
	console.log(`   Events received: ${eventsReceived.join(", ")}\n`);

	const checks: Array<{ name: string; passed: boolean; message: string }> = [];

	checks.push({
		name: "Pool has at least one peer",
		passed: peerPool.size > 0,
		message: `Pool size: ${peerPool.size}`,
	});

	if (peerPool.size > 0) {
		const peer = peerPool.peers[0];
		checks.push({
			name: "Peer is P2PPeer",
			passed: peer.constructor.name === "P2PPeer",
			message: `Peer type: ${peer.constructor.name}`,
		});

		checks.push({
			name: "Pool contains peer",
			passed: peerPool.contains(peer),
			message: `Contains check: ${peerPool.contains(peer)}`,
		});

		checks.push({
			name: "Pool contains peer by ID",
			passed: peerPool.contains(peer.id),
			message: `Contains by ID: ${peerPool.contains(peer.id)}`,
		});

		checks.push({
			name: "Peer has ETH protocol",
			passed: peer.eth !== undefined,
			message: peer.eth ? "ETH protocol present" : "ETH protocol missing",
		});

		// Test idle peer selection
		const idlePeer = peerPool.idle();
		checks.push({
			name: "Can get idle peer",
			passed: idlePeer !== undefined,
			message: idlePeer
				? `Idle peer: ${idlePeer.id.slice(0, 8)}...`
				: "No idle peer",
		});
	}

	// Print results
	console.log("📊 Test Results:\n");
	for (const check of checks) {
		const icon = check.passed ? "✅" : "❌";
		console.log(`   ${icon} ${check.name}`);
		console.log(`      ${check.message}\n`);
	}

	const allPassed = checks.every((c) => c.passed);
	if (!allPassed) {
		throw new Error("Some checks failed!");
	}

	// =========================================================================
	// Test Disconnect
	// =========================================================================
	console.log("🔒 Testing disconnect...\n");
	await connection.close();
	await new Promise((resolve) => setTimeout(resolve, 1000));

	console.log(`   Pool size after disconnect: ${peerPool.size}\n`);

	// =========================================================================
	// Cleanup
	// =========================================================================
	console.log("🧹 Cleaning up...\n");

	await peerPool.stop();
	await peerPool.close();
	await nodeB.stop();
	await nodeA.stop();

	console.log("=".repeat(70));
	console.log("✅ Test completed successfully!");
	console.log("=".repeat(70) + "\n");

	process.exit(0);
}

main().catch((err) => {
	console.error("\n❌ Test failed:", err);
	console.error(err.stack);
	process.exit(1);
});
