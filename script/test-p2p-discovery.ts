#!/usr/bin/env npx tsx

/**
 * Test script for P2PNode with DPT Peer Discovery
 *
 * Demonstrates the full discovery-to-connection flow:
 * 1. Node A starts with DPT discovery listening on UDP
 * 2. Node B starts with DPT discovery and Node A as bootstrap
 * 3. Node B discovers Node A via DPT ping/pong
 * 4. DPT emits peer:added, which triggers peer:discovery
 * 5. Connection is established automatically (autoDialBootstrap: true)
 * 6. ETH STATUS messages are exchanged
 * 7. Topology callbacks fire
 *
 * Key difference from test-p2p-node.ts:
 * - NO manual dial() call - connection initiated by discovery
 * - Uses DPT UDP layer for peer discovery
 */

import type { ComponentLogger, Logger } from "@libp2p/interface";
import { createHash } from "crypto";
import debug from "debug";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import { Common, Hardfork } from "../src/chain-config/index.ts";
import { ETH, type EthStatusOpts } from "../src/devp2p/protocol/eth.ts";
import {
	type Connection,
	createP2PNode,
	dptDiscovery,
	type PeerId,
	type PeerInfo,
	type Topology,
} from "../src/p2p/libp2p/index.ts";
import type { RLPxConnection } from "../src/p2p/transport/rlpx/connection.ts";
import { rlpx } from "../src/p2p/transport/rlpx/index.ts";
import { bytesToUnprefixedHex } from "../src/utils/index.ts";

debug.enable("p2p:*");

// Test configuration
const TCP_PORT_A = 30303;
const TCP_PORT_B = 30304; // Different port for Node B
const UDP_PORT_A = 30301;
const UDP_PORT_B = 30302;

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
	log.trace = (_formatter: string, ..._args: any[]) => {};
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
	console.log("🔍 P2PNode Test - Peer Discovery with DPT");
	console.log("=".repeat(70) + "\n");

	// Create Common instance
	const common = new Common({
		chain: customChainConfig as any,
		hardfork: Hardfork.Chainstart,
	});

	// Generate deterministic keys for both nodes
	const nodeAPrivateKey = derivePrivateKey("discovery-test-node-a-12345");
	const nodeBPrivateKey = derivePrivateKey("discovery-test-node-b-67890");

	const nodeAId = getNodeId(nodeAPrivateKey);
	const nodeBId = getNodeId(nodeBPrivateKey);

	console.log("📋 Node Configuration:");
	console.log(`   Node A ID: ${formatNodeId(nodeAId)}`);
	console.log(`   Node B ID: ${formatNodeId(nodeBId)}`);
	console.log(`   Node A: TCP ${TCP_PORT_A}, UDP ${UDP_PORT_A}`);
	console.log(`   Node B: TCP ${TCP_PORT_B}, UDP ${UDP_PORT_B}`);
	console.log("");

	// Create capabilities (ETH/68)
	const capabilities = [ETH.eth68];

	// Track events
	const events: string[] = [];

	// =========================================================================
	// Create Node A (Listener/Bootstrap Node)
	// =========================================================================
	console.log("🚀 Creating Node A (Bootstrap Node)...\n");

	const nodeA = await createP2PNode({
		privateKey: nodeAPrivateKey,
		addresses: {
			listen: [`/ip4/127.0.0.1/tcp/${TCP_PORT_A}`],
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
		peerDiscovery: [
			(components) =>
				dptDiscovery({
					privateKey: nodeAPrivateKey,
					bindAddr: "127.0.0.1",
					bindPort: UDP_PORT_A,
					// Node A has no bootstrap nodes - it IS the bootstrap node
					bootstrapNodes: [],
					autoDial: false,
					autoDialBootstrap: false,
				})(components),
		],
		logger: createComponentLogger("node-a"),
	});

	// =========================================================================
	// Create Node B (Discoverer)
	// =========================================================================
	console.log("🚀 Creating Node B (Discoverer)...\n");

	const nodeB = await createP2PNode({
		privateKey: nodeBPrivateKey,
		addresses: {
			listen: [`/ip4/127.0.0.1/tcp/${TCP_PORT_B}`],
		},
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
		peerDiscovery: [
			(components) =>
				dptDiscovery({
					privateKey: nodeBPrivateKey,
					bindAddr: "127.0.0.1",
					bindPort: UDP_PORT_B,
					// Node A is our bootstrap node
					bootstrapNodes: [
						{
							id: nodeAId,
							address: "127.0.0.1",
							udpPort: UDP_PORT_A,
							tcpPort: TCP_PORT_A,
						},
					],
					autoDial: false,
					autoDialBootstrap: true, // Auto-dial bootstrap node!
					discoveryDelay: 500, // Quick startup for test
				})(components),
		],
		logger: createComponentLogger("node-b"),
	});

	// =========================================================================
	// Set up event listeners
	// =========================================================================
	console.log("📡 Setting up event listeners...\n");

	// Connection tracking
	const connectionPromise = new Promise<Connection>((resolve) => {
		nodeB.addEventListener("peer:connect", (evt) => {
			const peerId = evt.detail;
			console.log(`✅ Node B: peer:connect - ${formatNodeId(peerId)}`);
			events.push("nodeB:peer:connect");
		});

		nodeB.addEventListener("connection:open", (evt) => {
			const conn = evt.detail;
			console.log(`🔗 Node B: connection:open - ${conn.id}`);
			events.push("nodeB:connection:open");
			resolve(conn);
		});
	});

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
	nodeB.addEventListener("peer:disconnect", (evt) => {
		const peerId = evt.detail;
		console.log(`❌ Node B: peer:disconnect - ${formatNodeId(peerId)}`);
		events.push("nodeB:peer:disconnect");
	});

	nodeB.addEventListener("connection:close", (evt) => {
		console.log(`🔒 Node B: connection:close - ${evt.detail.id}`);
		events.push("nodeB:connection:close");
	});

	// IMPORTANT: Listen for peer:discovery events
	nodeA.addEventListener("peer:discovery", (evt: CustomEvent<PeerInfo>) => {
		const peer = evt.detail;
		console.log(`🔍 Node A: peer:discovery - ${formatNodeId(peer.id)}`);
		events.push("nodeA:peer:discovery");
	});

	nodeB.addEventListener("peer:discovery", (evt: CustomEvent<PeerInfo>) => {
		const peer = evt.detail;
		console.log(`🔍 Node B: peer:discovery - ${formatNodeId(peer.id)}`);
		events.push("nodeB:peer:discovery");
	});

	// =========================================================================
	// Register topologies
	// =========================================================================
	console.log("📐 Registering topologies...\n");

	let topologyConnectCount = 0;
	let topologyDisconnectCount = 0;

	const ethTopology: Topology = {
		onConnect: (peerId: PeerId, _connection: Connection) => {
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
	// Start nodes - DPT will discover and connect automatically!
	// =========================================================================
	console.log("\n🚀 Starting nodes...\n");

	await nodeA.start();
	console.log(`✅ Node A started, status: ${nodeA.status}`);

	await nodeB.start();
	console.log(`✅ Node B started, status: ${nodeB.status}`);

	// Wait for listener to be ready
	await new Promise((resolve) => setTimeout(resolve, 500));

	const listenAddrs = nodeA.getMultiaddrs();
	console.log(
		`\n📡 Node A listening on: ${listenAddrs.map((a) => a.toString()).join(", ")}`,
	);

	// =========================================================================
	// Wait for DPT discovery and automatic connection
	// =========================================================================
	console.log("\n⏳ Waiting for DPT discovery and automatic connection...\n");
	console.log("   (Node B should discover Node A via UDP and auto-dial)\n");

	try {
		// Wait for connection with timeout
		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(
				() => reject(new Error("Connection timeout - DPT discovery failed")),
				15000,
			);
		});

		const connection = await Promise.race([connectionPromise, timeoutPromise]);

		console.log(`\n🎉 Connection established via peer discovery!`);
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

		const nodeAConnection = nodeAConnections[0];
		if (nodeAConnection) {
			(nodeA as any).components.events.dispatchEvent(
				new CustomEvent("peer:identify", {
					detail: {
						peerId: nodeBId,
						protocols: ["/eth/68"],
						connection: nodeAConnection,
					},
				}),
			);
		}

		await new Promise((resolve) => setTimeout(resolve, 500));

		console.log(`   Topology onConnect calls: ${topologyConnectCount}`);

		// =========================================================================
		// ETH Protocol Status Exchange
		// =========================================================================
		console.log("\n📨 Testing ETH Protocol Status Exchange...");
		console.log("─".repeat(50));

		const nodeBRLPxConn = (connection as any).getRLPxConnection?.() as
			| RLPxConnection
			| undefined;
		const nodeARLPxConn = (nodeAConnection as any)?.getRLPxConnection?.() as
			| RLPxConnection
			| undefined;

		if (nodeBRLPxConn && nodeARLPxConn) {
			const nodeBProtocols = nodeBRLPxConn.getProtocols();
			const nodeAProtocols = nodeARLPxConn.getProtocols();

			const nodeBEth = nodeBProtocols.find(
				(p) => p.constructor.name === "ETH",
			) as ETH | undefined;
			const nodeAEth = nodeAProtocols.find(
				(p) => p.constructor.name === "ETH",
			) as ETH | undefined;

			if (nodeBEth && nodeAEth) {
				console.log(`   Node A ETH version: ${nodeAEth.getVersion()}`);
				console.log(`   Node B ETH version: ${nodeBEth.getVersion()}`);

				// Create test status options
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

				// Set up status event handlers
				let nodeAStatusReceived = false;
				let nodeBStatusReceived = false;

				const statusPromise = new Promise<void>((resolve, reject) => {
					const timeout = setTimeout(() => {
						reject(new Error("Status exchange timed out"));
					}, 5000);

					nodeAEth.events.on("status", (_status) => {
						console.log("   ✅ Node A received STATUS from Node B");
						nodeAStatusReceived = true;
						events.push("nodeA:eth:status:received");
						if (nodeAStatusReceived && nodeBStatusReceived) {
							clearTimeout(timeout);
							resolve();
						}
					});

					nodeBEth.events.on("status", (_status) => {
						console.log("   ✅ Node B received STATUS from Node A");
						nodeBStatusReceived = true;
						events.push("nodeB:eth:status:received");
						if (nodeAStatusReceived && nodeBStatusReceived) {
							clearTimeout(timeout);
							resolve();
						}
					});
				});

				console.log("\n   📤 Node A sending STATUS...");
				nodeAEth.sendStatus(statusOpts);

				console.log("   📤 Node B sending STATUS...");
				nodeBEth.sendStatus(statusOpts);

				try {
					await statusPromise;
					console.log("\n   🎉 ETH Status exchange successful!");
				} catch (err: any) {
					console.log(`\n   ❌ ETH Status exchange failed: ${err.message}`);
				}
			}
		}

		// =========================================================================
		// Keep connections alive briefly
		// =========================================================================
		console.log("\n⏳ Keeping connections alive for 2 seconds...");
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// // =========================================================================
		// // Close connection
		// // =========================================================================
		// console.log("\n🔒 Closing connection...");
		// await connection.close();

		// Wait for disconnect events
		await new Promise((resolve) => setTimeout(resolve, 10000));

		console.log(`   Topology onDisconnect calls: ${topologyDisconnectCount}`);

		// =========================================================================
		// Event summary
		// =========================================================================
		// console.log("\n📋 Events received:");
		// console.log("─".repeat(50));
		// for (const event of events) {
		// 	console.log(`   - ${event}`);
		// }

		// // =========================================================================
		// // Cleanup
		// // =========================================================================
		// console.log("\n🧹 Cleaning up...");

		// nodeA.unregister(topologyId);

		// await nodeB.stop();
		// console.log(`✅ Node B stopped, status: ${nodeB.status}`);

		// await nodeA.stop();
		// console.log(`✅ Node A stopped, status: ${nodeA.status}`);

		// console.log("\n" + "=".repeat(70));
		// console.log("✅ DPT Discovery Test completed successfully!");
		// console.log("=".repeat(70) + "\n");

		// process.exit(0);
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
