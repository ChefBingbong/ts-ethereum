import type { EthereumClient } from "../../../client.ts";
import { content } from "./content.ts";

export const createTxPoolRpcMethods = (client: EthereumClient) => {
	return {
		txpool_content: content(client),
	};
};
