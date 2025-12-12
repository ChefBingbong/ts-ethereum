import { multiaddr } from "@multiformats/multiaddr";
import type { PeerNode } from "../src/node/node";

export function startCLI(node: PeerNode) {
	console.log(
		`\nCommands:\n  connections - show active connections\n  dial <multiaddr> - connect to peer\n  ping <multiaddr> - ping a peer\n  echo <multiaddr> <message> - send echo message\n  info - show node info\n  help - show commands\n`,
	);

	const stdin = process.stdin;
	stdin.setEncoding("utf8");
	stdin.on("data", async (line: string) => {
		const args = line.trim().split(/\s+/);
		const cmd = args[0];
		if (!cmd) return;

		try {
			if (cmd === "connections") {
				const connections = node.getConnections();
				console.log(`Active connections: ${connections.length}`);
				connections.forEach((_, i) => {
					console.log(`  ${i + 1}: Connection active`);
				});
				return;
			}

			if (cmd === "dial") {
				const addr = args[1];
				if (!addr) {
					console.log("Usage: dial <multiaddr>");
					console.log("Example: dial /ip4/127.0.0.1/tcp/9001");
					return;
				}

				console.log(`Dialing ${addr}...`);
				const ma = multiaddr(addr);
				await node.dial(ma);
				console.log(`✓ Connected to ${addr} with ECIES encryption`);
				return;
			}

			if (cmd === "ping") {
				const addr = args[1];
				if (!addr) {
					console.log("Usage: ping <multiaddr>");
					return;
				}

				console.log(`Pinging ${addr}...`);
				const ma = multiaddr(addr);
				const connection = await node.dial(ma);
				const stream = await node.openStream(connection, "/ping/1.0.0");

				const startTime = Date.now();

				stream.addEventListener("message", (evt) => {
					const msg = evt.data;
					if (msg.type === "pong") {
						const rtt = Date.now() - msg.ts;
						console.log(`✓ Ping successful! RTT: ${rtt}ms`);
					}
				});

				stream.send({ type: "ping", ts: startTime, from: "CLI" });
				return;
			}

			if (cmd === "echo") {
				const addr = args[1];
				const message = args.slice(2).join(" ");

				if (!addr || !message) {
					console.log("Usage: echo <multiaddr> <message>");
					return;
				}

				console.log(`Sending echo to ${addr}: "${message}"`);
				const ma = multiaddr(addr);
				const connection = await node.dial(ma);
				const stream = await node.openStream(connection, "/echo/1.0.0");

				stream.addEventListener("message", (evt) => {
					console.log(`✓ Echo response:`, evt.data);
				});

				stream.send({ text: message, timestamp: Date.now() });
				return;
			}

			if (cmd === "info") {
				console.log(`Node Information:`);
				console.log(`  Multiaddr: ${node.getMultiaddr()}`);
				console.log(
					`  Peer ID: ${Buffer.from(node.peerId).toString("hex").slice(0, 16)}...`,
				);
				console.log(`  Protocols: ${node.getProtocols().join(", ")}`);
				console.log(`  Connections: ${node.getConnections().length}`);
				return;
			}

			if (cmd === "help") {
				console.log("Available commands:");
				console.log("  connections - show active connections");
				console.log(
					"  dial <multiaddr> - connect to peer (e.g., /ip4/127.0.0.1/tcp/9001)",
				);
				console.log("  ping <multiaddr> - ping a peer");
				console.log("  echo <multiaddr> <message> - send echo message to peer");
				console.log("  info - show node information");
				console.log("  help - show this help");
				return;
			}

			console.log(
				`Unknown command: ${cmd}. Type 'help' for available commands.`,
			);
		} catch (error) {
			console.log(
				`Error executing ${cmd}:`,
				error instanceof Error ? error.message : error,
			);
		}
	});
}
