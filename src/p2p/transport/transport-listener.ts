import type { Multiaddr } from "@multiformats/multiaddr";
import debug from "debug";
import { EventEmitter } from "eventemitter3";
import net, { type Server, type Socket } from "node:net";
import type { NetConfig } from "../../utils/getNetConfig";
import { multiaddrToNetConfig } from "../../utils/utils";
import { BasicConnection } from "../connection/basic-connection";
import { Connection } from "../connection/connection";
import { toMultiaddrConnection } from "../connection/multiaddr-connection";
import type { ListenerContext, Status } from "./types";

const log = debug("p2p:transport:listener");

interface TransportListenerEvents {
	connection: (connection: BasicConnection | Connection) => void;
	listening: () => void;
	error: (error: Error) => void;
	close: () => void;
}

export class TransportListener extends EventEmitter<TransportListenerEvents> {
	public server: Server;
	private addr: string = "unknown";
	public context: ListenerContext;
	private status: Status = { code: "INACTIVE" };
	private connections: Map<string, BasicConnection | Connection> = new Map();

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
			// For inbound connections, derive a temporary peer ID from the socket address
			// The real peer ID will be extracted during ECIES handshake (if encryption is enabled)
			const remoteAddr = sock.remoteAddress;
			const remotePort = sock.remotePort;
			const tempPeerId = new Uint8Array(64);  // Will be replaced after encryption
			
			log('incoming socket from %s:%s', remoteAddr, remotePort);

			// Create multiaddr connection from raw socket
			const maConn = toMultiaddrConnection({
				socket: sock,
				remoteAddr: this.status.listeningAddr,
				direction: 'inbound',
				remotePeerId: tempPeerId  // Temporary ID
			});

			log('upgrading inbound connection (basic, no muxing)...');
			const basicConn = await this.context.upgrader.upgradeInboundBasic(maConn);
			
			// Attempt upgrade with timeout
			// The server will wait for the client to initiate muxer negotiation
			// If client doesn't send muxer protocol within timeout, we keep BasicConnection
			// If successful, handle full connection setup in .then()
			// If failed/timeout, handle basic connection setup in .catch()
			basicConn.upgrade(
				this.context.upgrader.getComponents(),
				this.context.upgrader.getStreamMuxerFactory(),
				{ signal: AbortSignal.timeout(5_000) }
			).then((fullConn) => {
				// Upgrade succeeded - client wanted full connection
				const connKey = fullConn.id;
				this.connections.set(connKey, fullConn);
				
				fullConn.addEventListener('close', () => {
					this.connections.delete(connKey);
					log('connection closed: %s', connKey);
				});

				log('new inbound connection (full): %s from peer %s', connKey, Buffer.from(fullConn.remotePeer).toString('hex').slice(0, 16));
				this.emit('connection', fullConn);
			}).catch((upgradeErr: any) => {
				// Upgrade failed/timeout - client only wants basic connection
				log('client did not request full connection (timeout or error), keeping BasicConnection: %s', upgradeErr.message);
				
				const connKey = basicConn.id;
				this.connections.set(connKey, basicConn);

				basicConn.addEventListener('close', () => {
					this.connections.delete(connKey);
					log('connection closed: %s', connKey);
				});

				log('new inbound connection (basic): %s from peer %s', connKey, Buffer.from(basicConn.remotePeer).toString('hex').slice(0, 16));
				this.emit('connection', basicConn);
			});
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

		await this.pause();
		this.status = { code: "INACTIVE" };
	}

	getConnections(): (BasicConnection | Connection)[] {
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
