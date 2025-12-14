import type { Multiaddr } from "@multiformats/multiaddr";
import debug from "debug";
import { EventEmitter } from "eventemitter3";
import net, { type Server, type Socket } from "node:net";
import type { NetConfig } from "../../../utils/getNetConfig";
import { ipPortToMultiaddr } from "../../../utils/multi-addr";
import { multiaddrToNetConfig } from "../../../utils/utils";
import type { EcciesEncrypter as EcciesEncrypterType } from "../../connection-encrypters";
import { EcciesEncrypter } from "../../connection-encrypters";
import { BasicConnection, createBasicConnection } from "../../connection/basic-connection";
import { toRlpxConnection } from "./rlpx-to-connection";
import type { ListenerContext, Status } from "./types";

const log = debug("p2p:transport:listener:rlpx");

interface TransportListenerEvents {
	connection: (connection: BasicConnection) => void;
	listening: () => void;
	error: (error: Error) => void;
	close: () => void;
}

export class TransportListener extends EventEmitter<TransportListenerEvents> {
	public server: Server;
	private addr: string = "unknown";
	public context: ListenerContext;
	private status: Status = { code: "INACTIVE" };
	private connections: Map<string, BasicConnection> = new Map();
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
			// For inbound connections, derive a temporary peer ID from the socket address
			// The real peer ID will be extracted during ECIES handshake (if encryption is enabled)
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

			log(`✅ Handshake complete! Remote peer: ${Buffer.from(secureResult.remotePeer!).toString("hex").slice(0, 16)}`);

			// Create RLPx multiaddr connection from raw socket with encrypter
			const maConn = toRlpxConnection({
				socket: sock,
				remoteAddr: actualRemoteAddr, // Use actual remote address, not our listening address!
				direction: "inbound",
				remotePeerId: secureResult.remotePeer,
				encrypter,
			});

			// Now wrap in connection abstractions
			const connId = `${(parseInt(String(Math.random() * 1e9))).toString(36)}${Date.now()}`;
			const basicConn = createBasicConnection({
				id: connId,
				maConn,
				stream: maConn,
				remotePeer: secureResult.remotePeer!,
				direction: "inbound",
				cryptoProtocol: "eccies",
			});

			// Store encrypter mapped to connection ID for lifetime isolation
			this.encrypterMap.set(connId, encrypter);

			// Store and emit the BasicConnection
			const connKey = basicConn.id;
			this.connections.set(connKey, basicConn);

			basicConn.addEventListener("close", () => {
				this.connections.delete(connKey);
				this.encrypterMap.delete(connId);
				log("connection closed: %s (encrypter cleaned up)", connKey);
			});

			log(
				"new inbound RLPx connection (basic): %s from peer %s",
				connKey,
				basicConn.remotePeer 
					? Buffer.from(basicConn.remotePeer).toString("hex").slice(0, 16)
					: "unknown (handshake pending)",
			);
			this.emit("connection", basicConn);
		} catch (err: any) {
			console.error("error handling RLPx socket", err);	
			log(`Error handling RLPx socket: ${err.message}`);
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

	getConnections(): BasicConnection[] {
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
