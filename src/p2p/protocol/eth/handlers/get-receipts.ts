/**
 * Handler for GET_RECEIPTS request (0x0f)
 * Processes incoming GET_RECEIPTS requests and sends RECEIPTS response
 */

import debug from "debug";
import {
	ETH_MESSAGES,
	EthMessageCode,
} from "../../../../client/net/protocol/eth/definitions";
import type { TxReceipt } from "../../../../../vm";
import type { EthHandler } from "../handler";

const log = debug("p2p:eth:handlers:get-receipts");

/**
 * Handle GET_RECEIPTS request
 * Payload is already decoded: [reqId, hashes]
 */
export async function handleGetReceipts(
	handler: EthHandler,
	payload: unknown,
): Promise<void> {
	try {
		// Payload is already decoded: [reqId, hashes]
		const decoded = ETH_MESSAGES[EthMessageCode.GET_RECEIPTS].decode(payload);
		const { reqId, hashes } = decoded;

		log("GET_RECEIPTS: reqId=%d, hashes=%d", reqId, hashes.length);

		// Get receipts from execution receiptsManager
		const receipts: TxReceipt[][] = [];
		for (const hash of hashes) {
			if (handler.execution.receiptsManager) {
				const blockReceipts =
					await handler.execution.receiptsManager.getReceipts(
						hash,
						false,
						true, // includeTxType for encoding
					);
				receipts.push((blockReceipts as unknown) || []);
			} else {
				receipts.push([]);
			}
		}

		log(
			"Sending %d receipt sets in response to reqId=%d",
			receipts.length,
			reqId,
		);

		const responseData = ETH_MESSAGES[EthMessageCode.RECEIPTS].encode({
			reqId,
			receipts: receipts as unknown, // Type compatibility
		});

		// Send using handler's sendMessage
		handler.sendMessage(EthMessageCode.RECEIPTS, responseData);
	} catch (error: unknown) {
		const err = error as Error;
		log("Error handling GET_RECEIPTS: %s", err.message);
		throw error;
	}
}

