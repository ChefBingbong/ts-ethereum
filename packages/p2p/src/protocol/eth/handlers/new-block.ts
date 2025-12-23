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
import { handleNewBlock as handleNewBlockExec } from "../../../../client/net/protocol/eth/handlers.ts";

const log = debug("p2p:eth:handlers:new-block");

/**
 * Handle NEW_BLOCK announcement
 * Payload is already decoded: [blockBytes, tdBytes]
 */
export async function handleNewBlock(
	handler: EthHandler,
	payload: unknown,
): Promise<void> {
	try {
		const decoded = ETH_MESSAGES[EthMessageCode.NEW_BLOCK].decode(payload, {
			chainCommon: handler.config.chainCommon,
		});
		const block = decoded[0];
		const td = decoded[1];

		// If context is available, call execution handler directly
		if (handler.context) {
			const peer = handler.findPeer();
			if (peer) {
				await handleNewBlockExec([block, td], peer, handler.context);
				return;
			}
		}

		// Otherwise emit event for backward compatibility
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
