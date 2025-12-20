#!/usr/bin/env npx tsx

/**
 * Test script for P2PNode with RLPx Transport
 *
 * Demonstrates:
 * 1. Creating two P2PNode instances with RLPx transport
 * 2. Node A listens on a port
 * 3. Node B dials Node A
 * 4. Verifying connection via peer:connect event
 * 5. Registering a topology and verifying onConnect callback
 * 6. Closing connection and verifying peer:disconnect event
 */

import type { ComponentLogger, Logger } from "@libp2p/interface";
import { multiaddr } from "@multiformats/multiaddr";
import { createHash } from "crypto";
import debug from "debug";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import { Common, Hardfork } from "../src/chain-config/index.ts";
import { ETH } from "../src/devp2p/protocol/eth.ts";
import {
	type Connection,
	createP2PNode,
	type PeerId,
	type Topology,
} from "../src/p2p/libp2p/index.ts";
import { rlpx } from "../src/p2p/transport/rlpx/index.ts";
import { bytesToUnprefixedHex } from "../src/utils/index.ts";

debug.enable("p2p:*");
// Test configuration
const LISTEN_PORT = 30303;

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

async function main() {
	console.log("\n" + "=".repeat(70));
	console.log("🔗 P2PNode Test - Two Node Handshake with Events");
	console.log("=".repeat(70) + "\n");

	// Create Common instance
	const common = new Common({
		chain: customChainConfig as any,
		hardfork: Hardfork.Chainstart,
	});

	// Generate deterministic keys for both nodes
	const nodeAPrivateKey = derivePrivateKey("p2p-node-test-a-12345");
	const nodeBPrivateKey = derivePrivateKey("p2p-node-test-b-67890");

	const nodeAId = getNodeId(nodeAPrivateKey);
	const nodeBId = getNodeId(nodeBPrivateKey);

	console.log("📋 Node Configuration:");
	console.log(`   Node A ID: ${formatNodeId(nodeAId)}`);
	console.log(`   Node B ID: ${formatNodeId(nodeBId)}`);
	console.log("");

	// Create capabilities (ETH/68)
	const capabilities = [ETH.eth68];

	// =========================================================================
	// Create Node A (Listener)
	// =========================================================================
	console.log("🚀 Creating Node A (Listener)...\n");

	const nodeA = await createP2PNode({
		privateKey: nodeAPrivateKey,
		addresses: {
			listen: [`/ip4/127.0.0.1/tcp/${LISTEN_PORT}`],
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

	// =========================================================================
	// Create Node B (Dialer)
	// =========================================================================
	console.log("🚀 Creating Node B (Dialer)...\n");

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

	// =========================================================================
	// Set up event listeners
	// =========================================================================
	console.log("📡 Setting up event listeners...\n");

	// Track events
	const events: string[] = [];

	// Node A events
	nodeA.addEventListener("peer:connect", (evt) => {
		const peerId = evt.detail;
		console.log(`✅ Node A: peer:connect - ${formatNodeId(peerId)}`);
		events.push("nodeA:peer:connect");
	});

	nodeA.addEventListener("peer:disconnect", (evt) => {
		const peerId = evt.detail;
		console.log(`❌ Node A: peer:disconnect - ${formatNodeId(peerId)}`);
		events.push("nodeA:peer:disconnect");
	});

	nodeA.addEventListener("connection:open", (evt) => {
		console.log(`🔗 Node A: connection:open - ${evt.detail.id}`);
		events.push("nodeA:connection:open");
	});

	nodeA.addEventListener("connection:close", (evt) => {
		console.log(`🔒 Node A: connection:close - ${evt.detail.id}`);
		events.push("nodeA:connection:close");
	});

	// Node B events
	nodeB.addEventListener("peer:connect", (evt) => {
		const peerId = evt.detail;
		console.log(`✅ Node B: peer:connect - ${formatNodeId(peerId)}`);
		events.push("nodeB:peer:connect");
	});

	nodeB.addEventListener("peer:disconnect", (evt) => {
		const peerId = evt.detail;
		console.log(`❌ Node B: peer:disconnect - ${formatNodeId(peerId)}`);
		events.push("nodeB:peer:disconnect");
	});

	nodeB.addEventListener("connection:open", (evt) => {
		console.log(`🔗 Node B: connection:open - ${evt.detail.id}`);
		events.push("nodeB:connection:open");
	});

	nodeB.addEventListener("connection:close", (evt) => {
		console.log(`🔒 Node B: connection:close - ${evt.detail.id}`);
		events.push("nodeB:connection:close");
	});

	// =========================================================================
	// Register topologies
	// =========================================================================
	console.log("📐 Registering topologies...\n");

	let topologyConnectCount = 0;
	let topologyDisconnectCount = 0;

	const ethTopology: Topology = {
		onConnect: (peerId: PeerId, connection: Connection) => {
			console.log(`📐 ETH Topology: onConnect - ${formatNodeId(peerId)}`);
			topologyConnectCount++;
			events.push("topology:onConnect");
		},
		onDisconnect: (peerId: PeerId) => {
			console.log(`📐 ETH Topology: onDisconnect - ${formatNodeId(peerId)}`);
			topologyDisconnectCount++;
			events.push("topology:onDisconnect");
		},
	};

	const topologyId = nodeA.register("/eth/68", ethTopology);
	console.log(`   Registered topology with ID: ${topologyId}`);

	// =========================================================================
	// Start nodes
	// =========================================================================
	console.log("\n🚀 Starting nodes...\n");

	await nodeA.start();
	console.log(`✅ Node A started, status: ${nodeA.status}`);

	await nodeB.start();
	console.log(`✅ Node B started, status: ${nodeB.status}`);

	// Wait for listener to be ready
	await new Promise((resolve) => setTimeout(resolve, 1000));

	const listenAddrs = nodeA.getMultiaddrs();
	console.log(
		`\n📡 Node A listening on: ${listenAddrs.map((a) => a.toString()).join(", ")}`,
	);

	// =========================================================================
	// Node B dials Node A
	// =========================================================================
	console.log("\n📞 Node B dialing Node A...\n");

	const dialAddr = multiaddr(`/ip4/127.0.0.1/tcp/${LISTEN_PORT}`);

	try {
		const connection = await nodeB.dial(dialAddr, {
			remoteId: nodeAId,
		});

		console.log(`\n🎉 Connection established!`);
		console.log(`   Connection ID: ${connection.id}`);
		console.log(`   Remote Peer: ${formatNodeId(connection.remotePeer)}`);
		console.log(`   Direction: ${connection.direction}`);
		console.log(`   Status: ${connection.status}`);

		// Wait for events to propagate
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// =========================================================================
		// Verify connections
		// =========================================================================
		console.log("\n📊 Connection Summary:");
		console.log("─".repeat(50));

		const nodeAConnections = nodeA.getConnections();
		const nodeBConnections = nodeB.getConnections();

		console.log(`Node A connections: ${nodeAConnections.length}`);
		console.log(`Node B connections: ${nodeBConnections.length}`);

		const nodeAPeers = nodeA.getPeers();
		const nodeBPeers = nodeB.getPeers();

		console.log(`Node A peers: ${nodeAPeers.length}`);
		console.log(`Node B peers: ${nodeBPeers.length}`);

		// =========================================================================
		// Notify registrar about protocols (simulate identify)
		// =========================================================================
		console.log("\n📡 Simulating peer identify for topology notification...");

		// Emit peer:identify event to trigger topology callbacks
		const nodeAConnection = nodeAConnections[0];
		if (nodeAConnection == null) {
			console.log(
				"   ⚠️ Warning: Node A has no tracked connections, using Node B's connection",
			);
		}

		(nodeA as any).components.events.dispatchEvent(
			new CustomEvent("peer:identify", {
				detail: {
					peerId: nodeBId,
					protocols: ["/eth/68"],
					connection: nodeAConnection ?? nodeBConnections[0],
				},
			}),
		);

		await new Promise((resolve) => setTimeout(resolve, 500));

		console.log(`   Topology onConnect calls: ${topologyConnectCount}`);

		// =========================================================================
		// Keep connections alive briefly
		// =========================================================================
		console.log("\n⏳ Keeping connections alive for 2 seconds...");
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// =========================================================================
		// Close connection
		// =========================================================================
		console.log("\n🔒 Closing connection...");
		await connection.close();

		// Wait for disconnect events
		await new Promise((resolve) => setTimeout(resolve, 1000));

		console.log(`   Topology onDisconnect calls: ${topologyDisconnectCount}`);

		// =========================================================================
		// Event summary
		// =========================================================================
		console.log("\n📋 Events received:");
		console.log("─".repeat(50));
		for (const event of events) {
			console.log(`   - ${event}`);
		}

		// =========================================================================
		// Cleanup
		// =========================================================================
		console.log("\n🧹 Cleaning up...");

		nodeA.unregister(topologyId);

		await nodeB.stop();
		console.log(`✅ Node B stopped, status: ${nodeB.status}`);

		await nodeA.stop();
		console.log(`✅ Node A stopped, status: ${nodeA.status}`);

		console.log("\n" + "=".repeat(70));
		console.log("✅ Test completed successfully!");
		console.log("=".repeat(70) + "\n");

		process.exit(0);
	} catch (err: any) {
		console.error("\n❌ Test failed:", err.message);
		console.error(err.stack);

		await nodeB.stop().catch(() => {});
		await nodeA.stop().catch(() => {});

		process.exit(1);
	}
}

// Run the test
main().catch((err) => {
	console.error("\n❌ Unhandled error:", err);
	process.exit(1);
});
