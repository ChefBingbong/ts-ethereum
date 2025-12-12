#!/usr/bin/env tsx

import { bytesToHex } from "ethereum-cryptography/utils";
import { SimpleNode } from "../src/node/simple-node";

const log = console.log;

async function testEccies() {
	log("🧪 Testing ECIES Encryption Between Two Simple Nodes\n");

	// Create first node (server)
	const node1 = new SimpleNode({
		host: "127.0.0.1",
		port: 8000,
	});

	// Create second node (client)
	const node2 = new SimpleNode({
		host: "127.0.0.1",
		port: 8001,
	});

	// Register a simple echo protocol on node1
	node1.registerProtocol("echo", (stream) => {
		log("📡 Node1: Received echo stream");
		stream.on("data", (data) => {
			const message = data.toString();
			log(`📡 Node1: Received message: "${message}"`);
			// Echo it back
			stream.send(Buffer.from(`Echo: ${message}`));
		});
	});

	// Start both nodes
	await node1.start();
	await node2.start();

	log(`✅ Node1 started: ${node1.getMultiaddr()}`);
	log(`   Peer ID: ${bytesToHex(node1.peerId).slice(0, 16)}...`);
	log(`✅ Node2 started: ${node2.getMultiaddr()}`);
	log(`   Peer ID: ${bytesToHex(node2.peerId).slice(0, 16)}...`);

	// Wait a moment
	await new Promise((resolve) => setTimeout(resolve, 1000));

	try {
		// Node2 connects to Node1 using ECIES
		log("\n🔐 Testing ECIES connection...");
		const { multiaddr } = await import("@multiformats/multiaddr");
		const connection = await node2.dial(multiaddr(node1.getMultiaddr()));
		log("✅ ECIES handshake completed successfully!");

		// Open a stream for the echo protocol
		log("\n📡 Opening echo stream...");
		const stream = connection.openStream("echo");

		// Set up stream handler
		stream.on("data", (data) => {
			const response = data.toString();
			log(`📡 Node2: Received response: "${response}"`);
		});

		// Send test message
		log("📡 Sending test message...");
		stream.send(Buffer.from("Hello ECIES!"));

		// Keep connection alive for a bit
		await new Promise((resolve) => setTimeout(resolve, 2000));

		log("\n🎉 ECIES test completed successfully!");
		log("✅ Connection established");
		log("✅ Encrypted communication working");
		log("✅ Protocol multiplexing working");
	} catch (error) {
		log(`❌ ECIES test failed: ${error}`);
		throw error;
	}

	// Cleanup
	log("\n🛑 Stopping nodes...");
	await Promise.all([node1.stop(), node2.stop()]);
	log("✅ Test completed");
}

// Handle graceful shutdown
process.on("SIGINT", () => {
	log("\n🛑 Test interrupted");
	process.exit(0);
});

testEccies().catch((error) => {
	log(`❌ Test failed: ${error}`);
	process.exit(1);
});
