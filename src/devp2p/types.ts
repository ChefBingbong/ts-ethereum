import type { Common } from "../chain-config";

// NOTE: RLPxEvent references Peer type which was from old devp2p implementation
// This interface may not be used anymore but kept for compatibility
export interface RLPxEvent {
	"peer:added": [peer: any]; // Peer type was from old devp2p, using any for compatibility
	"peer:error": [peer: any, error: any];
	"peer:removed": [peer: any, reason: any, disconnectWe: boolean | null]; // disconnectWe indicates whether the disconnection was initiated by us or not
	error: [error: Error];
	close: undefined;
	listening: undefined;
}

export interface PeerEvent {
	error: [error: Error];
	connect: undefined;
	close: [reason: any, disconnectWe: boolean | null]; // disconnectWe indicates whether the disconnection was initiated by us or not
}

// REMOVED: ProtocolEvent - protocol events are now handled in src/client/net/protocol/abstract-protocol.ts

export interface KBucketEvent {
	ping: [contacts: Contact[], contact: PeerInfo];
	updated: [incumbent: Contact, selection: Contact];
	added: [peer: PeerInfo];
	removed: [peer: PeerInfo];
}

export interface DPTEvent {
	listening: undefined;
	close: undefined;
	error: [error: Error];
	"peer:added": [peer: PeerInfo];
	"peer:new": [peer: PeerInfo];
	"peer:removed": [peer: PeerInfo];
}

export interface ServerEvent {
	listening: undefined;
	close: undefined;
	error: [error: Error];
	peers: any[];
}

// REMOVED: ProtocolConstructor and Capabilities - these were for the old devp2p protocol system
// Protocol capabilities are now handled in src/client/net/protocol/eth/definitions.ts

export type DISCONNECT_REASON =
	(typeof DISCONNECT_REASON)[keyof typeof DISCONNECT_REASON];

export const DISCONNECT_REASON = {
	DISCONNECT_REQUESTED: 0x00,
	NETWORK_ERROR: 0x01,
	PROTOCOL_ERROR: 0x02,
	USELESS_PEER: 0x03,
	TOO_MANY_PEERS: 0x04,
	ALREADY_CONNECTED: 0x05,
	INCOMPATIBLE_VERSION: 0x06,
	INVALID_IDENTITY: 0x07,
	CLIENT_QUITTING: 0x08,
	UNEXPECTED_IDENTITY: 0x09,
	SAME_IDENTITY: 0x0a,
	TIMEOUT: 0x0b,
	SUBPROTOCOL_ERROR: 0x10,
} as const;

// Create a reverse mapping: numeric value -> key name
export const DisconnectReasonNames: { [key in DISCONNECT_REASON]: string } =
	Object.entries(DISCONNECT_REASON).reduce(
		(acc, [key, value]) => {
			acc[value as DISCONNECT_REASON] = key;
			return acc;
		},
		{} as { [key in DISCONNECT_REASON]: string },
	);

export interface DPTOptions {
	/**
	 * Timeout for peer requests
	 *
	 * Default: 10s
	 */
	timeout?: number;

	/**
	 * Network info to send a long a request
	 *
	 * Default: 127.0.0.1, no UDP or TCP port provided
	 */
	endpoint?: PeerInfo;

	/**
	 * Function for socket creation
	 *
	 * Default: dgram-created socket
	 */
	createSocket?: Function;

	/**
	 * Interval for peer table refresh
	 *
	 * Default: 60s
	 */
	refreshInterval?: number;

	/**
	 * Toggles whether or not peers should be queried with 'findNeighbours'
	 * to discover more peers
	 *
	 * Default: true
	 */
	shouldFindNeighbours?: boolean;

	/**
	 * Send findNeighbour requests to and only answer with respective peers
	 * being confirmed by calling the `confirmPeer()` method
	 *
	 * (allows for a more selective and noise reduced discovery)
	 *
	 * Note: Bootstrap nodes are confirmed by default.
	 *
	 * Default: false
	 */
	onlyConfirmed?: boolean;

	/**
	 * Common instance to allow for crypto primitive (e.g. keccak) replacement
	 */
	common?: Common;
}

export interface DPTServerOptions {
	/**
	 * Timeout for peer requests
	 *
	 * Default: 10s
	 */
	timeout?: number;

	/**
	 * Network info to send a long a request
	 *
	 * Default: 127.0.0.1, no UDP or TCP port provided
	 */
	endpoint?: PeerInfo;

	/**
	 * Function for socket creation
	 *
	 * Default: dgram-created socket
	 */
	createSocket?: Function;

	/**
	 * Common instance to allow for crypto primitive (e.g. keccak) replacement
	 */
	common?: Common;
}

export type ProtocolType = (typeof ProtocolType)[keyof typeof ProtocolType];

export const ProtocolType = {
	ETH: "eth",
} as const;

export interface KBucketOptions {
	/**
	 * An optional Uint8Array representing the local node id.
	 * If not provided, a local node id will be created via `randomBytes(20)`.
	 */
	localNodeId?: Uint8Array;
	/**
	 * The number of nodes that a k-bucket can contain before being full or split.
	 * Defaults to 20.
	 */
	numberOfNodesPerKBucket?: number;
	/**
	 * The number of nodes to ping when a bucket that should not be split becomes full.
	 * KBucket will emit a `ping` event that contains `numberOfNodesToPing` nodes that have not been contacted the longest.
	 * Defaults to 3.
	 */
	numberOfNodesToPing?: number;
	/**
	 * An optional distance function that gets two id Uint8Arrays and return distance between them as a number.
	 */
	distance?: (firstId: Uint8Array, secondId: Uint8Array) => number;
	/**
	 * An optional arbiter function that given two `contact` objects with the same `id`,
	 * returns the desired object to be used for updating the k-bucket.
	 * Defaults to vectorClock arbiter function.
	 */
	arbiter?: (incumbent: Contact, candidate: Contact) => Contact;
	/**
	 * Optional satellite data to include
	 * with the k-bucket. `metadata` property is guaranteed not be altered by,
	 * it is provided as an explicit container for users of k-bucket to store
	 * implementation-specific data.
	 */
	metadata?: object;
}

export interface PeerInfo {
	id?: Uint8Array;
	address?: string;
	udpPort?: number | null;
	tcpPort?: number | null;
	vectorClock?: number;
}

export interface Contact extends PeerInfo {
	id: Uint8Array;
	vectorClock: number;
}

// REMOVED: PeerOptions and RLPxOptions - these were for the old devp2p RLPx implementation
// These types are no longer used as we've migrated to the new RLPx transport system
// Peer options are now in src/client/net/peer/peer.ts

export type SendMethod = (code: number, data: Uint8Array) => any;
