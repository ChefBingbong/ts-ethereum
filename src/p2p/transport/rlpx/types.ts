import type { Multiaddr } from "@multiformats/multiaddr";
import type { NetConfig } from "../../../utils/getNetConfig";
import { Upgrader } from "../../connection/upgrader";

export interface RLPxSocketOptions {
	noDelay?: boolean;
	keepAlive?: boolean;
	allowHalfOpen?: boolean;
	signal?: AbortSignal;
}

export interface CreateListenerOptions {
	upgrader: Upgrader;
}

export interface RLPxCreateListenerOptions extends CreateListenerOptions, RLPxSocketOptions {}

export type Status =
	| { code: "INACTIVE" }
	| {
			code: "ACTIVE";
			listeningAddr: Multiaddr;
			netConfig: NetConfig;
	  };

export interface ListenerContext extends RLPxCreateListenerOptions {
	privateKey?: Uint8Array;
	id?: Uint8Array;
	socketInactivityTimeout?: number;
	socketCloseTimeout?: number;
	maxConnections?: number;
	backlog?: number;
}

export type TransportDialOpts = {
	timeoutMs?: number;
	maxActiveDials: number;
};

export type StreamOpenHandler = (protocol: string, stream: any) => void;
