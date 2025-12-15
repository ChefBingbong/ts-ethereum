import debug from 'debug';
import * as RLP from "../../../../../rlp";
import {
	BaseEthHandler,
	MessageType,
	type HandlerContext,
} from "./base-handler";

const log = debug('p2p:rlpx:handler:status');

export interface StatusPayload {
	protocolVersion: number;
	networkId: number | bigint;
	td: bigint;
	bestHash: Uint8Array;
	genesisHash: Uint8Array;
	forkID?: { hash: Uint8Array; next: number | bigint };
}

export class StatusHandler extends BaseEthHandler {
	readonly messageType = MessageType.HANDSHAKE;
	readonly code = 0x00; // Relative to ETH protocol offset
	readonly name = "STATUS";

	/**
	 * Send STATUS and wait for peer's STATUS response
	 */
	async sendGetStatus(
		payload: StatusPayload,
		ctx: HandlerContext,
	): Promise<StatusPayload> {
		log('📤 [sendGetStatus] Sending STATUS and waiting for response timeout=%dms', this.timeout);
		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				cleanup();
				log('❌ [sendGetStatus] STATUS handshake timeout after %dms', this.timeout);
				reject(new Error(`STATUS handshake timeout after ${this.timeout}ms`));
			}, this.timeout);

			// Listen for eth:status events which are dispatched by EthProtocolHandler
			// after it receives and decodes the STATUS message
			const onStatus = ((evt: CustomEvent) => {
				log('📥 [sendGetStatus] Received eth:status event');
				const status = evt.detail as StatusPayload;
				cleanup();
				log('✅ [sendGetStatus] STATUS response received: protocolVersion=%d networkId=%d td=%d', 
					status.protocolVersion, status.networkId, status.td);
				resolve(status);
			}) as EventListener;

			const cleanup = () => {
				clearTimeout(timeoutId);
				ctx.connection.removeEventListener("eth:status", onStatus);
			};

			// Set up listener BEFORE sending to avoid race condition
			ctx.connection.addEventListener("eth:status", onStatus);

			// Send our STATUS
			log('📤 [sendGetStatus] Sending STATUS message');
			this.send(payload, ctx);
		});
	}

	async send(payload: StatusPayload, ctx: HandlerContext): Promise<void> {
		log('📤 [send] Encoding and sending STATUS payload');
		const encoded = this.encode(payload);
		log('📤 [send] STATUS encoded size=%d, sending with code=0x%s', encoded.length, this.code.toString(16));
		await ctx.connection.sendMessage(this.code, encoded);
		log('✅ [send] STATUS message sent');
	}

	async handle(data: Uint8Array, ctx: HandlerContext): Promise<StatusPayload> {
		log('📥 [handle] Decoding STATUS message size=%d', data.length);
		const status = this.decode(data);
		log('✅ [handle] STATUS decoded: protocolVersion=%d networkId=%d td=%d', 
			status.protocolVersion, status.networkId, status.td);
		return status;
	}

	private encode(payload: StatusPayload): Uint8Array {
		const arr = [
			payload.protocolVersion,
			payload.networkId,
			payload.td,
			payload.bestHash,
			payload.genesisHash,
		];

		if (payload.forkID) {
			arr.push([payload.forkID.hash, payload.forkID.next] as any);
		}

		return RLP.encode(arr as any);
	}

	private decode(data: Uint8Array): StatusPayload {
		const decoded = RLP.decode(data) as any[];

		return {
			protocolVersion: decoded[0],
			networkId: decoded[1],
			td: decoded[2],
			bestHash: decoded[3],
			genesisHash: decoded[4],
			forkID: decoded[5]
				? { hash: decoded[5][0], next: decoded[5][1] }
				: undefined,
		};
	}
}

