/**
 * Handler for NEW_POOLED_TRANSACTION_HASHES announcement (0x08)
 * Processes incoming NEW_POOLED_TRANSACTION_HASHES announcements
 */

import debug from "debug";
import {
	ETH_MESSAGES,
	EthMessageCode,
} from "../../../../client/net/protocol/eth/definitions";
import type { EthHandler } from "../handler";

const log = debug("p2p:eth:handlers:new-pooled-transaction-hashes");

/**
 * Handle NEW_POOLED_TRANSACTION_HASHES announcement
 * Payload is already decoded: array or tuple format
 */
export function handleNewPooledTransactionHashes(
	handler: EthHandler,
	payload: unknown,
): void {
	try {
		const decoded =
			ETH_MESSAGES[EthMessageCode.NEW_POOLED_TRANSACTION_HASHES].decode(
				payload,
			);
		handler.emit("message", {
			code: EthMessageCode.NEW_POOLED_TRANSACTION_HASHES,
			name: "NewPooledTransactionHashes",
			data: decoded,
		});
	} catch (error: unknown) {
		const err = error as Error;
		log("Error handling NEW_POOLED_TRANSACTION_HASHES: %s", err.message);
		handler.emit("error", err);
	}
}
