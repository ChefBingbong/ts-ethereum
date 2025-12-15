import * as RLP from "../../../../../rlp";
import { bigIntToUnpaddedBytes } from "../../../../../utils";
import {
	BaseEthHandler,
	MessageType,
	type HandlerContext,
} from "./base-handler";

export interface NewBlockPayload {
	block: any; // Block data
	td: bigint; // Total difficulty
}

export class NewBlockHandler extends BaseEthHandler {
	readonly messageType = MessageType.ANNOUNCEMENT;
	readonly code = 0x07; // NEW_BLOCK
	readonly name = "NEW_BLOCK";

	async send(payload: NewBlockPayload, ctx: HandlerContext): Promise<void> {
		if (!ctx.connection) {
			throw new Error("Cannot send NEW_BLOCK: connection is undefined");
		}
		
		// Block should be raw bytes array format [header, transactions, uncles]
		// If it's a Block object, get raw() which returns BlockBytes
		let blockBytes: any;
		if (payload.block && typeof payload.block.raw === 'function') {
			// It's a Block object, get raw bytes array [header, transactions, uncles]
			blockBytes = payload.block.raw();
		} else if (Array.isArray(payload.block)) {
			// Already raw bytes array format
			blockBytes = payload.block;
		} else {
			throw new Error("Invalid block format for NEW_BLOCK message");
		}
		
		// NEW_BLOCK format: [block, td]
		// block is BlockBytes array [header, transactions, uncles], td is converted to bytes
		const tdBytes = bigIntToUnpaddedBytes(payload.td);
		const encoded = RLP.encode([blockBytes, tdBytes] as any);
		await ctx.connection.sendMessage(this.code, encoded);
	}

	async handle(
		data: Uint8Array,
		ctx: HandlerContext,
	): Promise<NewBlockPayload> {
		const decoded = RLP.decode(data) as any[];
		return {
			block: decoded[0],
			td: decoded[1],
		};
	}
}

