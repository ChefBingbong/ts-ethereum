import type { Multiaddr } from "@multiformats/multiaddr";
import debug from "debug";
import { EventEmitter } from "eventemitter3";
import net, { type Server, type Socket } from "node:net";
import type { NetConfig } from "../../../utils/getNetConfig";
import { ipPortToMultiaddr } from "../../../utils/multi-addr";
import { multiaddrToNetConfig } from "../../../utils/utils";
import { Connection, toMultiaddrConnection } from "../../connection";
import { EcciesEncrypter, type EcciesEncrypter as EcciesEncrypterType } from "../../connection-encrypters";
import type { ListenerContext, Status } from "./types";

const log = debug("p2p:transport:listener:rlpx");

interface TransportListenerEvents {
	connection: (connection: Connection) => void;
	listening: () => void;
	error: (error: Error) => void;
	close: () => void;
}

export class TransportListener extends EventEmitter<TransportListenerEvents> {
	public server: Server;
	private addr: string = "unknown";
	public context: ListenerContext;
	private status: Status = { code: "INACTIVE" };
	private connections: Map<string, Connection> = new Map();
	private encrypterMap: Map<string, EcciesEncrypterType> = new Map();

	constructor(context: ListenerContext) {
		super();
		this.context = context;
		this.server = net.createServer(this.onSocket.bind(this));
		this.server
			.on("listening", () => {
				this.onListen();
				this.emit("listening");
			})
			.on("error", (err) => {
				log(`server error: ${err?.message || err}`);
				this.emit("error", err);
			})
			.on("close", () => {
				log(`server on ${this.addr} closed`);
				this.emit("close");
			});
	}

	private onSocket = async (sock: Socket) => {
		if (this.status.code !== "ACTIVE") {
			sock.destroy();
			log("Server is not listening yet, destroying socket");
			return;
		}

		try {
			const remoteAddr = sock.remoteAddress;
			const remotePort = sock.remotePort;
			const tempPeerId = null;

			log("incoming RLPx socket from %s:%s", remoteAddr, remotePort);

			// Get the actual remote address from the socket
			const actualRemoteAddr = remoteAddr && remotePort
				? ipPortToMultiaddr(remoteAddr, remotePort)
				: this.status.listeningAddr;

			// Ensure privateKey and id are available (transport always provides them)
			if (!this.context.privateKey || !this.context.id) {
				throw new Error("privateKey and id must be provided in ListenerContext");
			}

			// Create encrypter for inbound (we don't know the remote ID yet)
			const encrypter = new EcciesEncrypter(this.context.privateKey, {
				requireEip8: true,
				id: this.context.id,
				remoteId: null, // Will be extracted during handshake
			});

			// Do ECIES + HELLO handshake directly on raw socket
			const secureResult = await encrypter.secureInBound(sock);
			// Create multiaddr connection from raw socket
			const maConn = toMultiaddrConnection({
				socket: sock,
				remoteAddr: this.status.listeningAddr,
				direction: 'inbound'
			});

			// Upgrade the connection (encrypt + mux)
			const connection = await this.context.upgrader.upgradeInbound(maConn);

			const connKey = connection.id;
			this.connections.set(connKey, connection);

			connection.addEventListener('close', () => {
				this.connections.delete(connKey);
					this.encrypterMap.delete(connKey);
				log("connection closed: %s (encrypter cleaned up)", connKey);
			});

			log('new inbound connection: %s', connKey);
		} catch (err: any) {
			log(`Error handling socket: ${err.message}`);
			sock.destroy();
		}
	};

	async listen(addr: Multiaddr): Promise<void> {
		if (this.status.code === "ACTIVE") {
			throw new Error("server is already listening");
		}

		try {
			this.status = {
				code: "ACTIVE",
				listeningAddr: addr,
				netConfig: multiaddrToNetConfig(addr) as NetConfig,
			};

			await this.resume();
			log("listening on %s", this.addr);
		} catch (error) {
			this.status = { code: "INACTIVE" };
			throw error;
		}
	}

	async resume(): Promise<void> {
		if (this.status.code === "INACTIVE") return;
		if (this.server.listening) return;

		const netConfig = this.status.netConfig;
		await new Promise<void>((resolve, reject) => {
			this.server.once("error", reject);
			this.server.listen(netConfig, resolve);
		});
	}

	async pause(): Promise<void> {
		await new Promise<void>((resolve) => {
			this.server.close(() => resolve());
		});
	}

	async close(): Promise<void> {
		// Close all connections
		for (const connection of this.connections.values()) {
			try {
				await connection.close();
			} catch {
				// Ignore errors during close
			}
		}
		this.connections.clear();
		this.encrypterMap.clear();

		await this.pause();
		this.status = { code: "INACTIVE" };
	}

	getConnections(): Connection[] {
		return Array.from(this.connections.values());
	}

	private onListen(): void {
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

export function createListener(context: ListenerContext): TransportListener {
	return new TransportListener(context);
}
