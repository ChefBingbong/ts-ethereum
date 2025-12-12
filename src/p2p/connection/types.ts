import type { Multiaddr } from "@multiformats/multiaddr";
import type { TLSSocket } from "node:tls";
import { PeerInfo } from "../../kademlia";
import type { MuxedConnection } from "./connection";
import { ProtocolHandler } from "./protocol-manager";
import type { ProtocolStream } from "./protocol-stream";

export type ConnectionHandler = (mc: MuxedConnection, f: any) => Promise<void>;

export type FrameHandler = (f: any) => void;

export type StreamOpenPayload = {
	sid: number;
	protocol: string;
};

export type StreamDataPayload = {
	sid: number;
	data: any;
};

export type StreamClosePayload = {
	sid: number;
	direction?: "local" | "remote" | "both";
};

export type StreamPacket =
	| { t: "STREAM_OPEN"; payload: StreamOpenPayload }
	| { t: "STREAM_DATA"; payload: StreamDataPayload }
	| { t: "STREAM_CLOSE"; payload: StreamClosePayload };

export type StreamOpenHandler = (
	protocol: string,
	stream: ProtocolStream,
) => void;

export type MuxedConnectionOptions = {
	localAddr?: Multiaddr;
	remoteAddr?: Multiaddr;
};

export type EncryptionCredentials = {
	certPEM: string;
	keyPEM: string;
	nodeKey: {
		private: Uint8Array<ArrayBufferLike>;
		publicCompressed: Uint8Array<ArrayBufferLike>;
	};
};

export type SecureConnection = {
	socket: TLSSocket
	remoteInfo: {
		remotePublicKey: Uint8Array;
		remoteNonce: Uint8Array;
	};
};

export interface NetworkEvents {
	'peer:update': CustomEvent<PeerInfo>
	'peer:connect': CustomEvent<PeerInfo>
	'peer:disconnect': CustomEvent<PeerInfo>
  
  }

  export type ServiceMap = Record<string, unknown>

  export interface AbortOptions {
	signal?: AbortSignal
  }
  
  export interface StreamHandlerOptions extends AbortOptions {
	maxInboundStreams?: number
  
	maxOutboundStreams?: number
	runOnLimitedConnection?: boolean
	force?: true
  }

  export type StreamProtocolHandler = { handler: ProtocolHandler, options?: StreamHandlerOptions }

  export interface AbortOptions {
	signal?: AbortSignal
  }