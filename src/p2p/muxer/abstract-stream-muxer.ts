import { TypedEventEmitter } from "main-event";
import { raceSignal } from "race-signal";
import type { Uint8ArrayList } from "uint8arraylist";
import {
	AbortOptions,
	CreateStreamOptions,
	StreamMuxerStatus,
	StreamOptions,
} from "../connection/types";
import { AbstractStream } from "../stream/abstract-stream";
import {
	AbstractMessageStream,
	Logger,
} from "../stream/default-message-stream";
import { StreamCloseEvent, StreamMessageEvent } from "../stream/types";

export interface StreamMuxerEvents<
	MuxedStream extends AbstractStream = AbstractStream,
> {
	stream: CustomEvent<MuxedStream>;
	close: Event;
}

export interface AbstractStreamMuxerInit {
	/**
	 * The protocol name for the muxer
	 */
	protocol: string;

	/**
	 * The name of the muxer, used to create a new logging scope
	 */
	name: string;

	/**
	 * Stream options to apply to created streams
	 */
	streamOptions?: StreamOptions;

	/**
	 * Maximum number of early streams (streams opened before listener attached)
	 */
	maxEarlyStreams?: number;
}

export abstract class AbstractStreamMuxer<
	MuxedStream extends AbstractStream = AbstractStream,
> extends TypedEventEmitter<StreamMuxerEvents<MuxedStream>> {
	public streams: MuxedStream[];
	public protocol: string;
	public status: StreamMuxerStatus;

	protected log: Logger;
	protected maConn: AbstractMessageStream;
	protected streamOptions?: StreamOptions;
	protected earlyStreams: MuxedStream[];
	protected maxEarlyStreams: number;

	constructor(maConn: AbstractMessageStream, init: AbstractStreamMuxerInit) {
		super();

		this.maConn = maConn;
		this.protocol = init.protocol;
		this.streams = [];
		this.earlyStreams = [];
		this.status = "open";
		this.log = maConn.log.newScope(init.name);
		this.streamOptions = init.streamOptions;
		this.maxEarlyStreams = init.maxEarlyStreams ?? 10;

		// read/write all data from/to underlying maConn
		const muxerMaConnOnMessage = (evt: StreamMessageEvent): void => {
			try {
				this.onData(evt.data);
			} catch (err: any) {
				this.abort(err);
				this.maConn.abort(err);
			}
		};
		this.maConn.addEventListener("message", muxerMaConnOnMessage);

		// signal stream writers when the underlying connection can accept more data
		const muxerMaConnOnDrain = (): void => {
			this.log(
				"underlying stream drained, signal %d streams to continue writing",
				this.streams.length,
			);

			this.streams.forEach((stream) => {
				stream.onMuxerDrain();
			});
		};
		this.maConn.addEventListener("drain", muxerMaConnOnDrain);

		const muxerOnMaConnClose = (): void => {
			this.log(
				"underlying stream closed with status %s and %d streams",
				this.status,
				this.streams.length,
			);
			this.onTransportClosed();
		};
		this.maConn.addEventListener("close", muxerOnMaConnClose);
	}

	send(data: Uint8Array | Uint8ArrayList): boolean {
		const result = this.maConn.send(data);

		if (result === false) {
			this.log(
				"underlying stream saturated, signal %d streams to pause writing",
				this.streams.length,
			);

			this.streams.forEach((stream) => {
				stream.onMuxerNeedsDrain();
			});
		}

		return result;
	}

	async close(options?: AbortOptions): Promise<void> {
		if (this.status === "closed" || this.status === "closing") {
			return;
		}

		this.status = "closing";

		await raceSignal(
			Promise.all(
				[...this.streams].map(async (s) => {
					await s.close(options);
				}),
			),
			options?.signal,
		);

		this.status = "closed";
	}

	abort(err: Error): void {
		if (this.status === "closed") {
			return;
		}

		this.status = "closing";

		[...this.streams].forEach((s) => {
			s.abort(err);
		});

		this.status = "closed";
	}

	onTransportClosed(err?: Error): void {
		this.status = "closing";

		try {
			[...this.streams].forEach((stream) => {
				stream.onTransportClosed(err);
			});
		} catch (err: any) {
			this.abort(err);
		}

		this.status = "closed";
	}

	async createStream(options?: CreateStreamOptions): Promise<MuxedStream> {
		if (this.status !== "open") {
			throw new Error("Muxer is not open");
		}

		let stream = this.onCreateStream({
			...this.streamOptions,
			...options,
		});

		if (stream instanceof Promise) {
			stream = await stream;
		}

		this.streams.push(stream);
		this.cleanUpStream(stream);

		return stream;
	}

	/**
	 * Extending classes should invoke this method when a new stream was created
	 * by the remote muxer
	 */
	onRemoteStream(stream: MuxedStream): void {
		this.streams.push(stream);
		this.cleanUpStream(stream);

		if (this.listenerCount("stream") === 0) {
			// no listener has been added for the stream event yet, store the stream
			// to emit it later
			this.earlyStreams.push(stream);

			if (this.earlyStreams.length > this.maxEarlyStreams) {
				this.abort(
					new Error(
						`Too many early streams were opened - ${this.earlyStreams.length}/${this.maxEarlyStreams}`,
					),
				);
			}

			return;
		}

		this.safeDispatchEvent("stream", {
			detail: stream,
		});
	}

	private cleanUpStream(stream: AbstractStream): void {
		const muxerOnStreamEnd = (evt: StreamCloseEvent): void => {
			const index = this.streams.findIndex((s) => s === stream);

			if (index !== -1) {
				this.streams.splice(index, 1);
			}
		};
		stream.addEventListener("close", muxerOnStreamEnd);
	}

	addEventListener(
		type: keyof StreamMuxerEvents<MuxedStream> | string,
		listener: any,
		options?: boolean | AddEventListenerOptions,
	): void {
		super.addEventListener(
			type as keyof StreamMuxerEvents<MuxedStream>,
			listener,
			options,
		);

		// if a 'stream' listener is being added and we have early streams, emit them
		if (type === "stream" && this.earlyStreams.length > 0) {
			queueMicrotask(() => {
				this.earlyStreams.forEach((stream) => {
					this.safeDispatchEvent("stream", {
						detail: stream,
					});
				});
				this.earlyStreams = [];
			});
		}
	}

	/**
	 * A new outgoing stream needs to be created
	 */
	abstract onCreateStream(
		options: CreateStreamOptions,
	): MuxedStream | Promise<MuxedStream>;

	/**
	 * Multiplexed data was received from the remote muxer
	 */
	abstract onData(data: Uint8Array | Uint8ArrayList): void;
}
