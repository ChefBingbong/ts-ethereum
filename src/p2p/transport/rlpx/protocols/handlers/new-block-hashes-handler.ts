import * as RLP from "../../../../../rlp";
import {
    BaseEthHandler,
    MessageType,
    type HandlerContext,
} from "./base-handler";

export interface BlockHash {
	hash: Uint8Array;
	number: number | bigint;
}

export class NewBlockHashesHandler extends BaseEthHandler {
	readonly messageType = MessageType.ANNOUNCEMENT;
	readonly code = 0x01; // NEW_BLOCK_HASHES
	readonly name = "NEW_BLOCK_HASHES";

	async send(hashes: BlockHash[], ctx: HandlerContext): Promise<void> {
		const payload = hashes.map((h) => [h.hash, h.number]);
		const encoded = RLP.encode(payload as any);
		await ctx.connection.sendMessage(this.code, encoded);
	}

	async handle(data: Uint8Array, ctx: HandlerContext): Promise<BlockHash[]> {
		const decoded = RLP.decode(data) as any[];
		return decoded.map((item) => ({
			hash: item[0],
			number: item[1],
		}));
	}
}

