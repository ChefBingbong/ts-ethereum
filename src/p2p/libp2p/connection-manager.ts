/**
 * ConnectionManager - Manages peer connections
 *
 * Based on libp2p's ConnectionManager, simplified for RLPx
 * Tracks connections, emits peer:connect/disconnect events
 */

import type { Multiaddr } from "@multiformats/multiaddr";
import type { TypedEventTarget } from "main-event";
import type { RLPxConnection } from "../transport/rlpx/connection.ts";
import type {
	AbortOptions,
	ComponentLogger,
	Connection,
	ConnectionManager as ConnectionManagerInterface,
	Logger,
	P2PNodeEvents,
	PeerId,
	TransportManager,
	TransportManagerDialOptions,
} from "./types.ts";
import { DEFAULT_MAX_CONNECTIONS, peerIdEquals, peerIdToString } from "./types.ts";

/**
 * Connection wrapper to adapt RLPxConnection to our Connection interface
 */
class ConnectionWrapper implements Connection {
	readonly id: string;
	readonly remoteAddr: Multiaddr;
	readonly remotePeer: PeerId;
	readonly direction: "inbound" | "outbound";
	readonly timeline: { open: number; close?: number };
	private _status: "open" | "closing" | "closed" = "open";
	private readonly rlpxConnection: RLPxConnection;

	constructor(rlpxConn: RLPxConnection, remoteAddr: Multiaddr) {
		this.rlpxConnection = rlpxConn;
		this.id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
		this.remoteAddr = remoteAddr;
		
		// Get remote peer ID from RLPx Hello message
		const hello = rlpxConn.getHelloMessage();
		this.remotePeer = hello?.id ?? new Uint8Array(64);
		
		// RLPx connections are outbound when we initiate
		this.direction = (rlpxConn as any)._direction ?? "outbound";
		this.timeline = { open: Date.now() };
	}

	get status(): "open" | "closing" | "closed" {
		return this._status;
	}

	async close(_options?: AbortOptions): Promise<void> {
		if (this._status !== "open") return;
		
		this._status = "closing";
		this.rlpxConnection.close();
		this._status = "closed";
		this.timeline.close = Date.now();
	}

	abort(err: Error): void {
		this._status = "closed";
		this.rlpxConnection.close();
		this.timeline.close = Date.now();
	}

	/**
	 * Get the underlying RLPx connection
	 */
	getRLPxConnection(): RLPxConnection {
		return this.rlpxConnection;
	}
}

/**
 * ConnectionManager configuration
 */
export interface ConnectionManagerInit {
	/**
	 * Maximum number of connections
	 * @default 100
	 */
	maxConnections?: number;

	/**
	 * Dial timeout in milliseconds
	 * @default 10000
	 */
	dialTimeout?: number;

	/**
	 * Maximum incoming pending connections
	 * @default 10
	 */
	maxIncomingPendingConnections?: number;

	/**
	 * Inbound connection rate limit (per second per host)
	 * @default 5
	 */
	inboundConnectionThreshold?: number;
}

/**
 * Components required by ConnectionManager
 */
export interface ConnectionManagerComponents {
	peerId: PeerId;
	transportManager: TransportManager;
	events: TypedEventTarget<P2PNodeEvents>;
	logger: ComponentLogger;
}

/**
 * ConnectionManager implementation
 * Tracks connections and emits peer events
 */
export class ConnectionManager implements ConnectionManagerInterface {
	private readonly log: Logger;
	private readonly components: ConnectionManagerComponents;
	private readonly connections: Map<string, Connection[]>;
	private readonly maxConnections: number;
	private readonly maxIncomingPendingConnections: number;
	private incomingPendingConnections: number;
	private started: boolean;

	readonly [Symbol.toStringTag] = "@p2p/connection-manager";

	constructor(
		components: ConnectionManagerComponents,
		init: ConnectionManagerInit = {},
	) {
		this.log = components.logger.forComponent("p2p:connection-manager");
		this.components = components;
		this.connections = new Map();
		this.maxConnections = init.maxConnections ?? DEFAULT_MAX_CONNECTIONS;
		this.maxIncomingPendingConnections = init.maxIncomingPendingConnections ?? 10;
		this.incomingPendingConnections = 0;
		this.started = false;

		// Bind event handlers
		this.onConnect = this.onConnect.bind(this);
		this.onDisconnect = this.onDisconnect.bind(this);
	}

	/**
	 * Start the connection manager
	 */
	async start(): Promise<void> {
		this.components.events.addEventListener(
			"connection:open",
			this.onConnect as EventListener,
		);
		this.components.events.addEventListener(
			"connection:close",
			this.onDisconnect as EventListener,
		);

		this.started = true;
		this.log("started");
	}

	/**
	 * Stop the connection manager
	 */
	async stop(): Promise<void> {
		this.components.events.removeEventListener(
			"connection:open",
			this.onConnect as EventListener,
		);
		this.components.events.removeEventListener(
			"connection:close",
			this.onDisconnect as EventListener,
		);

		// Close all connections
		const tasks: Promise<void>[] = [];

		for (const connectionList of this.connections.values()) {
			for (const connection of connectionList) {
				tasks.push(
					connection.close({ signal: AbortSignal.timeout(500) }).catch((err) => {
						connection.abort(err);
					}),
				);
			}
		}

		this.log("closing %d connections", tasks.length);
		await Promise.all(tasks);
		this.connections.clear();

		this.started = false;
		this.log("stopped");
	}

	/**
	 * Get max connections limit
	 */
	getMaxConnections(): number {
		return this.maxConnections;
	}

	/**
	 * Open a connection to a peer
	 */
	async openConnection(
		ma: Multiaddr,
		options?: TransportManagerDialOptions,
	): Promise<Connection> {
		if (!this.started) {
			throw new Error("ConnectionManager not started");
		}

		this.log("opening connection to %s", ma.toString());

		// Dial using transport manager
		const rlpxConn = await this.components.transportManager.dial(ma, options);

		// Wrap in our Connection interface
		const connection = new ConnectionWrapper(rlpxConn, ma);

		// Track the connection
		this.trackConnection(connection);

		// Set up close handler
		rlpxConn.once("close", () => {
			this.components.events.dispatchEvent(
				new CustomEvent("connection:close", { detail: connection }),
			);
		});

		// Emit connection:open
		this.components.events.dispatchEvent(
			new CustomEvent("connection:open", { detail: connection }),
		);

		return connection;
	}

	/**
	 * Get all connections, optionally filtered by peer
	 */
	getConnections(peerId?: PeerId): Connection[] {
		if (peerId != null) {
			return this.connections.get(peerIdToString(peerId)) ?? [];
		}

		let conns: Connection[] = [];

		for (const c of this.connections.values()) {
			conns = conns.concat(c);
		}

		return conns;
	}

	/**
	 * Close all connections to a peer
	 */
	async closeConnections(peerId: PeerId, options?: AbortOptions): Promise<void> {
		const connections = this.connections.get(peerIdToString(peerId)) ?? [];

		await Promise.all(
			connections.map(async (connection) => {
				try {
					await connection.close(options);
				} catch (err: any) {
					connection.abort(err);
				}
			}),
		);
	}

	/**
	 * Check if we should accept an incoming connection
	 */
	acceptIncomingConnection(connection: RLPxConnection): boolean {
		// Check if we have room for more connections
		const totalConnections = this.getConnections().length;

		if (totalConnections >= this.maxConnections) {
			this.log("connection refused - maxConnections exceeded");
			return false;
		}

		// Check pending connections
		if (this.incomingPendingConnections >= this.maxIncomingPendingConnections) {
			this.log("connection refused - maxIncomingPendingConnections exceeded");
			return false;
		}

		this.incomingPendingConnections++;
		return true;
	}

	/**
	 * Called after inbound connection upgrade completes
	 */
	afterUpgradeInbound(): void {
		this.incomingPendingConnections--;
	}

	/**
	 * Handle new connection
	 */
	private onConnect(evt: CustomEvent<Connection>): void {
		const connection = evt.detail;

		if (!this.started) {
			// Shutting down, close the connection
			connection.close().catch(() => {});
			return;
		}

		if (connection.status !== "open") {
			return;
		}

		const peerId = connection.remotePeer;
		const peerKey = peerIdToString(peerId);
		const isNewPeer = !this.connections.has(peerKey);

		// Track the connection
		const storedConns = this.connections.get(peerKey) ?? [];
		
		// Check if already tracked
		if (!storedConns.some(c => c.id === connection.id)) {
			storedConns.push(connection);
			this.connections.set(peerKey, storedConns);
		}

		// Emit peer:connect for first connection to this peer
		if (isNewPeer) {
			this.log("new peer connected: %s", peerKey.slice(0, 16));
			this.components.events.dispatchEvent(
				new CustomEvent("peer:connect", { detail: peerId }),
			);
		}
	}

	/**
	 * Handle connection close
	 */
	private onDisconnect(evt: CustomEvent<Connection>): void {
		const connection = evt.detail;
		const peerId = connection.remotePeer;
		const peerKey = peerIdToString(peerId);

		const peerConns = this.connections.get(peerKey) ?? [];

		// Remove closed connection
		const filteredConns = peerConns.filter((conn) => conn.id !== connection.id);

		if (filteredConns.length === 0) {
			// No more connections to this peer
			this.log("peer disconnected: %s", peerKey.slice(0, 16));
			this.connections.delete(peerKey);

			// Emit peer:disconnect
			this.components.events.dispatchEvent(
				new CustomEvent("peer:disconnect", { detail: peerId }),
			);
		} else {
			this.connections.set(peerKey, filteredConns);
		}
	}

	/**
	 * Track a connection
	 */
	private trackConnection(connection: Connection): void {
		const peerKey = peerIdToString(connection.remotePeer);
		const conns = this.connections.get(peerKey) ?? [];
		conns.push(connection);
		this.connections.set(peerKey, conns);
	}
}

/**
 * Create a new ConnectionManager instance
 */
export function createConnectionManager(
	components: ConnectionManagerComponents,
	init?: ConnectionManagerInit,
): ConnectionManager {
	return new ConnectionManager(components, init);
}

// Re-export the wrapper for external use
export { ConnectionWrapper };

