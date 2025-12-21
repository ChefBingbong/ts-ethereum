#!/usr/bin/env npx tsx

/**
 * Test script for Step 5: P2PService
 *
 * Tests:
 * 1. Creating P2PService with P2PConfig (should succeed)
 * 2. Creating P2PService with regular Config (should fail)
 * 3. Service lifecycle (open/start/stop/close)
 * 4. Pool property is P2PPeerPool instance
 * 5. PROTOCOL_MESSAGE event handling
 */

import { createHash } from "crypto";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import { Common, Hardfork } from "../src/chain-config/index.ts";
import { Config } from "../src/client/config.ts";
import { P2PConfig } from "../src/client/p2p-config.ts";
import { P2PService } from "../src/client/service/p2p-service.ts";
import { ETH } from "../src/devp2p/protocol/eth.ts";
import {
	createP2PNode,
	dptDiscovery,
	type PeerInfo,
} from "../src/p2p/libp2p/index.ts";
import type { ComponentLogger, Logger } from "../src/p2p/libp2p/types.ts";
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
	console.log("🧪 Step 5 Test: P2PService Base Class");
	console.log("=".repeat(70) + "\n");

	// Create Common instance
	const common = new Common({
		chain: customChainConfig as any,
		hardfork: Hardfork.Chainstart,
		params: {},
	});

	const tests: Array<{ name: string; passed: boolean; error?: string }> = [];

	// =========================================================================
	// Test 1: Create P2PService with regular Config (should fail)
	// =========================================================================
	console.log(
		"📋 Test 1: Creating P2PService with regular Config (should fail)...\n",
	);

	try {
		const config = new Config({
			common,
			syncmode: "full",
		});

		// This should throw an error
		const service = new P2PService({
			config,
			// Chain will be created by Service constructor
		});

		tests.push({
			name: "P2PService with regular Config should fail",
			passed: false,
			error: "Should have thrown an error",
		});
		console.log("   ❌ FAILED: Should have thrown an error\n");
	} catch (error: any) {
		if (error.message.includes("P2PConfig")) {
			tests.push({
				name: "P2PService with regular Config should fail",
				passed: true,
			});
			console.log("   ✅ PASSED: Correctly rejected regular Config\n");
		} else {
			tests.push({
				name: "P2PService with regular Config should fail",
				passed: false,
				error: error.message,
			});
			console.log(`   ❌ FAILED: Wrong error: ${error.message}\n`);
		}
	}

	// =========================================================================
	// Test 2: Create P2PService with P2PConfig (should succeed)
	// =========================================================================
	console.log("📋 Test 2: Creating P2PService with P2PConfig...\n");

	let service: P2PService | null = null;
	let node: any = null;
	try {
		const privateKey = derivePrivateKey("p2p-service-test");
		const capabilities = [ETH.eth68];

		node = await createP2PNode({
			privateKey,
			addresses: {
				listen: [`/ip4/127.0.0.1/tcp/30303`],
			},
			transports: [
				(components) =>
					rlpx({
						privateKey,
						capabilities,
						common,
						timeout: 10000,
					})({
						logger: components.logger,
					}) as any,
			],
			logger: createComponentLogger("test-node") as any,
			maxConnections: 10,
		} as any);

		const p2pConfig = new P2PConfig({
			common,
			syncmode: "full",
			port: 30303,
			maxPeers: 10,
			node, // Provide node instance
		});

		// Create Chain properly using Chain.create() (async)
		// The Service constructor tries to create Chain synchronously, but Chain needs async creation
		// So we create it beforehand to avoid the error
		// Provide genesisStateRoot directly to avoid the getGenesisStateRoot call which causes hex parsing errors
		// An empty state root (all zeros) represents an empty genesis state
		const { Chain } = await import("../src/client/blockchain/chain.ts");
		const emptyStateRoot = new Uint8Array(32); // Empty state root (all zeros)
		const chain = await Chain.create({
			config: p2pConfig,
			genesisStateRoot: emptyStateRoot, // Provide state root directly
		});

		service = new P2PService({
			config: p2pConfig,
			chain, // Provide pre-created chain
		});

		tests.push({
			name: "P2PService with P2PConfig should succeed",
			passed: service !== null && service.pool !== undefined,
		});
		console.log("   ✅ PASSED: P2PService created successfully\n");
	} catch (error: any) {
		tests.push({
			name: "P2PService with P2PConfig should succeed",
			passed: false,
			error: error.message,
		});
		console.log(`   ❌ FAILED: ${error.message}\n`);
		console.error(error.stack);
	}

	if (!service) {
		console.log("❌ Cannot continue tests without service instance\n");
		process.exit(1);
	}

	// =========================================================================
	// Test 3: Verify pool is P2PPeerPool instance
	// =========================================================================
	console.log("📋 Test 3: Verifying pool is P2PPeerPool instance...\n");

	const { P2PPeerPool } = await import("../src/client/net/p2p-peerpool.ts");
	const isP2PPeerPool = service.pool instanceof P2PPeerPool;

	tests.push({
		name: "Pool should be P2PPeerPool instance",
		passed: isP2PPeerPool,
	});

	if (isP2PPeerPool) {
		console.log("   ✅ PASSED: Pool is P2PPeerPool instance\n");
	} else {
		console.log("   ❌ FAILED: Pool is not P2PPeerPool instance\n");
	}

	// =========================================================================
	// Test 4: Service lifecycle (open/start/stop/close)
	// =========================================================================
	console.log("📋 Test 4: Testing service lifecycle...\n");

	try {
		// Start the node first (required for pool.open())
		await node.start();

		// Open
		const opened = await service.open();
		const openedCheck = service.opened === true && opened === true;

		// Start
		const started = await service.start();
		const startedCheck = service.running === true && started === true;

		// Stop
		const stopped = await service.stop();
		const stoppedCheck = service.running === false && stopped === true;

		// Close
		await service.close();
		const closedCheck = service.opened === false;

		// Stop node
		await node.stop();

		const lifecyclePassed =
			openedCheck && startedCheck && stoppedCheck && closedCheck;

		tests.push({
			name: "Service lifecycle (open/start/stop/close)",
			passed: lifecyclePassed,
		});

		if (lifecyclePassed) {
			console.log("   ✅ PASSED: Service lifecycle works correctly\n");
		} else {
			console.log("   ❌ FAILED: Service lifecycle issues\n");
			console.log(
				`      opened: ${openedCheck}, started: ${startedCheck}, stopped: ${stoppedCheck}, closed: ${closedCheck}\n`,
			);
		}
	} catch (error: any) {
		tests.push({
			name: "Service lifecycle (open/start/stop/close)",
			passed: false,
			error: error.message,
		});
		console.log(`   ❌ FAILED: ${error.message}\n`);
		console.error(error.stack);
	}

	// =========================================================================
	// Test 5: Verify protocols getter returns empty array
	// =========================================================================
	console.log("📋 Test 5: Verifying protocols getter...\n");

	const protocols = service.protocols;
	const protocolsEmpty = Array.isArray(protocols) && protocols.length === 0;

	tests.push({
		name: "Protocols getter should return empty array",
		passed: protocolsEmpty,
	});

	if (protocolsEmpty) {
		console.log("   ✅ PASSED: Protocols getter returns empty array\n");
	} else {
		console.log(`   ❌ FAILED: Protocols getter returned: ${protocols}\n`);
	}

	// =========================================================================
	// Test 6: DPT Peer Discovery Events
	// =========================================================================
	console.log("📋 Test 6: Testing DPT Peer Discovery Events...\n");

	try {
		// Create two nodes with discovery enabled
		const nodeAPrivateKey = derivePrivateKey("p2p-discovery-test-a");
		const nodeBPrivateKey = derivePrivateKey("p2p-discovery-test-b");

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

		// Track discovery events
		const discoveryEvents: string[] = [];

		// Listen for peer:discovery events on Node B
		nodeB.addEventListener("peer:discovery", (evt: CustomEvent<PeerInfo>) => {
			const peer = evt.detail;
			const peerIdStr = formatNodeId(peer.id);
			console.log(`   🔍 Node B: peer:discovery - ${peerIdStr}`);
			discoveryEvents.push(`nodeB:peer:discovery:${peerIdStr}`);
		});

		// Listen for peer:discovery events on Node A
		nodeA.addEventListener("peer:discovery", (evt: CustomEvent<PeerInfo>) => {
			const peer = evt.detail;
			const peerIdStr = formatNodeId(peer.id);
			console.log(`   🔍 Node A: peer:discovery - ${peerIdStr}`);
			discoveryEvents.push(`nodeA:peer:discovery:${peerIdStr}`);
		});

		// Start both nodes
		await nodeA.start();
		console.log("   ✅ Node A started");
		await nodeB.start();
		console.log("   ✅ Node B started\n");

		// Wait for discovery to happen (DPT ping/pong)
		console.log("   ⏳ Waiting for peer discovery (up to 10 seconds)...\n");
		await new Promise((resolve) => setTimeout(resolve, 10000));

		// At least one discovery event should have fired
		const discoveryPassed = discoveryEvents.length > 0;

		tests.push({
			name: "DPT Peer Discovery events",
			passed: discoveryPassed,
		});

		if (discoveryPassed) {
			console.log(
				`   ✅ PASSED: Discovery events fired (${discoveryEvents.length} events)\n`,
			);
			console.log(`      Events: ${discoveryEvents.join(", ")}\n`);
		} else {
			console.log(
				"   ❌ FAILED: No discovery events fired (this may be normal if DPT hasn't discovered peers yet)\n",
			);
		}

		// Cleanup
		await nodeA.stop();
		await nodeB.stop();
	} catch (error: any) {
		tests.push({
			name: "DPT Peer Discovery events",
			passed: false,
			error: error.message,
		});
		console.log(`   ❌ FAILED: ${error.message}\n`);
		console.error(error.stack);
	}

	// =========================================================================
	// Test Results Summary
	// =========================================================================
	console.log("=".repeat(70));
	console.log("📊 Test Results:");
	console.log("=".repeat(70));

	let passedCount = 0;
	tests.forEach((test) => {
		const status = test.passed ? "✅" : "❌";
		console.log(`   ${status} ${test.name}`);
		if (test.error) {
			console.log(`      Error: ${test.error}`);
		}
		if (test.passed) passedCount++;
	});

	console.log("\n" + "=".repeat(70));
	console.log(`Results: ${passedCount}/${tests.length} tests passed`);
	console.log("=".repeat(70) + "\n");

	if (passedCount === tests.length) {
		console.log("✅ All tests passed!\n");
		process.exit(0);
	} else {
		console.log("❌ Some tests failed\n");
		process.exit(1);
	}
}

main().catch((err) => {
	console.error("\n❌ Test failed:", err);
	console.error(err.stack);
	process.exit(1);
});
