import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import { genPrivateKey, pk2id } from "./src/devp2p/index.js";
import { Registrar } from "./src/p2p/connection/registrar.js";
import { Upgrader } from "./src/p2p/connection/upgrader.js";
import { mplex } from "./src/p2p/muxer/index.js";
import { Transport } from "./src/p2p/transport/rlpx/transport.js";
import { ipPortToMultiaddr } from "./src/utils/multi-addr.js";

// Enable debug logging
process.env.DEBUG = "p2p:*";

async function main() {
	console.log("\n🚀 Starting SIMPLE RLPx Transport Test\n");

	// Generate keys for both nodes
	const node0PrivateKey = genPrivateKey();
	const node0Id = pk2id(secp256k1.getPublicKey(node0PrivateKey, false));

	const node1PrivateKey = genPrivateKey();
	const node1Id = pk2id(secp256k1.getPublicKey(node1PrivateKey, false));

	console.log("Node 0 ID:", Buffer.from(node0Id).toString("hex").slice(0, 16) + "...");
	console.log("Node 1 ID:", Buffer.from(node1Id).toString("hex").slice(0, 16) + "...");

	// ========== Node 1 (Server/Listener) Setup ==========
	console.log("\n[Node 1] 🔧 Setting up server transport...");

	const node1Registrar = new Registrar({ peerId: node1Id });
	const node1Upgrader = new Upgrader(
		{ registrar: node1Registrar },
		{
			privateKey: node1PrivateKey,
			id: node1Id,
			connectionEncrypter: null, // We handle encryption in Transport
			streamMuxerFactory: mplex()(),
			skipEncryptionNegotiation: true,
			skipMuxerNegotiation: true,
		},
	);

	const node1Transport = new Transport({
		upgrader: node1Upgrader,
		privateKey: node1PrivateKey,
		id: node1Id,
	});

	const node1Listener = node1Transport.createListener();

	let testComplete = false;

	const testPromise = new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => {
			if (!testComplete) {
				reject(new Error("Test timeout after 15 seconds"));
			}
		}, 15000);

		// Handle incoming connections on Node 1
		node1Listener.on("connection", async (basicConn: any) => {
			try {
				console.log("\n[Node 1] 📥 Received Connection!");
				console.log(
					"[Node 1] Remote peer:",
					Buffer.from(basicConn.remotePeer).toString("hex").slice(0, 16) + "...",
				);
				console.log("[Node 1] ✅ SUCCESS - Connection established!");

				testComplete = true;
				clearTimeout(timeout);
				resolve();
			} catch (err: any) {
				clearTimeout(timeout);
				console.error("[Node 1] ❌ Error:", err.message);
				reject(err);
			}
		});

		node1Listener.on("error", (err: any) => {
			clearTimeout(timeout);
			console.error("[Node 1] Listener error:", err.message);
			reject(err);
		});
	});

	// Start listening
	await node1Listener.listen(ipPortToMultiaddr("127.0.0.1", 0));
	
	const serverAddress = node1Listener.server.address();
	if (!serverAddress || typeof serverAddress === "string") {
		throw new Error("Failed to get server address");
	}
	
	const listeningAddr = ipPortToMultiaddr(serverAddress.address, serverAddress.port);
	console.log(`[Node 1] 🎧 Listening on ${listeningAddr.toString()}\n`);

	// ========== Node 0 (Client/Dialer) Setup ==========
	console.log("[Node 0] 🔧 Setting up client transport...");

	const node0Registrar = new Registrar({ peerId: node0Id });
	const node0Upgrader = new Upgrader(
		{ registrar: node0Registrar },
		{
			privateKey: node0PrivateKey,
			id: node0Id,
			connectionEncrypter: null, // We handle encryption in Transport
			streamMuxerFactory: mplex()(),
			skipEncryptionNegotiation: true,
			skipMuxerNegotiation: true,
		},
	);

	const node0Transport = new Transport({
		upgrader: node0Upgrader,
		privateKey: node0PrivateKey,
		id: node0Id,
	});

	// Dial Node 1 from Node 0
	console.log("[Node 0] 📤 Dialing Node 1...");

	try {
		const dialResult = await node0Transport.dial(listeningAddr, node1Id);

		if (dialResult[0]) {
			throw dialResult[0];
		}

		const basicConn = dialResult[1];
		console.log("[Node 0] ✅ Dial successful! Connection established");
		console.log(
			"[Node 0] Remote peer:",
			Buffer.from(basicConn.remotePeer).toString("hex").slice(0, 16) + "...",
		);
	} catch (err: any) {
		console.error("[Node 0] ❌ Dial error:", err.message);
		console.error(err.stack);
		throw err;
	}

	// Wait for listener to receive connection
	try {
		await testPromise;
		console.log("\n✅ Test completed successfully!");
		console.log("✅ Both nodes established Connections\n");

		// Cleanup
		await node1Listener.close();
		process.exit(0);
	} catch (err: any) {
		console.error("\n❌ Test failed:", err.message);
		console.error(err.stack);
		await node1Listener.close();
		process.exit(1);
	}
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});

