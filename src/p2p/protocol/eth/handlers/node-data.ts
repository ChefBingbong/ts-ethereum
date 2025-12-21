/**
 * Handler for NODE_DATA response (0x0e)
 * Processes incoming NODE_DATA responses to GET_NODE_DATA requests
 */

import debug from "debug";
import {
	ETH_MESSAGES,
	EthMessageCode,
} from "../../../../client/net/protocol/eth/definitions";
import type { EthHandler } from "../handler";

const log = debug("p2p:eth:handlers:node-data");

/**
 * Handle NODE_DATA response
 * Payload is already decoded: [reqId, data]
 */
export function handleNodeData(handler: EthHandler, payload: unknown): void {
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
	} catch (error: unknown) {
		const err = error as Error;
		log("Error handling NODE_DATA: %s", err.message);
		handler.emit("error", err);
	}
}

