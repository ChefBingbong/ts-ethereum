import type { TypedEventTarget } from "main-event";
import {
	NetworkEvents,
	PeerId,
	StreamHandler,
	StreamHandlerOptions,
	StreamHandlerRecord,
} from "./types";

export const DEFAULT_MAX_INBOUND_STREAMS = 32;
export const DEFAULT_MAX_OUTBOUND_STREAMS = 64;

export interface RegistrarOptions {
	peerId: PeerId;
	events?: TypedEventTarget<NetworkEvents>;
}

export class Registrar {
	protected readonly handlers: Map<string, StreamHandlerRecord>;
	protected readonly peerId: PeerId;
	protected readonly events?: TypedEventTarget<NetworkEvents>;

	constructor(options: RegistrarOptions) {
		this.handlers = new Map<string, StreamHandlerRecord>();
		this.peerId = options.peerId;
		this.events = options.events;
	}

	getProtocols(): string[] {
		return Array.from(this.handlers.keys());
	}

	getHandler(protocol: string): StreamHandlerRecord {
		const handler = this.handlers.get(protocol);

		if (handler == null) {
			throw new Error(`No handler registered for protocol ${protocol}`);
		}

		return handler;
	}

	handle(
		protocol: string,
		handler: StreamHandler,
		opts?: StreamHandlerOptions,
	): void {
		if (this.handlers.has(protocol) && opts?.force !== true) {
			throw new Error(`Handler already registered for protocol ${protocol}`);
		}

		this.handlers.set(protocol, {
			handler,
			options: {
				maxInboundStreams: DEFAULT_MAX_INBOUND_STREAMS,
				maxOutboundStreams: DEFAULT_MAX_OUTBOUND_STREAMS,
				...opts,
			},
		});
	}

	unhandle(protocols: string | string[]): void {
		const protocolList = Array.isArray(protocols) ? protocols : [protocols];

		for (const protocol of protocolList) {
			this.handlers.delete(protocol);
		}
	}

	hasHandler(protocol: string): boolean {
		return this.handlers.has(protocol);
	}
}

export function createRegistrar(options: RegistrarOptions): Registrar {
	return new Registrar(options);
}
