import debug from "debug";
import { createNode } from "../src/node/createNode";
import type { PeerNode } from "../src/node/node";
import type { ProtocolStream } from "../src/p2p/connection/protocol-stream";
import { startCLI } from "./cli";

debug.enable("p2p*");

const PING_PROTOCOL = "/ping/1.0.0";
const PORT = parseInt(process.env.PORT || "0", 10); // 0 picks a free port

export function setupPingProtocolPing(node: PeerNode) {
	node.handleProtocol(PING_PROTOCOL, (stream: ProtocolStream) => {
		// This is the "pong" side: respond to ping messages
		stream.addEventListener("message", (evt) => {
			const msg = evt.data;
			if (!msg) return;

			if (msg.type === "ping") console.log("[ping] received ping:", msg);
			else if (msg.type === "pong") console.log("[ping] received pong:", msg);

			// echo back the same timestamp so the sender can compute RTT
			if (msg.type === "ping") stream.send({ type: "pong", ts: msg.ts });
		});

		stream.addEventListener("remoteCloseWrite", () => {
			stream.close();
		});
	});
}

const ECHO_PROTOCOL = "/echo/1.0.0";

function setupProtocols(node: PeerNode) {
	// This makes THIS node able to act as the "remote echo server"
	node.handleProtocol(ECHO_PROTOCOL, (stream) => {
		// Echo incoming messages back
		stream.addEventListener("message", (evt) => {
			console.log("[echo] received:", evt.data);
			stream.send(evt.data);
		});

		// When the remote writable end closes, close ours
		stream.addEventListener("remoteCloseWrite", () => {
			stream.close();
		});
	});
}

console.log(`Starting peer node on port ${PORT || "random"}...`);
console.log("Using ECIES encryption for secure connections");

const node = await createNode({
	nodeTypes: "peer",
	host: "127.0.0.1",
	port: PORT,
	start: true,
});

setupProtocols(node);
setupPingProtocolPing(node);

console.log(`✓ Peer node started on ${node.getMultiaddr()}`);
console.log(
	`✓ Peer ID: ${Buffer.from(node.peerId).toString("hex").slice(0, 16)}...`,
);
console.log("✓ Protocols registered: /ping/1.0.0, /echo/1.0.0");
console.log("Ready for connections!");

startCLI(node);
