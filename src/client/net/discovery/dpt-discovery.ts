/**
 * DPT Discovery Module - Wraps DPT for peer discovery in P2PNode
 *
 * Based on libp2p's PeerDiscovery interface with Lodestar-inspired
 * caching and dial strategies.
 */

import { multiaddr } from "@multiformats/multiaddr";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import { TypedEventEmitter } from "main-event";
import type {
	ComponentLogger,
	ConnectionManager,
	Logger,
	P2PNodeComponents,
	PeerDiscovery,
	PeerDiscoveryEvents,
	PeerInfo,
} from "../../../p2p/libp2p/types.ts";
import {
	peerDiscoverySymbol,
	peerIdEquals,
	peerIdToString,
} from "../../../p2p/libp2p/types.ts";
import { DPT, type PeerInfo as DPTPeerInfo } from "../dpt-1/index.ts";
import type { DPTOptions } from "../dpt-1/types.ts";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_CACHED_PEERS = 100;
const DEFAULT_CACHED_PEER_TTL = 5 * 60 * 1000; // 5 minutes
const DEFAULT_DISCOVERY_DELAY = 1000; // 1 second

// ============================================================================
// Types
// ============================================================================

/**
 * Cached peer entry with TTL tracking
 */
interface CachedPeer {
	dptPeer: DPTPeerInfo;
	peerInfo: PeerInfo;
	addedAt: number;
}

/**
 * DPT Discovery initialization options
 */
export interface DPTDiscoveryInit {
	/**
	 * Node's private key for DPT
	 */
	privateKey: Uint8Array;

	/**
	 * DPT options passed to underlying DPT instance
	 */
	dptOptions?: DPTOptions;

	/**
	 * Address to bind UDP socket
	 * @default "0.0.0.0"
	 */
	bindAddr?: string;

	/**
	 * Port to bind UDP socket
	 * @default 30303
	 */
	bindPort?: number;

	/**
	 * Bootstrap nodes to connect to on start
	 */
	bootstrapNodes?: DPTPeerInfo[];

	/**
	 * Auto-dial discovered peers immediately
	 * @default false
	 */
	autoDial?: boolean;

	/**
	 * Auto-dial bootstrap nodes immediately
	 * @default true
	 */
	autoDialBootstrap?: boolean;

	/**
	 * Maximum number of cached peers
	 * @default 100
	 */
	maxCachedPeers?: number;

	/**
	 * TTL for cached peers in milliseconds
	 * @default 300000 (5 minutes)
	 */
	cachedPeerTTL?: number;

	/**
	 * Delay before first discovery/bootstrap in milliseconds
	 * @default 1000
	 */
	discoveryDelay?: number;
}

/**
 * Components required by DPTDiscovery
 */
export interface DPTDiscoveryComponents {
	logger: ComponentLogger;
	connectionManager?: ConnectionManager;
}

// ============================================================================
// DPTDiscovery Class
// ============================================================================

/**
 * DPT Discovery Module
 *
 * Wraps the DPT (Distributed Peer Table) for peer discovery,
 * converting DPT events to libp2p-style 'peer' events.
 *
 * Features:
 * - Caches discovered peers with TTL
 * - Supports auto-dial on discovery
 * - Bootstrap node support
 * - Lodestar-style discoverPeers() for on-demand dialing
 */
export class DPTDiscovery
	extends TypedEventEmitter<PeerDiscoveryEvents>
	implements PeerDiscovery
{
	readonly [Symbol.toStringTag] = "@p2p/dpt-discovery";
	readonly [peerDiscoverySymbol] = this;

	private readonly log: Logger;
	private readonly dpt: DPT;
	private readonly init: DPTDiscoveryInit;
	private readonly components: DPTDiscoveryComponents;

	// Cached peers
	private readonly cachedPeers: Map<string, CachedPeer> = new Map();
	private readonly maxCachedPeers: number;
	private readonly cachedPeerTTL: number;

	// State
	private started = false;
	private bootstrapTimer?: ReturnType<typeof setTimeout>;

	// Local peer ID derived from private key
	private readonly localPeerId: Uint8Array;

	constructor(components: DPTDiscoveryComponents, init: DPTDiscoveryInit) {
		super();

		this.log = components.logger.forComponent("p2p:dpt-discovery");
		this.components = components;
		this.init = init;

		// Derive local peer ID from private key (64-byte public key)
		this.localPeerId = secp256k1.getPublicKey(init.privateKey, false).slice(1);

		// Configuration
		this.maxCachedPeers = init.maxCachedPeers ?? DEFAULT_MAX_CACHED_PEERS;
		this.cachedPeerTTL = init.cachedPeerTTL ?? DEFAULT_CACHED_PEER_TTL;

		// Create DPT instance
		const dptOptions: DPTOptions = {
			...init.dptOptions,
			endpoint: {
				address: init.bindAddr ?? "0.0.0.0",
				udpPort: init.bindPort ?? 30303,
				tcpPort: init.bindPort ?? 30303,
			},
		};

		this.dpt = new DPT(init.privateKey, dptOptions);

		// Forward DPT events
		this.setupEventHandlers();
	}

	/**
	 * Set up event handlers for DPT events
	 */
	private setupEventHandlers(): void {
		// Handle peer:added - peer confirmed in routing table
		this.dpt.events.on("peer:added", (peer) => {
			this.handlePeerAdded(peer);
		});

		// Handle peer:new - new peer discovered but not yet confirmed
		this.dpt.events.on("peer:new", (peer) => {
			this.handlePeerNew(peer);
		});

		// Handle peer:removed
		this.dpt.events.on("peer:removed", (peer) => {
			this.handlePeerRemoved(peer);
		});

		// Handle errors
		this.dpt.events.on("error", (err) => {
			this.log.error("DPT error: %s", err.message);
		});

		// Handle listening
		this.dpt.events.on("listening", () => {
			this.log(
				"DPT listening on %s:%d",
				this.init.bindAddr,
				this.init.bindPort,
			);
		});
	}

	/**
	 * Handle peer added to DPT routing table
	 */
	private handlePeerAdded(dptPeer: DPTPeerInfo): void {
		if (!dptPeer.id || !dptPeer.address || !dptPeer.tcpPort) {
			this.log("ignoring peer without complete info");
			return;
		}

		const peerInfo = this.dptPeerToPeerInfo(dptPeer);
		if (!peerInfo) {
			return;
		}

		// Check for self-discovery - prevent connecting to ourselves
		if (peerIdEquals(peerInfo.id, this.localPeerId)) {
			this.log(
				"ignoring self-discovery: %s",
				peerIdToString(peerInfo.id).slice(0, 16),
			);
			return;
		}

		const peerIdStr = peerIdToString(peerInfo.id);
		this.log(
			"peer added: %s at %s:%d",
			peerIdStr.slice(0, 16),
			dptPeer.address,
			dptPeer.tcpPort,
		);

		// Cache the peer
		this.cachePeer(dptPeer, peerInfo);

		// Emit 'peer' event (libp2p pattern)
		this.safeDispatchEvent("peer", { detail: peerInfo });

		// Auto-dial if configured
		if (this.init.autoDial && this.components.connectionManager) {
			this.dialPeer(peerInfo).catch((err) => {
				this.log.error(
					"failed to auto-dial peer %s: %s",
					peerIdStr.slice(0, 16),
					err.message,
				);
			});
		}
	}

	/**
	 * Handle new peer discovered (not yet confirmed)
	 */
	private handlePeerNew(dptPeer: DPTPeerInfo): void {
		if (!dptPeer.id || !dptPeer.address || !dptPeer.tcpPort) {
			return;
		}

		const peerInfo = this.dptPeerToPeerInfo(dptPeer);
		if (!peerInfo) {
			return;
		}

		// Check for self-discovery - prevent logging self as discovered peer
		if (peerIdEquals(peerInfo.id, this.localPeerId)) {
			return;
		}

		const peerIdStr = peerIdToString(peerInfo.id);
		this.log(
			"new peer discovered: %s at %s:%d",
			peerIdStr.slice(0, 16),
			dptPeer.address,
			dptPeer.tcpPort,
		);

		// Cache the peer (will be updated when confirmed via peer:added)
		this.cachePeer(dptPeer, peerInfo);
	}

	/**
	 * Handle peer removed from DPT
	 */
	private handlePeerRemoved(dptPeer: DPTPeerInfo): void {
		if (!dptPeer.id) {
			return;
		}

		const peerIdStr = peerIdToString(dptPeer.id);
		this.log("peer removed: %s", peerIdStr.slice(0, 16));

		// Remove from cache
		this.cachedPeers.delete(peerIdStr);
	}

	/**
	 * Convert DPT PeerInfo to libp2p-style PeerInfo with multiaddr
	 */
	private dptPeerToPeerInfo(dptPeer: DPTPeerInfo): PeerInfo | null {
		if (!dptPeer.id || !dptPeer.address || !dptPeer.tcpPort) {
			return null;
		}

		try {
			const ma = multiaddr(`/ip4/${dptPeer.address}/tcp/${dptPeer.tcpPort}`);
			return {
				id: dptPeer.id,
				multiaddrs: [ma],
			};
		} catch (err) {
			this.log.error(
				"failed to create multiaddr for peer: %s",
				(err as Error).message,
			);
			return null;
		}
	}

	/**
	 * Cache a peer with TTL
	 */
	private cachePeer(dptPeer: DPTPeerInfo, peerInfo: PeerInfo): void {
		const peerIdStr = peerIdToString(peerInfo.id);

		// Update or add to cache
		this.cachedPeers.set(peerIdStr, {
			dptPeer,
			peerInfo,
			addedAt: Date.now(),
		});

		// Prune if over limit
		this.pruneCache();
	}

	/**
	 * Prune cached peers to stay under limit (remove oldest first)
	 */
	private pruneCache(): void {
		if (this.cachedPeers.size <= this.maxCachedPeers) {
			return;
		}

		// Sort by addedAt and remove oldest
		const entries = Array.from(this.cachedPeers.entries()).sort(
			(a, b) => a[1].addedAt - b[1].addedAt,
		);

		const toRemove = entries.slice(
			0,
			this.cachedPeers.size - this.maxCachedPeers,
		);
		for (const [key] of toRemove) {
			this.cachedPeers.delete(key);
		}
	}

	/**
	 * Dial a peer using the connection manager
	 */
	private async dialPeer(peerInfo: PeerInfo): Promise<void> {
		if (!this.components.connectionManager) {
			return;
		}

		const ma = peerInfo.multiaddrs[0];
		if (!ma) {
			return;
		}

		await this.components.connectionManager.openConnection(ma, {
			remoteId: peerInfo.id,
		});
	}

	/**
	 * Start the DPT discovery module
	 */
	async start(): Promise<void> {
		if (this.started) {
			return;
		}

		this.log("starting DPT discovery");

		// Bind DPT to UDP socket
		const bindAddr = this.init.bindAddr ?? "0.0.0.0";
		const bindPort = this.init.bindPort ?? 30303;

		this.dpt.bind(bindPort, bindAddr);

		// Schedule bootstrap after delay
		const delay = this.init.discoveryDelay ?? DEFAULT_DISCOVERY_DELAY;
		this.bootstrapTimer = setTimeout(() => {
			this.bootstrapNodes().catch((err) => {
				this.log.error("bootstrap failed: %s", err.message);
			});
		}, delay);

		this.started = true;
		this.log("DPT discovery started");
	}

	/**
	 * Bootstrap from configured nodes
	 */
	private async bootstrapNodes(): Promise<void> {
		const bootstrapNodes = this.init.bootstrapNodes ?? [];

		if (bootstrapNodes.length === 0) {
			this.log("no bootstrap nodes configured");
			return;
		}

		this.log("bootstrapping from %d nodes", bootstrapNodes.length);

		for (const peer of bootstrapNodes) {
			try {
				await this.dpt.bootstrap(peer);
				this.log("bootstrapped from %s:%d", peer.address, peer.udpPort);

				// Auto-dial bootstrap nodes if configured
				if (
					this.init.autoDialBootstrap !== false &&
					peer.tcpPort &&
					this.components.connectionManager
				) {
					const peerInfo = this.dptPeerToPeerInfo(peer);
					if (peerInfo) {
						// Check for self-discovery in bootstrap nodes
						if (peerIdEquals(peerInfo.id, this.localPeerId)) {
							this.log(
								"ignoring self in bootstrap nodes: %s",
								peerIdToString(peerInfo.id).slice(0, 16),
							);
							continue;
						}

						this.log(
							"auto-dialing bootstrap node %s",
							peerIdToString(peerInfo.id).slice(0, 16),
						);

						// Emit 'peer' event for bootstrap node
						this.safeDispatchEvent("peer", { detail: peerInfo });

						// Dial the bootstrap node
						this.dialPeer(peerInfo).catch((err) => {
							this.log.error("failed to dial bootstrap node: %s", err.message);
						});
					}
				}
			} catch (err) {
				this.log.error(
					"failed to bootstrap from %s: %s",
					peer.address,
					(err as Error).message,
				);
			}
		}
	}

	/**
	 * Stop the DPT discovery module
	 */
	async stop(): Promise<void> {
		if (!this.started) {
			return;
		}

		this.log("stopping DPT discovery");

		// Cancel bootstrap timer
		if (this.bootstrapTimer) {
			clearTimeout(this.bootstrapTimer);
			this.bootstrapTimer = undefined;
		}

		// Destroy DPT
		this.dpt.destroy();

		// Clear cache
		this.cachedPeers.clear();

		this.started = false;
		this.log("DPT discovery stopped");
	}

	/**
	 * Check if the module is started
	 */
	isStarted(): boolean {
		return this.started;
	}

	// =========================================================================
	// Lodestar-style Discovery Methods
	// =========================================================================

	/**
	 * Get cached peers for dialing (Lodestar pattern)
	 *
	 * Returns up to `count` cached peers that haven't expired.
	 * Removes returned peers from cache (they should be dialed).
	 */
	discoverPeers(count: number): PeerInfo[] {
		const now = Date.now();
		const result: PeerInfo[] = [];

		for (const [key, cached] of this.cachedPeers.entries()) {
			// Skip expired peers
			if (now - cached.addedAt > this.cachedPeerTTL) {
				this.cachedPeers.delete(key);
				continue;
			}

			result.push(cached.peerInfo);
			this.cachedPeers.delete(key);

			if (result.length >= count) {
				break;
			}
		}

		this.log(
			"discoverPeers returned %d peers (requested %d)",
			result.length,
			count,
		);
		return result;
	}

	/**
	 * Get the number of cached peers
	 */
	getCachedPeerCount(): number {
		return this.cachedPeers.size;
	}

	/**
	 * Get all cached peer IDs (for debugging)
	 */
	getCachedPeerIds(): string[] {
		return Array.from(this.cachedPeers.keys());
	}

	/**
	 * Get the underlying DPT instance (for advanced usage)
	 */
	getDPT(): DPT {
		return this.dpt;
	}

	/**
	 * Manually add a bootstrap node and dial it
	 */
	async addBootstrapNode(peer: DPTPeerInfo): Promise<void> {
		await this.dpt.bootstrap(peer);

		if (this.init.autoDialBootstrap !== false && peer.tcpPort) {
			const peerInfo = this.dptPeerToPeerInfo(peer);
			if (peerInfo) {
				this.safeDispatchEvent("peer", { detail: peerInfo });
				await this.dialPeer(peerInfo);
			}
		}
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a DPT discovery module factory
 *
 * @example
 * ```typescript
 * const node = await createP2PNode({
 *   privateKey,
 *   peerDiscovery: [
 *     dptDiscovery({
 *       privateKey,
 *       bindPort: 30303,
 *       bootstrapNodes: [{ id, address: '1.2.3.4', udpPort: 30303, tcpPort: 30303 }],
 *       autoDialBootstrap: true,
 *     })
 *   ],
 * });
 * ```
 */
export function dptDiscovery(
	init: DPTDiscoveryInit,
): (components: P2PNodeComponents) => DPTDiscovery {
	return (components: P2PNodeComponents) => {
		return new DPTDiscovery(
			{
				logger: components.logger,
				connectionManager: components.connectionManager,
			},
			init,
		);
	};
}
