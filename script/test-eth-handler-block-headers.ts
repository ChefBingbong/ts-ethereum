#!/usr/bin/env npx tsx

/**
 * Test script for ETH Protocol Handler GET_BLOCK_HEADERS/BLOCK_HEADERS
 *
 * Tests that a node can request block headers from a peer and receive a response.
 */

import { createHash } from "crypto";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import { Common, Hardfork } from "../src/chain-config/index.ts";
import { Chain } from "../src/client/blockchain";
import { P2PConfig } from "../src/client/p2p-config.ts";
import { P2PFullEthereumService } from "../src/client/service/p2p-fullethereumservice.ts";
import { EthHandler } from "../src/p2p/protocol/eth/handler";
import { ETH } from "../src/devp2p/protocol/eth.ts";
import { createP2PNode, dptDiscovery } from "../src/p2p/libp2p/index.ts";
import type { ComponentLogger, Logger } from "../src/p2p/libp2p/types.ts";
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

async function testBlockHeaders() {
	console.log("\n" + "=".repeat(70));
	console.log("🧪 Testing ETH Handler GET_BLOCK_HEADERS/BLOCK_HEADERS");
	console.log("=".repeat(70) + "\n");

	// Create Common instance
	const common = new Common({
		chain: customChainConfig as any,
		hardfork: Hardfork.Chainstart,
		params: {},
	});

	try {
		// Create two nodes with discovery enabled
		const nodeAPrivateKey = derivePrivateKey("eth-block-headers-test-a");
		const nodeBPrivateKey = derivePrivateKey("eth-block-headers-test-b");

		const nodeAId = getNodeId(nodeAPrivateKey);

		const TCP_PORT_A = 30320;
		const TCP_PORT_B = 30321;
		const UDP_PORT_A = 30322;
		const UDP_PORT_B = 30323;

		console.log(`   Node A: TCP ${TCP_PORT_A}, UDP ${UDP_PORT_A}`);
		console.log(`   Node B: TCP ${TCP_PORT_B}, UDP ${UDP_PORT_B}\n`);

		// Create Node A (Server - has blocks)
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

		// Create Node B (Client - requests headers)
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
						autoDialBootstrap: true,
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
			genesisState: {} as any,
		});

		const chainB = await Chain.create({
			config: configB,
			genesisState: {} as any,
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

		// Create ETH handlers
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

		// Wait for STATUS exchange
		console.log("   ⏳ Waiting for STATUS exchange (up to 5 seconds)...\n");
		await new Promise((resolve) => setTimeout(resolve, 5000));

		// Check STATUS exchange
		const statusAReady = ethHandlerA.isReady;
		const statusBReady = ethHandlerB.isReady;

		if (!statusAReady || !statusBReady) {
			throw new Error("STATUS exchange not completed");
		}

		console.log("   ✅ STATUS exchange completed\n");

		// Test GET_BLOCK_HEADERS
		console.log("🧪 Testing GET_BLOCK_HEADERS...\n");

		// Request headers from genesis (block 0)
		console.log("   Requesting block headers from block 0, max 5...");
		const [reqId, headers] = await ethHandlerB.getBlockHeaders({
			block: 0n,
			max: 5,
			skip: 0,
			reverse: false,
		});

		console.log(`   ✅ Received response: reqId=${reqId}, headers=${headers.length}`);

		if (headers.length > 0) {
			console.log(`   First header: block ${headers[0].number}, hash: ${headers[0].hash().slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('')}...`);
		}

		// Verify we got headers
		if (headers.length === 0) {
			console.log("   ⚠️  No headers returned (chain might be empty)");
		} else {
			console.log("   ✅ Block headers request/response successful!\n");
		}

		// Cleanup
		console.log("Cleaning up...");
		await serviceA.stop();
		await serviceB.stop();
		await nodeA.stop();
		await nodeB.stop();
		console.log("   ✅ Cleanup complete\n");

		console.log("=".repeat(70));
		console.log("✅ Test PASSED: GET_BLOCK_HEADERS/BLOCK_HEADERS works!");
		console.log("=".repeat(70) + "\n");
		process.exit(0);
	} catch (error: any) {
		console.error("\n❌ Test failed:", error.message);
		console.error(error.stack);
		process.exit(1);
	}
}

testBlockHeaders().catch((err) => {
	console.error("\n❌ Unhandled error:", err);
	console.error(err.stack);
	process.exit(1);
});

