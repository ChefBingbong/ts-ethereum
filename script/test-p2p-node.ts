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
import {
	ETH,
	EthStatusEncoded,
	type EthStatusOpts,
} from "../src/devp2p/protocol/eth.ts";
import {
	type Connection,
	createP2PNode,
	type PeerId,
	type Topology,
} from "../src/p2p/libp2p/index.ts";
import type { RLPxConnection } from "../src/p2p/transport/rlpx/connection.ts";
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
		// ETH Protocol Status Exchange
		// =========================================================================
		console.log("\n📨 Testing ETH Protocol Status Exchange...");
		console.log("─".repeat(50));

		// Get RLPx connections from both sides
		const nodeBRLPxConn = (connection as any).getRLPxConnection?.() as
			| RLPxConnection
			| undefined;
		const nodeARLPxConn = (nodeAConnection as any)?.getRLPxConnection?.() as
			| RLPxConnection
			| undefined;

		if (!nodeBRLPxConn) {
			console.log("   ⚠️ Could not get RLPx connection from Node B wrapper");
		} else if (!nodeARLPxConn) {
			console.log("   ⚠️ Could not get RLPx connection from Node A wrapper");
		} else {
			// Get ETH protocols from both connections
			const nodeBProtocols = nodeBRLPxConn.getProtocols();
			const nodeAProtocols = nodeARLPxConn.getProtocols();

			const nodeBEth = nodeBProtocols.find(
				(p) => p.constructor.name === "ETH",
			) as ETH | undefined;
			const nodeAEth = nodeAProtocols.find(
				(p) => p.constructor.name === "ETH",
			) as ETH | undefined;

			console.log(
				`   Node A protocols: ${nodeAProtocols.map((p) => p.constructor.name).join(", ")}`,
			);
			console.log(
				`   Node B protocols: ${nodeBProtocols.map((p) => p.constructor.name).join(", ")}`,
			);

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
					td: new Uint8Array([0x01]), // Total difficulty = 1
					bestHash: testBestHash,
					genesisHash: testGenesisHash,
				};

				// Set up status event handlers
				let nodeAStatusReceived = false;
				let nodeBStatusReceived = false;
				let nodeAStatus: any = null;
				let nodeBStatus: any = null;

				const statusPromise = new Promise<void>((resolve, reject) => {
					const timeout = setTimeout(() => {
						reject(new Error("Status exchange timed out"));
					}, 5000);

					nodeAEth.events.on("status", (_status) => {
						const status = nodeAEth.decodeStatus(_status as EthStatusEncoded);
						console.log("   ✅ Node A received STATUS from Node B");
						console.log(`      Chain ID: ${status.chainId}`);
						console.log(`      TD: ${status.td}`);
						console.log(
							`      Genesis Hash: ${(status.genesisHash).slice(0, 16)}...`,
						);
						nodeAStatusReceived = true;
						nodeAStatus = status;
						events.push("nodeA:eth:status:received");
						if (nodeAStatusReceived && nodeBStatusReceived) {
							clearTimeout(timeout);
							resolve();
						}
					});

					nodeBEth.events.on("status", (status) => {
						console.log("   ✅ Node B received STATUS from Node A");
						console.log(`      Chain ID: ${status.chainId}`);
						console.log(`      TD: ${status.td.length > 0 ? status.td[0] : 0}`);
						console.log(
							`      Genesis Hash: ${bytesToUnprefixedHex(status.genesisHash).slice(0, 16)}...`,
						);
						nodeBStatusReceived = true;
						nodeBStatus = status;
						events.push("nodeB:eth:status:received");
						if (nodeAStatusReceived && nodeBStatusReceived) {
							clearTimeout(timeout);
							resolve();
						}
					});
				});

				// Send STATUS from both sides
				console.log("\n   📤 Node A sending STATUS...");
				nodeAEth.sendStatus(statusOpts);

				console.log("   📤 Node B sending STATUS...");
				nodeBEth.sendStatus(statusOpts);

				try {
					await statusPromise;
					console.log("\n   🎉 ETH Status exchange successful!");
					console.log("   ─".repeat(25));
					console.log(
						`   Node A received status: ${nodeAStatusReceived ? "✅" : "❌"}`,
					);
					console.log(
						`   Node B received status: ${nodeBStatusReceived ? "✅" : "❌"}`,
					);
				} catch (err: any) {
					console.log(`\n   ❌ ETH Status exchange failed: ${err.message}`);
				}
			} else {
				console.log("   ⚠️ ETH protocol not found on one or both connections");
				console.log(`   Node A ETH: ${nodeAEth ? "found" : "not found"}`);
				console.log(`   Node B ETH: ${nodeBEth ? "found" : "not found"}`);
			}
		}

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
