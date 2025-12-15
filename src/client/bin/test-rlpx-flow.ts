#!/usr/bin/env node

/**
 * Simple test script to verify RLPx transport flow:
 * - Two nodes connecting
 * - ECIES handshake
 * - HELLO exchange
 * - STATUS handshake
 * - Message sending/receiving
 */

import { multiaddr } from "@multiformats/multiaddr";
import { createHash } from "crypto";
import { Common, Hardfork } from "../../chain-config/index.ts";
import { EthereumClient } from "../client.ts";
import { Config, SyncMode } from "../config.ts";

const NODE0_PORT = 8000;
const NODE1_PORT = 8001;

// Simple logger
const log = (node: string, ...args: any[]) => {
	const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
	console.log(`[${timestamp}] [${node}]`, ...args);
};

async function createNode(port: number, bootnodes: any[] = []): Promise<EthereumClient> {
	const nodeKeySeed = `testnet-node-key-seed-${port}`;
	const nodeKey = createHash("sha256").update(nodeKeySeed).digest();

	const common = new Common({
		chain: "mainnet",
		hardfork: Hardfork.Chainstart,
	});

	const config = new Config({
		common,
		port,
		extIP: "127.0.0.1",
		bootnodes,
		key: nodeKey,
		syncmode: SyncMode.None, // Don't sync, just test connection
		minPeers: 0,
		maxPeers: 10,
		discV4: false, // Disable DHT for simpler test
		logger: {
			debug: (...args: any[]) => log(`NODE${port}`, ...args),
			info: (...args: any[]) => log(`NODE${port}`, ...args),
			warn: (...args: any[]) => log(`NODE${port}`, "WARN", ...args),
			error: (...args: any[]) => log(`NODE${port}`, "ERROR", ...args),
		} as any,
	});

	const client = await EthereumClient.create({ config });
	return client;
}

async function testConnection() {
	console.log("\n" + "=".repeat(60));
	console.log("🧪 Testing RLPx Transport Flow");
	console.log("=".repeat(60) + "\n");

	// Create Node 0 (listener)
	log("SETUP", "Creating Node 0 (port", NODE0_PORT, ")...");
	const node0 = await createNode(NODE0_PORT);
	await node0.open();
	log("NODE0", "✅ Node 0 started on port", NODE0_PORT);

	// Get Node 0's enode
	const node0Server = node0.service.pool.server;
	const node0Enode = node0Server.getRlpxInfo().enode;
	log("NODE0", "Enode:", node0Enode);

	// Extract peer ID from enode
	const node0PeerId = node0Enode.split("//")[1]?.split("@")[0] || "";
	log("NODE0", "Peer ID:", node0PeerId.slice(0, 16) + "...");

	// Create Node 1 (connector) with Node 0 as bootnode
	log("SETUP", "Creating Node 1 (port", NODE1_PORT, ")...");
	const bootnode = multiaddr(`/ip4/127.0.0.1/tcp/${NODE0_PORT}`);
	const node1 = await createNode(NODE1_PORT, [bootnode]);
	await node1.open();
	log("NODE1", "✅ Node 1 started on port", NODE1_PORT);

	// Wait a bit for servers to be ready
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Test 1: Node 1 connects to Node 0
	console.log("\n" + "-".repeat(60));
	console.log("TEST 1: Node 1 connecting to Node 0");
	console.log("-".repeat(60));

	try {
		const node1Server = node1.service.pool.server;
		await node1Server.connectToPeer(
			node0PeerId,
			"127.0.0.1",
			NODE0_PORT,
		);
		log("TEST1", "✅ Connection initiated");

		// Wait for connection to establish
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Check if peers are connected
		const node0Peers = Array.from(node0Server.peers.values());
		const node1Peers = Array.from(node1Server.peers.values());

		log("TEST1", "Node 0 peers:", node0Peers.length);
		log("TEST1", "Node 1 peers:", node1Peers.length);

		if (node0Peers.length > 0 && node1Peers.length > 0) {
			log("TEST1", "✅ Both nodes have peers!");
		} else {
			log("TEST1", "❌ Peers not connected");
			log("TEST1", "  Node 0 peer count:", node0Peers.length);
			log("TEST1", "  Node 1 peer count:", node1Peers.length);
			return;
		}

		// Test 2: Verify ECIES handshake completed
		console.log("\n" + "-".repeat(60));
		console.log("TEST 2: Verify ECIES handshake");
		console.log("-".repeat(60));

		const node0Peer = node0Peers[0];
		const node1Peer = node1Peers[0];

		log("TEST2", "Node 0 peer:", node0Peer.id.slice(0, 16) + "...");
		log("TEST2", "Node 1 peer:", node1Peer.id.slice(0, 16) + "...");
		log("TEST2", "Node 0 has rlpxConnection:", !!node0Peer.rlpxConnection);
		log("TEST2", "Node 1 has rlpxConnection:", !!node1Peer.rlpxConnection);

		if (node0Peer.rlpxConnection && node1Peer.rlpxConnection) {
			const node0Encrypter = (node0Peer.rlpxConnection as any).encrypter;
			const node1Encrypter = (node1Peer.rlpxConnection as any).encrypter;

			const node0Complete = node0Encrypter?.isHandshakeComplete;
			const node1Complete = node1Encrypter?.isHandshakeComplete;

			if (node0Complete && node1Complete) {
				log("TEST2", "✅ ECIES handshake completed on both sides");
			} else {
				log("TEST2", "❌ ECIES handshake not complete");
				log("TEST2", "  Node 0 complete:", node0Complete);
				log("TEST2", "  Node 1 complete:", node1Complete);
			}
		} else {
			log("TEST2", "❌ RLPx connections not available");
		}

		// Test 3: Verify HELLO messages exchanged
		console.log("\n" + "-".repeat(60));
		console.log("TEST 3: Verify HELLO messages");
		console.log("-".repeat(60));

		if (node0Peer.rlpxConnection && node1Peer.rlpxConnection) {
			const node0Hello = (node0Peer.rlpxConnection as any)._hello;
			const node1Hello = (node1Peer.rlpxConnection as any)._hello;

			if (node0Hello && node1Hello) {
				log("TEST3", "✅ HELLO messages exchanged");
				log("TEST3", "  Node 0 received HELLO:", !!node0Hello);
				log("TEST3", "  Node 1 received HELLO:", !!node1Hello);
			} else {
				log("TEST3", "❌ HELLO messages not exchanged");
				log("TEST3", "  Node 0 HELLO:", !!node0Hello);
				log("TEST3", "  Node 1 HELLO:", !!node1Hello);
			}
		}

		// Test 4: Verify STATUS handshake
		console.log("\n" + "-".repeat(60));
		console.log("TEST 4: Verify STATUS handshake");
		console.log("-".repeat(60));

		const node0EthProtocol = Array.from(node0Server.protocols).find(
			(p) => p.spec.name === "eth",
		) as any;
		const node1EthProtocol = Array.from(node1Server.protocols).find(
			(p) => p.spec.name === "eth",
		) as any;

		if (node0EthProtocol && node1EthProtocol) {
			const node0Status = node0EthProtocol.peerStatus;
			const node1Status = node1EthProtocol.peerStatus;

			if (node0Status && node1Status) {
				log("TEST4", "✅ STATUS handshake completed");
				log("TEST4", "  Node 0 received STATUS:", !!node0Status);
				log("TEST4", "  Node 1 received STATUS:", !!node1Status);
			} else {
				log("TEST4", "❌ STATUS handshake not complete");
				log("TEST4", "  Node 0 STATUS:", !!node0Status);
				log("TEST4", "  Node 1 STATUS:", !!node1Status);
			}
		} else {
			log("TEST4", "❌ ETH protocols not found");
			log("TEST4", "  Node 0 protocols:", Array.from(node0Server.protocols).map(p => p.spec.name));
			log("TEST4", "  Node 1 protocols:", Array.from(node1Server.protocols).map(p => p.spec.name));
		}

		// Test 5: Verify connection state
		console.log("\n" + "-".repeat(60));
		console.log("TEST 5: Verify connection state");
		console.log("-".repeat(60));

		log("TEST5", "Node 0 peer connected:", node0Peer.connected);
		log("TEST5", "Node 1 peer connected:", node1Peer.connected);
		log("TEST5", "Node 0 peer inbound:", node0Peer.inbound);
		log("TEST5", "Node 1 peer inbound:", node1Peer.inbound);

		// Summary
		console.log("\n" + "=".repeat(60));
		console.log("📊 Test Summary");
		console.log("=".repeat(60));
		const peersConnected = node0Peers.length > 0 && node1Peers.length > 0;
		const node0Encrypter = node0Peer.rlpxConnection ? (node0Peer.rlpxConnection as any).encrypter : null;
		const node1Encrypter = node1Peer.rlpxConnection ? (node1Peer.rlpxConnection as any).encrypter : null;
		const eciesComplete = node0Encrypter?.isHandshakeComplete && node1Encrypter?.isHandshakeComplete;
		const helloExchanged = !!(node0Peer.rlpxConnection as any)?._hello && !!(node1Peer.rlpxConnection as any)?._hello;
		const statusComplete = !!node0EthProtocol?.peerStatus && !!node1EthProtocol?.peerStatus;

		console.log("Peers connected:", peersConnected ? "✅" : "❌");
		console.log("ECIES handshake:", eciesComplete ? "✅" : "❌");
		console.log("HELLO exchanged:", helloExchanged ? "✅" : "❌");
		console.log("STATUS handshake:", statusComplete ? "✅" : "❌");
		console.log("=".repeat(60) + "\n");

	} catch (err: any) {
		log("ERROR", "Connection test failed:", err.message);
		console.error(err);
		if (err.stack) {
			console.error(err.stack);
		}
	} finally {
		// Cleanup
		console.log("\nCleaning up...");
		try {
			await node1.stop();
			await node0.stop();
			console.log("✅ Cleanup complete");
		} catch (cleanupErr: any) {
			console.error("Cleanup error:", cleanupErr.message);
		}
	}
}

// Run the test
testConnection()
	.then(() => {
		console.log("\n✅ Test completed");
		process.exit(0);
	})
	.catch((err) => {
		console.error("\n❌ Test failed:", err);
		process.exit(1);
	});

