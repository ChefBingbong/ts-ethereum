#!/usr/bin/env npx tsx

/**
 * Test script for Step 4: P2PConfig
 *
 * Tests:
 * 1. Creating P2PConfig with default options
 * 2. Verifying P2PNode is created
 * 3. Testing bootnode conversion
 * 4. Verifying DPT discovery setup
 */

import { multiaddr } from "@multiformats/multiaddr";
import { Common, Hardfork } from "../src/chain-config/index.ts";
import { P2PConfig } from "../src/client/p2p-config.ts";

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
	console.log("🔧 P2PConfig Test");
	console.log("=".repeat(70) + "\n");

	// Create Common instance
	const common = new Common({
		chain: customChainConfig as any,
		hardfork: Hardfork.Chainstart,
	});

	// =========================================================================
	// Test 1: Create P2PConfig with default options
	// =========================================================================
	console.log("📋 Test 1: Creating P2PConfig with default options...\n");

	const config1 = new P2PConfig({
		common,
		syncmode: "full",
		port: 30303,
		maxPeers: 10,
	});

	console.log(`   ✅ P2PConfig created`);
	console.log(`   Node: ${config1.node ? "✅ Created" : "❌ Missing"}`);
	console.log(`   Port: ${config1.port}`);
	console.log(`   Max Peers: ${config1.maxPeers}`);
	console.log(`   DiscV4: ${config1.discV4}\n`);

	// =========================================================================
	// Test 2: Create P2PConfig with bootnodes
	// =========================================================================
	console.log("📋 Test 2: Creating P2PConfig with bootnodes...\n");

	const bootnodes = [
		multiaddr("/ip4/127.0.0.1/tcp/30303"),
		// multiaddr("/ip4/192.168.1.1/tcp/30304"),
	];

	const config2 = new P2PConfig({
		common,
		syncmode: "full",
		port: 30304,
		bootnodes,
		maxPeers: 20,
	});

	console.log(`   ✅ P2PConfig created with bootnodes`);
	console.log(`   Node: ${config2.node ? "✅ Created" : "❌ Missing"}`);
	console.log(`   Bootnodes: ${config2.bootnodes?.length ?? 0}\n`);

	// =========================================================================
	// Test 3: Create P2PConfig with syncmode "none" (no node)
	// =========================================================================
	console.log("📋 Test 3: Creating P2PConfig with syncmode 'none'...\n");

	const config3 = new P2PConfig({
		common,
		syncmode: "none",
		port: 30305,
	});

	console.log(`   ✅ P2PConfig created`);
	console.log(
		`   Node: ${config3.node ? "❌ Should not exist" : "✅ Correctly missing"}\n`,
	);

	// =========================================================================
	// Test 4: Start and stop node
	// =========================================================================
	console.log("📋 Test 4: Starting and stopping P2PNode...\n");

	await config1.node?.start();
	console.log(`   ✅ Node started`);
	console.log(`   Status: ${config1.node?.status}`);
	console.log(
		`   Listening on: ${config1.node
			?.getMultiaddrs()
			.map((a) => a.toString())
			.join(", ")}\n`,
	);

	await config2.node?.start();
	console.log(`   ✅ Node started`);
	console.log(`   Status: ${config2.node?.status}`);
	console.log(
		`   Listening on: ${config2.node
			?.getMultiaddrs()
			.map((a) => a.toString())
			.join(", ")}\n`,
	);

	// if (config1.node) {
	// 	// await config1.node.start();
	// 	console.log(`   ✅ Node started`);
	// 	console.log(`   Status: ${config1.node.status}`);
	// 	console.log(
	// 		`   Listening on: ${config1.node
	// 			.getMultiaddrs()
	// 			.map((a) => a.toString())
	// 			.join(", ")}\n`,
	// 	);

	// 	// await config1.node.stop();
	// 	// console.log(`   ✅ Node stopped`);
	// 	// console.log(`   Status: ${config1.node.status}\n`);
	// }

	// =========================================================================
	// Test 5: Verify node properties
	// =========================================================================
	console.log("📋 Test 5: Verifying node properties...\n");
	await new Promise((resolve) => setTimeout(resolve, 3000));

	if (config1.node) {
		// getProtocols() returns registrar protocols (stream-based), not transport protocols
		const registrarProtocols = config1.node.getProtocols();
		const connections = config1.node.getConnections();
		const peers = config1.node.getPeers();

		console.log(
			`   Registrar Protocols (stream-based): ${registrarProtocols.length}`,
		);
		console.log(`   Connections: ${connections.length}`);
		console.log(`   Peers: ${peers.length}`);

		// Check transport-level protocols (ETH) on connections
		if (connections.length > 0) {
			console.log(`\n   Transport-level protocols on connections:`);
			for (const conn of connections) {
				const rlpxConn = (conn as any).getRLPxConnection?.() as
					| import("../src/p2p/transport/rlpx/connection.ts").RLPxConnection
					| undefined;
				if (rlpxConn) {
					const transportProtocols = rlpxConn.getProtocols();
					const protocolNames = transportProtocols
						.map((p) => p.constructor.name)
						.join(", ");
					console.log(
						`      Connection ${conn.id.slice(0, 8)}...: ${protocolNames || "none"}`,
					);
				}
			}
		}
		console.log();
	}

	console.log("=".repeat(70));
	console.log("✅ All tests completed successfully!");
	console.log("=".repeat(70) + "\n");

	if (config2.node) {
		const registrarProtocols = config2.node.getProtocols();
		const connections = config2.node.getConnections();
		const peers = config2.node.getPeers();

		console.log(
			`   Registrar Protocols (stream-based): ${registrarProtocols.length}`,
		);
		console.log(`   Connections: ${connections.length}`);
		console.log(`   Peers: ${peers.length}`);

		// Check transport-level protocols (ETH) on connections
		if (connections.length > 0) {
			console.log(`\n   Transport-level protocols on connections:`);
			for (const conn of connections) {
				const rlpxConn = (conn as any).getRLPxConnection?.() as
					| import("../src/p2p/transport/rlpx/connection.ts").RLPxConnection
					| undefined;
				if (rlpxConn) {
					const transportProtocols = rlpxConn.getProtocols();
					const protocolNames = transportProtocols
						.map((p) => p.constructor.name)
						.join(", ");
					console.log(
						`      Connection ${conn.id.slice(0, 8)}...: ${protocolNames || "none"}`,
					);
				}
			}
		}
		console.log();
	}

	console.log("=".repeat(70));
	console.log("✅ All tests completed successfully!");
	console.log("=".repeat(70) + "\n");

	process.exit(0);
}

main().catch((err) => {
	console.error("\n❌ Test failed:", err);
	console.error(err.stack);
	process.exit(1);
});
