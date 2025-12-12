import type { Multiaddr } from "@multiformats/multiaddr";
import debug from "debug";
import net, { type Server, type Socket } from "node:net";
import { MuxedConnection } from "../connection/connection";
import type { NetConfig } from "../utils/getNetConfig";
import { safeTry } from "../utils/safe";
import { multiaddrToNetConfig } from "../utils/utils";
import type { Context, Status } from "./types";

const log = debug("p2p:transport");

export class TransportListener {
	public server: Server;
	private addr: string = "unknown";
	public context: Context;
	private status: Status = { code: "INACTIVE" };

	constructor(context: Context) {
		this.context = context;
		this.server = net.createServer(context, this.onSocket.bind(this));
		this.server
			.on("listening,", this.onListen.bind(this))
			.on("error", (err) => {
				log(`[server error: ${err?.message || err}`);
			})
			.on("close", () => {
				log(`server on ${this.addr} closed`);
			});
	}

	private onSocket = async (sock: Socket) => {
		let connection: MuxedConnection;

		console.log("New inbound connection received");
		if (this.status.code !== "ACTIVE") {
			sock.destroy();
			throw new Error("Server is not listening yet");
		}
		try {
			// Use factory if available, otherwise fall back to shared upgrader

			console.log(
				"Upgrading inbound connection to encrypted connection",
				this.status.listeningAddr.decapsulateCode(4),
			);
			const [error, upgraded] = await safeTry(() =>
				this.context.upgrader.encryptInBound(sock),
			);
			if (error) throw error;
			connection = new MuxedConnection(upgraded.socket, {
				localAddr: this.status.listeningAddr,
			});

			connection.setOnFrame((f) => this.context.frameHandler(connection, f));
			connection.setOnStreamOpen((protocol, stream) =>
				this.context.streamOpenHandler(protocol, stream),
			);
		} catch (err) {
			log(`Error handling socket: ${err}`);
			sock.destroy();
		}
	};

	async listen(peerId: Multiaddr) {
		if (this.status.code === "ACTIVE") {
			throw new Error("server is already listening");
		}
		try {
			this.status = {
				code: "ACTIVE",
				listeningAddr: peerId,
				netConfig: multiaddrToNetConfig(peerId) as NetConfig,
			};

			await this.resume();
		} catch (error) {
			log("listening on %s", this.server.address());
			this.status = { code: "INACTIVE" };
			throw error;
		}
	}

	async resume() {
		if (this.status.code === "INACTIVE") return;
		if (this.server.listening) return;

		const netConfig = this.status.netConfig;
		await new Promise<void>((resolve, reject) => {
			this.server.once("error", reject);
			this.server.listen(netConfig, resolve);
		});

		this.status = { ...this.status, code: "ACTIVE" };
	}

	async pause() {
		this.server.close();
	}

	private onListen() {
		const address = this.server.address();

		if (address == null) {
			this.addr = "unknown";
		} else if (typeof address === "string") {
			this.addr = address;
		} else {
			this.addr = `${address.address}:${address.port}`;
		}
	}
}
