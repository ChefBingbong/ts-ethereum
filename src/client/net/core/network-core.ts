import debug from "debug";
import type { Connection, P2PNode, PeerId } from "../../../p2p/libp2p/types.ts";
import { peerIdToString } from "../../../p2p/libp2p/types.ts";
import type { RLPxConnection } from "../../../p2p/transport/rlpx/connection.ts";
import { bigIntToUnpaddedBytes } from "../../../utils/index.ts";
import type { Chain } from "../../blockchain/chain.ts";
import type { Config } from "../../config/index.ts";
import type { VMExecution } from "../../execution";
import { Event } from "../../types.ts";
import { P2PPeer } from "../peer/p2p-peer.ts";
import type { Peer } from "../peer/peer.ts";
import type { ETH, EthStatusOpts } from "../protocol/eth/eth.ts";
import type { Protocol } from "../protocol/protocol.ts";
import type { NetworkCoreOptions } from "./types.ts";

const log = debug("p2p:network-core");

/**
 * NetworkCore - Core network functionality that manages peer connections,
 * peer pool, and protocol handling. Absorbs all P2PPeerPool logic.
 *
 * Similar to lodestar's NetworkCore, but adapted for execution layer.
 */
export class NetworkCore {
	public readonly config: Config;
	private readonly node: P2PNode;
	public readonly chain?: Chain;
	private readonly execution: VMExecution;

	// Peer management (from P2PPeerPool)
	public readonly peers: Map<string, Peer> = new Map();
	private readonly pendingPeers: Map<string, P2PPeer> = new Map();
	private noPeerPeriods: number = 0;
	private opened: boolean = false;
	public running: boolean = false;

	/**
	 * Default status check interval (in ms)
	 */
	private readonly DEFAULT_STATUS_CHECK_INTERVAL = 20000;

	/**
	 * Default peer best header update interval (in ms)
	 */
	private readonly DEFAULT_PEER_BEST_HEADER_UPDATE_INTERVAL = 5000;

	private statusCheckInterval: NodeJS.Timeout | undefined;
	private peerBestHeaderUpdateInterval: NodeJS.Timeout | undefined;
	private reconnectTimeout: NodeJS.Timeout | undefined;

	/**
	 * Initialize NetworkCore with static init method (following lodestar pattern)
	 */
	static async init(options: NetworkCoreOptions): Promise<NetworkCore> {
		log("Initializing NetworkCore");
		const core = new NetworkCore(options);

		// Handle open logic (event listeners)
		log("Opening NetworkCore");
		core.node.addEventListener(
			"connection:open",
			core.onConnectionOpen.bind(core),
		);
		core.node.addEventListener(
			"connection:close",
			core.onConnectionClose.bind(core),
		);
		core.node.addEventListener(
			"peer:disconnect",
			core.onPeerDisconnect.bind(core),
		);

		core.config.events.on(Event.PEER_CONNECTED, (peer) => core.connected(peer));
		core.config.events.on(Event.PEER_DISCONNECTED, (peer) =>
			core.disconnected(peer),
		);
		core.config.events.on(Event.PEER_ERROR, (error, peer) => {
			if (core.peers.get(peer.id)) {
				core.config.options.logger?.warn(`Peer error: ${error} ${peer}`);
				core.banPeer(peer);
			}
		});

		core.opened = true;
		log("NetworkCore opened");

		// Handle start logic (intervals)
		log("Starting NetworkCore");
		core.statusCheckInterval = setInterval(
			() => core.statusCheck(),
			core.DEFAULT_STATUS_CHECK_INTERVAL,
		);
		core.peerBestHeaderUpdateInterval = setInterval(
			() => core.peerBestHeaderUpdate(),
			core.DEFAULT_PEER_BEST_HEADER_UPDATE_INTERVAL,
		);
		core.running = true;
		log("NetworkCore started");

		await options.chain.open();
		return core;
	}

	constructor(options: NetworkCoreOptions) {
		log("Creating NetworkCore");
		this.config = options.config;
		this.node = options.node;
		this.chain = options.chain;
		this.execution = options.execution;
		log("NetworkCore created");
	}

	/**
	 * Stop network core
	 */
	async stop(): Promise<boolean> {
		log("Stopping NetworkCore");
		if (this.opened) {
			await this.close();
		}
		clearInterval(this.statusCheckInterval as NodeJS.Timeout);
		clearInterval(this.peerBestHeaderUpdateInterval as NodeJS.Timeout);
		clearTimeout(this.reconnectTimeout as NodeJS.Timeout);
		this.running = false;
		log("NetworkCore stopped");
		return true;
	}

	/**
	 * Close network core
	 */
	async close(): Promise<void> {
		log("Closing NetworkCore");
		// Remove P2PNode event listeners
		this.node.removeEventListener(
			"connection:open",
			this.onConnectionOpen.bind(this),
		);
		this.node.removeEventListener(
			"connection:close",
			this.onConnectionClose.bind(this),
		);
		this.node.removeEventListener(
			"peer:disconnect",
			this.onPeerDisconnect.bind(this),
		);

		// Remove client event listeners
		this.config.events.removeAllListeners(Event.PEER_CONNECTED);
		this.config.events.removeAllListeners(Event.PEER_DISCONNECTED);
		this.config.events.removeAllListeners(Event.PEER_ERROR);

		this.peers.clear();
		this.pendingPeers.clear();
		this.opened = false;
		log("NetworkCore closed");
	}

	// ============================================================================
	// Peer Management API (from P2PPeerPool)
	// ============================================================================

	/**
	 * Get connected peers
	 */
	getConnectedPeers(): Peer[] {
		return Array.from(this.peers.values());
	}

	/**
	 * Get peer count
	 */
	getPeerCount(): number {
		return this.peers.size;
	}

	/**
	 * Check if pool contains the specified peer
	 */
	containsPeer(peer: Peer | string): boolean {
		const peerId = typeof peer !== "string" ? peer.id : peer;
		return !!this.peers.get(peerId);
	}

	/**
	 * Returns a random idle peer from the pool
	 */
	getIdlePeer(filterFn = (_peer: Peer) => true): Peer | undefined {
		const idle = this.getConnectedPeers().filter((p) => p.idle && filterFn(p));
		if (idle.length > 0) {
			const index = Math.floor(Math.random() * idle.length);
			return idle[index];
		}
		return;
	}

	/**
	 * Add peer to pool
	 */
	addPeer(peer?: Peer): void {
		if (peer?.id !== undefined && !this.peers.get(peer.id)) {
			log("Adding peer to pool: %s", peer.id.slice(0, 8));
			this.peers.set(peer.id, peer);
			peer.pooled = true;
			this.config.events.emit(Event.POOL_PEER_ADDED, peer);
			log("Pool size: %d", this.getPeerCount());
		}
	}

	/**
	 * Remove peer from pool
	 */
	removePeer(peer?: Peer): void {
		if (peer && peer.id) {
			if (this.peers.delete(peer.id)) {
				log("Removing peer from pool: %s", peer.id.slice(0, 8));
				peer.pooled = false;
				this.config.events.emit(Event.POOL_PEER_REMOVED, peer);
				log("Pool size: %d", this.getPeerCount());
			}
			// Also remove from pending if present
			this.pendingPeers.delete(peer.id);
		}
	}

	/**
	 * Ban peer from being added to the pool for a period of time
	 */
	banPeer(peer: Peer, maxAge: number = 60000): void {
		log("Banning peer: %s for %d ms", peer.id.slice(0, 8), maxAge);
		// For P2P peers, use node.hangUp() instead of server.ban()
		if (peer instanceof P2PPeer) {
			this.node.hangUp(peer.connection.remotePeer).catch(() => {});
		}
		this.removePeer(peer);
		this.config.events.emit(Event.POOL_PEER_BANNED, peer);

		// Reconnect to peer after ban period if pool is empty
		this.reconnectTimeout = setTimeout(async () => {
			if (this.running && this.getPeerCount() === 0) {
				// For P2P, we can't easily reconnect - discovery will handle it
				this.config.options.logger?.info(
					"Pool empty after ban period - waiting for discovery",
				);
			}
		}, maxAge + 1000);
	}

	// ============================================================================
	// Connection Handlers (from P2PPeerPool)
	// ============================================================================

	/**
	 * Handler for peer connections
	 */
	private connected(peer: Peer): void {
		if (this.getPeerCount() >= this.config.options.maxPeers) {
			log("Max peers reached, not adding peer %s", peer.id.slice(0, 8));
			return;
		}
		log("Peer connected: %s", peer.id.slice(0, 8));
		this.addPeer(peer);
		peer.handleMessageQueue();
	}

	/**
	 * Handler for peer disconnections
	 */
	private disconnected(peer: Peer): void {
		log("Peer disconnected: %s", peer.id.slice(0, 8));
		this.removePeer(peer);
	}

	/**
	 * Handle new connection from P2PNode
	 */
	private onConnectionOpen(evt: CustomEvent<Connection>): void {
		const connection = evt.detail;
		const peerIdHex = peerIdToString(connection.remotePeer);

		log(
			"Connection opened: %s (status: %s)",
			peerIdHex.slice(0, 8),
			connection.status,
		);

		if (connection.status !== "open") {
			log("Connection not open, ignoring");
			return;
		}

		// Extract RLPxConnection from Connection wrapper
		// Connection may have getRLPxConnection method for RLPx transport
		const connectionWrapper = connection as Connection & {
			getRLPxConnection?: () => RLPxConnection;
		};
		const rlpxConnection = connectionWrapper.getRLPxConnection?.();

		if (!rlpxConnection) {
			log("Connection %s does not have RLPxConnection", connection.id);
			this.config.options.logger?.warn(
				`Connection ${connection.id} does not have RLPxConnection`,
			);
			return;
		}

		log("Setting up peer creation for connection %s", peerIdHex.slice(0, 8));
		// Set up listener for protocols:ready BEFORE the delay
		// This ensures we catch the event even if it fires early
		const protocols = rlpxConnection.getProtocols();
		if (protocols.length > 0) {
			// Protocols already ready, create peer immediately
			log("Protocols already available, creating peer immediately");
			this.createPeerFromConnection(connection, rlpxConnection);
		} else {
			// Wait for protocols:ready event, then create peer
			log("Waiting for protocols:ready event");
			rlpxConnection.once("protocols:ready", () => {
				log("protocols:ready received, creating peer");
				this.createPeerFromConnection(connection, rlpxConnection);
			});
			// Also set a timeout in case protocols:ready never fires
			setTimeout(() => {
				const protocolsAfterDelay = rlpxConnection.getProtocols();
				if (protocolsAfterDelay.length > 0) {
					log("Protocols available after delay, creating peer");
					this.createPeerFromConnection(connection, rlpxConnection);
				} else {
					log(
						"WARNING: No protocols available after delay for peer %s",
						peerIdHex.slice(0, 8),
					);
				}
			}, 1000);
		}
	}

	/**
	 * Create P2PPeer from Connection and RLPxConnection
	 */
	private async createPeerFromConnection(
		connection: Connection,
		rlpxConnection: RLPxConnection,
	): Promise<void> {
		const peerIdHex = peerIdToString(connection.remotePeer);

		log("Creating peer from connection: %s", peerIdHex.slice(0, 8));

		// Check if peer already exists
		if (this.peers.has(peerIdHex) || this.pendingPeers.has(peerIdHex)) {
			log("Peer %s already exists, skipping", peerIdHex.slice(0, 8));
			return;
		}

		// Check max peers
		if (this.getPeerCount() >= this.config.options.maxPeers) {
			log(
				"Max peers reached (%d), not adding peer %s",
				this.config.options.maxPeers,
				peerIdHex.slice(0, 8),
			);
			this.config.options.logger?.debug(
				`Max peers reached (${this.config.options.maxPeers}), not adding peer ${peerIdHex.slice(0, 8)}...`,
			);
			return;
		}

		// Create P2PPeer
		log("Instantiating P2PPeer for %s", peerIdHex.slice(0, 8));
		const peer = new P2PPeer({
			config: this.config,
			connection,
			rlpxConnection,
			inbound: connection.direction === "inbound",
			chain: this.chain,
			execution: this.execution,
		});

		// Check if ETH protocol is available
		if (!peer.eth) {
			log("Peer %s does not have ETH protocol", peerIdHex.slice(0, 8));
			this.config.options.logger?.warn(
				`Peer ${peerIdHex.slice(0, 8)}... does not have ETH protocol`,
			);
			return;
		}

		log("ETH protocol available, adding to pending peers");
		// Add to pending peers (waiting for status exchange)
		this.pendingPeers.set(peerIdHex, peer);

		// Listen for protocols:ready event from RLPxConnection to send STATUS
		// The RLPx connection will emit this when protocols are negotiated
		const onProtocolsReady = (protocols: Protocol[]) => {
			log(
				"protocols:ready event received for peer %s, protocols: %d",
				peerIdHex.slice(0, 8),
				protocols.length,
			);
			const ethProtocol = protocols.find((p) => p.constructor.name === "ETH") as
				| ETH
				| undefined;

			if (!ethProtocol) {
				log(
					"No ETH protocol found in protocols:ready for peer %s",
					peerIdHex.slice(0, 8),
				);
				rlpxConnection.off("protocols:ready", onProtocolsReady);
				return;
			}

			if (!this.chain) {
				log(
					"Chain not available for STATUS exchange with peer %s",
					peerIdHex.slice(0, 8),
				);
				rlpxConnection.off("protocols:ready", onProtocolsReady);
				return;
			}

			try {
				// Get chain info for STATUS
				const genesisHash = this.chain.blockchain.genesisBlock.hash();
				const bestHash = this.chain.headers.latest
					? this.chain.headers.latest.hash()
					: genesisHash; // Use genesis if no blocks yet
				const td = this.chain.headers.td;

				const statusOpts: EthStatusOpts = {
					td: bigIntToUnpaddedBytes(td),
					bestHash,
					genesisHash,
				};

				const bestHashHex = Array.from(bestHash.slice(0, 8))
					.map((b) => b.toString(16).padStart(2, "0"))
					.join("");
				log(
					"Sending STATUS to peer %s (td=%s, bestHash=%s)",
					peerIdHex.slice(0, 8),
					td.toString(),
					bestHashHex,
				);
				this.config.options.logger?.debug(
					`Sending STATUS to peer ${peerIdHex.slice(0, 8)}...`,
				);
				ethProtocol.sendStatus(statusOpts);
				log("STATUS sent successfully to peer %s", peerIdHex.slice(0, 8));
				// Remove listener after sending STATUS
				rlpxConnection.off("protocols:ready", onProtocolsReady);
			} catch (err: unknown) {
				const error = err instanceof Error ? err : new Error(String(err));
				log(
					"ERROR: Failed to send STATUS to peer %s: %s",
					peerIdHex.slice(0, 8),
					error.message,
				);
				this.config.options.logger?.warn(
					`Failed to send STATUS to peer ${peerIdHex.slice(0, 8)}...: ${error.message}`,
				);
				rlpxConnection.off("protocols:ready", onProtocolsReady);
			}
		};

		// Listen for protocols:ready event (may have already fired)
		const existingProtocols = rlpxConnection.getProtocols();
		log(
			"Checking protocols for peer %s: found %d protocols",
			peerIdHex.slice(0, 8),
			existingProtocols.length,
		);
		if (existingProtocols.length > 0) {
			// Protocols already ready, send STATUS immediately
			log("Protocols already ready, sending STATUS immediately");
			onProtocolsReady(existingProtocols);
		} else {
			// Wait for protocols:ready event
			log(
				"Waiting for protocols:ready event for peer %s",
				peerIdHex.slice(0, 8),
			);
			rlpxConnection.once("protocols:ready", onProtocolsReady);
		}

		// Listen for ETH status event from the protocol
		// The ETH protocol emits "status" event when STATUS is received
		const protocols = rlpxConnection.getProtocols();
		const ethProtocol = protocols.find((p) => p.constructor.name === "ETH") as
			| ETH
			| undefined;

		if (ethProtocol) {
			// Listen for status event from ETH protocol
			const onStatusReceived = () => {
				log("STATUS received from peer %s", peerIdHex.slice(0, 8));
				// Status received, add peer to pool
				if (this.pendingPeers.has(peerIdHex)) {
					this.pendingPeers.delete(peerIdHex);
					this.addPeer(peer);
					this.config.events.emit(Event.PEER_CONNECTED, peer);
					this.config.options.logger?.debug(`Peer added to pool: ${peer}`);
					// Clean up listener
					ethProtocol.events.off("status", onStatusReceived);
					clearTimeout(statusTimeout);
				}
			};

			ethProtocol.events.once("status", onStatusReceived);

			// Timeout after 10 seconds if STATUS not received
			const statusTimeout = setTimeout(() => {
				if (this.pendingPeers.has(peerIdHex)) {
					log(
						"STATUS timeout for peer %s, adding anyway",
						peerIdHex.slice(0, 8),
					);
					this.config.options.logger?.warn(
						`Status exchange timeout for peer ${peerIdHex.slice(0, 8)}..., adding anyway`,
					);
					this.pendingPeers.delete(peerIdHex);
					this.addPeer(peer);
					this.config.events.emit(Event.PEER_CONNECTED, peer);
					// Clean up listener
					ethProtocol.events.off("status", onStatusReceived);
				}
			}, 10000);
		} else {
			// No ETH protocol, add peer anyway (shouldn't happen)
			this.config.options.logger?.warn(
				`No ETH protocol found for peer ${peerIdHex.slice(0, 8)}..., adding anyway`,
			);
			this.pendingPeers.delete(peerIdHex);
			this.addPeer(peer);
			this.config.events.emit(Event.PEER_CONNECTED, peer);
		}
	}

	/**
	 * Handle connection close
	 */
	private onConnectionClose(evt: CustomEvent<Connection>): void {
		const connection = evt.detail;
		const peerIdHex = peerIdToString(connection.remotePeer);

		log("Connection closed: %s", peerIdHex.slice(0, 8));
		// Find and remove peer
		const peer = this.peers.get(peerIdHex) || this.pendingPeers.get(peerIdHex);
		if (peer) {
			this.removePeer(peer);
			this.config.events.emit(Event.PEER_DISCONNECTED, peer);
		}
	}

	/**
	 * Handle peer disconnect
	 */
	private onPeerDisconnect(evt: CustomEvent<PeerId>): void {
		const peerId = evt.detail;
		const peerIdHex = peerIdToString(peerId);

		log("Peer disconnected: %s", peerIdHex.slice(0, 8));
		// Find and remove peer
		const peer = this.peers.get(peerIdHex) || this.pendingPeers.get(peerIdHex);
		if (peer) {
			this.removePeer(peer);
			this.config.events.emit(Event.PEER_DISCONNECTED, peer);
		}
	}

	// ============================================================================
	// Periodic Tasks (from P2PPeerPool)
	// ============================================================================

	/**
	 * Peer pool status check on a repeated interval
	 */
	private async statusCheck(): Promise<void> {
		const NO_PEER_PERIOD_COUNT = 3;
		if (this.getPeerCount() === 0 && this.config.options.maxPeers > 0) {
			this.noPeerPeriods += 1;
			if (this.noPeerPeriods >= NO_PEER_PERIOD_COUNT) {
				this.noPeerPeriods = 0;
				// For P2P, we can't restart the node easily
				// Discovery should handle finding new peers
				this.config.options.logger?.info(
					"No peers in pool - waiting for peer discovery",
				);
			} else {
				const connections = this.node.getConnections();
				this.config.options.logger?.info(
					`Looking for suited peers: connections=${connections.length}, pool=${this.getPeerCount()}`,
				);
			}
		} else {
			this.noPeerPeriods = 0;
		}
	}

	/**
	 * Periodically update the latest best known header for peers
	 */
	private async peerBestHeaderUpdate(): Promise<void> {
		for (const p of this.getConnectedPeers()) {
			if (p.idle && p.eth !== undefined && p instanceof P2PPeer) {
				p.idle = false;
				await p.latest();
				p.idle = true;
			}
		}
	}
}
