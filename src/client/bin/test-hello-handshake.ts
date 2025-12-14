import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import net from "node:net";
import { genPrivateKey, pk2id } from "../../devp2p";
import { EcciesEncrypter } from "../../p2p/connection-encrypters/eccies/eccies-encrypter";

// Enable debug logging
process.env.DEBUG = "p2p:*";

async function main() {
	console.log("\n🚀 Starting HELLO Handshake Test\n");

	// Generate keys for both nodes
	const node0PrivateKey = genPrivateKey();
	const node0Id =pk2id(secp256k1.getPublicKey(node0PrivateKey, false))

	const node1PrivateKey = genPrivateKey();
	const node1Id = pk2id(secp256k1.getPublicKey(node1PrivateKey, false));

	console.log("Node 0 ID:", Buffer.from(node0Id).toString("hex").slice(0, 16));
	console.log("Node 1 ID:", Buffer.from(node1Id).toString("hex").slice(0, 16));

	// Create Node 1 (listener)
	const node1Server = net.createServer();

	const node1Promise = new Promise<void>((resolve, reject) => {
		node1Server.on("connection", async (socket) => {
			try {
				console.log("\n[Node 1] 📥 Received incoming connection");

				// Create encrypter for inbound connection (no remoteId initially)
				const encrypter = new EcciesEncrypter(node1PrivateKey, {
					requireEip8: true,
					id: node1Id,
					remoteId: null, // Don't know remote ID yet for inbound
				});

				console.log("[Node 1] 🔐 Starting ECIES + HELLO handshake (inbound)...");

				// This will do AUTH/ACK + HELLO automatically
				const result = await encrypter.secureInBound(socket);

				console.log("\n[Node 1] ✅ Handshake complete!");
				console.log(
					"[Node 1] Remote peer ID:",
					Buffer.from(result.remotePeer!).toString("hex").slice(0, 16),
				);

				if (encrypter.helloResult) {
					console.log("\n[Node 1] 📨 HELLO Exchange Results:");
					console.log("  Local HELLO:");
					console.log("    Client ID:", encrypter.helloResult.localHello.clientId);
					console.log(
						"    Capabilities:",
						encrypter.helloResult.localHello.capabilities,
					);
					console.log("  Remote HELLO:");
					console.log("    Client ID:", encrypter.helloResult.remoteHello.clientId);
					console.log(
						"    Capabilities:",
						encrypter.helloResult.remoteHello.capabilities,
					);
				}

				socket.end();
				resolve();
			} catch (err: any) {
				console.error("[Node 1] ❌ Error:", err.message);
				reject(err);
			}
		});

		node1Server.listen(0, "127.0.0.1", () => {
			const address = node1Server.address() as net.AddressInfo;
			console.log(`\n[Node 1] 🎧 Listening on ${address.address}:${address.port}\n`);

			// Now create Node 0 (dialer)
			const socket = net.connect(address.port, address.address);

			socket.on("connect", async () => {
				try {
					console.log("[Node 0] 📤 Connected to Node 1");

					// Create encrypter for outbound connection (knows remote ID)
					const encrypter = new EcciesEncrypter(node0PrivateKey, {
						requireEip8: true,
						id: node0Id,
						remoteId: node1Id, // We know who we're connecting to
					});

					console.log("[Node 0] 🔐 Starting ECIES + HELLO handshake (outbound)...");

					// This will do AUTH/ACK + HELLO automatically
					const result = await encrypter.secureOutBound(socket, node1Id);

					console.log("\n[Node 0] ✅ Handshake complete!");
					console.log(
						"[Node 0] Remote peer ID:",
						Buffer.from(result.remotePeer!).toString("hex").slice(0, 16),
					);

					if (encrypter.helloResult) {
						console.log("\n[Node 0] 📨 HELLO Exchange Results:");
						console.log("  Local HELLO:");
						console.log("    Client ID:", encrypter.helloResult.localHello.clientId);
						console.log(
							"    Capabilities:",
							encrypter.helloResult.localHello.capabilities,
						);
						console.log("  Remote HELLO:");
						console.log("    Client ID:", encrypter.helloResult.remoteHello.clientId);
						console.log(
							"    Capabilities:",
							encrypter.helloResult.remoteHello.capabilities,
						);
					}
				} catch (err: any) {
					console.error("[Node 0] ❌ Error:", err.message);
					reject(err);
				}
			});

			socket.on("error", (err) => {
				console.error("[Node 0] Socket error:", err.message);
				reject(err);
			});
		});
	});

	try {
		await node1Promise;
		console.log("\n✅ Test completed successfully!\n");
		node1Server.close();
		process.exit(0);
	} catch (err: any) {
		console.error("\n❌ Test failed:", err.message);
		node1Server.close();
		process.exit(1);
	}
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});

