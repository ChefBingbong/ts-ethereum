/**
 * TransportManager - Manages transport lifecycle
 *
 * Based on libp2p's TransportManager, simplified for RLPx
 * Handles transport registration, dialing, and listening
 */

import {
	FaultTolerance,
	type Listener,
	type Transport,
} from "@libp2p/interface";
import { type Multiaddr, multiaddr } from "@multiformats/multiaddr";
import type { TypedEventTarget } from "main-event";
import type { RLPxConnection } from "../transport/rlpx/connection.ts";
import { ConnectionWrapper } from "./connection-manager.ts";
import type {
	AddressManager,
	ComponentLogger,
	Logger,
	P2PNodeEvents,
	TransportManagerDialOptions,
	TransportManager as TransportManagerInterface,
} from "./types.ts";

/**
 * Error when no transport is available for an address
 */
export class TransportUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TransportUnavailableError";
	}
}

/**
 * Error when address is not supported
 */
export class UnsupportedListenAddressError extends Error {
	constructor(message: string = "Unsupported listen address") {
		super(message);
		this.name = "UnsupportedListenAddressError";
	}
}

/**
 * TransportManager configuration
 */
export interface TransportManagerInit {
	/**
	 * How to handle listen failures
	 * @default FaultTolerance.FATAL_ALL
	 */
	faultTolerance?: FaultTolerance;
}

/**
 * Components required by TransportManager
 */
export interface TransportManagerComponents {
	addressManager: AddressManager;
	events: TypedEventTarget<P2PNodeEvents>;
	logger: ComponentLogger;
}

/**
 * TransportManager implementation
 * Manages transport registration, dialing, and listening
 */
export class TransportManager implements TransportManagerInterface {
	private readonly log: Logger;
	private readonly components: TransportManagerComponents;
	private readonly transports: Map<string, Transport>;
	private readonly listeners: Map<string, Listener[]>;
	private readonly faultTolerance: FaultTolerance;
	private started: boolean;

	readonly [Symbol.toStringTag] = "@p2p/transport-manager";

	constructor(
		components: TransportManagerComponents,
		init: TransportManagerInit = {},
	) {
		this.log = components.logger.forComponent("p2p:transport-manager");
		this.components = components;
		this.started = false;
		this.transports = new Map();
		this.listeners = new Map();
		this.faultTolerance = init.faultTolerance ?? FaultTolerance.FATAL_ALL;
	}

	/**
	 * Add a transport to the manager
	 */
	add(transport: Transport): void {
		const tag = transport[Symbol.toStringTag];

		if (tag == null) {
			throw new Error("Transport must have a valid tag");
		}

		if (this.transports.has(tag)) {
			throw new Error(`There is already a transport with the tag ${tag}`);
		}

		this.log("adding transport %s", tag);

		this.transports.set(tag, transport);

		if (!this.listeners.has(tag)) {
			this.listeners.set(tag, []);
		}
	}

	/**
	 * Check if started
	 */
	isStarted(): boolean {
		return this.started;
	}

	/**
	 * Start the transport manager
	 */
	start(): void {
		this.started = true;
	}

	/**
	 * Called after start to begin listening
	 */
	async afterStart(): Promise<void> {
		const addrs = this.components.addressManager.getListenAddrs();
		await this.listen(addrs);
	}

	/**
	 * Stop all listeners
	 */
	async stop(): Promise<void> {
		const tasks: Promise<void>[] = [];

		for (const [key, listeners] of this.listeners) {
			this.log("closing listeners for %s", key);

			while (listeners.length > 0) {
				const listener = listeners.pop();

				if (listener == null) {
					continue;
				}

				tasks.push(listener.close());
			}
		}

		await Promise.all(tasks);
		this.log("all listeners closed");

		for (const key of this.listeners.keys()) {
			this.listeners.set(key, []);
		}

		this.started = false;
	}

	/**
	 * Dial a multiaddr using the appropriate transport
	 */
	async dial(
		ma: Multiaddr,
		options?: TransportManagerDialOptions,
	): Promise<RLPxConnection> {
		const transport = this.dialTransportForMultiaddr(ma);

		if (transport == null) {
			throw new TransportUnavailableError(
				`No transport available for address ${ma.toString()}`,
			);
		}

		this.log(
			"dialing %s using transport %s",
			ma.toString(),
			transport[Symbol.toStringTag],
		);

		// For RLPx, we need to pass remoteId in options
		const connection = await (transport as any).dial(ma, {
			...options,
			signal: options?.signal ?? AbortSignal.timeout(10000),
		});

		return connection as RLPxConnection;
	}

	/**
	 * Get all listening addresses
	 */
	getAddrs(): Multiaddr[] {
		let addrs: Multiaddr[] = [];

		for (const listeners of this.listeners.values()) {
			for (const listener of listeners) {
				addrs = [...addrs, ...listener.getAddrs()];
			}
		}

		return addrs;
	}

	/**
	 * Get all registered transports
	 */
	getTransports(): Transport[] {
		return Array.from(this.transports.values());
	}

	/**
	 * Get all listeners
	 */
	getListeners(): Listener[] {
		return Array.from(this.listeners.values()).flat();
	}

	/**
	 * Find a transport that can dial the given address
	 */
	dialTransportForMultiaddr(ma: Multiaddr): Transport | undefined {
		for (const transport of this.transports.values()) {
			const addrs = transport.dialFilter([ma]);

			if (addrs.length > 0) {
				return transport;
			}
		}
	}

	/**
	 * Find a transport that can listen on the given address
	 */
	listenTransportForMultiaddr(ma: Multiaddr): Transport | undefined {
		for (const transport of this.transports.values()) {
			const addrs = transport.listenFilter([ma]);

			if (addrs.length > 0) {
				return transport;
			}
		}
	}

	/**
	 * Start listeners for each listen address
	 */
	async listen(addrs: Multiaddr[]): Promise<void> {
		if (!this.isStarted()) {
			throw new Error("TransportManager not started");
		}

		if (addrs == null || addrs.length === 0) {
			this.log(
				"no addresses were provided for listening, this node is dial only",
			);
			return;
		}

		const errors: Map<string, Error> = new Map();
		const tasks: Promise<void>[] = [];

		// Initialize errors map with unsupported error for all addresses
		for (const addr of addrs) {
			errors.set(addr.toString(), new UnsupportedListenAddressError());
		}

		for (const [key, transport] of this.transports.entries()) {
			const supportedAddrs = transport.listenFilter(addrs);

			// Create a listener for each supported address
			for (const addr of supportedAddrs) {
				this.log("creating listener for %s on %s", key, addr.toString());

				const listener = transport.createListener({
					// RLPx doesn't use upgrader
				} as any);

				let listeners = this.listeners.get(key);

				if (listeners == null) {
					listeners = [];
					this.listeners.set(key, listeners);
				}

				listeners.push(listener);

				// Track listen/close events
				listener.addEventListener("listening", () => {
					this.components.events.dispatchEvent(
						new CustomEvent("transport:listening", { detail: listener }),
					);
				});

				listener.addEventListener("close", () => {
					const index = listeners!.findIndex((l) => l === listener);

					if (index !== -1) {
						listeners!.splice(index, 1);
					}

					this.components.events.dispatchEvent(
						new CustomEvent("transport:close", { detail: listener }),
					);
				});

				// Handle inbound connections from listener (RLPx specific)
				// Cast to EventTarget to bypass libp2p's Listener type constraints
				(listener as unknown as EventTarget).addEventListener(
					"rlpx:connection",
					((evt: CustomEvent<RLPxConnection>) => {
						const rlpxConn = evt.detail;
						this.handleInboundConnection(rlpxConn);
					}) as EventListener,
				);

				// Start listening
				tasks.push(
					listener
						.listen(addr)
						.then(() => {
							errors.delete(addr.toString());
							this.log("listening on %s", addr.toString());
						})
						.catch((err) => {
							this.log.error(
								"transport %s could not listen on %s - %s",
								key,
								addr.toString(),
								err.message,
							);
							errors.set(addr.toString(), err);
							throw err;
						}),
				);
			}
		}

		const results = await Promise.allSettled(tasks);

		// Check if all succeeded
		if (
			results.length > 0 &&
			results.every((res) => res.status === "fulfilled")
		) {
			return;
		}

		// Handle fault tolerance
		if (this.faultTolerance === FaultTolerance.NO_FATAL) {
			this.log(
				"failed to listen on some addresses but fault tolerance allows this",
			);
			return;
		}

		// Throw if we couldn't listen on any address
		if (errors.size === addrs.length) {
			const errorMessages = [...errors.entries()]
				.map(([addr, err]) => `  ${addr}: ${err.message}`)
				.join("\n");
			throw new Error(`Failed to listen on any address:\n${errorMessages}`);
		}
	}

	/**
	 * Handle an inbound connection from a listener
	 */
	private handleInboundConnection(rlpxConn: RLPxConnection): void {
		const remoteIp = rlpxConn.remoteAddress ?? "127.0.0.1";
		const remotePort = rlpxConn.remotePort ?? 0;

		// Create multiaddr from remote address
		const remoteAddr = multiaddr(`/ip4/${remoteIp}/tcp/${remotePort}`);

		this.log("inbound connection from %s:%d", remoteIp, remotePort);

		// Wrap in our Connection interface
		const connection = new ConnectionWrapper(rlpxConn, remoteAddr);

		// Set up close handler
		rlpxConn.once("close", () => {
			this.components.events.dispatchEvent(
				new CustomEvent("connection:close", { detail: connection }),
			);
		});

		// Emit connection:open - this will be picked up by ConnectionManager
		this.components.events.dispatchEvent(
			new CustomEvent("connection:open", { detail: connection }),
		);
	}

	/**
	 * Remove a transport
	 */
	async remove(key: string): Promise<void> {
		const listeners = this.listeners.get(key) ?? [];
		this.log("removing transport %s", key);

		const tasks: Promise<void>[] = [];

		while (listeners.length > 0) {
			const listener = listeners.pop();

			if (listener == null) {
				continue;
			}

			tasks.push(listener.close());
		}

		await Promise.all(tasks);

		this.transports.delete(key);
		this.listeners.delete(key);
	}

	/**
	 * Remove all transports
	 */
	async removeAll(): Promise<void> {
		const tasks: Promise<void>[] = [];

		for (const key of this.transports.keys()) {
			tasks.push(this.remove(key));
		}

		await Promise.all(tasks);
	}
}

/**
 * Create a new TransportManager instance
 */
export function createTransportManager(
	components: TransportManagerComponents,
	init?: TransportManagerInit,
): TransportManager {
	return new TransportManager(components, init);
}
