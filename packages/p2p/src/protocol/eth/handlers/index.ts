/**
 * ETH Protocol Handlers
 *
 * Exports all message handlers and provides registration function
 */

import { EthMessageCode } from "../../../../client/net/protocol/eth/definitions";
import type { EthHandlerRegistry } from "../registry";
import { handleBlockBodies } from "./block-bodies";
// Response handlers
import { handleBlockHeaders } from "./block-headers";
import { handleGetBlockBodies } from "./get-block-bodies";
// Request handlers
import { handleGetBlockHeaders } from "./get-block-headers";
import { handleGetNodeData } from "./get-node-data";
import { handleGetPooledTransactions } from "./get-pooled-transactions";
import { handleGetReceipts } from "./get-receipts";
import { handleNewBlock } from "./new-block";
// Announcement handlers
import { handleNewBlockHashes } from "./new-block-hashes";
import { handleNewPooledTransactionHashes } from "./new-pooled-transaction-hashes";
import { handleNodeData } from "./node-data";
import { handlePooledTransactions } from "./pooled-transactions";
import { handleReceipts } from "./receipts";
import { handleTransactions } from "./transactions";

/**
 * Register all default handlers with the registry
 * This function is called by EthHandler during initialization
 */
export function registerDefaultHandlers(registry: EthHandlerRegistry): void {
	// Register request handlers
	registry.registerProtocolHandler(
		EthMessageCode.GET_BLOCK_HEADERS,
		handleGetBlockHeaders,
	);
	registry.registerProtocolHandler(
		EthMessageCode.GET_BLOCK_BODIES,
		handleGetBlockBodies,
	);
	registry.registerProtocolHandler(
		EthMessageCode.GET_POOLED_TRANSACTIONS,
		handleGetPooledTransactions,
	);
	registry.registerProtocolHandler(
		EthMessageCode.GET_RECEIPTS,
		handleGetReceipts,
	);
	registry.registerProtocolHandler(
		EthMessageCode.GET_NODE_DATA,
		handleGetNodeData,
	);

	// Register response handlers
	registry.registerProtocolHandler(
		EthMessageCode.BLOCK_HEADERS,
		handleBlockHeaders,
	);
	registry.registerProtocolHandler(
		EthMessageCode.BLOCK_BODIES,
		handleBlockBodies,
	);
	registry.registerProtocolHandler(
		EthMessageCode.POOLED_TRANSACTIONS,
		handlePooledTransactions,
	);
	registry.registerProtocolHandler(EthMessageCode.RECEIPTS, handleReceipts);
	registry.registerProtocolHandler(EthMessageCode.NODE_DATA, handleNodeData);

	// Register announcement handlers
	registry.registerProtocolHandler(
		EthMessageCode.NEW_BLOCK_HASHES,
		handleNewBlockHashes,
	);
	registry.registerProtocolHandler(
		EthMessageCode.TRANSACTIONS,
		handleTransactions,
	);
	registry.registerProtocolHandler(EthMessageCode.NEW_BLOCK, handleNewBlock);
	registry.registerProtocolHandler(
		EthMessageCode.NEW_POOLED_TRANSACTION_HASHES,
		handleNewPooledTransactionHashes,
	);
}

// Export all handlers for direct access if needed
export {
	handleBlockBodies,
	// Responses
	handleBlockHeaders,
	handleGetBlockBodies,
	// Requests
	handleGetBlockHeaders,
	handleGetNodeData,
	handleGetPooledTransactions,
	handleGetReceipts,
	handleNewBlock,
	// Announcements
	handleNewBlockHashes,
	handleNewPooledTransactionHashes,
	handleNodeData,
	handlePooledTransactions,
	handleReceipts,
	handleTransactions,
};
