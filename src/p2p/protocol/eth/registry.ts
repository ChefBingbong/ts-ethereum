/**
 * ETH Protocol Handler Registry
 *
 * Manages registration and routing of request/response handlers for ETH protocol messages.
 * Similar to libp2p's handler registration pattern but adapted for RLPxConnection.
 */

import debug from "debug";
import { EthMessageCode } from "../../../client/net/protocol/eth/definitions";
import type { EthHandler } from "./handler";

const log = debug("p2p:eth:registry");

/**
 * Handler function type for processing incoming messages
 */
export type MessageHandler = (
	handler: EthHandler,
	payload: any,
) => Promise<void> | void;

/**
 * Registry for ETH protocol message handlers
 */
export class EthHandlerRegistry {
	private requestHandlers: Map<EthMessageCode, MessageHandler> = new Map();
	private responseHandlers: Map<EthMessageCode, MessageHandler> = new Map();
	private announcementHandlers: Map<EthMessageCode, MessageHandler> = new Map();

	/**
	 * Register a handler for an incoming request message
	 * Request handlers process incoming requests and send responses
	 */
	registerRequestHandler(code: EthMessageCode, handler: MessageHandler): void {
		if (this.requestHandlers.has(code)) {
			log("Overwriting existing request handler for code: 0x%02x", code);
		}
		this.requestHandlers.set(code, handler);
		log("Registered request handler for code: 0x%02x", code);
	}

	/**
	 * Register a handler for an incoming response message
	 * Response handlers process responses to outgoing requests
	 */
	registerResponseHandler(code: EthMessageCode, handler: MessageHandler): void {
		if (this.responseHandlers.has(code)) {
			log("Overwriting existing response handler for code: 0x%02x", code);
		}
		this.responseHandlers.set(code, handler);
		log("Registered response handler for code: 0x%02x", code);
	}

	/**
	 * Register a handler for an announcement message
	 * Announcement handlers process broadcast messages (no response expected)
	 */
	registerAnnouncementHandler(
		code: EthMessageCode,
		handler: MessageHandler,
	): void {
		if (this.announcementHandlers.has(code)) {
			log("Overwriting existing announcement handler for code: 0x%02x", code);
		}
		this.announcementHandlers.set(code, handler);
		log("Registered announcement handler for code: 0x%02x", code);
	}

	/**
	 * Get handler for a message code
	 * Checks request handlers, response handlers, and announcement handlers in order
	 */
	getHandler(code: EthMessageCode): MessageHandler | undefined {
		return (
			this.requestHandlers.get(code) ||
			this.responseHandlers.get(code) ||
			this.announcementHandlers.get(code)
		);
	}

	/**
	 * Check if a handler is registered for a message code
	 */
	hasHandler(code: EthMessageCode): boolean {
		return (
			this.requestHandlers.has(code) ||
			this.responseHandlers.has(code) ||
			this.announcementHandlers.has(code)
		);
	}

	/**
	 * Unregister a handler for a message code
	 */
	unregisterHandler(code: EthMessageCode): void {
		this.requestHandlers.delete(code);
		this.responseHandlers.delete(code);
		this.announcementHandlers.delete(code);
		log("Unregistered handler for code: 0x%02x", code);
	}

	/**
	 * Clear all registered handlers
	 */
	clear(): void {
		this.requestHandlers.clear();
		this.responseHandlers.clear();
		this.announcementHandlers.clear();
		log("Cleared all handlers");
	}
}
