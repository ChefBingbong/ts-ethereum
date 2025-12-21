#!/usr/bin/env npx tsx

/**
 * Test script for ETH Protocol Handler STATUS exchange
 *
 * Tests that two P2P nodes can connect and complete STATUS exchange
 * using the new EthHandler.
 */

import { createHash } from "crypto";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import { Common, Hardfork } from "../src/chain-config/index.ts";
import { P2PConfig } from "../src/client/p2p-config.ts";
import { P2PFullEthereumService } from "../src/client/service/p2p-fullethereumservice.ts";
import { ETH } from "../src/devp2p/protocol/eth.ts";
import { createP2PNode, dptDiscovery } from "../src/p2p/libp2p/index.ts";
import type { ComponentLogger, Logger } from "../src/p2p/libp2p/types.ts";
import { EthHandler } from "../src/p2p/protocol/eth/handler";
import type { RLPxConnection } from "../src/p2p/transport/rlpx/connection.ts";
import { rlpx } from "../src/p2p/transport/rlpx/index.ts";

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
 * Create a simple logger
 */
function createSimpleLogger(component: string): Logger {
	const prefix = `[${component}]`;
	const log = (formatter: string, ...args: unknown[]) => {
		console.log(`${prefix} ${formatter}`, ...args);
	};
	log.enabled = true;
	log.trace = (_formatter: string, ..._args: unknown[]) => {};
	log.error = (formatter: string, ...args: unknown[]) => {
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

async function testStatusExchange() {
	console.log("\n" + "=".repeat(70));
	console.log("🧪 Testing ETH Handler STATUS Exchange");
	console.log("=".repeat(70) + "\n");

	// Create Common instance
	const common = new Common({
		chain: customChainConfig as any,
		hardfork: Hardfork.Chainstart,
		params: {},
	});

	try {
		// Create two nodes with discovery enabled
		const nodeAPrivateKey = derivePrivateKey("eth-handler-test-a");
		const nodeBPrivateKey = derivePrivateKey("eth-handler-test-b");

		const nodeAId = getNodeId(nodeAPrivateKey);

		const TCP_PORT_A = 30303;
		const TCP_PORT_B = 30304;
		const UDP_PORT_A = 30301;
		const UDP_PORT_B = 30302;

		console.log(`   Node A: TCP ${TCP_PORT_A}, UDP ${UDP_PORT_A}`);
		console.log(`   Node B: TCP ${TCP_PORT_B}, UDP ${UDP_PORT_B}\n`);

		// Create Node A (Bootstrap Node)
		const nodeA = await createP2PNode({
			privateKey: nodeAPrivateKey,
			addresses: {
				listen: [`/ip4/127.0.0.1/tcp/${TCP_PORT_A}`],
			},
			transports: [
				(components) =>
					rlpx({
						privateKey: nodeAPrivateKey,
						capabilities: [ETH.eth68],
						common,
						timeout: 10000,
					})({
						logger: components.logger,
					}) as any,
			],
			peerDiscovery: [
				(components) =>
					dptDiscovery({
						privateKey: nodeAPrivateKey,
						bindAddr: "127.0.0.1",
						bindPort: UDP_PORT_A,
						bootstrapNodes: [],
						autoDial: false,
						autoDialBootstrap: false,
					})(components),
			],
			logger: createComponentLogger("node-a") as any,
			maxConnections: 10,
		} as any);

		// Create Node B (Discoverer) with Node A as bootstrap
		const nodeB = await createP2PNode({
			privateKey: nodeBPrivateKey,
			addresses: {
				listen: [`/ip4/127.0.0.1/tcp/${TCP_PORT_B}`],
			},
			transports: [
				(components) =>
					rlpx({
						privateKey: nodeBPrivateKey,
						capabilities: [ETH.eth68],
						common,
						timeout: 10000,
					})({
						logger: components.logger,
					}) as any,
			],
			peerDiscovery: [
				(components) =>
					dptDiscovery({
						privateKey: nodeBPrivateKey,
						bindAddr: "127.0.0.1",
						bindPort: UDP_PORT_B,
						bootstrapNodes: [
							{
								id: nodeAId,
								address: "127.0.0.1",
								tcpPort: TCP_PORT_A,
								udpPort: UDP_PORT_A,
							},
						],
						autoDial: false,
						autoDialBootstrap: true, // Auto-dial bootstrap nodes
					})(components),
			],
			logger: createComponentLogger("node-b") as any,
			maxConnections: 10,
		} as any);

		// Create P2PConfigs
		const configA = new P2PConfig({
			common,
			syncmode: "full",
			port: TCP_PORT_A,
			maxPeers: 10,
			node: nodeA,
		});

		const configB = new P2PConfig({
			common,
			syncmode: "full",
			port: TCP_PORT_B,
			maxPeers: 10,
			node: nodeB,
		});

		// Create Chains
		const { Chain } = await import("../src/client/blockchain/chain.ts");
		const chainA = await Chain.create({
			config: configA,
			genesisState: {} as any, // Empty genesis state
		});

		const chainB = await Chain.create({
			config: configB,
			genesisState: {} as any, // Empty genesis state
		});

		// Create Services
		const serviceA = new P2PFullEthereumService({
			config: configA,
			chain: chainA,
		});

		const serviceB = new P2PFullEthereumService({
			config: configB,
			chain: chainB,
		});

		// Start both nodes
		console.log("Starting Node A...");
		await nodeA.start();
		console.log("   ✅ Node A started");

		console.log("Starting Node B...");
		await nodeB.start();
		console.log("   ✅ Node B started\n");

		// Start services
		console.log("Opening Service A...");
		await serviceA.open();
		await serviceA.start();
		console.log("   ✅ Service A started");

		console.log("Opening Service B...");
		await serviceB.open();
		await serviceB.start();
		console.log("   ✅ Service B started\n");

		// Wait for connection to be established via DPT discovery
		console.log("   ⏳ Waiting for peer connection (up to 10 seconds)...\n");
		await new Promise((resolve) => setTimeout(resolve, 10000));

		// Check connections
		const nodeAConnections = nodeA.getConnections();
		const nodeBConnections = nodeB.getConnections();

		console.log(`   Node A connections: ${nodeAConnections.length}`);
		console.log(`   Node B connections: ${nodeBConnections.length}`);
		console.log(`   Service A peers: ${serviceA.pool.peers.length}`);
		console.log(`   Service B peers: ${serviceB.pool.peers.length}\n`);

		if (nodeAConnections.length === 0 || nodeBConnections.length === 0) {
			throw new Error("No connection established between nodes");
		}

		// Get RLPx connections
		const connectionA = nodeAConnections[0];
		const connectionB = nodeBConnections[0];

		const rlpxConnA = (connectionA as any).getRLPxConnection?.() as
			| RLPxConnection
			| undefined;
		const rlpxConnB = (connectionB as any).getRLPxConnection?.() as
			| RLPxConnection
			| undefined;

		if (!rlpxConnA || !rlpxConnB) {
			throw new Error("RLPxConnection not found");
		}

		console.log("   ✅ RLPx connections found\n");

		// Check if protocols are ready and STATUS was already sent
		const protocolsA = rlpxConnA.getProtocols();
		const protocolsB = rlpxConnB.getProtocols();
		const ethProtocolA = protocolsA.find(
			(p) => p.constructor.name === "ETH",
		) as any;
		const ethProtocolB = protocolsB.find(
			(p) => p.constructor.name === "ETH",
		) as any;

		if (!ethProtocolA || !ethProtocolB) {
			throw new Error("ETH protocol not found in connections");
		}

		console.log("   ✅ ETH protocols found\n");

		// Check if STATUS was already sent/received
		// STATUS is sent by P2PPeerPool, so it should have happened already
		// But we'll wait a bit more and check the protocol's status
		console.log("   ⏳ Waiting for STATUS exchange (up to 5 seconds)...\n");

		// Set up status listeners
		let statusAReceived = false;
		let statusBReceived = false;

		ethProtocolA.events.once("status", () => {
			statusAReceived = true;
			console.log("   ✅ STATUS received on Node A");
		});

		ethProtocolB.events.once("status", () => {
			statusBReceived = true;
			console.log("   ✅ STATUS received on Node B");
		});

		// Wait for STATUS exchange
		await new Promise((resolve) => setTimeout(resolve, 5000));

		// Check if STATUS was already received (check protocol's internal state)
		const statusA = (ethProtocolA as any)._status;
		const statusB = (ethProtocolB as any)._status;

		// Create ETH handlers to verify they can read the status
		console.log("Creating ETH handlers...");
		const ethHandlerA = new EthHandler({
			config: configA,
			chain: chainA,
			execution: serviceA.execution,
			rlpxConnection: rlpxConnA,
		});

		const ethHandlerB = new EthHandler({
			config: configB,
			chain: chainB,
			execution: serviceB.execution,
			rlpxConnection: rlpxConnB,
		});

		console.log("   ✅ ETH handlers created\n");

		// Wait a bit more for handlers to process
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Check STATUS exchange
		const statusAReady = ethHandlerA.isReady || statusA !== null;
		const statusBReady = ethHandlerB.isReady || statusB !== null;

		console.log("📊 STATUS Exchange Results:");
		console.log(`   Handler A ready: ${statusAReady}`);
		console.log(`   Handler B ready: ${statusBReady}`);
		console.log(
			`   Protocol A status: ${statusA ? "received" : "not received"}`,
		);
		console.log(
			`   Protocol B status: ${statusB ? "received" : "not received"}`,
		);

		if (statusAReady && statusBReady) {
			console.log("\n   ✅ STATUS exchange completed successfully!");
			if (ethHandlerA.status) {
				console.log(`   Handler A status:`, ethHandlerA.status);
			}
			if (ethHandlerB.status) {
				console.log(`   Handler B status:`, ethHandlerB.status);
			}
		} else {
			console.log("\n   ⚠️  STATUS exchange not completed");
			if (!statusAReady) {
				console.log("   Handler A is not ready");
			}
			if (!statusBReady) {
				console.log("   Handler B is not ready");
			}
			// Try to manually check peer status
			const peerA = serviceA.pool.peers[0];
			const peerB = serviceB.pool.peers[0];
			if (peerA && (peerA as any).eth) {
				try {
					const peerAStatus = (peerA as any).eth.status;
					console.log(`   Peer A ETH status exists: ${!!peerAStatus}`);
				} catch (e) {
					console.log(`   Peer A ETH status not available`);
				}
			}
			if (peerB && (peerB as any).eth) {
				try {
					const peerBStatus = (peerB as any).eth.status;
					console.log(`   Peer B ETH status exists: ${!!peerBStatus}`);
				} catch (e) {
					console.log(`   Peer B ETH status not available`);
				}
			}
		}

		// Cleanup
		console.log("\nCleaning up...");
		await serviceA.stop();
		await serviceB.stop();
		await nodeA.stop();
		await nodeB.stop();
		console.log("   ✅ Cleanup complete\n");

		if (statusAReady && statusBReady) {
			console.log("=".repeat(70));
			console.log("✅ Test PASSED: STATUS exchange completed successfully!");
			console.log("=".repeat(70) + "\n");
			process.exit(0);
		} else {
			console.log("=".repeat(70));
			console.log("❌ Test FAILED: STATUS exchange did not complete");
			console.log("=".repeat(70) + "\n");
			process.exit(1);
		}
	} catch (error: any) {
		console.error("\n❌ Test failed:", error.message);
		console.error(error.stack);
		process.exit(1);
	}
}

testStatusExchange().catch((err) => {
	console.error("\n❌ Unhandled error:", err);
	console.error(err.stack);
	process.exit(1);
});
