import type { EthereumClient } from "../../../client.ts";
import { RpcMethods, TxpoolRpcMethods } from "../types.ts";
import { content } from "./content.ts";

export const createTxPoolRpcMethods = (
	client: EthereumClient,
): RpcMethods<typeof TxpoolRpcMethods> => {
	return {
		txpool_content: content(client),
	};
};
