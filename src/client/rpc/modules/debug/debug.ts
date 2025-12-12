import type { EthereumClient } from "../../../client.ts";
import { DebugRpcMethods, RpcMethods } from "../types.ts";
import { getRawBlock } from "./get-raw-block.ts";
import { getRawHeader } from "./get-raw-header.ts";
import { getRawReceipts } from "./get-raw-receipts.ts";
import { getRawTransaction } from "./get-raw-transaction.ts";
import { setHead } from "./set-head.ts";
import { verbosity } from "./verbosity.ts";

export const createDebugRpcMethods = (
	client: EthereumClient,
): RpcMethods<typeof DebugRpcMethods> => {
	return {
		debug_getRawBlock: getRawBlock(client),
		debug_getRawHeader: getRawHeader(client),
		debug_getRawReceipts: getRawReceipts(client),
		debug_getRawTransaction: getRawTransaction(client),
		debug_setHead: setHead(client),
		debug_verbosity: verbosity(client),
	};
};
