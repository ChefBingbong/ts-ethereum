import { multiaddr } from "@multiformats/multiaddr";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import { DPT as Devp2pDPT } from "../../../devp2p/dpt-1/index.ts";
import { pk2id } from "../../../devp2p/util.ts";
import { EcciesEncrypter } from "../../../p2p/connection-encrypters/eccies/eccies-encrypter.ts";
import { Connection } from "../../../p2p/connection/connection.ts";
import { Registrar } from "../../../p2p/connection/registrar.ts";
import { Upgrader } from "../../../p2p/connection/upgrader.ts";
import { mplex } from "../../../p2p/muxer/index.ts";
import { Transport } from "../../../p2p/transport/transport.ts";
import {
    bytesToUnprefixedHex
} from "../../../utils";
import { getHostPortFromMultiaddr } from "../../../utils/utils.ts";
import { Event } from "../../types.ts";
import { P2PPeer } from "../peer/p2ppeer.ts";
import { StreamEthProtocol } from "../protocol/streamethprotocol.ts";
import type { ServerOptions } from "./server.ts";
import { Server } from "./server.ts";

export interface P2PServerOptions extends ServerOptions {
	/* List of supported clients */
	clientFilter?: string[];
}

const ignoredErrors = new RegExp(
	[
		// Peer socket connection
		"ECONNRESET",
		"EPIPE",
		"ETIMEDOUT",

		// ETH status handling
		"Genesis block mismatch",
		"NetworkId mismatch",
		"Unknown fork hash",

		// DPT message decoding
		"Hash verification failed",
		"Invalid address bytes",
		"Invalid timestamp bytes",
		"Invalid type",
		"Timeout error: ping",
		"Peer is banned",

		// ECIES message encryption
		"Invalid MAC",

		// Client
		"Handshake timed out",
		"Server already destroyed",
	].join("|"),
);

/**
 * P2P server using modular transport + connection + mplex + multi-stream-select
 * @memberof module:net/server
 */
export class P2PServer extends Server {
	private peers: Map<string, P2PPeer> = new Map();

	public discovery: boolean;
	private clientFilter: string[];

	public transport: Transport | null = null;
	public listener: any = null;
	public registrar: Registrar | null = null;
	public upgrader: Upgrader | null = null;
	public dpt: Devp2pDPT | null = null;
	public ip: string;

	/**
	 * Create new P2P server
	 */
	constructor(options: P2PServerOptions) {
		super(options);
		this.ip = options.config.extIP ?? "127.0.0.1";
		this.discovery = options.config.discV4;
		this.clientFilter = options.clientFilter ?? [
			"go1.5",
			"go1.6",
			"go1.7",
			"quorum",
			"pirl",
			"ubiq",
			"gmc",
			"gwhale",
			"prichain",
		];
	}

	/**
	 * Server name
	 */
	get name() {
		return "p2p";
	}

	/**
	 * Return server info
	 */
	getServerInfo() {
		const listenAddr = this.ip.match(/^(\d+\.\d+\.\d+\.\d+)$/)
			? `${this.ip}:${this.config.port}`
			: `[${this.ip}]:${this.config.port}`;

		const id = bytesToUnprefixedHex(this.key);
		return {
			enode: `enode://${id}@${listenAddr}`,
			id,
			ip: this.ip,
			listenAddr,
			ports: { discovery: this.config.port, listener: this.config.port },
		};
	}

	/**
	 * Start P2P server.
	 * Returns a promise that resolves once server has been started.
	 * @returns true if server successfully started
	 */
	async start(): Promise<boolean> {
		if (this.started) {
			return false;
		}

		// CRITICAL: Initialize DPT and P2P stack BEFORE opening protocols
		// This ensures registrar exists when protocols try to register handlers
		await this.initDpt();
		await this.initP2P();
		
		// Set registrar reference on all StreamEthProtocol instances BEFORE opening
		this.initializeProtocolHandlers();
		
		// NOW open protocols - handlers will be registered successfully
		await super.start();
		
		this.started = true;

		return true;
	}

	/**
	 * Initialize protocol handlers with the registrar
	 */
	private initializeProtocolHandlers() {
		if (!this.registrar) {
			this.config.logger?.error("❌ Registrar not initialized - protocols will not work!");
			return;
		}

		this.config.logger?.info(
			`🔧 Initializing protocol handlers with registrar...`,
		);

		for (const protocol of this.protocols) {
			if (protocol instanceof StreamEthProtocol) {
				// Set registrar reference BEFORE opening
				protocol.setRegistrar(this.registrar);
				this.config.logger?.info(
					`✅ Set registrar on StreamEthProtocol for ${protocol.name}`,
				);
			}
		}
	}

	/**
	 * Bootstrap bootnode from the network
	 */
	async bootstrap(): Promise<void> {
		this.config.logger?.info(
			`🌐 Bootstrap starting with ${this.bootnodes.length} bootnode(s)`,
		);

		const promises = this.bootnodes.map((ma) => {
			const { host, port } = getHostPortFromMultiaddr(ma);
			const bootnode = {
				address: host,
				udpPort: Number(port),
				tcpPort: Number(port),
			};
			this.config.logger?.info(
				`📡 Bootstrapping to ${host}:${port} (UDP+TCP)`,
			);
			return this.dpt!.bootstrap(bootnode);
		});

		for (const promise of promises) {
			try {
				await promise;
				this.config.logger?.info(`✅ Bootstrap complete`);
			} catch (e: any) {
				this.config.logger?.error(`❌ Bootstrap failed: ${e.message}`);
				this.error(e);
			}
		}

		this.config.logger?.info(
			`✅ Bootstrap phase complete, DPT table size: ${this.dpt?.getPeers().length || 0}`,
		);
	}

	/**
	 * Stop P2P server. Returns a promise that resolves once server has been stopped.
	 */
	async stop(): Promise<boolean> {
		if (this.started) {
			// Close all peer connections
			for (const peer of this.peers.values()) {
				try {
					await peer.connection?.close();
				} catch {}
			}

			// Stop listener
			if (this.listener) {
				await this.listener.close();
			}

			// Destroy DPT
			if (this.dpt) {
				this.dpt.destroy();
			}

			await super.stop();
			this.started = false;
		}
		return this.started;
	}

	/**
	 * Ban peer for a specified time
	 * @param peerId id of peer
	 * @param maxAge how long to ban peer in ms
	 * @returns true if ban was successfully executed
	 */
	ban(peerId: string, maxAge = 60000): boolean {
		if (!this.started) {
			return false;
		}
		this.dpt!.banPeer(peerId, maxAge);
		const peer = this.peers.get(peerId);
		if (peer && peer.connection) {
			peer.connection.close().catch(() => {});
		}
		return true;
	}

	/**
	 * Handles errors from server and peers
	 * @param error
	 * @emits {@link Event.SERVER_ERROR}
	 */
	private error(error: Error) {
		if (ignoredErrors.test(error.message)) {
			return;
		}
		this.config.events.emit(Event.SERVER_ERROR, error, this);
	}

	/**
	 * Initializes DPT for peer discovery
	 */
	private async initDpt() {
		return new Promise<void>((resolve) => {
			this.dpt = new Devp2pDPT(this.key, {
				refreshInterval: this.refreshInterval,
				endpoint: {
					address: "127.0.0.1",
					udpPort: this.config.port || null,
					tcpPort: this.config.port || null,  // Important: Tell peers our TCP port!
				},
				onlyConfirmed: false,
				shouldFindNeighbours: this.config.discV4,
				common: this.config.chainCommon,
			});

			this.config.logger?.info(
				`🔧 DPT initialized with endpoint udp:${this.config.port} tcp:${this.config.port}`,
			);

			this.dpt.events.on("error", (e: Error) => {
				this.error(e);
				if (e.message.includes("EADDRINUSE") === true) resolve();
			});

			this.dpt.events.on("listening", () => {
				this.config.logger?.info(
					`🎧 DPT listening on UDP port ${this.config.port}`,
				);
				resolve();
			});

			// Add more DPT event logging
			this.dpt.events.on("peer:new", (peer: any) => {
				const peerId = peer.id
					? bytesToUnprefixedHex(peer.id).slice(0, 8)
					: "unknown";
				this.config.logger?.info(
					`🆕 DPT PEER:NEW - ${peerId}... at ${peer.address}:${peer.udpPort}/${peer.tcpPort || "?"}`,
				);
			});

			this.config.events.on(Event.PEER_CONNECTED, (peer) => {
				this.dpt?.confirmPeer(peer.id);
			});

			// Listen for peer discovery
			this.dpt.events.on("peer:added", async (peerInfo: any) => {
				const peerId = peerInfo.id
					? bytesToUnprefixedHex(peerInfo.id).slice(0, 8)
					: "unknown";
				this.config.logger?.info(
					`🔍 DPT discovered peer: ${peerId}... at ${peerInfo.address}:${peerInfo.tcpPort || "?"} (table size: ${this.dpt?.getPeers().length})`,
				);

				// Attempt to connect to discovered peers
				if (peerInfo.tcpPort && peerInfo.address && peerInfo.id) {
					await this.attemptConnection(peerInfo);
				} else {
					this.config.logger?.debug(
						`Cannot connect to ${peerId}... - missing connection info`,
					);
				}
			});

			if (typeof this.config.port === "number") {
				this.dpt.bind(this.config.port, "127.0.0.1");
			}
			this.config.logger?.info(
				`Started discovery service discV4=${this.config.discV4} refreshInterval=${this.refreshInterval}`,
			);
		});
	}

	/**
	 * Initializes P2P networking stack
	 */
	private async initP2P() {
		return new Promise<void>((resolve, reject) => {
			try {
				// Derive peer ID from private key
				const publicKey = secp256k1.getPublicKey(this.key, false);
				const peerId = pk2id(publicKey);

				this.config.logger?.info(
					`🆔 Node peer ID: ${bytesToUnprefixedHex(peerId).slice(0, 16)}...`,
				);

				// Create registrar for protocol handling
				this.registrar = new Registrar({
					peerId: peerId,
				});

				this.config.logger?.info(
					`✅ Registrar created (protocols: ${this.registrar.getProtocols().length})`,
				);

				// Create stream muxer factory  
				const muxerFactory = mplex()();

				// Create upgrader WITHOUT ECIES
				// ECIES frame encryption is incompatible with mplex because:
				// - ECIES sets up frame cipher on socket (ingressAes/egressAes)
				// - Mplex tries to read/write raw bytes
				// - Data gets corrupted: "04b730d902776d0fcf..." (encrypted garbage)
				// - Result: "missing stream" errors, timeouts
				// TODO: Implement ECIES-aware socket wrapper or use TLS instead
				this.upgrader = new Upgrader(
					{ registrar: this.registrar },
					{
						privateKey: this.key,
						id: peerId,
						connectionEncrypter: null,  // Disable ECIES
						streamMuxerFactory: muxerFactory,
						skipEncryptionNegotiation: false,
						skipMuxerNegotiation: false,
					},
				);

				this.config.logger?.info(
					`⚠️  Upgrader created WITHOUT encryption (plaintext for testing)`,
				);

				// Create transport
				this.transport = new Transport({
					upgrader: this.upgrader,
					dialOpts: {
						timeoutMs: 30000,
						maxActiveDials: 10,
					},
				});

				// Create listener
				this.listener = this.transport.createListener({});

				// Handle incoming connections
				this.listener.on("connection", (connection) => {
					this.handleInboundConnection(connection);
				});

				// Start listening
				if (typeof this.config.port === "number") {
					const listenAddr = multiaddr(
						`/ip4/127.0.0.1/tcp/${this.config.port}`,
					);
					this.listener
						.listen(listenAddr)
						.then(() => {
							const registeredProtocols = this.registrar?.getProtocols() || [];
							this.config.logger?.info(
								`🎧 TCP listener started, registrar has ${registeredProtocols.length} protocol(s)`,
							);
							if (registeredProtocols.length === 0) {
								this.config.logger?.warn(
									`⚠️  WARNING: No protocols registered yet! Handlers must be added before connections arrive.`,
								);
							}

							this.config.events.emit(Event.SERVER_LISTENING, {
								transport: this.name,
								url: this.getServerInfo().enode ?? "",
							});
							resolve();
						})
						.catch((err: Error) => {
							this.error(err);
							if (err.message.includes("EADDRINUSE") === true) resolve();
							else reject(err);
						});
				} else {
					resolve();
				}
			} catch (err: any) {
				this.error(err);
				reject(err);
			}
		});
	}

	/**
	 * Attempt to connect to a discovered peer
	 */
	private async attemptConnection(peerInfo: any) {
		const peerId = bytesToUnprefixedHex(peerInfo.id);
		const myId = bytesToUnprefixedHex(this.key);

		// Skip if trying to connect to ourselves
		if (peerId === myId) {
			this.config.logger?.debug(
				`Skipping connection to self: ${peerId.slice(0, 8)}...`,
			);
			return;
		}

		// Skip if already connected
		if (this.peers.has(peerId)) {
			this.config.logger?.debug(
				`Already connected to peer: ${peerId.slice(0, 8)}...`,
			);
			return;
		}

		// Skip if max peers reached
		if (this.peers.size >= this.config.maxPeers) {
			this.config.logger?.debug(
				`Max peers reached (${this.config.maxPeers}), not connecting to ${peerId.slice(0, 8)}...`,
			);
			return;
		}

		this.config.logger?.info(
			`🔌 Attempting connection to ${peerId.slice(0, 8)}... at ${peerInfo.address}:${peerInfo.tcpPort}`,
		);

		try {
			const peerMultiaddr = multiaddr(
				`/ip4/${peerInfo.address}/tcp/${peerInfo.tcpPort}`,
			);

			const [error, connection] = await this.transport!.dial(
				peerMultiaddr,
				peerInfo.id,
			);

			if (error || !connection) {
				this.config.logger?.debug(
					`❌ Failed to connect to peer ${peerId.slice(0, 8)}...: ${error?.message ?? "Unknown error"}`,
				);
				return;
			}

			this.config.logger?.info(
				`✅ TCP connection established to ${peerId.slice(0, 8)}...`,
			);

			// Create peer wrapper
			await this.handleConnection(connection, peerInfo, false);
		} catch (err: any) {
			this.config.logger?.debug(
				`❌ Error connecting to peer ${peerId.slice(0, 8)}...: ${err.message}`,
			);
		}
	}

	/**
	 * Handle inbound connection
	 */
	private async handleInboundConnection(connection: Connection) {
		try {
			const remoteId = connection.remotePeer;
			const peerId = bytesToUnprefixedHex(remoteId);

			// Extract address from connection
			const remoteAddr = connection.remoteAddr;
			const components = remoteAddr.getComponents();
			const address =
				components.find((c) => c.code === 4)?.value || "unknown";
			const port = components.find((c) => c.code === 6)?.value || 0;

			const peerInfo = {
				id: remoteId,
				address: address.toString(),
				tcpPort: Number(port),
				udpPort: Number(port),
			};

			await this.handleConnection(connection, peerInfo, true);
		} catch (err: any) {
			this.error(err);
		}
	}

	/**
	 * Handle a new connection (inbound or outbound)
	 */
	private async handleConnection(
		connection: Connection,
		peerInfo: any,
		isInbound: boolean,
	) {
		const peerId = bytesToUnprefixedHex(peerInfo.id);
		const direction = isInbound ? "inbound" : "outbound";

		this.config.logger?.info(
			`🔗 Handling ${direction} connection from/to ${peerId.slice(0, 8)}...`,
		);

		// Skip if already connected
		if (this.peers.has(peerId)) {
			this.config.logger?.debug(
				`Peer ${peerId.slice(0, 8)}... already connected, closing duplicate`,
			);
			connection.close().catch(() => {});
			return;
		}

		// Create peer
		const peer = new P2PPeer({
			config: this.config,
			id: peerId,
			address: `${peerInfo.address}:${peerInfo.tcpPort}`,
			inbound: isInbound,
			protocols: Array.from(this.protocols),
			connection,
			registrar: this.registrar!,
		});

		try {
			this.config.logger?.info(
				`📝 Initializing protocols for peer ${peerId.slice(0, 8)}...`,
			);

			// Initialize peer protocols
			await peer.accept(this);

			this.peers.set(peerId, peer);
			this.config.logger?.info(
				`✅ Peer ${peerId.slice(0, 8)}... fully connected (protocols: ${this.protocols.size})`,
			);
			this.config.events.emit(Event.PEER_CONNECTED, peer);

			// Handle connection close
			connection.addEventListener("close", () => {
				this.peers.delete(peerId);
				this.config.logger?.info(`👋 Peer disconnected: ${peerId.slice(0, 8)}...`);
				this.config.events.emit(Event.PEER_DISCONNECTED, peer);
			});

			// Add inbound peers to DPT so they can be discovered by others
			if (isInbound && this.dpt) {
				this.config.logger?.info(
					`📢 Adding inbound peer ${peerId.slice(0, 8)}... to DPT for sharing with other nodes`,
				);
				const added = this.dpt.kademlia.addPeer(peerInfo);
				if (added) {
					this.config.logger?.info(
						`✅ Peer added to DPT (table size: ${this.dpt.getPeers().length})`,
					);
				} else {
					this.config.logger?.debug(
						`Peer ${peerId.slice(0, 8)}... was already in DPT`,
					);
				}
			}
		} catch (error: any) {
			this.config.logger?.error(
				`❌ Error initializing peer ${peerId.slice(0, 8)}...: ${error.message}`,
			);
			this.error(error);
			connection.close().catch(() => {});
		}
	}
}

