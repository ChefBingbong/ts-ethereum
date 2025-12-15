import type { Multiaddr } from "@multiformats/multiaddr";
import type { NetConfig } from "../../../utils/getNetConfig";
import { Upgrader } from "../../connection/upgrader";

export interface TCPSocketOptions {
	noDelay?: boolean;
	keepAlive?: boolean;
	allowHalfOpen?: boolean;
	signal?: AbortSignal;
}

export interface CreateListenerOptions {
	upgrader: Upgrader;
}

export interface TCPCreateListenerOptions extends CreateListenerOptions, TCPSocketOptions {}

export type Status =
	| { code: "INACTIVE" }
	| {
			code: "ACTIVE";
			listeningAddr: Multiaddr;
			netConfig: NetConfig;
	  };

export interface ListenerContext extends TCPCreateListenerOptions {
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
