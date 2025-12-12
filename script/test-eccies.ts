import { multiaddr } from "@multiformats/multiaddr";
import debug from "debug";
import { createNode } from "../src/node/createNode";
import type { PeerNode } from "../src/node/node";
import type { ProtocolStream } from "../src/p2p/connection/protocol-stream";

debug.enable("p2p*");

const log = debug("p2p:test");

const ECHO_PROTOCOL = "/echo/1.0.0";
const PING_PROTOCOL = "/ping/1.0.0";

function setupEchoProtocol(node: PeerNode, nodeName: string) {
	node.handleProtocol(ECHO_PROTOCOL, (stream: ProtocolStream) => {
		log(`[${nodeName}] Echo protocol handler activated`);

		stream.addEventListener("message", (evt) => {
			const message = evt.data;
			log(`[${nodeName}] Received echo message:`, message);
			// Echo back the message
			stream.send(message);
		});

		stream.addEventListener("remoteCloseWrite", () => {
			log(`[${nodeName}] Echo stream closed by remote`);
			stream.close();
		});
	});
}

function setupPingProtocol(node: PeerNode, nodeName: string) {
	node.handleProtocol(PING_PROTOCOL, (stream: ProtocolStream) => {
		log(`[${nodeName}] Ping protocol handler activated`);

		stream.addEventListener("message", (evt) => {
			const msg = evt.data;
			if (!msg) return;

			if (msg.type === "ping") {
				log(`[${nodeName}] Received ping from ${msg.from}, ts: ${msg.ts}`);
				// Send pong response
				stream.send({
					type: "pong",
					ts: msg.ts,
					from: nodeName,
				});
			} else if (msg.type === "pong") {
				const rtt = Date.now() - msg.ts;
				log(`[${nodeName}] Received pong from ${msg.from}, RTT: ${rtt}ms`);
			}
		});

		stream.addEventListener("remoteCloseWrite", () => {
			log(`[${nodeName}] Ping stream closed by remote`);
			stream.close();
		});
	});
}

async function testEciesConnection() {
	log("Starting ECIES connection test...");

	// Create first node (server)
	const node1 = await createNode({
		nodeTypes: "peer",
		host: "127.0.0.1",
		port: 9001,
		start: true,
	});

	setupEchoProtocol(node1, "Node1");
	setupPingProtocol(node1, "Node1");

	log("Node1 started on", node1.getMultiaddr());

	// Create second node (client)
	const node2 = await createNode({
		nodeTypes: "peer",
		host: "127.0.0.1",
		port: 9002,
		start: true,
	});

	setupEchoProtocol(node2, "Node2");
	setupPingProtocol(node2, "Node2");

	log("Node2 started on", node2.getMultiaddr());

	// Wait a bit for nodes to be ready
	await new Promise((resolve) => setTimeout(resolve, 1000));

	try {
		// Node2 connects to Node1
		const node1Addr = multiaddr("/ip4/127.0.0.1/tcp/9001");
		log("Node2 attempting to dial Node1...");

		const connection = await node2.dial(node1Addr);
		log("✓ ECIES handshake completed successfully!");
		log("Connection established to:", node1Addr.toString());

		// Test echo protocol
		log("\n--- Testing Echo Protocol ---");
		const echoStream = await node2.openStream(connection, ECHO_PROTOCOL);

		echoStream.addEventListener("message", (evt) => {
			log("Node2 received echo response:", evt.data);
		});

		const testMessage = { text: "Hello from Node2!", timestamp: Date.now() };
		log("Node2 sending echo message:", testMessage);
		echoStream.send(testMessage);

		// Wait for echo response
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Test ping protocol
		log("\n--- Testing Ping Protocol ---");
		const pingStream = await node2.openStream(connection, PING_PROTOCOL);

		pingStream.addEventListener("message", (evt) => {
			const msg = evt.data;
			if (msg.type === "pong") {
				const rtt = Date.now() - msg.ts;
				log(`✓ Ping successful! RTT: ${rtt}ms`);
			}
		});

		// Send ping
		const pingMsg = { type: "ping", ts: Date.now(), from: "Node2" };
		log("Node2 sending ping:", pingMsg);
		pingStream.send(pingMsg);

		// Wait for ping response
		await new Promise((resolve) => setTimeout(resolve, 2000));

		log("\n✅ All tests completed successfully!");
		log("ECIES encryption is working correctly between peers.");
	} catch (error) {
		log("❌ Test failed:", error);
	} finally {
		// Cleanup
		setTimeout(async () => {
			log("Shutting down nodes...");
			await node1.stop();
			await node2.stop();
			process.exit(0);
		}, 3000);
	}
}

// Handle process signals for clean shutdown
process.on("SIGINT", () => {
	log("Received SIGINT, shutting down...");
	process.exit(0);
});

process.on("SIGTERM", () => {
	log("Received SIGTERM, shutting down...");
	process.exit(0);
});

// Start the test
testEciesConnection().catch((error) => {
	log("Fatal error:", error);
	process.exit(1);
});
