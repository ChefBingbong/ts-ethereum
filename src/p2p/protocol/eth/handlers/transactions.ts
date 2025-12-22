/**
 * Handler for TRANSACTIONS announcement (0x02)
 * Processes incoming TRANSACTIONS announcements
 */

import debug from "debug";
import {
	ETH_MESSAGES,
	EthMessageCode,
} from "../../../../client/net/protocol/eth/definitions";
import type { EthHandler } from "../handler";

const log = debug("p2p:eth:handlers:transactions");

/**
 * Handle TRANSACTIONS announcement
 * Payload is already decoded: array of transaction bytes
 */
export function handleTransactions(
	handler: EthHandler,
	payload: unknown,
): void {
	try {
		const decoded = ETH_MESSAGES[EthMessageCode.TRANSACTIONS].decode(payload, {
			chainCommon: handler.config.chainCommon,
			synchronized: handler.isReady,
		});
		handler.emit("message", {
			code: EthMessageCode.TRANSACTIONS,
			name: "Transactions",
			data: decoded,
		});
	} catch (error: unknown) {
		const err = error as Error;
		log("Error handling TRANSACTIONS: %s", err.message);
		handler.emit("error", err);
	}
}
