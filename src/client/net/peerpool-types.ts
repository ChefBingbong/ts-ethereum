import type { Config } from "../config.ts";
import type { Peer } from "./peer/peer.ts";
import type { P2PPeerPool } from "./p2p-peerpool.ts";

/**
 * Common interface for peer pools
 * Now only P2PPeerPool is supported
 */
export interface IPeerPool {
	config: Config;
	running: boolean;
	peers: Peer[];
	size: number;
	contains(peer: Peer | string): boolean;
	idle(filterFn?: (peer: Peer) => boolean): Peer | undefined;
	add(peer?: Peer): void;
	remove(peer?: Peer): void;
	ban(peer: Peer, maxAge?: number): void;
	open(): Promise<boolean | void>;
	start(): Promise<boolean>;
	stop(): Promise<boolean>;
	close(): Promise<void>;
}

/**
 * Type alias for peer pool implementations
 * Now only P2PPeerPool is supported
 */
export type PeerPoolLike = P2PPeerPool;

