import * as RLP from "../../../../../rlp";
import {
    BaseEthHandler,
    MessageType,
    type HandlerContext,
} from "./base-handler";

export class TransactionsHandler extends BaseEthHandler {
	readonly messageType = MessageType.ANNOUNCEMENT;
	readonly code = 0x02; // TRANSACTIONS
	readonly name = "TRANSACTIONS";

	async send(transactions: Uint8Array[], ctx: HandlerContext): Promise<void> {
		const encoded = RLP.encode(transactions as any);
		await ctx.connection.sendMessage(this.code, encoded);
	}

	async handle(
		data: Uint8Array,
		ctx: HandlerContext,
	): Promise<Uint8Array[]> {
		return RLP.decode(data) as Uint8Array[];
	}
}

