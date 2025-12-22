/**
 * AddressManager - Manages node addresses
 *
 * Simplified version of libp2p's AddressManager
 * Handles listen and announce addresses
 */

import { multiaddr, type Multiaddr } from "@multiformats/multiaddr";
import type { TypedEventTarget } from "main-event";
import type {
	AddressManager as AddressManagerInterface,
	ComponentLogger,
	Logger,
	P2PNodeEvents,
	PeerId,
	TransportManager,
} from "./types.ts";

/**
 * Address manager configuration
 */
export interface AddressManagerInit {
	/**
	 * Multiaddrs to listen on
	 */
	listen?: string[];

	/**
	 * Multiaddrs to announce (overrides transport addrs if set)
	 */
	announce?: string[];
}

/**
 * Components required by AddressManager
 */
export interface AddressManagerComponents {
	peerId: PeerId;
	transportManager: TransportManager;
	events: TypedEventTarget<P2PNodeEvents>;
	logger: ComponentLogger;
}

/**
 * AddressManager implementation
 * Manages listen and announce addresses for the node
 */
export class AddressManager implements AddressManagerInterface {
	private readonly log: Logger;
	private readonly listen: string[];
	private readonly announce: Set<string>;
	private readonly components: AddressManagerComponents;

	readonly [Symbol.toStringTag] = "@p2p/address-manager";

	constructor(
		components: AddressManagerComponents,
		init: AddressManagerInit = {},
	) {
		const { listen = [], announce = [] } = init;

		this.components = components;
		this.log = components.logger.forComponent("p2p:address-manager");
		this.listen = listen.map((ma) => ma.toString());
		this.announce = new Set(announce.map((ma) => ma.toString()));

		this.log("initialized with %d listen addresses", this.listen.length);
	}

	/**
	 * Get configured listen multiaddrs
	 */
	getListenAddrs(): Multiaddr[] {
		return this.listen.map((a) => multiaddr(a));
	}

	/**
	 * Get all addresses to announce
	 * If announce addrs are configured, use those
	 * Otherwise use transport listening addresses
	 */
	getAddresses(): Multiaddr[] {
		// If announce addresses are configured, use those
		if (this.announce.size > 0) {
			return Array.from(this.announce).map((a) => multiaddr(a));
		}

		// Otherwise return addresses from transports
		return this.components.transportManager.getAddrs();
	}

	/**
	 * Get announce addresses if configured
	 */
	getAnnounceAddrs(): Multiaddr[] {
		return Array.from(this.announce).map((a) => multiaddr(a));
	}

	/**
	 * Add an observed address (from remote peer)
	 * For now this is a no-op, can be extended later
	 */
	addObservedAddr(addr: Multiaddr): void {
		this.log("observed address: %s", addr.toString());
		// Could track observed addresses for NAT traversal in the future
	}
}

/**
 * Create a new AddressManager instance
 */
export function createAddressManager(
	components: AddressManagerComponents,
	init?: AddressManagerInit,
): AddressManager {
	return new AddressManager(components, init);
}
