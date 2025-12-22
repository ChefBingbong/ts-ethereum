/**
 * Handler for NEW_BLOCK announcement (0x07)
 * Processes incoming NEW_BLOCK announcements
 */

import debug from "debug";
import {
	ETH_MESSAGES,
	EthMessageCode,
} from "../../../../client/net/protocol/eth/definitions";
import type { EthHandler } from "../handler";

const log = debug("p2p:eth:handlers:new-block");

/**
 * Handle NEW_BLOCK announcement
 * Payload is already decoded: [blockBytes, tdBytes]
 */
export function handleNewBlock(handler: EthHandler, payload: unknown): void {
	try {
		const decoded = ETH_MESSAGES[EthMessageCode.NEW_BLOCK].decode(payload, {
			chainCommon: handler.config.chainCommon,
		});
		const block = decoded[0];
		const td = decoded[1];
		handler.emit("message", {
			code: EthMessageCode.NEW_BLOCK,
			name: "NewBlock",
			data: [block, td],
		});
	} catch (error: unknown) {
		const err = error as Error;
		log("Error handling NEW_BLOCK: %s", err.message);
		handler.emit("error", err);
	}
}
