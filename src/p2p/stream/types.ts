import type { Uint8ArrayList } from "uint8arraylist";

export type MessageStreamDirection = "inbound" | "outbound";
export type MessageStreamStatus =
	| "open"
	| "closing"
	| "closed"
	| "aborted"
	| "reset";
export type MessageStreamReadStatus =
	| "readable"
	| "paused"
	| "closing"
	| "closed";
export type MessageStreamWriteStatus = "writable" | "closing" | "closed";

export interface MessageStreamTimeline {
	open: number;
	close?: number;
}

export class StreamMessageEvent extends Event {
	public data: Uint8Array | Uint8ArrayList;

	constructor(data: Uint8Array | Uint8ArrayList) {
		super("message");
		this.data = data;
	}
}

export class StreamCloseEvent extends Event {
	public error?: Error;
	public local?: boolean;

	constructor(local?: boolean, error?: Error) {
		super("close");
		this.error = error;
		this.local = local;
	}
}

export class StreamAbortEvent extends StreamCloseEvent {
	constructor(error: Error) {
		super(true, error);
	}
}

export class StreamResetEvent extends StreamCloseEvent {
	constructor(error: Error) {
		super(false, error);
	}
}

export interface MessageStreamEvents {
	message: StreamMessageEvent;
	drain: Event;
	close: StreamCloseEvent;
	remoteCloseWrite: Event;
	idle: Event;
}

export interface SendResult {
	sentBytes: number;
	canSendMore: boolean;
}
