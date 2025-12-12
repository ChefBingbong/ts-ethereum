import type { Multiaddr } from "@multiformats/multiaddr";
import { multiaddr } from "@multiformats/multiaddr";
import debug from "debug";
import { secp256k1 } from "ethereum-cryptography/secp256k1";
import EventEmitter from "events";
import { EcciesEncrypter } from "../connection-encrypters/eccies/eccies-encrypter";
import type { MuxedConnection } from "../connection/connection";
import type { ProtocolStream } from "../connection/protocol-stream";
import { genPrivateKey, pk2id } from "../devp2p";
import { Transport } from "../transport/transport";
import { TransportListener } from "../transport/transport-listener";

const log = debug("p2p:node");

export type ProtocolHandler = (stream: ProtocolStream) => void;
export type NodeOptions = {
	host: string;
	port: number;
	nodeTypes: "peer";
	start?: boolean;
	privateKey?: Uint8Array;
	peerId?: Uint8Array;
};

export class PeerNode extends EventEmitter {
	public host: string;
	public port: number;
	public privateKey: Uint8Array;
	public peerId: Uint8Array;
	public transport: Transport;
	public listener: TransportListener;
	public connections = new Map<string, MuxedConnection>();
	public protocolHandlers = new Map<string, ProtocolHandler>();

	private encrypter: EcciesEncrypter;
	private isStarted = false;

	constructor(options: NodeOptions) {
		super();
		this.host = options.host;
		this.port = options.port;
		this.privateKey = options.privateKey || genPrivateKey();
		this.peerId = pk2id(secp256k1.getPublicKey(this.privateKey, false));

		// Create ECIES encrypter
		this.encrypter = new EcciesEncrypter(this.privateKey, {
			requireEip8: true,
			id: this.peerId,
			remoteId: null,
		});

		// Create transport with dial options
		this.transport = new Transport(
			{
				timeoutMs: 30000,
				maxActiveDials: 10,
			},
			this.encrypter,
		);

		// Create transport listener
		this.listener = new TransportListener({
			upgrader: this.encrypter,
			frameHandler: this.handleFrame.bind(this),
			streamOpenHandler: this.handleStreamOpen.bind(this),
		});
	}

	async start(): Promise<void> {
		if (this.isStarted) return;

		try {
			// Start listening
			const listenAddr = multiaddr(`/ip4/${this.host}/tcp/${this.port}`);
			await this.listener.listen(listenAddr);

			this.isStarted = true;
			const actualPort = this.listener.server.address();
			const listeningPort =
				typeof actualPort === "object" ? actualPort?.port : this.port;

			log(`Peer node started on ${this.host}:${listeningPort}`);
			log(
				`Peer ID: ${Buffer.from(this.peerId).toString("hex").slice(0, 16)}...`,
			);

			this.emit("started", { host: this.host, port: listeningPort });
		} catch (error) {
			log(`Failed to start node: ${error}`);
			throw error;
		}
	}

	async stop(): Promise<void> {
		if (!this.isStarted) return;

		// Close all connections
		for (const connection of this.connections.values()) {
			try {
				connection.onClose();
			} catch (error) {
				log(`Error closing connection: ${error}`);
			}
		}
		this.connections.clear();

		// Stop listener
		if (this.listener.server.listening) {
			await new Promise<void>((resolve) => {
				this.listener.server.close(() => resolve());
			});
		}

		this.isStarted = false;
		log("Peer node stopped");
		this.emit("stopped");
	}

	async dial(multiaddr: Multiaddr): Promise<MuxedConnection> {
		if (!this.isStarted) {
			throw new Error("Node must be started before dialing");
		}

		try {
			const [error, connection] = await this.transport.dial(multiaddr);
			if (error) {
				log(`Failed to dial ${multiaddr.toString()}: ${error.message}`);
				throw error;
			}

			const connId = multiaddr.toString();
			this.connections.set(connId, connection);

			// Set up connection handlers
			connection.setOnFrame((frame) => this.handleFrame(connection, frame));
			connection.setOnStreamOpen((protocol, stream) =>
				this.handleStreamOpen(protocol, stream),
			);

			log(`Connected to ${multiaddr.toString()}`);
			this.emit("connection", connection, multiaddr);

			return connection;
		} catch (error) {
			log(`Dial failed: ${error}`);
			throw error;
		}
	}

	handleProtocol(protocolId: string, handler: ProtocolHandler): void {
		this.protocolHandlers.set(protocolId, handler);
		log(`Registered handler for protocol: ${protocolId}`);
	}

	async openStream(
		connection: MuxedConnection,
		protocolId: string,
	): Promise<ProtocolStream> {
		try {
			const stream = connection.openStream(protocolId);
			log(`Opened stream for protocol: ${protocolId}`);
			return stream;
		} catch (error) {
			log(`Failed to open stream for ${protocolId}: ${error}`);
			throw error;
		}
	}

	private handleFrame(_connection: MuxedConnection, frame: unknown): void {
		// Handle incoming frames
		log(`Received frame:`, frame);

		// Frame handling is typically done by the MuxedConnection itself
		// This is mainly for monitoring/debugging
	}

	private handleStreamOpen(protocolId: string, stream: ProtocolStream): void {
		log(`Incoming stream opened for protocol: ${protocolId}`);

		const handler = this.protocolHandlers.get(protocolId);
		if (handler) {
			try {
				handler(stream);
			} catch (error) {
				log(`Error in protocol handler for ${protocolId}: ${error}`);
				stream.close();
			}
		} else {
			log(`No handler registered for protocol: ${protocolId}`);
			stream.close();
		}
	}

	getMultiaddr(): string {
		const actualAddress = this.listener.server.address();
		const port =
			typeof actualAddress === "object" ? actualAddress?.port : this.port;
		return `/ip4/${this.host}/tcp/${port}`;
	}

	getConnections(): MuxedConnection[] {
		return Array.from(this.connections.values());
	}

	getProtocols(): string[] {
		return Array.from(this.protocolHandlers.keys());
	}
}
