import * as RLP from "../../../../../rlp";
import {
	BaseEthHandler,
	MessageType,
	type HandlerContext,
} from "./base-handler";

export interface GetBlockBodiesRequest {
	reqId?: bigint;
	hashes: Uint8Array[];
}

export class BlockBodiesHandler extends BaseEthHandler {
	readonly messageType = MessageType.REQUEST;
	readonly code = 0x05; // GET_BLOCK_BODIES
	readonly responseCode = 0x06; // BLOCK_BODIES
	readonly name = "GET_BLOCK_BODIES";

	/**
	 * Send GET_BLOCK_BODIES and wait for BLOCK_BODIES response
	 * Returns [reqId, bodies] tuple for eth/66 compatibility
	 */
	async sendGetBodies(
		request: GetBlockBodiesRequest,
		ctx: HandlerContext,
	): Promise<[bigint, any[]]> {
		const reqId = request.reqId ?? BigInt(Date.now());
		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				cleanup();
				reject(new Error(`GET_BLOCK_BODIES timeout after ${this.timeout}ms`));
			}, this.timeout);

			// Listen for BLOCK_BODIES response
			const onMessage = ((evt: CustomEvent) => {
				const { code, data } = evt.detail;
				if (code === this.responseCode) {
					cleanup();
					// eth/66 format: [reqId, bodies]
					const decoded = RLP.decode(data) as any[];
					const responseReqId = typeof decoded[0] === 'bigint' ? decoded[0] : BigInt(decoded[0]);
					const bodies = decoded[1] || [];
					// Match reqId to ensure we got the right response
					if (responseReqId === reqId) {
						resolve([reqId, bodies]);
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
		request: GetBlockBodiesRequest,
		ctx: HandlerContext,
	): Promise<void> {
		// eth/66 format: [reqId, hashes]
		const reqId = request.reqId ?? BigInt(Date.now());
		const payload = [reqId, request.hashes];
		const encoded = RLP.encode(payload as any);
		await ctx.connection.sendMessage(this.code, encoded);
	}

	async handle(
		data: Uint8Array,
		ctx: HandlerContext,
	): Promise<GetBlockBodiesRequest> {
		// eth/66 format: [reqId, hashes]
		const decoded = RLP.decode(data) as any[];
		const reqId = decoded[0];
		const hashes = decoded[1] as Uint8Array[];
		return {
			reqId: typeof reqId === 'bigint' ? reqId : BigInt(reqId),
			hashes,
		};
	}

	// Send BLOCK_BODIES response
	// request should contain reqId from the original request
	async sendBodies(bodies: any[], ctx: HandlerContext, reqId?: bigint): Promise<void> {
		if (reqId === undefined) {
			throw new Error("reqId required for BLOCK_BODIES response");
		}
		// eth/66 format: [reqId, bodies]
		const payload = [reqId, bodies];
		const encoded = RLP.encode(payload as any);
		await ctx.connection.sendMessage(this.responseCode, encoded);
	}
}

