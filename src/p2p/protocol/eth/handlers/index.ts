/**
 * ETH Protocol Handlers
 *
 * Exports all message handlers and provides registration function
 */

import { EthMessageCode } from "../../../../client/net/protocol/eth/definitions";
import type { EthHandlerRegistry } from "../registry";

// Request handlers
import { handleGetBlockHeaders } from "./get-block-headers";
import { handleGetBlockBodies } from "./get-block-bodies";
import { handleGetReceipts } from "./get-receipts";
import { handleGetNodeData } from "./get-node-data";
import { handleGetPooledTransactions } from "./get-pooled-transactions";

// Response handlers
import { handleBlockHeaders } from "./block-headers";
import { handleBlockBodies } from "./block-bodies";
import { handleReceipts } from "./receipts";
import { handleNodeData } from "./node-data";
import { handlePooledTransactions } from "./pooled-transactions";

// Announcement handlers
import { handleNewBlockHashes } from "./new-block-hashes";
import { handleTransactions } from "./transactions";
import { handleNewBlock } from "./new-block";
import { handleNewPooledTransactionHashes } from "./new-pooled-transaction-hashes";

/**
 * Register all default handlers with the registry
 * This function is called by EthHandler during initialization
 */
export function registerDefaultHandlers(
	registry: EthHandlerRegistry,
): void {
	// Register request handlers
	registry.registerRequestHandler(
		EthMessageCode.GET_BLOCK_HEADERS,
		handleGetBlockHeaders,
	);
	registry.registerRequestHandler(
		EthMessageCode.GET_BLOCK_BODIES,
		handleGetBlockBodies,
	);
	registry.registerRequestHandler(
		EthMessageCode.GET_POOLED_TRANSACTIONS,
		handleGetPooledTransactions,
	);
	registry.registerRequestHandler(
		EthMessageCode.GET_RECEIPTS,
		handleGetReceipts,
	);
	registry.registerRequestHandler(
		EthMessageCode.GET_NODE_DATA,
		handleGetNodeData,
	);

	// Register response handlers
	registry.registerResponseHandler(
		EthMessageCode.BLOCK_HEADERS,
		handleBlockHeaders,
	);
	registry.registerResponseHandler(
		EthMessageCode.BLOCK_BODIES,
		handleBlockBodies,
	);
	registry.registerResponseHandler(
		EthMessageCode.POOLED_TRANSACTIONS,
		handlePooledTransactions,
	);
	registry.registerResponseHandler(EthMessageCode.RECEIPTS, handleReceipts);
	registry.registerResponseHandler(EthMessageCode.NODE_DATA, handleNodeData);

	// Register announcement handlers
	registry.registerAnnouncementHandler(
		EthMessageCode.NEW_BLOCK_HASHES,
		handleNewBlockHashes,
	);
	registry.registerAnnouncementHandler(
		EthMessageCode.TRANSACTIONS,
		handleTransactions,
	);
	registry.registerAnnouncementHandler(
		EthMessageCode.NEW_BLOCK,
		handleNewBlock,
	);
	registry.registerAnnouncementHandler(
		EthMessageCode.NEW_POOLED_TRANSACTION_HASHES,
		handleNewPooledTransactionHashes,
	);
}

// Export all handlers for direct access if needed
export {
	// Requests
	handleGetBlockHeaders,
	handleGetBlockBodies,
	handleGetReceipts,
	handleGetNodeData,
	handleGetPooledTransactions,
	// Responses
	handleBlockHeaders,
	handleBlockBodies,
	handleReceipts,
	handleNodeData,
	handlePooledTransactions,
	// Announcements
	handleNewBlockHashes,
	handleTransactions,
	handleNewBlock,
	handleNewPooledTransactionHashes,
};

