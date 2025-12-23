import * as varint from "uint8-varint";
import { Uint8ArrayList } from "uint8arraylist";
import { AbortOptions } from "../connection/types";
import { AbstractMessageStream } from "../stream/default-message-stream";

export interface LengthPrefixedStreamOptions {
	maxDataLength?: number;
	maxLengthLength?: number;
}

/**
 * A simple length-prefixed stream wrapper that handles varint-prefixed messages
 */
export class LengthPrefixedStream {
	private readonly stream: AbstractMessageStream;
	private readonly maxDataLength: number;
	private readonly maxLengthLength: number;
	private buffer: Uint8ArrayList;
	private unwrapped: boolean = false;

	constructor(
		stream: AbstractMessageStream,
		options: LengthPrefixedStreamOptions = {},
	) {
		this.stream = stream;
		this.maxDataLength = options.maxDataLength ?? 1024 * 1024; // 1MB default
		this.maxLengthLength = options.maxLengthLength ?? 4;
		this.buffer = new Uint8ArrayList();
	}

	/**
	 * Read a length-prefixed message from the stream
	 */
	async read(options?: AbortOptions): Promise<Uint8ArrayList> {
		// Keep reading until we have a complete message
		while (true) {
			// Try to decode a message from the buffer
			const result = this.tryDecode();
			if (result !== null) {
				return result;
			}

			// Need more data - wait for message event
			const data = await this.waitForData(options);
			this.buffer.append(data);
		}
	}

	/**
	 * Write a length-prefixed message to the stream
	 */
	async write(
		data: Uint8Array | Uint8ArrayList,
		options?: AbortOptions,
	): Promise<void> {
		options?.signal?.throwIfAborted();

		const length =
			data instanceof Uint8ArrayList ? data.byteLength : data.length;
		const lengthBytes = varint.encode(length);
		const message = new Uint8ArrayList(lengthBytes, data);

		this.stream.send(message);
	}

	/**
	 * Write multiple messages as a vector (each individually length-prefixed)
	 */
	async writeV(
		messages: Array<Uint8Array | Uint8ArrayList>,
		options?: AbortOptions,
	): Promise<void> {
		options?.signal?.throwIfAborted();

		const output = new Uint8ArrayList();
		for (const msg of messages) {
			const length =
				msg instanceof Uint8ArrayList ? msg.byteLength : msg.length;
			output.append(varint.encode(length));
			output.append(msg);
		}

		this.stream.send(output);
	}

	/**
	 * Stop using length-prefixed mode - push any remaining buffered data back
	 */
	unwrap(): void {
		if (this.unwrapped) return;
		this.unwrapped = true;

		if (this.buffer.byteLength > 0) {
			this.stream.unshift(this.buffer);
			this.buffer = new Uint8ArrayList();
		}
	}

	private tryDecode(): Uint8ArrayList | null {
		if (this.buffer.byteLength === 0) {
			return null;
		}

		try {
			// Try to read the varint length prefix
			let offset = 0;
			let length = 0;
			let shift = 0;

			while (offset < this.buffer.byteLength && offset < this.maxLengthLength) {
				const byte = this.buffer.get(offset);
				length |= (byte & 0x7f) << shift;

				if ((byte & 0x80) === 0) {
					// Complete varint
					offset++;
					break;
				}

				shift += 7;
				offset++;

				if (offset >= this.maxLengthLength) {
					throw new Error(
						`Varint too long (max ${this.maxLengthLength} bytes)`,
					);
				}
			}

			// Check if we have the full length prefix
			if (offset > this.buffer.byteLength) {
				return null;
			}

			if (length > this.maxDataLength) {
				throw new Error(
					`Message length ${length} exceeds max ${this.maxDataLength}`,
				);
			}

			// Check if we have the full message
			if (this.buffer.byteLength < offset + length) {
				return null;
			}

			// Extract the message
			const message = this.buffer.sublist(offset, offset + length);
			this.buffer.consume(offset + length);

			return message;
		} catch (err) {
			// Not enough data yet
			return null;
		}
	}

	private async waitForData(
		options?: AbortOptions,
	): Promise<Uint8Array | Uint8ArrayList> {
		return new Promise((resolve, reject) => {
			const cleanup = (): void => {
				this.stream.removeEventListener("message", onMessage);
				this.stream.removeEventListener("close", onClose);
				options?.signal?.removeEventListener("abort", onAbort);
			};

			const onMessage = (evt: any): void => {
				cleanup();
				resolve(evt.data);
			};

			const onClose = (evt: any): void => {
				cleanup();
				reject(evt.error ?? new Error("Stream closed"));
			};

			const onAbort = (): void => {
				cleanup();
				reject(options?.signal?.reason ?? new Error("Aborted"));
			};

			this.stream.addEventListener("message", onMessage);
			this.stream.addEventListener("close", onClose);
			options?.signal?.addEventListener("abort", onAbort);
		});
	}
}

export function lpStream(
	stream: AbstractMessageStream,
	options?: LengthPrefixedStreamOptions,
): LengthPrefixedStream {
	return new LengthPrefixedStream(stream, options);
}

/**
 * Encode a single value with a varint length prefix
 */
export function encodeSingle(data: Uint8Array): Uint8ArrayList {
	const lengthBytes = varint.encode(data.length);
	return new Uint8ArrayList(lengthBytes, data);
}

export const encode = {
	single: encodeSingle,
};
