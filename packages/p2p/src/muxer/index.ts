import { AbstractMessageStream } from "../stream/default-message-stream";
import { MplexStreamMuxer } from "./mplex";

export type MplexInit = {};

export interface StreamMuxerFactory {
	protocol: string;
	createStreamMuxer(maConn: AbstractMessageStream): MplexStreamMuxer;
}

class Mplex implements StreamMuxerFactory {
	public protocol = "/mplex/6.7.0";
	private readonly _init: MplexInit;

	constructor(init: MplexInit = {}) {
		this._init = init;
	}

	createStreamMuxer(maConn: AbstractMessageStream): MplexStreamMuxer {
		return new MplexStreamMuxer(maConn, {
			...this._init,
		});
	}
}

export function mplex(init: MplexInit = {}): () => StreamMuxerFactory {
	return () => new Mplex(init);
}

export { AbstractStreamMuxer } from "./abstract-stream-muxer";
export type {
	AbstractStreamMuxerInit,
	StreamMuxerEvents,
} from "./abstract-stream-muxer";
export { Decoder, MAX_MSG_QUEUE_SIZE, MAX_MSG_SIZE } from "./decode";
export { encode } from "./encode";
export {
	InitiatorMessageTypes,
	MessageTypeNames,
	MessageTypes,
	ReceiverMessageTypes,
} from "./message-types";
export type { Message } from "./message-types";
export { MplexStreamMuxer } from "./mplex";
export { createStream, MplexStream } from "./stream";
