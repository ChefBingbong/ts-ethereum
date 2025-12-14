import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import { DPT as Devp2pDPT } from "../../../devp2p/dpt-1/index.ts";
import { pk2id } from "../../../devp2p/index";
import { EcciesEncrypter } from "../../../p2p/connection-encrypters/eccies/eccies-encrypter";
import type { BasicConnection } from "../../../p2p/connection/basic-connection";
import { Registrar } from "../../../p2p/connection/registrar";
import { Upgrader } from "../../../p2p/connection/upgrader.ts";
import { mplex } from "../../../p2p/muxer";
import { TransportListener } from "../../../p2p/transport/rlpx/transport-listener.ts";
import { Transport } from "../../../p2p/transport/rlpx/transport.ts";
import { bytesToUnprefixedHex } from "../../../utils";
import { ipPortToMultiaddr } from "../../../utils/multi-addr";
import { getHostPortFromMultiaddr } from "../../../utils/utils.ts";
import { Event } from "../../types.ts";
import { Peer } from "../peer/peer.ts";
import type { ServerOptions } from "./server.ts";
import { Server } from "./server.ts";

export interface RlpxServerOptions extends ServerOptions {
	/* List of supported clients */
	clientFilter?: string[];
}

const ignoredErrors = new RegExp(
	[
		// Peer socket connection
		"ECONNRESET",
		"EPIPE", // (?)
		"ETIMEDOUT", // (?)

		// ETH status handling
		"Genesis block mismatch",
		"NetworkId mismatch",
		"Unknown fork hash",

		// DPT message decoding
		"Hash verification failed",
		"Invalid address bytes",
		"Invalid timestamp bytes",
		"Invalid type",
		"Timeout error: ping", // connection
		"Peer is banned", // connection

		// ECIES message encryption
		"Invalid MAC",

		// Client
		"Handshake timed out", // Protocol handshake
		"Server already destroyed", // Bootstrap retrigger
	].join("|"),
);

/**
 * DevP2P/RLPx server
 * @memberof module:net/server
 */
export class RlpxServer extends Server {
	private peers: Map<string, Peer> = new Map();

	public discovery: boolean;
	private clientFilter: string[];

	public dpt: Devp2pDPT | null = null;
	public ip: string;

	// New RLPx transport
	private transport: Transport | null = null;
	private listener: TransportListener | null = null;
	private upgrader: Upgrader | null = null;
	private peerId: Uint8Array; // Our peer ID derived from private key

	/**
	 * Create new DevP2P/RLPx server
	 */
	constructor(options: RlpxServerOptions) {
		super(options);
		// As of now, the devp2p dpt server listens on the ip4 protocol by default and hence the ip in the
		// bootnode needs to be of ip4 by default
		this.ip = options.config.extIP ?? "127.0.0.1";
		this.discovery = options.config.discV4;
		this.clientFilter = options.clientFilter ?? [
			"go1.5",
			"go1.6",
			"go1.7",
			"quorum",
			"pirl", // cspell:disable-line
			"ubiq", // cspell:disable-line
			"gmc", // cspell:disable-line
			"gwhale", // cspell:disable-line
			"prichain", // cspell:disable-line
		];

		// Derive peer ID from private key
		this.peerId = pk2id(secp256k1.getPublicKey(this.key, false));
	}

	/**
	 * Server name
	 */
	get name() {
		return "rlpx";
	}

	/**
	 * Return Rlpx info
	 */
	getRlpxInfo() {
		const listenAddr = this.ip.match(/^(\d+\.\d+\.\d+\.\d+)$/)
			? `${this.ip}:${this.config.port}`
			: `[${this.ip}]:${this.config.port}`;

		const id = bytesToUnprefixedHex(this.peerId);
		return {
			enode: `enode://${id}@${listenAddr}`,
			id,
			ip: this.ip,
			listenAddr,
			ports: { discovery: this.config.port, listener: this.config.port },
		};
	}

	/**
	 * Start Devp2p/RLPx server.
	 * Returns a promise that resolves once server has been started.
	 * @returns true if server successfully started
	 */
	async start(): Promise<boolean> {
		if (this.started) {
			return false;
		}
		await super.start();
		await this.initDpt();
		await this.initTransport();
		this.started = true;

		return true;
	}

	/**
	 * Bootstrap bootnode from the network
	 */
	async bootstrap(): Promise<void> {
		this.config.logger?.info(
			`[RlpxServer.bootstrap] 🚀 Starting bootstrap with ${this.bootnodes.length} bootnode(s)`,
		);

		// Bootnodes
		let promises = this.bootnodes.map((ma, index) => {
			const { host, port } = getHostPortFromMultiaddr(ma);
			const bootnode = {
				address: host,
				udpPort: Number(port),
				tcpPort: Number(port),
			};
			this.config.logger?.info(
				`[RlpxServer.bootstrap] 📡 Bootstrapping bootnode ${index + 1}/${this.bootnodes.length}: ${host}:${port}`,
			);
			return this.dpt!.bootstrap(bootnode);
		});

		for (const [index, promise] of promises.entries()) {
			try {
				const { host, port } = getHostPortFromMultiaddr(this.bootnodes[index]);
				this.config.logger?.debug(
					`[RlpxServer.bootstrap] ⏳ Waiting for bootnode ${host}:${port}...`,
				);
				await promise;
				this.config.logger?.info(
					`[RlpxServer.bootstrap] ✅ Bootnode ${host}:${port} bootstrap completed`,
				);
			} catch (e: any) {
				const { host, port } = getHostPortFromMultiaddr(this.bootnodes[index]);
				this.config.logger?.warn(
					`[RlpxServer.bootstrap] ⚠️ Bootnode ${host}:${port} bootstrap failed: ${e.message || e}`,
				);
				this.error(e);
			}
		}

		this.config.logger?.info(
			`[RlpxServer.bootstrap] 📊 Bootstrap complete. DPT has ${this.dpt?.numPeers() || 0} discovered peers`,
		);
	}

	/**
	 * Connect to a discovered peer
	 * @param peerId Peer ID as hex string
	 * @param host Peer host address
	 * @param port Peer TCP port
	 */
	private async connectToPeer(
		peerId: string,
		host: string,
		port: number,
	): Promise<void> {
		// Skip if trying to connect to ourselves
		const ourPeerId = bytesToUnprefixedHex(this.peerId);
		if (peerId === ourPeerId) {
			this.config.logger?.debug(
				`[RlpxServer.connectToPeer] ⏭️ Skipping self-connection attempt (our ID: ${peerId.slice(0, 8)})`,
			);
			return;
		}
		
		// Skip if already connected
		if (this.peers.has(peerId)) {
			this.config.logger?.debug(
				`[RlpxServer.connectToPeer] ⏭️ Already connected to peer ${peerId.slice(0, 8)}, skipping`,
			);
			return;
		}

		// Skip if we're at max peers
		if (this.peers.size >= (this.config.maxPeers ?? 10)) {
			this.config.logger?.debug(
				`[RlpxServer.connectToPeer] ⚠️ Max peers reached (${this.peers.size}), skipping peer ${peerId.slice(0, 8)}`,
			);
			return;
		}

		if (!this.transport) {
			this.config.logger?.error(
				`[RlpxServer.connectToPeer] ❌ Transport not initialized, cannot connect to peer ${peerId.slice(0, 8)}`,
			);
			return;
		}

		this.config.logger?.info(
			`[RlpxServer.connectToPeer] 🔌 Creating peer instance for ${peerId.slice(0, 8)} at ${host}:${port}`,
		);

		const peer = new Peer({
			config: this.config,
			id: peerId,
			host: host,
			port: port,
			protocols: Array.from(this.protocols),
			inbound: false,
			transportInstance: this.transport,
		});
		// Set server reference for outbound peers so they can send HELLO
		peer.server = this;

		try {
			await peer.connect();
			this.peers.set(peer.id, peer);
			this.config.logger?.info(
				`[RlpxServer.connectToPeer] ✅ Successfully connected to peer ${peerId.slice(0, 8)}`,
			);
			this.config.events.emit(Event.PEER_CONNECTED, peer);

			// Listen for disconnection
			this.config.events.once(
				Event.PEER_DISCONNECTED,
				(disconnectedPeer: Peer) => {
					if (disconnectedPeer.id === peerId) {
						this.peers.delete(peerId);
					}
				},
			);
		} catch (error: any) {
			this.config.logger?.warn(
				`[RlpxServer.connectToPeer] ❌ Failed to connect to peer ${peerId.slice(0, 8)}: ${error.message || error}`,
			);
			// Don't throw - we want to continue trying other peers
		}
	}

	/**
	 * Stop Devp2p/RLPx server. Returns a promise that resolves once server has been stopped.
	 */
	async stop(): Promise<boolean> {
		if (this.started) {
			if (this.listener) {
				await this.listener.close();
			}
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
		if (this.dpt) {
			this.dpt.banPeer(peerId, maxAge);
		}
		// Close connection if peer is connected
		const peer = this.peers.get(peerId);
		if (peer && peer.basicConnection) {
			peer.basicConnection.close().catch(() => {});
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
					udpPort: null,
					tcpPort: null,
				},
				onlyConfirmed: false,
				shouldFindNeighbours: this.config.discV4,
				common: this.config.chainCommon,
			});

			this.dpt.events.on("error", (e: Error) => {
				this.error(e);
				// If DPT can't bind to port, resolve anyway so client startup doesn't hang
				if (e.message.includes("EADDRINUSE") === true) resolve();
			});

			this.dpt.events.on("listening", () => {
				this.config.logger?.info(
					`[RlpxServer.initDpt] 🎧 DPT listening on UDP port`,
				);
				resolve();
			});

			this.dpt.events.on("peer:added", (peerInfo) => {
				const peerIdHex = bytesToUnprefixedHex(peerInfo.id);
				this.config.logger?.info(
					`[RlpxServer.initDpt] ➕ DPT peer:added: ${peerIdHex.slice(0, 8)} at ${peerInfo.address}:${peerInfo.tcpPort} (DPT size: ${this.dpt?.numPeers() || 0})`,
				);

				// Automatically attempt to connect to discovered peers
				if (peerInfo.tcpPort && peerInfo.address && this.transport) {
					this.config.logger?.info(
						`[RlpxServer.initDpt] 🔌 Attempting to connect to discovered peer ${peerIdHex.slice(0, 8)}...`,
					);
					this.connectToPeer(
						peerIdHex,
						peerInfo.address,
						peerInfo.tcpPort,
					).catch((err) => {
						this.config.logger?.debug(
							`[RlpxServer.initDpt] ⚠️ Failed to connect to discovered peer ${peerIdHex.slice(0, 8)}: ${err.message || err}`,
						);
					});
				}
			});

			this.dpt.events.on("peer:new", (peerInfo) => {
				this.config.logger?.debug(
					`[RlpxServer.initDpt] 🆕 DPT peer:new: ${bytesToUnprefixedHex(peerInfo.id).slice(0, 8)} at ${peerInfo.address}:${peerInfo.tcpPort}`,
				);
			});

			this.dpt.events.on("peer:removed", (peerInfo) => {
				this.config.logger?.debug(
					`[RlpxServer.initDpt] ➖ DPT peer:removed: ${bytesToUnprefixedHex(peerInfo.id).slice(0, 8)}`,
				);
			});

			this.dpt.events.on("error", (error) => {
				this.config.logger?.error(
					`[RlpxServer.initDpt] ❌ DPT error: ${error.message || error}`,
				);
			});

			this.config.events.on(Event.PEER_CONNECTED, (peer) => {
				this.config.logger?.debug(
					`[RlpxServer] ✓ Confirming peer ${peer.id.slice(0, 8)} in DPT`,
				);
				this.dpt?.confirmPeer(peer.id);
			});

			if (typeof this.config.port === "number") {
				this.dpt.bind(this.config.port, "127.0.0.1");
			}
			this.config.logger?.info(
				`Started discovery service discV4=${this.config.discV4}  refreshInterval=${this.refreshInterval}`,
			);
		});
	}

	/**
	 * Initializes Transport and TransportListener for peer management
	 */
	private async initTransport(): Promise<void> {
		// Create ECIES encrypter
		const encrypter = new EcciesEncrypter(this.key, {
			requireEip8: true,
			id: this.peerId,
			remoteId: null,
		});

		// Create registrar for protocol handling
		const registrar = new Registrar({
			peerId: this.peerId,
		});

		// Create stream muxer factory (though we won't use muxing for RLPx)
		const muxerFactory = mplex()();

		// Create upgrader
		this.upgrader = new Upgrader(
			{ registrar },
			{
				privateKey: this.key,
				id: this.peerId,
				connectionEncrypter: encrypter,
				streamMuxerFactory: muxerFactory,
				skipEncryptionNegotiation: false, // ECIES handles its own handshake
				skipMuxerNegotiation: true, // RLPx doesn't use muxing
			},
		);

		// Create transport
		this.transport = new Transport({
			upgrader: this.upgrader,
			dialOpts: { maxActiveDials: this.config.maxPeers ?? 10 },
		});

		// Create listener - TransportListener handles connections automatically via 'connection' event
		// The transport already has the upgrader, so we don't need to pass it
		this.listener = this.transport.createListener({ upgrader: this.upgrader });

		// Handle incoming connections
		this.listener.on("connection", async (basicConn: BasicConnection) => {
			// Extract peer info from connection
			const remotePeerId = bytesToUnprefixedHex(basicConn.remotePeer);
			const remoteAddr = basicConn.remoteAddr;
			const { host, port } = getHostPortFromMultiaddr(remoteAddr);

			// Check if peer already exists
			if (this.peers.has(remotePeerId)) {
				this.config.logger?.warn(
					`[RlpxServer] ⚠️ Duplicate connection from peer ${remotePeerId.slice(0, 8)} at ${host}:${port}, closing duplicate`,
				);
				try {
					await basicConn.close();
				} catch {
					// Ignore close errors
				}
				return;
			}

			this.config.logger?.info(
				`[RlpxServer] 📥 New INBOUND connection from peer ${remotePeerId.slice(0, 8)} at ${host}:${port}`,
			);

			let peer: Peer | null = new Peer({
				config: this.config,
				id: remotePeerId,
				host: host,
				port: Number(port),
				protocols: Array.from(this.protocols),
				inbound: true,
				transportInstance: this.transport, // Provide transport for future outbound connections
			});

			try {
				await peer.accept(basicConn, this);
				this.peers.set(peer.id, peer);
				this.config.logger?.info(
					`[RlpxServer] ✅ Inbound peer ${peer.id.slice(0, 8)} added to server peers (total: ${this.peers.size})`,
				);
				this.config.events.emit(Event.PEER_CONNECTED, peer);

				// Add inbound peers to DPT so they can be shared with other nodes
				if (this.dpt) {
					const peerInfo = {
						id: basicConn.remotePeer,
						address: host,
						udpPort: Number(port),
						tcpPort: Number(port),
					};
					// Add verified peer directly (skip UDP ping since we have RLPx connection)
					const added = this.dpt.kademlia.addPeer(peerInfo);
					if (added) {
						this.config.logger?.info(
							`Added inbound peer to DPT: ${host}:${port} (DPT size: ${this.dpt.numPeers()})`,
						);
					}
				}

				// Listen for connection close
				basicConn.addEventListener("close", () => {
					const peer = this.peers.get(remotePeerId);
					if (peer) {
						this.peers.delete(peer.id);
						this.config.logger?.debug(`Peer disconnected: ${peer}`);
						this.config.events.emit(Event.PEER_DISCONNECTED, peer);
					}
				});
			} catch (error: any) {
				this.config.logger?.error(
					`[RlpxServer] ❌ Failed to accept inbound connection from ${remotePeerId.slice(0, 8)}: ${error.message || error}`,
				);
				peer = null;
				this.error(error);
				try {
					await basicConn.close();
				} catch {
					// Ignore close errors
				}
			}
		});

		// Set up listener error handling
		this.listener.on("error", (error: Error) => {
			this.error(error);
		});

		this.listener.on("listening", () => {
			this.config.events.emit(Event.SERVER_LISTENING, {
				transport: this.name,
				url: this.getRlpxInfo().enode,
			});
		});

		// Start listening
		if (typeof this.config.port === "number") {
			const listenAddr = ipPortToMultiaddr(this.ip, this.config.port);
			await this.listener.listen(listenAddr);
			this.config.logger?.info(
				`RLPx server listening on ${listenAddr.toString()}`,
			);
		}
	}
}
