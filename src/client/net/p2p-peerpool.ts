import debug from "debug";
import type { ETH, EthStatusOpts } from "../../devp2p/protocol/eth.ts";
import type { Protocol } from "../../devp2p/protocol/protocol.ts";
import type { Connection, P2PNode, PeerId } from "../../p2p/libp2p/types.ts";
import { peerIdToString } from "../../p2p/libp2p/types.ts";
import type { RLPxConnection } from "../../p2p/transport/rlpx/connection.ts";
import { bigIntToUnpaddedBytes } from "../../utils/index.ts";
import type { Chain } from "../blockchain/chain.ts";
import type { Config } from "../config.ts";
import type { VMExecution } from "../execution";
import { Event } from "../types.ts";
import { P2PPeer } from "./peer/p2p-peer.ts";
import type { Peer } from "./peer/peer.ts";

const log = debug("p2p:peerpool");

export interface P2PPeerPoolOptions {
	/* Config */
	config: Config;

	/* P2PNode instance */
	node: P2PNode;

	/* Chain instance (optional, for STATUS exchange) */
	chain?: Chain;

	/* VMExecution instance (optional, for ETH handler) */
	execution?: VMExecution;
}

/**
 * P2P Peer Pool - Adapter that wraps P2PNode's ConnectionManager
 * to provide the same interface as the old PeerPool
 *
 * @memberof module:net
 */
export class P2PPeerPool {
	public config: Config;
	private node: P2PNode;
	private chain?: Chain;
	private execution?: VMExecution;
	private pool: Map<string, Peer>;
	private noPeerPeriods: number;
	private opened: boolean;
	public running: boolean;

	/**
	 * Default status check interval (in ms)
	 */
	private DEFAULT_STATUS_CHECK_INTERVAL = 20000;

	/**
	 * Default peer best header update interval (in ms)
	 */
	private DEFAULT_PEER_BEST_HEADER_UPDATE_INTERVAL = 5000;

	private _statusCheckInterval: NodeJS.Timeout | undefined;
	private _peerBestHeaderUpdateInterval: NodeJS.Timeout | undefined;
	private _reconnectTimeout: NodeJS.Timeout | undefined;

	// Track pending peers (waiting for status exchange)
	private pendingPeers: Map<string, P2PPeer> = new Map();

	/**
	 * Create new P2P peer pool
	 */
	constructor(options: P2PPeerPoolOptions) {
		log("Creating P2PPeerPool");
		this.config = options.config;
		this.node = options.node;
		this.chain = options.chain;
		this.execution = options.execution;
		this.pool = new Map<string, Peer>();
		this.noPeerPeriods = 0;
		this.opened = false;
		this.running = false;
		log("P2PPeerPool created");
	}

	/**
	 * Set execution instance (called after service creates it)
	 */
	setExecution(execution: VMExecution): void {
		log("Setting execution instance in P2PPeerPool");
		this.execution = execution;
	}

	init() {
		this.opened = false;
	}

	/**
	 * Open pool
	 */
	async open(): Promise<boolean | void> {
		if (this.opened) {
			log("Pool already opened");
			return false;
		}

		log("Opening P2PPeerPool");
		// Listen for P2PNode connection events
		this.node.addEventListener(
			"connection:open",
			this.onConnectionOpen.bind(this),
		);
		this.node.addEventListener(
			"connection:close",
			this.onConnectionClose.bind(this),
		);
		this.node.addEventListener(
			"peer:disconnect",
			this.onPeerDisconnect.bind(this),
		);

		// Also listen to client events for compatibility
		this.config.events.on(Event.PEER_CONNECTED, (peer) => {
			this.connected(peer);
		});
		this.config.events.on(Event.PEER_DISCONNECTED, (peer) => {
			this.disconnected(peer);
		});
		this.config.events.on(Event.PEER_ERROR, (error, peer) => {
			if (this.pool.get(peer.id)) {
				this.config.logger?.warn(`Peer error: ${error} ${peer}`);
				this.ban(peer);
			}
		});

		this.opened = true;
		log("P2PPeerPool opened");
	}

	/**
	 * Start peer pool
	 */
	async start(): Promise<boolean> {
		if (this.running) {
			log("Pool already running");
			return false;
		}

		log("Starting P2PPeerPool");
		this._statusCheckInterval = setInterval(
			() => this._statusCheck(),
			this.DEFAULT_STATUS_CHECK_INTERVAL,
		);

		this._peerBestHeaderUpdateInterval = setInterval(
			() => this._peerBestHeaderUpdate(),
			this.DEFAULT_PEER_BEST_HEADER_UPDATE_INTERVAL,
		);

		this.running = true;
		log("P2PPeerPool started");
		return true;
	}

	/**
	 * Stop peer pool
	 */
	async stop(): Promise<boolean> {
		log("Stopping P2PPeerPool");
		if (this.opened) {
			await this.close();
		}
		clearInterval(this._statusCheckInterval as NodeJS.Timeout);
		clearInterval(this._peerBestHeaderUpdateInterval as NodeJS.Timeout);
		clearTimeout(this._reconnectTimeout as NodeJS.Timeout);
		this.running = false;
		log("P2PPeerPool stopped");
		return true;
	}

	/**
	 * Close pool
	 */
	async close() {
		log("Closing P2PPeerPool");
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

		this.pool.clear();
		this.pendingPeers.clear();
		this.opened = false;
		log("P2PPeerPool closed");
	}

	/**
	 * Connected peers
	 */
	get peers(): Peer[] {
		return Array.from(this.pool.values());
	}

	/**
	 * Number of peers in pool
	 */
	get size() {
		return this.peers.length;
	}

	/**
	 * Return true if pool contains the specified peer
	 * @param peer peer object or id
	 */
	contains(peer: Peer | string): boolean {
		if (typeof peer !== "string") {
			peer = peer.id;
		}
		return !!this.pool.get(peer);
	}

	/**
	 * Returns a random idle peer from the pool
	 * @param filterFn filter function to apply before finding idle peers
	 */
	idle(filterFn = (_peer: Peer) => true): Peer | undefined {
		const idle = this.peers.filter((p) => p.idle && filterFn(p));
		if (idle.length > 0) {
			const index = Math.floor(Math.random() * idle.length);
			return idle[index];
		}
		return;
	}

	/**
	 * Handler for peer connections
	 * @param peer peer
	 */
	private connected(peer: Peer) {
		if (this.size >= this.config.maxPeers) {
			log("Max peers reached, not adding peer %s", peer.id.slice(0, 8));
			return;
		}
		log("Peer connected: %s", peer.id.slice(0, 8));
		this.add(peer);
		peer.handleMessageQueue();
	}

	/**
	 * Handler for peer disconnections
	 * @param peer peer
	 */
	private disconnected(peer: Peer) {
		log("Peer disconnected: %s", peer.id.slice(0, 8));
		this.remove(peer);
	}

	/**
	 * Ban peer from being added to the pool for a period of time
	 * @param peer peer
	 * @param maxAge ban period in ms
	 * @emits {@link Event.POOL_PEER_BANNED}
	 */
	ban(peer: Peer, maxAge: number = 60000) {
		log("Banning peer: %s for %d ms", peer.id.slice(0, 8), maxAge);
		// For P2P peers, use node.hangUp() instead of server.ban()
		if (peer instanceof P2PPeer) {
			this.node.hangUp(peer.connection.remotePeer).catch(() => {});
		}
		this.remove(peer);
		this.config.events.emit(Event.POOL_PEER_BANNED, peer);

		// Reconnect to peer after ban period if pool is empty
		this._reconnectTimeout = setTimeout(async () => {
			if (this.running && this.size === 0) {
				// For P2P, we can't easily reconnect - discovery will handle it
				this.config.logger?.info(
					"Pool empty after ban period - waiting for discovery",
				);
			}
		}, maxAge + 1000);
	}

	/**
	 * Add peer to pool
	 * @param peer peer
	 * @emits {@link Event.POOL_PEER_ADDED}
	 */
	add(peer?: Peer) {
		if (peer?.id !== undefined && !this.pool.get(peer.id)) {
			log("Adding peer to pool: %s", peer.id.slice(0, 8));
			this.pool.set(peer.id, peer);
			peer.pooled = true;
			this.config.events.emit(Event.POOL_PEER_ADDED, peer);
			log("Pool size: %d", this.size);
		}
	}

	/**
	 * Remove peer from pool
	 * @param peer peer
	 * @emits {@link Event.POOL_PEER_REMOVED}
	 */
	remove(peer?: Peer) {
		if (peer && peer.id) {
			if (this.pool.delete(peer.id)) {
				log("Removing peer from pool: %s", peer.id.slice(0, 8));
				peer.pooled = false;
				this.config.events.emit(Event.POOL_PEER_REMOVED, peer);
				log("Pool size: %d", this.size);
			}
			// Also remove from pending if present
			this.pendingPeers.delete(peer.id);
		}
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
		const connectionWrapper = connection as any;
		const rlpxConnection = connectionWrapper.getRLPxConnection?.() as
			| RLPxConnection
			| undefined;

		if (!rlpxConnection) {
			log("Connection %s does not have RLPxConnection", connection.id);
			this.config.logger?.warn(
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
		if (this.pool.has(peerIdHex) || this.pendingPeers.has(peerIdHex)) {
			log("Peer %s already exists, skipping", peerIdHex.slice(0, 8));
			return;
		}

		// Check max peers
		if (this.size >= this.config.maxPeers) {
			log(
				"Max peers reached (%d), not adding peer %s",
				this.config.maxPeers,
				peerIdHex.slice(0, 8),
			);
			this.config.logger?.debug(
				`Max peers reached (${this.config.maxPeers}), not adding peer ${peerIdHex.slice(0, 8)}...`,
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
			this.config.logger?.warn(
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
				this.config.logger?.debug(
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
				this.config.logger?.warn(
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
					this.add(peer);
					this.config.events.emit(Event.PEER_CONNECTED, peer);
					this.config.logger?.debug(`Peer added to pool: ${peer}`);
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
					this.config.logger?.warn(
						`Status exchange timeout for peer ${peerIdHex.slice(0, 8)}..., adding anyway`,
					);
					this.pendingPeers.delete(peerIdHex);
					this.add(peer);
					this.config.events.emit(Event.PEER_CONNECTED, peer);
					// Clean up listener
					ethProtocol.events.off("status", onStatusReceived);
				}
			}, 10000);
		} else {
			// No ETH protocol, add peer anyway (shouldn't happen)
			this.config.logger?.warn(
				`No ETH protocol found for peer ${peerIdHex.slice(0, 8)}..., adding anyway`,
			);
			this.pendingPeers.delete(peerIdHex);
			this.add(peer);
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
		const peer = this.pool.get(peerIdHex) || this.pendingPeers.get(peerIdHex);
		if (peer) {
			this.remove(peer);
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
		const peer = this.pool.get(peerIdHex) || this.pendingPeers.get(peerIdHex);
		if (peer) {
			this.remove(peer);
			this.config.events.emit(Event.PEER_DISCONNECTED, peer);
		}
	}

	/**
	 * Peer pool status check on a repeated interval
	 */
	async _statusCheck() {
		const NO_PEER_PERIOD_COUNT = 3;
		if (this.size === 0 && this.config.maxPeers > 0) {
			this.noPeerPeriods += 1;
			if (this.noPeerPeriods >= NO_PEER_PERIOD_COUNT) {
				this.noPeerPeriods = 0;
				// For P2P, we can't restart the node easily
				// Discovery should handle finding new peers
				this.config.logger?.info(
					"No peers in pool - waiting for peer discovery",
				);
			} else {
				const connections = this.node.getConnections();
				this.config.logger?.info(
					`Looking for suited peers: connections=${connections.length}, pool=${this.size}`,
				);
			}
		} else {
			this.noPeerPeriods = 0;
		}
	}

	/**
	 * Periodically update the latest best known header for peers
	 */
	async _peerBestHeaderUpdate() {
		for (const p of this.peers) {
			if (p.idle && p.eth !== undefined && p instanceof P2PPeer) {
				p.idle = false;
				await p.latest();
				p.idle = true;
			}
		}
	}
}
