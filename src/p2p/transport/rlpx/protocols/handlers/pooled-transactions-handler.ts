import * as RLP from "../../../../../rlp";
import {
	BaseEthHandler,
	MessageType,
	type HandlerContext,
} from "./base-handler";

export interface GetPooledTransactionsRequest {
	reqId?: bigint;
	hashes: Uint8Array[];
}

export class PooledTransactionsHandler extends BaseEthHandler {
	readonly messageType = MessageType.REQUEST;
	readonly code = 0x09; // GET_POOLED_TRANSACTIONS
	readonly responseCode = 0x0a; // POOLED_TRANSACTIONS
	readonly name = "GET_POOLED_TRANSACTIONS";

	/**
	 * Send GET_POOLED_TRANSACTIONS and wait for POOLED_TRANSACTIONS response
	 * Returns [reqId, transactions] tuple for eth/66 compatibility
	 */
	async sendGetPooledTransactions(
		request: GetPooledTransactionsRequest,
		ctx: HandlerContext,
	): Promise<[bigint, Uint8Array[]]> {
		const reqId = request.reqId ?? BigInt(Date.now());
		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				cleanup();
				reject(
					new Error(
						`GET_POOLED_TRANSACTIONS timeout after ${this.timeout}ms`,
					),
				);
			}, this.timeout);

			// Listen for POOLED_TRANSACTIONS response
			const onMessage = ((evt: CustomEvent) => {
				const { code, data } = evt.detail;
				if (code === this.responseCode) {
					cleanup();
					// eth/66 format: [reqId, transactions]
					const decoded = RLP.decode(data) as any[];
					const responseReqId = typeof decoded[0] === 'bigint' ? decoded[0] : BigInt(decoded[0]);
					const txs = decoded[1] || [];
					// Match reqId to ensure we got the right response
					if (responseReqId === reqId) {
						resolve([reqId, txs]);
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
		request: GetPooledTransactionsRequest,
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
	): Promise<GetPooledTransactionsRequest> {
		// eth/66 format: [reqId, hashes]
		const decoded = RLP.decode(data) as any[];
		const reqId = decoded[0];
		const hashes = decoded[1] as Uint8Array[];
		return {
			reqId: typeof reqId === 'bigint' ? reqId : BigInt(reqId),
			hashes,
		};
	}

	// Send POOLED_TRANSACTIONS response
	// request should contain reqId from the original request
	async sendTransactions(
		transactions: Uint8Array[],
		ctx: HandlerContext,
		reqId?: bigint,
	): Promise<void> {
		if (reqId === undefined) {
			throw new Error("reqId required for POOLED_TRANSACTIONS response");
		}
		// eth/66 format: [reqId, transactions]
		const payload = [reqId, transactions];
		const encoded = RLP.encode(payload as any);
		await ctx.connection.sendMessage(this.responseCode, encoded);
	}
}

