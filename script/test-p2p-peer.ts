#!/usr/bin/env npx tsx

/**
 * Test script for Step 2: P2PPeer wrapper
 *
 * Tests:
 * 1. Creating P2PPeer from P2PNode Connection
 * 2. Extracting RLPxConnection and ETH protocol
 * 3. Verifying P2PPeer interface matches Peer interface
 * 4. Testing protocol message handling
 */

import type { ComponentLogger, Logger } from "@libp2p/interface";
import { createHash } from "crypto";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import { Common, Hardfork } from "../src/chain-config/index.ts";
import { Config } from "../src/client/config.ts";
import { P2PPeer } from "../src/client/net/peer/p2p-peer.ts";
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

async function main() {
	console.log("\n" + "=".repeat(70));
	console.log("🧪 Step 2 Test: P2PPeer Wrapper");
	console.log("=".repeat(70) + "\n");

	// Create Common instance
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

	const common = new Common({
		chain: customChainConfig as any,
		hardfork: Hardfork.Chainstart,
	} as any);

	// Generate deterministic keys for both nodes
	const nodeAPrivateKey = derivePrivateKey("p2p-peer-test-node-a");
	const nodeBPrivateKey = derivePrivateKey("p2p-peer-test-node-b");

	const nodeAId = getNodeId(nodeAPrivateKey);
	const nodeBId = getNodeId(nodeBPrivateKey);

	console.log("📋 Test Configuration:");
	console.log(`   Node A ID: ${formatNodeId(nodeAId)}`);
	console.log(`   Node B ID: ${formatNodeId(nodeBId)}`);
	console.log("");

	// Create capabilities (ETH/68)
	const capabilities = [ETH.eth68];

	// =========================================================================
	// Create Node A (Listener)
	// =========================================================================
	console.log("🚀 Creating Node A...\n");

	const nodeA = await createP2PNode({
		privateKey: nodeAPrivateKey,
		addresses: {
			listen: ["/ip4/127.0.0.1/tcp/30303"],
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
				}) as any,
		],
		maxConnections: 10,
		logger: createComponentLogger("node-a") as any,
	});

	await nodeA.start();
	console.log("✅ Node A started");

	const nodeAAddrs = nodeA.getMultiaddrs();
	console.log(
		`   Listening on: ${nodeAAddrs.map((a) => a.toString()).join(", ")}\n`,
	);

	// =========================================================================
	// Create Node B (Dialer)
	// =========================================================================
	console.log("🚀 Creating Node B...\n");

	const nodeB = await createP2PNode({
		privateKey: nodeBPrivateKey,
		addresses: {
			listen: ["/ip4/127.0.0.1/tcp/30304"],
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
				}) as any,
		],
		maxConnections: 10,
		logger: createComponentLogger("node-b") as any,
	});

	await nodeB.start();
	console.log("✅ Node B started\n");

	// =========================================================================
	// Establish Connection
	// =========================================================================
	console.log("🔗 Establishing connection from Node B to Node A...\n");

	const nodeAAddr = nodeAAddrs[0];
	const connection = await nodeB.dial(nodeAAddr, {
		remoteId: nodeAId,
	});

	console.log("✅ Connection established");
	console.log(`   Connection ID: ${connection.id}`);
	console.log(`   Remote Peer: ${formatNodeId(connection.remotePeer)}`);
	console.log(`   Direction: ${connection.direction}`);
	console.log(`   Status: ${connection.status}\n`);

	// Wait a bit for protocols to negotiate
	await new Promise((resolve) => setTimeout(resolve, 1000));

	// =========================================================================
	// Extract RLPxConnection
	// =========================================================================
	console.log("🔍 Extracting RLPxConnection from Connection...\n");

	// Type assertion - ConnectionWrapper has getRLPxConnection()
	const connectionWrapper = connection as any;
	const rlpxConnection = connectionWrapper.getRLPxConnection() as
		| RLPxConnection
		| undefined;

	if (!rlpxConnection) {
		throw new Error("Failed to extract RLPxConnection from Connection");
	}

	console.log("✅ RLPxConnection extracted");
	const protocols = rlpxConnection.getProtocols();
	console.log(
		`   Protocols: ${protocols.map((p) => p.constructor.name).join(", ")}\n`,
	);

	// =========================================================================
	// Create Config for P2PPeer
	// =========================================================================
	console.log("⚙️  Creating Config...\n");

	const config = new Config({
		common,
		syncmode: "full",
	});

	console.log("✅ Config created\n");

	// =========================================================================
	// Create P2PPeer
	// =========================================================================
	console.log("👤 Creating P2PPeer...\n");

	const p2pPeer = new P2PPeer({
		config,
		connection,
		rlpxConnection,
		inbound: connection.direction === "inbound",
	});

	console.log("✅ P2PPeer created");
	console.log(`   Peer ID: ${p2pPeer.id.slice(0, 16)}...`);
	console.log(`   Address: ${p2pPeer.address}`);
	console.log(`   Transport: p2p`);
	console.log(`   Inbound: ${p2pPeer.inbound}`);
	console.log(`   Pooled: ${p2pPeer.pooled}`);
	console.log(`   Idle: ${p2pPeer.idle}`);
	console.log(
		`   ETH Protocol: ${p2pPeer.eth ? "✅ Present" : "❌ Missing"}\n`,
	);

	// =========================================================================
	// Trigger ETH Status Exchange (like test-p2p-node.ts)
	// =========================================================================
	console.log("📨 Triggering ETH Status Exchange...\n");

	// Get Node A's connection to send status from that side too
	const nodeAConnections = nodeA.getConnections();
	const nodeAConnection = nodeAConnections[0];
	let statusReceived = false;

	if (nodeAConnection && p2pPeer.eth) {
		// Get RLPxConnection from Node A's side
		const nodeARLPxConn = (nodeAConnection as any).getRLPxConnection?.() as
			| RLPxConnection
			| undefined;

		if (nodeARLPxConn) {
			const nodeAProtocols = nodeARLPxConn.getProtocols();
			const nodeAEth = nodeAProtocols.find(
				(p) => p.constructor.name === "ETH",
			) as ETH | undefined;

			if (nodeAEth) {
				// Get Node B's ETH protocol first
				const nodeBEthProtocol = rlpxConnection
					.getProtocols()
					.find((p) => p.constructor.name === "ETH") as ETH | undefined;

				if (!nodeBEthProtocol) {
					console.log("   ⚠️ Could not find ETH protocol on Node B connection");
				} else {
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

					// Set up status event handler BEFORE sending
					const statusPromise = new Promise<void>((resolve, reject) => {
						const timeout = setTimeout(() => {
							reject(new Error("Status exchange timed out"));
						}, 5000);

						// Listen for status on the ETH protocol directly
						// P2PBoundEthProtocol already listens to this, so we check when it's set
						const onStatus = () => {
							// Give P2PBoundEthProtocol a moment to process the status
							setTimeout(() => {
								try {
									const status = p2pPeer.eth!.status;
									if (status) {
										nodeBEthProtocol.events.off("status", onStatus);
										clearTimeout(timeout);
										statusReceived = true;
										console.log("   ✅ Status received on P2PPeer");
										resolve();
									}
								} catch {
									// Status not yet received, keep waiting
								}
							}, 50);
						};

						nodeBEthProtocol.events.on("status", onStatus);
					});

					// Send STATUS from both sides
					console.log("   📤 Node A sending STATUS...");
					nodeAEth.sendStatus(statusOpts);

					console.log("   📤 Node B sending STATUS (via RLPxConnection)...");
					nodeBEthProtocol.sendStatus(statusOpts);

					try {
						await statusPromise;
						console.log("   🎉 ETH Status exchange successful!\n");
					} catch (err: any) {
						console.log(`   ⚠️ Status exchange: ${err.message}\n`);
					}
				}
			}
		}
	}

	// =========================================================================
	// Verify P2PPeer Properties
	// =========================================================================
	console.log("🔍 Verifying P2PPeer properties...\n");

	const checks: Array<{ name: string; passed: boolean; message: string }> = [];

	// Check ID
	const expectedId = bytesToUnprefixedHex(connection.remotePeer);
	checks.push({
		name: "Peer ID matches connection.remotePeer",
		passed: p2pPeer.id === expectedId,
		message: `Expected: ${expectedId.slice(0, 16)}..., Got: ${p2pPeer.id.slice(0, 16)}...`,
	});

	// Check address
	checks.push({
		name: "Address matches connection.remoteAddr",
		passed: p2pPeer.address === connection.remoteAddr.toString(),
		message: `Expected: ${connection.remoteAddr.toString()}, Got: ${p2pPeer.address}`,
	});

	// Check inbound
	checks.push({
		name: "Inbound matches connection.direction",
		passed: p2pPeer.inbound === (connection.direction === "inbound"),
		message: `Expected: ${connection.direction === "inbound"}, Got: ${p2pPeer.inbound}`,
	});

	// Check ETH protocol
	checks.push({
		name: "ETH protocol is bound",
		passed: p2pPeer.eth !== undefined,
		message: p2pPeer.eth
			? "ETH protocol is present"
			: "ETH protocol is missing",
	});

	// Check ETH protocol properties
	if (p2pPeer.eth) {
		checks.push({
			name: "ETH protocol has correct name",
			passed: p2pPeer.eth.name === "eth",
			message: `Expected: eth, Got: ${p2pPeer.eth.name}`,
		});

		// Check versions (P2PBoundEthProtocol exposes versions as public getter)
		const versions = (p2pPeer.eth as any).versions;
		checks.push({
			name: "ETH protocol has versions",
			passed: Array.isArray(versions) && versions.length > 0,
			message: `Versions: ${Array.isArray(versions) ? versions.join(", ") : "N/A"}`,
		});

		// Check status (after manual exchange)
		checks.push({
			name: "ETH protocol status received",
			passed: statusReceived,
			message: statusReceived
				? "Status received"
				: "Status not received (status exchange may have failed)",
		});
	}

	// Print results
	let allPassed = true;
	for (const check of checks) {
		const status = check.passed ? "✅" : "❌";
		console.log(`   ${status} ${check.name}`);
		if (!check.passed) {
			console.log(`      ${check.message}`);
			allPassed = false;
		}
	}

	console.log("");

	if (!allPassed) {
		throw new Error("Some checks failed!");
	}

	// =========================================================================
	// Test toString()
	// =========================================================================
	console.log("📝 Testing toString()...\n");
	const peerString = p2pPeer.toString();
	const peerStringFull = p2pPeer.toString(true);
	console.log(`   toString(): ${peerString}`);
	console.log(`   toString(true): ${peerStringFull}\n`);

	// =========================================================================
	// Test handleMessageQueue() (should be no-op)
	// =========================================================================
	console.log("📬 Testing handleMessageQueue()...\n");
	p2pPeer.handleMessageQueue();
	console.log("✅ handleMessageQueue() completed (no-op)\n");

	// =========================================================================
	// Test disconnect()
	// =========================================================================
	console.log("🔌 Testing disconnect()...\n");
	await p2pPeer.disconnect();
	console.log("✅ disconnect() completed\n");

	// =========================================================================
	// Cleanup
	// =========================================================================
	console.log("🧹 Cleaning up...\n");
	await nodeA.stop();
	await nodeB.stop();
	console.log("✅ Nodes stopped\n");

	console.log("=".repeat(70));
	console.log("✅ Step 2 Test: P2PPeer - ALL TESTS PASSED");
	console.log("=".repeat(70) + "\n");
}

main().catch((error) => {
	console.error("❌ Test failed:", error);
	process.exit(1);
});
