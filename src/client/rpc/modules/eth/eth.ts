import type { EthereumClient } from "../../../client.ts";
import { EthRpcMethods, RpcMethods } from "../types.ts";
import { blockNumber } from "./block-number.ts";
import { chainId } from "./chain-id.ts";
import { coinbase } from "./coinbase.ts";
import { estimateGas } from "./estimate-gas.ts";
import { gasPrice } from "./gas-price.ts";
import { getBalance } from "./get-balance.ts";
import { getBlockByHash } from "./get-block-by-hash.ts";
import { getBlockByNumber } from "./get-block-by-number.ts";
import { getBlockReceipts } from "./get-block-receipts.ts";
import { getBlockTransactionCountByHash } from "./get-block-transaction-count-by-hash.ts";
import { getBlockTransactionCountByNumber } from "./get-block-transaction-count-by-number.ts";
import { getProof } from "./get-proof.ts";
import { getTransactionByBlockHashAndIndex } from "./get-transaction-by-block-hash-and-index.ts";
import { getTransactionByBlockNumberAndIndex } from "./get-transaction-by-block-number-and-index.ts";
import { getTransactionByHash } from "./get-transaction-by-hash.ts";
import { getTransactionCount } from "./get-transaction-count.ts";
import { getTransactionReceipt } from "./get-transaction-receipt.ts";
import { getUncleCountByBlockNumber } from "./get-uncle-count-by-block-number.ts";
import { protocolVersion } from "./protocol-version.ts";
import { sendRawTransaction } from "./send-raw-transaction.ts";
import { syncing } from "./syncing.ts";

export const createEthRpcMethods = (
	client: EthereumClient,
): RpcMethods<typeof EthRpcMethods> => {
	return {
		eth_blockNumber: blockNumber(client),
		eth_chainId: chainId(client),
		eth_coinbase: coinbase(client),
		eth_estimateGas: estimateGas(client),
		eth_gasPrice: gasPrice(client),
		eth_getBalance: getBalance(client),
		eth_getBlockByHash: getBlockByHash(client),
		eth_getBlockByNumber: getBlockByNumber(client),
		eth_getBlockReceipts: getBlockReceipts(client),
		eth_getBlockTransactionCountByHash: getBlockTransactionCountByHash(client),
		eth_getBlockTransactionCountByNumber:
			getBlockTransactionCountByNumber(client),
		eth_getProof: getProof(client),
		eth_getTransactionByBlockHashAndIndex:
			getTransactionByBlockHashAndIndex(client),
		eth_getTransactionByBlockNumberAndIndex:
			getTransactionByBlockNumberAndIndex(client),
		eth_getTransactionByHash: getTransactionByHash(client),
		eth_getTransactionCount: getTransactionCount(client),
		eth_getTransactionReceipt: getTransactionReceipt(client),
		eth_getUncleCountByBlockNumber: getUncleCountByBlockNumber(client),
		eth_protocolVersion: protocolVersion(client),
		eth_sendRawTransaction: sendRawTransaction(client),
		eth_syncing: syncing(client),
	};
};
