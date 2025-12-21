/**
 * ETH Protocol Message Handlers
 *
 * Handlers for all ETH protocol message codes using protocol definitions.
 * These handlers process incoming messages and emit events for the service layer.
 *
 * Note: Payloads are already decoded by devp2p ETH protocol before reaching handlers.
 * The payload format matches the RLP-decoded structure from the protocol definitions.
 */

import debug from "debug";
import {
	ETH_MESSAGES,
	EthMessageCode,
} from "../../../client/net/protocol/eth/definitions";
import type { TypedTransaction } from "../../../tx";
import type { TxReceipt } from "../../../vm";
import type { EthHandler } from "./handler";

const log = debug("p2p:eth:messages");

/**
 * Handle GET_BLOCK_HEADERS request
 * Payload is already decoded by devp2p protocol: [reqId, [block, max, skip, reverse]]
 */
export async function handleGetBlockHeaders(
	handler: EthHandler,
	payload: any,
): Promise<void> {
	try {
		// Payload is already decoded: [reqId, [block, max, skip, reverse]]
		// Use protocol definitions to decode (handles both formats)
		const decoded =
			ETH_MESSAGES[EthMessageCode.GET_BLOCK_HEADERS].decode(payload);
		const { reqId, block, max, skip, reverse } = decoded;

		log(
			"GET_BLOCK_HEADERS: reqId=%d, block=%s, max=%d, skip=%d, reverse=%s",
			reqId,
			typeof block === "bigint" ? block.toString() : "hash",
			max,
			skip,
			reverse,
		);

		// Get headers from chain
		const headers = await handler.chain.getHeaders(block, max, skip, reverse);

		log("Sending %d headers in response to reqId=%d", headers.length, reqId);

		// Encode response using protocol definitions
		const responseData = ETH_MESSAGES[EthMessageCode.BLOCK_HEADERS].encode({
			reqId,
			headers,
		});

		// Send using handler's sendMessage (uses wire module internally)
		handler.sendMessage(EthMessageCode.BLOCK_HEADERS, responseData);
	} catch (error: any) {
		log("Error handling GET_BLOCK_HEADERS: %s", error.message);
		throw error;
	}
}

/**
 * Handle GET_BLOCK_BODIES request
 * Payload is already decoded: [reqId, hashes]
 */
export async function handleGetBlockBodies(
	handler: EthHandler,
	payload: any,
): Promise<void> {
	try {
		// Payload is already decoded: [reqId, hashes]
		const decoded =
			ETH_MESSAGES[EthMessageCode.GET_BLOCK_BODIES].decode(payload);
		const { reqId, hashes } = decoded;

		log("GET_BLOCK_BODIES: reqId=%d, hashes=%d", reqId, hashes.length);

		// Get blocks from chain
		const blocks = await Promise.all(
			hashes.map((hash) => handler.chain.getBlock(hash)),
		);

		// Extract bodies: [transactions, uncles]
		// Block.raw() returns [header, transactions, uncles]
		// BlockBodyBytes is [transactions, uncles] - slice(1) removes header
		const bodies = blocks.map((block) => block.raw().slice(1) as any);

		log("Sending %d bodies in response to reqId=%d", bodies.length, reqId);

		const responseData = ETH_MESSAGES[EthMessageCode.BLOCK_BODIES].encode({
			reqId,
			bodies,
		});

		// Send using handler's sendMessage (uses wire module internally)
		handler.sendMessage(EthMessageCode.BLOCK_BODIES, responseData);
	} catch (error: any) {
		log("Error handling GET_BLOCK_BODIES: %s", error.message);
		throw error;
	}
}

/**
 * Handle GET_RECEIPTS request
 * Payload is already decoded: [reqId, hashes]
 */
export async function handleGetReceipts(
	handler: EthHandler,
	payload: any,
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
				receipts.push((blockReceipts as any) || []);
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
			receipts: receipts as any, // Type compatibility
		});

		// Send using handler's sendMessage (uses wire module internally)
		handler.sendMessage(EthMessageCode.RECEIPTS, responseData);
	} catch (error: any) {
		log("Error handling GET_RECEIPTS: %s", error.message);
		throw error;
	}
}

/**
 * Handle GET_NODE_DATA request
 * Payload is already decoded: [reqId, hashes]
 */
export async function handleGetNodeData(
	handler: EthHandler,
	payload: any,
): Promise<void> {
	try {
		// Payload is already decoded: [reqId, hashes]
		const decoded = ETH_MESSAGES[EthMessageCode.GET_NODE_DATA].decode(payload);
		const { reqId, hashes } = decoded;

		log("GET_NODE_DATA: reqId=%d, hashes=%d", reqId, hashes.length);

		// Get node data from state manager
		// TODO: Implement node data retrieval from state manager
		// For now, return empty array
		const nodes: Uint8Array[] = [];

		log("Sending %d nodes in response to reqId=%d", nodes.length, reqId);

		const responseData = ETH_MESSAGES[EthMessageCode.NODE_DATA].encode({
			reqId,
			data: nodes,
		});

		// Send using handler's sendMessage (uses wire module internally)
		handler.sendMessage(EthMessageCode.NODE_DATA, responseData);
	} catch (error: any) {
		log("Error handling GET_NODE_DATA: %s", error.message);
		throw error;
	}
}

/**
 * Handle GET_POOLED_TRANSACTIONS request
 * Payload is already decoded: [reqId, hashes]
 */
export async function handleGetPooledTransactions(
	handler: EthHandler,
	payload: any,
): Promise<void> {
	try {
		// Payload is already decoded: [reqId, hashes]
		const decoded =
			ETH_MESSAGES[EthMessageCode.GET_POOLED_TRANSACTIONS].decode(payload);
		const { reqId, hashes } = decoded;

		log("GET_POOLED_TRANSACTIONS: reqId=%d, hashes=%d", reqId, hashes.length);

		// Get transactions from tx pool
		// Note: txPool is accessed via service, not config
		// For now, we'll need to access it through the service if available
		// This will be fixed when we integrate with P2PFullEthereumService
		const txs: TypedTransaction[] = [];
		// TODO: Access txPool from service when handler is integrated with service
		// For now, return empty array
		log("GET_POOLED_TRANSACTIONS: txPool not accessible from handler yet");

		log("Sending %d transactions in response to reqId=%d", txs.length, reqId);

		const responseData = ETH_MESSAGES[
			EthMessageCode.POOLED_TRANSACTIONS
		].encode({
			reqId,
			txs,
		});

		// Send using handler's sendMessage (uses wire module internally)
		handler.sendMessage(EthMessageCode.POOLED_TRANSACTIONS, responseData);
	} catch (error: any) {
		log("Error handling GET_POOLED_TRANSACTIONS: %s", error.message);
		throw error;
	}
}

/**
 * Handle NEW_BLOCK_HASHES announcement
 * Payload is already decoded: array of [hash, number]
 */
export function handleNewBlockHashes(handler: EthHandler, payload: any): void {
	try {
		const decoded =
			ETH_MESSAGES[EthMessageCode.NEW_BLOCK_HASHES].decode(payload);
		handler.emit("message", {
			code: EthMessageCode.NEW_BLOCK_HASHES,
			name: "NewBlockHashes",
			data: decoded,
		});
	} catch (error: any) {
		log("Error handling NEW_BLOCK_HASHES: %s", error.message);
		handler.emit("error", error);
	}
}

/**
 * Handle TRANSACTIONS announcement
 * Payload is already decoded: array of transaction bytes
 */
export function handleTransactions(handler: EthHandler, payload: any): void {
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
	} catch (error: any) {
		log("Error handling TRANSACTIONS: %s", error.message);
		handler.emit("error", error);
	}
}

/**
 * Handle NEW_BLOCK announcement
 * Payload is already decoded: [blockBytes, tdBytes]
 */
export function handleNewBlock(handler: EthHandler, payload: any): void {
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
	} catch (error: any) {
		log("Error handling NEW_BLOCK: %s", error.message);
		handler.emit("error", error);
	}
}

/**
 * Handle NEW_POOLED_TRANSACTION_HASHES announcement
 * Payload is already decoded: array or tuple format
 */
export function handleNewPooledTransactionHashes(
	handler: EthHandler,
	payload: any,
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
	} catch (error: any) {
		log("Error handling NEW_POOLED_TRANSACTION_HASHES: %s", error.message);
		handler.emit("error", error);
	}
}

/**
 * Handle BLOCK_HEADERS response
 * Payload is already decoded: [reqId, headers]
 */
export function handleBlockHeaders(handler: EthHandler, payload: any): void {
	try {
		const decoded = ETH_MESSAGES[EthMessageCode.BLOCK_HEADERS].decode(payload, {
			chainCommon: handler.config.chainCommon,
		}) as [bigint, any[]];
		const reqId = decoded[0] as bigint;
		const headers = decoded[1] as any[];

		log("BLOCK_HEADERS response: reqId=%d, headers=%d", reqId, headers.length);

		// Resolve pending request if exists
		const resolver = handler.resolvers.get(reqId);
		if (resolver) {
			clearTimeout(resolver.timeout);
			handler.resolvers.delete(reqId);
			resolver.resolve([reqId, headers]);
			log("Resolved GET_BLOCK_HEADERS request for reqId=%d", reqId);
		} else {
			// No pending request, emit as event for service layer
			handler.emit("message", {
				code: EthMessageCode.BLOCK_HEADERS,
				name: "BlockHeaders",
				data: { reqId, headers },
			});
		}
	} catch (error: any) {
		log("Error handling BLOCK_HEADERS: %s", error.message);
		handler.emit("error", error);
	}
}

/**
 * Handle BLOCK_BODIES response
 * Payload is already decoded: [reqId, bodies]
 */
export function handleBlockBodies(handler: EthHandler, payload: any): void {
	try {
		const decoded = ETH_MESSAGES[EthMessageCode.BLOCK_BODIES].decode(payload);
		const reqId = decoded[0] as bigint;
		const bodies = decoded[1] as any[];

		log("BLOCK_BODIES response: reqId=%d, bodies=%d", reqId, bodies.length);

		// Resolve pending request if exists
		const resolver = handler.resolvers.get(reqId);
		if (resolver) {
			clearTimeout(resolver.timeout);
			handler.resolvers.delete(reqId);
			resolver.resolve([reqId, bodies]);
			log("Resolved GET_BLOCK_BODIES request for reqId=%d", reqId);
		} else {
			// No pending request, emit as event for service layer
			handler.emit("message", {
				code: EthMessageCode.BLOCK_BODIES,
				name: "BlockBodies",
				data: { reqId, bodies },
			});
		}
	} catch (error: any) {
		log("Error handling BLOCK_BODIES: %s", error.message);
		handler.emit("error", error);
	}
}

/**
 * Handle POOLED_TRANSACTIONS response
 * Payload is already decoded: [reqId, txs]
 */
export function handlePooledTransactions(
	handler: EthHandler,
	payload: any,
): void {
	try {
		const decoded = ETH_MESSAGES[EthMessageCode.POOLED_TRANSACTIONS].decode(
			payload,
			{ chainCommon: handler.config.chainCommon },
		) as [bigint, any[]];
		const reqId = decoded[0] as bigint;
		const txs = decoded[1] as any[];

		log("POOLED_TRANSACTIONS response: reqId=%d, txs=%d", reqId, txs.length);

		// Resolve pending request if exists
		const resolver = handler.resolvers.get(reqId);
		if (resolver) {
			clearTimeout(resolver.timeout);
			handler.resolvers.delete(reqId);
			resolver.resolve([reqId, txs]);
			log("Resolved GET_POOLED_TRANSACTIONS request for reqId=%d", reqId);
		} else {
			// No pending request, emit as event for service layer
			handler.emit("message", {
				code: EthMessageCode.POOLED_TRANSACTIONS,
				name: "PooledTransactions",
				data: { reqId, txs },
			});
		}
	} catch (error: any) {
		log("Error handling POOLED_TRANSACTIONS: %s", error.message);
		handler.emit("error", error);
	}
}

/**
 * Handle NODE_DATA response
 * Payload is already decoded: [reqId, data]
 */
export function handleNodeData(handler: EthHandler, payload: any): void {
	try {
		const decoded = ETH_MESSAGES[EthMessageCode.NODE_DATA].decode(payload);
		const reqId = decoded[0] as bigint;
		const data = decoded[1] as Uint8Array[];

		log("NODE_DATA response: reqId=%d, nodes=%d", reqId, data.length);

		// Resolve pending request if exists
		const resolver = handler.resolvers.get(reqId);
		if (resolver) {
			clearTimeout(resolver.timeout);
			handler.resolvers.delete(reqId);
			resolver.resolve([reqId, data]);
			log("Resolved GET_NODE_DATA request for reqId=%d", reqId);
		} else {
			// No pending request, emit as event for service layer
			handler.emit("message", {
				code: EthMessageCode.NODE_DATA,
				name: "NodeData",
				data: { reqId, data },
			});
		}
	} catch (error: any) {
		log("Error handling NODE_DATA: %s", error.message);
		handler.emit("error", error);
	}
}

/**
 * Handle RECEIPTS response
 * Payload is already decoded: [reqId, receipts]
 */
export function handleReceipts(handler: EthHandler, payload: any): void {
	try {
		const decoded = ETH_MESSAGES[EthMessageCode.RECEIPTS].decode(payload);
		const reqId = decoded[0] as bigint;
		const receipts = decoded[1] as any[];

		log("RECEIPTS response: reqId=%d, receipts=%d", reqId, receipts.length);

		// Resolve pending request if exists
		const resolver = handler.resolvers.get(reqId);
		if (resolver) {
			clearTimeout(resolver.timeout);
			handler.resolvers.delete(reqId);
			resolver.resolve([reqId, receipts]);
			log("Resolved GET_RECEIPTS request for reqId=%d", reqId);
		} else {
			// No pending request, emit as event for service layer
			handler.emit("message", {
				code: EthMessageCode.RECEIPTS,
				name: "Receipts",
				data: { reqId, receipts },
			});
		}
	} catch (error: any) {
		log("Error handling RECEIPTS: %s", error.message);
		handler.emit("error", error);
	}
}

/**
 * Register all default handlers with the registry
 * This function is called by EthHandler during initialization
 */
export function registerDefaultHandlers(
	registry: import("./registry").EthHandlerRegistry,
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
