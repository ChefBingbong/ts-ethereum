import { EthereumClient } from "../../client";
import { createRpcHandler } from "../validation";
import { createAdminRpcMethods } from "./admin/admin";
import { createDebugRpcMethods } from "./debug/debug";
import { createEthRpcMethods } from "./eth/eth";
import { createNetRpcMethods } from "./net/net";
import { createTxPoolRpcMethods } from "./txpool/txpool";
import { createWeb3RpcMethods } from "./web3/web3";

export const list = ["Eth", "Web3", "Net", "Admin", "TxPool", "Debug"];

// New functional module exports
export * from "./admin";
export * from "./debug";
// Backward compatibility: export old class-based modules
export * from "./eth";
export * from "./net";
export * from "./txpool";
export * from "./web3";

export const createRpcHandlers = (client: EthereumClient, debug: boolean) => {
	const methods = {
		...createAdminRpcMethods(client),
		...createEthRpcMethods(client),
		...createNetRpcMethods(client),
		...createTxPoolRpcMethods(client),
		...createWeb3RpcMethods(client),
		...createDebugRpcMethods(client),
	};
	return {
		rpcHandlers: createRpcHandler(methods, { debug }),
		methods: Object.keys(methods),
	};
};
