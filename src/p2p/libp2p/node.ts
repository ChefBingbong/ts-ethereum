/**
 * P2PNode - Main P2P networking node
 *
 * Based on libp2p's Libp2p class, using TypedEventEmitter from main-event
 * Orchestrates all components for peer-to-peer networking
 */

import { defaultLogger } from "@libp2p/logger";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import { TypedEventEmitter, setMaxListeners } from "main-event";
import type { Multiaddr } from "@multiformats/multiaddr";
import { createAddressManager, type AddressManager } from "./address-manager.ts";
import {
	createConnectionManager,
	type ConnectionManager,
} from "./connection-manager.ts";
import { createRegistrar, type Registrar } from "./registrar.ts";
import {
	createTransportManager,
	type TransportManager,
} from "./transport-manager.ts";
import type {
	AbortOptions,
	ComponentLogger,
	Connection,
	P2PNode as P2PNodeInterface,
	P2PNodeComponents,
	P2PNodeEvents,
	P2PNodeInit,
	P2PNodeStatus,
	PeerId,
	PeerInfo,
	StreamHandler,
	StreamHandlerOptions,
	Topology,
	TransportManagerDialOptions,
} from "./types.ts";
import { peerDiscoverySymbol, peerIdEquals, peerIdToString } from "./types.ts";

/**
 * Get node ID (64-byte public key) from private key
 */
function pk2id(privateKey: Uint8Array): Uint8Array {
	return secp256k1.getPublicKey(privateKey, false).slice(1);
}

/**
 * P2PNode - The main P2P networking node class
 *
 * Extends TypedEventEmitter to provide typed events exactly like libp2p.
 * Uses the dual-dispatch pattern where internal components communicate
 * via an internal event bus, and all events are also dispatched to
 * external listeners on the P2PNode instance.
 */
export class P2PNode
	extends TypedEventEmitter<P2PNodeEvents>
	implements P2PNodeInterface
{
	/**
	 * The node's peer ID (64-byte secp256k1 public key)
	 */
	public peerId: PeerId;

	/**
	 * Current node status
	 */
	public status: P2PNodeStatus;

	/**
	 * Logger for this node
	 */
	public logger: ComponentLogger;

	/**
	 * Internal components
	 */
	public components: P2PNodeComponents;

	private readonly log: ReturnType<ComponentLogger["forComponent"]>;
	private readonly privateKey: Uint8Array;

	// Component references
	private readonly addressManager: AddressManager;
	private readonly transportManager: TransportManager;
	private readonly connectionManager: ConnectionManager;
	private readonly registrar: Registrar;

	constructor(init: P2PNodeInit) {
		super();

		this.status = "stopped";
		this.privateKey = init.privateKey;
		this.peerId = pk2id(init.privateKey);

		// Set up logger
		this.logger = init.logger ?? defaultLogger();
		this.log = this.logger.forComponent("p2p:node");

		// Create internal event bus with dual-dispatch pattern
		// This is the same pattern used by libp2p
		const events = new TypedEventEmitter<P2PNodeEvents>();
		const originalDispatch = events.dispatchEvent.bind(events);
		events.dispatchEvent = (evt: any) => {
			const internalResult = originalDispatch(evt);
			const externalResult = this.dispatchEvent(
				new CustomEvent(evt.type, { detail: evt.detail }),
			);
			return internalResult || externalResult;
		};
		setMaxListeners(Infinity, events);

		// Create address manager first (needed by transport manager)
		// We'll set the transport manager reference after creating it
		const addressManagerComponents = {
			peerId: this.peerId,
			transportManager: null as any, // Will be set below
			events,
			logger: this.logger,
		};

		this.addressManager = createAddressManager(addressManagerComponents, {
			listen: init.addresses?.listen,
			announce: init.addresses?.announce,
		});

		// Create transport manager
		const transportManagerComponents = {
			addressManager: this.addressManager,
			events,
			logger: this.logger,
		};

		this.transportManager = createTransportManager(transportManagerComponents);

		// Now set the transport manager on address manager components
		addressManagerComponents.transportManager = this.transportManager;

		// Create connection manager
		const connectionManagerComponents = {
			peerId: this.peerId,
			transportManager: this.transportManager,
			events,
			logger: this.logger,
		};

		this.connectionManager = createConnectionManager(connectionManagerComponents, {
			maxConnections: init.maxConnections,
			dialTimeout: init.dialTimeout,
		});

		// Create registrar
		const registrarComponents = {
			peerId: this.peerId,
			events,
			logger: this.logger,
		};

		this.registrar = createRegistrar(registrarComponents);

		// Store components for external access and for passing to transports
		this.components = {
			peerId: this.peerId,
			privateKey: this.privateKey,
			logger: this.logger,
			events,
			addressManager: this.addressManager,
			transportManager: this.transportManager,
			connectionManager: this.connectionManager,
			registrar: this.registrar,
		};

		// Register transports
		if (init.transports != null) {
			for (const transportFactory of init.transports) {
				const transport = transportFactory(this.components);
				this.transportManager.add(transport);
			}
		}

		// Set up peer discovery modules (for future DPT integration)
		if (init.peerDiscovery != null) {
			for (const discoveryFactory of init.peerDiscovery) {
				const discovery = discoveryFactory(this.components);

				// Forward peer events
				discovery.addEventListener("peer", (evt: CustomEvent<PeerInfo>) => {
					this.#onDiscoveryPeer(evt);
				});
			}
		}

		this.log(
			"P2PNode created with peer ID: %s",
			peerIdToString(this.peerId).slice(0, 16) + "...",
		);
	}

	readonly [Symbol.toStringTag] = "@p2p/node";

	/**
	 * Start the P2P node
	 */
	async start(): Promise<void> {
		if (this.status !== "stopped") {
			return;
		}

		this.status = "starting";
		this.log("P2PNode starting");

		try {
			// Start transport manager
			this.transportManager.start();

			// Start connection manager
			await this.connectionManager.start();

			// Start listening on configured addresses
			await this.transportManager.afterStart();

			this.status = "started";
			this.safeDispatchEvent("start", { detail: this });
			this.log(
				"P2PNode started with peer ID: %s",
				peerIdToString(this.peerId).slice(0, 16) + "...",
			);
		} catch (err: any) {
			this.log.error("error starting P2PNode - %s", err.message);
			// Try to clean up
			this.status = "started";
			await this.stop();
			throw err;
		}
	}

	/**
	 * Stop the P2P node
	 */
	async stop(): Promise<void> {
		if (this.status !== "started") {
			return;
		}

		this.log("P2PNode stopping");
		this.status = "stopping";

		// Stop registrar (removes event listeners)
		this.registrar.stop();

		// Stop connection manager (closes connections)
		await this.connectionManager.stop();

		// Stop transport manager (closes listeners)
		await this.transportManager.stop();

		this.status = "stopped";
		this.safeDispatchEvent("stop", { detail: this });
		this.log("P2PNode stopped");
	}

	/**
	 * Dial a peer
	 */
	async dial(
		ma: Multiaddr,
		options?: TransportManagerDialOptions,
	): Promise<Connection> {
		if (this.status !== "started") {
			throw new Error("P2PNode not started");
		}

		return this.connectionManager.openConnection(ma, options);
	}

	/**
	 * Register a protocol handler
	 */
	handle(
		protocol: string,
		handler: StreamHandler,
		options?: StreamHandlerOptions,
	): void {
		this.registrar.handle(protocol, handler, options);
	}

	/**
	 * Unregister protocol handler(s)
	 */
	unhandle(protocols: string | string[]): void {
		this.registrar.unhandle(protocols);
	}

	/**
	 * Register a topology for protocol notifications
	 */
	register(protocol: string, topology: Topology): string {
		return this.registrar.register(protocol, topology);
	}

	/**
	 * Unregister a topology
	 */
	unregister(id: string): void {
		this.registrar.unregister(id);
	}

	/**
	 * Get all connections, optionally filtered by peer
	 */
	getConnections(peerId?: PeerId): Connection[] {
		return this.connectionManager.getConnections(peerId);
	}

	/**
	 * Get all connected peer IDs
	 */
	getPeers(): PeerId[] {
		const peerSet = new Set<string>();
		const peers: PeerId[] = [];

		for (const conn of this.connectionManager.getConnections()) {
			const peerKey = peerIdToString(conn.remotePeer);
			if (!peerSet.has(peerKey)) {
				peerSet.add(peerKey);
				peers.push(conn.remotePeer);
			}
		}

		return peers;
	}

	/**
	 * Get multiaddrs the node is listening on
	 */
	getMultiaddrs(): Multiaddr[] {
		return this.addressManager.getAddresses();
	}

	/**
	 * Get registered protocols
	 */
	getProtocols(): string[] {
		return this.registrar.getProtocols();
	}

	/**
	 * Close all connections to a peer
	 */
	async hangUp(peer: PeerId, options?: AbortOptions): Promise<void> {
		await this.connectionManager.closeConnections(peer, options);
	}

	/**
	 * Handle discovered peer from peer discovery modules
	 */
	#onDiscoveryPeer(evt: CustomEvent<PeerInfo>): void {
		const peer = evt.detail;

		// Don't discover ourselves
		if (peerIdEquals(peer.id, this.peerId)) {
			this.log.error("peer discovery discovered self");
			return;
		}

		// Dispatch peer:discovery event
		this.components.events.dispatchEvent(
			new CustomEvent("peer:discovery", { detail: peer }),
		);
	}
}

/**
 * Create a new P2P node
 */
export async function createP2PNode(init: P2PNodeInit): Promise<P2PNode> {
	const node = new P2PNode(init);
	return node;
}

/**
 * Create and start a new P2P node
 */
export async function createAndStartP2PNode(init: P2PNodeInit): Promise<P2PNode> {
	const node = new P2PNode(init);
	await node.start();
	return node;
}

