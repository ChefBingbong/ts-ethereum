import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import { genPrivateKey, pk2id } from "./src/devp2p/index.js";
import { EcciesEncrypter } from "./src/p2p/connection-encrypters/eccies/eccies-encrypter.js";
import { Registrar } from "./src/p2p/connection/registrar.js";
import { Upgrader } from "./src/p2p/connection/upgrader.js";
import { mplex } from "./src/p2p/muxer/index.js";
import { EthProtocolHandler } from "./src/p2p/transport/rlpx/protocols/eth-protocol-handler.js";
import { createRlpxConnection } from "./src/p2p/transport/rlpx/RlpxConnection.js";
import { createListener } from "./src/p2p/transport/rlpx/transport-listener.js";
import { Transport } from "./src/p2p/transport/rlpx/transport.js";
import { ipPortToMultiaddr } from "./src/utils/multi-addr.js";

// Enable debug logging
process.env.DEBUG = "p2p:*";

async function main() {
	console.log("\n🚀 Starting RLPx Transport HELLO Handshake Test\n");

	// Generate keys for both nodes
	const node0PrivateKey = genPrivateKey();
	const node0Id =pk2id(secp256k1.getPublicKey(node0PrivateKey, false))

	const node1PrivateKey = genPrivateKey();
	const node1Id = pk2id(secp256k1.getPublicKey(node1PrivateKey, false));

	console.log("Node 0 ID:", Buffer.from(node0Id).toString("hex").slice(0, 16) + "...");
	console.log("Node 1 ID:", Buffer.from(node1Id).toString("hex").slice(0, 16) + "...");

	// ========== Node 1 (Server/Listener) Setup ==========
	console.log("\n[Node 1] 🔧 Setting up server transport...");

	const node1Registrar = new Registrar({
		peerId: node1Id,
	});

	const node1Upgrader = new Upgrader(
		{ registrar: node1Registrar },
		{
			privateKey: node1PrivateKey,
			id: node1Id,
			connectionEncrypter: new EcciesEncrypter(node1PrivateKey, {
				requireEip8: true,
				id: node1Id,
				remoteId: null,
			}),
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

	// Create listener using the standalone createListener function
	const node1Listener = createListener({
		upgrader: node1Upgrader,
		privateKey: node1PrivateKey,
		id: node1Id,
	});

	let node1Connection: any = null;
	let node0Connection: any = null;

	const testPromise = new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error("Test timeout after 15 seconds"));
		}, 15000);

		// Handle incoming connections on Node 1
		node1Listener.on("connection", async (basicConn: any) => {
			try {
				console.log("\n[Node 1] 📥 Received incoming BasicConnection");
				console.log(
					"[Node 1] Remote peer:",
					Buffer.from(basicConn.remotePeer).toString("hex").slice(0, 16) + "...",
				);

				// Upgrade BasicConnection to RlpxConnection
				// Note: BasicConnection has protected maConn and stream, so we cast to any
				node1Connection = createRlpxConnection({
					id: basicConn.id,
					maConn: (basicConn as any).maConn,
					stream: (basicConn as any).stream,
					remotePeer: basicConn.remotePeer,
					direction: "inbound",
					cryptoProtocol: "eccies",
				});

				console.log("[Node 1] 🔗 Upgraded to RlpxConnection");

				// Register ETH protocol
				const ethHandler = new EthProtocolHandler(68);
				const ethOffset = node1Connection.registerProtocol(ethHandler);
				console.log(
					`[Node 1] ✅ Registered ETH protocol at offset 0x${ethOffset.toString(16)}`,
				);

				// Listen for STATUS event
				node1Connection.addEventListener("eth:status", (evt: CustomEvent) => {
					console.log("[Node 1] 📨 Received ETH STATUS:", evt.detail);
				});

				console.log("[Node 1] ✅ Node 1 setup complete!");

				// Check if both nodes are connected
				if (node0Connection && node1Connection) {
					console.log("\n🎉 Both nodes connected successfully!");
					clearTimeout(timeout);
					setTimeout(() => {
						resolve();
					}, 1000);
				}
			} catch (err: any) {
				clearTimeout(timeout);
				console.error("[Node 1] ❌ Error:", err.message);
				console.error(err.stack);
				reject(err);
			}
		});

		node1Listener.on("error", (err: any) => {
			clearTimeout(timeout);
			console.error("[Node 1] Listener error:", err.message);
			reject(err);
		});
	});

	// Start listening on Node 1
	await node1Listener.listen(ipPortToMultiaddr("127.0.0.1", 0));
	
	// Get the actual address we're listening on
	const serverAddress = node1Listener.server.address();
	if (!serverAddress || typeof serverAddress === "string") {
		throw new Error("Failed to get server address");
	}
	
	const listeningAddr = ipPortToMultiaddr(serverAddress.address, serverAddress.port);
	console.log(`[Node 1] 🎧 Listening on ${listeningAddr.toString()}\n`);

	// ========== Node 0 (Client/Dialer) Setup ==========
	console.log("[Node 0] 🔧 Setting up client transport...");

	const node0Registrar = new Registrar({
		peerId: node0Id,
	});

	const node0Upgrader = new Upgrader(
		{ registrar: node0Registrar },
		{
			privateKey: node0PrivateKey,
			id: node0Id,
			connectionEncrypter: new EcciesEncrypter(node0PrivateKey, {
				requireEip8: true,
				id: node0Id,
				remoteId: node1Id, // We know who we're connecting to
			}),
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
		const dialResult = await node0Transport.dial(
			listeningAddr,
			node1Id,
		);

		if (dialResult[0]) {
			throw dialResult[0];
		}

		const basicConn = dialResult[1];
		console.log("[Node 0] ✅ Dial successful! BasicConnection established");
		console.log(
			"[Node 0] Remote peer:",
			Buffer.from(basicConn.remotePeer).toString("hex").slice(0, 16) + "...",
		);

		// Upgrade BasicConnection to RlpxConnection
		// Note: BasicConnection has protected maConn and stream, so we cast to any
		node0Connection = createRlpxConnection({
			id: basicConn.id,
			maConn: (basicConn as any).maConn,
			stream: (basicConn as any).stream,
			remotePeer: basicConn.remotePeer,
			direction: "outbound",
			cryptoProtocol: "eccies",
		});

		console.log("[Node 0] 🔗 Upgraded to RlpxConnection");

		// Register ETH protocol
		const ethHandler = new EthProtocolHandler(68);
		const ethOffset = node0Connection.registerProtocol(ethHandler);
		console.log(
			`[Node 0] ✅ Registered ETH protocol at offset 0x${ethOffset.toString(16)}`,
		);

		// Listen for STATUS event
		node0Connection.addEventListener("eth:status", (evt: CustomEvent) => {
			console.log("[Node 0] 📨 Received ETH STATUS:", evt.detail);
		});

		console.log("[Node 0] ✅ Node 0 setup complete!");

	} catch (err: any) {
		console.error("[Node 0] ❌ Dial error:", err.message);
		console.error(err.stack);
		throw err;
	}

	// Wait for both nodes to complete setup
	try {
		await testPromise;
		console.log("\n✅ Test completed successfully!");
		console.log("✅ Both nodes established RLPx connections with registered ETH protocol\n");

		// Cleanup
		await node1Listener.close();
		if (node0Connection) {
			await node0Connection.close();
		}
		if (node1Connection) {
			await node1Connection.close();
		}

		process.exit(0);
	} catch (err: any) {
		console.error("\n❌ Test failed:", err.message);
		console.error(err.stack);

		// Cleanup
		await node1Listener.close();
		if (node0Connection) {
			await node0Connection.close();
		}
		if (node1Connection) {
			await node1Connection.close();
		}

		process.exit(1);
	}
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
