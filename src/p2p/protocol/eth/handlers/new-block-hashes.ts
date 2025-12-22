/**
 * Handler for NEW_BLOCK_HASHES announcement (0x01)
 * Processes incoming NEW_BLOCK_HASHES announcements
 */

import debug from "debug";
import {
	ETH_MESSAGES,
	EthMessageCode,
} from "../../../../client/net/protocol/eth/definitions";
import type { EthHandler } from "../handler";

const log = debug("p2p:eth:handlers:new-block-hashes");

/**
 * Handle NEW_BLOCK_HASHES announcement
 * Payload is already decoded: array of [hash, number]
 */
export function handleNewBlockHashes(
	handler: EthHandler,
	payload: unknown,
): void {
	try {
		const decoded =
			ETH_MESSAGES[EthMessageCode.NEW_BLOCK_HASHES].decode(payload);
		handler.emit("message", {
			code: EthMessageCode.NEW_BLOCK_HASHES,
			name: "NewBlockHashes",
			data: decoded,
		});
	} catch (error: unknown) {
		const err = error as Error;
		log("Error handling NEW_BLOCK_HASHES: %s", err.message);
		handler.emit("error", err);
	}
}
