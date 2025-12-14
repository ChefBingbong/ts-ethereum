import * as RLP from "../../../../../rlp";
import {
	BaseEthHandler,
	MessageType,
	type HandlerContext,
} from "./base-handler";

export interface GetBlockHeadersRequest {
	reqId?: bigint;
	startBlock: number | bigint | Uint8Array;
	maxHeaders: number;
	skip: number;
	reverse: boolean;
}

export class BlockHeadersHandler extends BaseEthHandler {
	readonly messageType = MessageType.REQUEST;
	readonly code = 0x03; // GET_BLOCK_HEADERS
	readonly responseCode = 0x04; // BLOCK_HEADERS
	readonly name = "GET_BLOCK_HEADERS";

	/**
	 * Send GET_BLOCK_HEADERS and wait for BLOCK_HEADERS response
	 * Returns [reqId, headers] tuple for eth/66 compatibility
	 */
	async sendGetHeaders(
		request: GetBlockHeadersRequest,
		ctx: HandlerContext,
	): Promise<[bigint, any[]]> {
		const reqId = request.reqId ?? BigInt(Date.now());
		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				cleanup();
				reject(
					new Error(`GET_BLOCK_HEADERS timeout after ${this.timeout}ms`),
				);
			}, this.timeout);

			// Listen for BLOCK_HEADERS response
			const onMessage = ((evt: CustomEvent) => {
				const { code, data } = evt.detail;
				if (code === this.responseCode) {
					cleanup();
					// eth/66 format: [reqId, headers]
					const decoded = RLP.decode(data) as any[];
					const responseReqId = typeof decoded[0] === 'bigint' ? decoded[0] : BigInt(decoded[0]);
					const headers = decoded[1] || [];
					// Match reqId to ensure we got the right response
					if (responseReqId === reqId) {
						resolve([reqId, headers]);
					}
				}
			}) as EventListener;

			const cleanup = () => {
				clearTimeout(timeoutId);
				ctx.connection.removeEventListener("message", onMessage);
			};

			ctx.connection.addEventListener("message", onMessage);

			// Send request with reqId
			this.send({ ...request, reqId }, ctx);
		});
	}

	async send(
		request: GetBlockHeadersRequest,
		ctx: HandlerContext,
	): Promise<void> {
		// eth/66 format: [reqId, [block, max, skip, reverse]]
		const reqId = request.reqId ?? BigInt(Date.now());
		const payload = [
			reqId,
			[
				request.startBlock,
				request.maxHeaders,
				request.skip,
				request.reverse ? 1 : 0,
			],
		];
		const encoded = RLP.encode(payload as any);
		await ctx.connection.sendMessage(this.code, encoded);
	}

	async handle(
		data: Uint8Array,
		ctx: HandlerContext,
	): Promise<GetBlockHeadersRequest> {
		// eth/66 format: [reqId, [block, max, skip, reverse]]
		const decoded = RLP.decode(data) as any[];
		const reqId = decoded[0];
		const [block, max, skip, reverse] = decoded[1];
		return {
			reqId: typeof reqId === 'bigint' ? reqId : BigInt(reqId),
			startBlock: block,
			maxHeaders: max,
			skip: skip,
			reverse: reverse === 1,
		};
	}

	// Send BLOCK_HEADERS response
	// request should contain reqId from the original request
	async sendHeaders(headers: any[], ctx: HandlerContext, reqId?: bigint): Promise<void> {
		if (reqId === undefined) {
			throw new Error("reqId required for BLOCK_HEADERS response");
		}
		// eth/66 format: [reqId, headers]
		const payload = [reqId, headers];
		const encoded = RLP.encode(payload as any);
		await ctx.connection.sendMessage(this.responseCode, encoded);
	}
}

