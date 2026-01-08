import type { ExecutionNode } from '../../../node/index'
import type { EthRpcMethods, RpcMethods } from '../types'
import { blockNumber } from './block-number'
import { call } from './call'
import { chainId } from './chain-id'
import { coinbase } from './coinbase'
import { estimateGas } from './estimate-gas'
import { gasPrice } from './gas-price'
import { getBalance } from './get-balance'
import { getBlockByHash } from './get-block-by-hash'
import { getBlockByNumber } from './get-block-by-number'
import { getBlockReceipts } from './get-block-receipts'
import { getBlockTransactionCountByHash } from './get-block-transaction-count-by-hash'
import { getBlockTransactionCountByNumber } from './get-block-transaction-count-by-number'
import { getCode } from './get-code'
import { getFeeHistory } from './get-fee-history'
import { getLogs } from './get-logs'
import { getProof } from './get-proof'
import { getStorageAt } from './get-storage-at'
import { getTransactionByBlockHashAndIndex } from './get-transaction-by-block-hash-and-index'
import { getTransactionByBlockNumberAndIndex } from './get-transaction-by-block-number-and-index'
import { getTransactionByHash } from './get-transaction-by-hash'
import { getTransactionCount } from './get-transaction-count'
import { getTransactionReceipt } from './get-transaction-receipt'
import { getUncleCountByBlockNumber } from './get-uncle-count-by-block-number'
import { protocolVersion } from './protocol-version'
import { sendRawTransaction } from './send-raw-transaction'
import { syncing } from './syncing'

export const createEthRpcMethods = (
  node: ExecutionNode,
): RpcMethods<typeof EthRpcMethods> => {
  return {
    eth_blockNumber: blockNumber(node),
    eth_call: call(node),
    eth_chainId: chainId(node),
    eth_coinbase: coinbase(node),
    eth_estimateGas: estimateGas(node),
    eth_gasPrice: gasPrice(node),
    eth_getBalance: getBalance(node),
    eth_getBlockByHash: getBlockByHash(node),
    eth_getBlockByNumber: getBlockByNumber(node),
    eth_getBlockReceipts: getBlockReceipts(node),
    eth_getCode: getCode(node),
    eth_getLogs: getLogs(node),
    eth_getStorageAt: getStorageAt(node),
    eth_getBlockTransactionCountByHash: getBlockTransactionCountByHash(node),
    eth_getBlockTransactionCountByNumber:
      getBlockTransactionCountByNumber(node),
    eth_getProof: getProof(node),
    eth_getTransactionByBlockHashAndIndex:
      getTransactionByBlockHashAndIndex(node),
    eth_getTransactionByBlockNumberAndIndex:
      getTransactionByBlockNumberAndIndex(node),
    eth_getTransactionByHash: getTransactionByHash(node),
    eth_getTransactionCount: getTransactionCount(node),
    eth_getTransactionReceipt: getTransactionReceipt(node),
    eth_getUncleCountByBlockNumber: getUncleCountByBlockNumber(node),
    eth_protocolVersion: protocolVersion(node),
    eth_sendRawTransaction: sendRawTransaction(node),
    eth_syncing: syncing(node),
    eth_feeHistory: getFeeHistory(node),
  }
}
