import type { PeerInfo } from "../../kademlia";

// Re-export PeerInfo for convenience
export type { PeerInfo };

// PeerId is a 64-byte Uint8Array (public key without 0x04 prefix)
export type PeerId = Uint8Array;

export interface AbortOptions {
	signal?: AbortSignal;
}

export interface StreamHandlerOptions extends AbortOptions {
	maxInboundStreams?: number;
	maxOutboundStreams?: number;
	runOnLimitedConnection?: boolean;
	force?: boolean;
}

export interface StreamHandlerRecord {
	handler: StreamHandler;
	options: StreamHandlerOptions;
}

export type StreamHandler = (stream: any) => void | Promise<void>;

export interface NetworkEvents {
	"peer:update": CustomEvent<PeerInfo>;
	"peer:connect": CustomEvent<PeerInfo>;
	"peer:disconnect": CustomEvent<PeerInfo>;
	"connection:open": CustomEvent<any>;
	"connection:close": CustomEvent<any>;
}

export interface SecureConnection {
	socket: import("node:net").Socket | import("tls").TLSSocket;
	remotePeer: PeerId;
	privateKey: Uint8Array;
	publicKey: Uint8Array;
	remotePublicKey: Uint8Array | null;
	nonce: Uint8Array;
	ephemeralPrivateKey: Uint8Array;
	ephemeralPublicKey: Uint8Array;
	requireEip8: boolean;
	remoteInfo: {
		remotePublicKey: Uint8Array | null;
		remoteNonce: Uint8Array | null;
	};
}

export interface NewStreamOptions extends AbortOptions {
	maxOutboundStreams?: number;
}

export interface CreateStreamOptions extends AbortOptions {
	protocol?: string;
}

// Stream muxer types
export type StreamMuxerStatus = "open" | "closing" | "closed";

export interface StreamOptions {
	direction?: "inbound" | "outbound";
}

export interface StreamMuxerOptions {
	streamOptions?: StreamOptions;
	maxEarlyStreams?: number;
}
