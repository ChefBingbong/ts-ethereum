import { RpcMethodFn } from '../types'

export enum AdminRpcMethods {
  admin_addPeer = 'admin_addPeer',
  admin_nodeInfo = 'admin_nodeInfo',
  admin_peers = 'admin_peers',
}

export enum EthRpcMethods {
  eth_blockNumber = 'eth_blockNumber',
  eth_chainId = 'eth_chainId',
  eth_coinbase = 'eth_coinbase',
  eth_estimateGas = 'eth_estimateGas',
  eth_gasPrice = 'eth_gasPrice',
  eth_getBalance = 'eth_getBalance',
  eth_getBlockByHash = 'eth_getBlockByHash',
  eth_getBlockByNumber = 'eth_getBlockByNumber',
  eth_getBlockReceipts = 'eth_getBlockReceipts',
  eth_getBlockTransactionCountByHash = 'eth_getBlockTransactionCountByHash',
  eth_getBlockTransactionCountByNumber = 'eth_getBlockTransactionCountByNumber',
  eth_getProof = 'eth_getProof',
  eth_getTransactionByBlockHashAndIndex = 'eth_getTransactionByBlockHashAndIndex',
  eth_getTransactionByBlockNumberAndIndex = 'eth_getTransactionByBlockNumberAndIndex',
  eth_getTransactionByHash = 'eth_getTransactionByHash',
  eth_getTransactionCount = 'eth_getTransactionCount',
  eth_getTransactionReceipt = 'eth_getTransactionReceipt',
  eth_getUncleCountByBlockNumber = 'eth_getUncleCountByBlockNumber',
  eth_protocolVersion = 'eth_protocolVersion',
  eth_sendRawTransaction = 'eth_sendRawTransaction',
  eth_syncing = 'eth_syncing',
}

export enum DebugRpcMethods {
  debug_getRawBlock = 'debug_getRawBlock',
  debug_getRawHeader = 'debug_getRawHeader',
  debug_getRawReceipts = 'debug_getRawReceipts',
  debug_getRawTransaction = 'debug_getRawTransaction',
  debug_setHead = 'debug_setHead',
  debug_verbosity = 'debug_verbosity',
}

export enum NetRpcMethods {
  net_listening = 'net_listening',
  net_peerCount = 'net_peerCount',
  net_version = 'net_version',
}

export enum Web3RpcMethods {
  web3_clientVersion = 'web3_clientVersion',
  web3_sha3 = 'web3_sha3',
}

export enum TxpoolRpcMethods {
  txpool_content = 'txpool_content',
}

export type RpcMethods<T extends Record<string, string>> = {
  [key in keyof T]: RpcMethodFn
}
export type AllRpcMethods =
  | keyof typeof AdminRpcMethods
  | keyof typeof EthRpcMethods
  | keyof typeof DebugRpcMethods
  | keyof typeof NetRpcMethods
  | keyof typeof Web3RpcMethods
  | keyof typeof TxpoolRpcMethods
