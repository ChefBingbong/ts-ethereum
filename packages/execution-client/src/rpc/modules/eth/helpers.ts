import type { Block, JSONRPCBlock } from '@ts-ethereum/block'
import type { Log } from '@ts-ethereum/evm'
import type { TxManager } from '@ts-ethereum/tx'
import type { Address } from '@ts-ethereum/utils'
import { bigIntToHex, bytesToHex, intToHex } from '@ts-ethereum/utils'
import type {
  PostByzantiumTxReceipt,
  PreByzantiumTxReceipt,
  TxReceipt,
} from '@ts-ethereum/vm'
import type { Chain } from '../../../blockchain/index'
import { toJSONRPCTx } from '../../helpers'

/**
 * Returns block formatted to the standard JSON-RPC fields
 */
export const toJSONRPCBlock = async (
  block: Block,
  chain: Chain,
  includeTransactions: boolean,
): Promise<JSONRPCBlock> => {
  const json = block.toJSON()
  const header = json!.header!
  const transactions = block.transactions.map((tx, txIndex) =>
    includeTransactions
      ? toJSONRPCTx(tx, block, txIndex)
      : bytesToHex(tx.hash()),
  )
  const td = await chain.getTd(block.hash(), block.header.number)
  return {
    number: header.number!,
    hash: bytesToHex(block.hash()),
    parentHash: header.parentHash!,
    mixHash: header.mixHash,
    nonce: header.nonce!,
    sha3Uncles: header.uncleHash!,
    logsBloom: header.logsBloom!,
    transactionsRoot: header.transactionsTrie!,
    stateRoot: header.stateRoot!,
    receiptsRoot: header.receiptTrie!,
    miner: header.coinbase!,
    difficulty: header.difficulty!,
    totalDifficulty: bigIntToHex(td),
    extraData: header.extraData!,
    size: intToHex(block.serialize().length),
    gasLimit: header.gasLimit!,
    gasUsed: header.gasUsed!,
    timestamp: header.timestamp!,
    transactions,
    uncles: block.uncleHeaders.map((uh) => bytesToHex(uh.hash())),
  }
}

export type JSONRPCReceipt = {
  transactionHash: string
  transactionIndex: string
  blockHash: string
  blockNumber: string
  from: string
  to: string | null
  cumulativeGasUsed: string
  effectiveGasPrice: string
  gasUsed: string
  contractAddress: string | null
  logs: JSONRPCLog[]
  logsBloom: string
  root?: string
  status?: string
  type: string
  blobGasUsed?: string
  blobGasPrice?: string
}

type JSONRPCLog = {
  removed: boolean // TAG - true when the log was removed, due to a chain reorganization. false if it's a valid log.
  logIndex: string | null // QUANTITY - integer of the log index position in the block. null when it's pending.
  transactionIndex: string | null // QUANTITY - integer of the transactions index position log was created from. null when it's pending.
  transactionHash: string | null // DATA, 32 Bytes - hash of the transactions this log was created from. null when it's pending.
  blockHash: string | null // DATA, 32 Bytes - hash of the block where this log was in. null when it's pending.
  blockNumber: string | null // QUANTITY - the block number where this log was in. null when it's pending.
  blockTimestamp: string | null // QUANTITY - the block timestamp where this log was in. null when it's pending.
  address: string // DATA, 20 Bytes - address from which this log originated.
  data: string // DATA - contains one or more 32 Bytes non-indexed arguments of the log.
  topics: string[] // Array of DATA - Array of 0 to 4 32 Bytes DATA of indexed log arguments.
  // (In solidity: The first topic is the hash of the signature of the event
  // (e.g. Deposit(address,bytes32,uint256)), except you declared the event with the anonymous specifier.)
}

/**
 * Returns log formatted to the standard JSON-RPC fields
 */
const toJSONRPCLog = async (
  log: Log,
  block?: Block,
  tx?: TxManager,
  txIndex?: number,
  logIndex?: number,
): Promise<JSONRPCLog> => ({
  removed: false, // TODO implement
  logIndex: logIndex !== undefined ? intToHex(logIndex) : null,
  transactionIndex: txIndex !== undefined ? intToHex(txIndex) : null,
  transactionHash: tx !== undefined ? bytesToHex(tx.hash()) : null,
  blockHash: block ? bytesToHex(block.hash()) : null,
  blockNumber: block ? bigIntToHex(block.header.number) : null,
  blockTimestamp: block ? bigIntToHex(block.header.timestamp) : null,
  address: bytesToHex(log[0]),
  topics: log[1].map(bytesToHex),
  data: bytesToHex(log[2]),
})

/**
 * Returns receipt formatted to the standard JSON-RPC fields
 */
export const toJSONRPCReceipt = async (
  receipt: TxReceipt,
  gasUsed: bigint,
  effectiveGasPrice: bigint,
  block: Block,
  tx: TxManager,
  txIndex: number,
  logIndex: number,
  contractAddress: Address,
  blobGasPrice?: bigint,
  blobGasUsed?: bigint,
): Promise<JSONRPCReceipt> => ({
  transactionHash: bytesToHex(tx.hash()),
  transactionIndex: intToHex(txIndex),
  blockHash: bytesToHex(block.hash()),
  blockNumber: bigIntToHex(block.header.number),
  from: tx.getSenderAddress().toString(),
  to: tx.to?.toString() ?? null,
  cumulativeGasUsed: bigIntToHex(receipt.cumulativeBlockGasUsed),
  effectiveGasPrice: bigIntToHex(effectiveGasPrice),
  gasUsed: bigIntToHex(gasUsed),
  contractAddress: contractAddress?.toString() ?? null,
  logs: await Promise.all(
    receipt.logs.map((l, i) =>
      toJSONRPCLog(l, block, tx, txIndex, logIndex + i),
    ),
  ),
  logsBloom: bytesToHex(receipt.bitvector),
  root:
    (receipt as PreByzantiumTxReceipt).stateRoot instanceof Uint8Array
      ? bytesToHex((receipt as PreByzantiumTxReceipt).stateRoot)
      : undefined,
  status:
    (receipt as PostByzantiumTxReceipt).status !== undefined
      ? intToHex((receipt as PostByzantiumTxReceipt).status)
      : undefined,

  type: intToHex(tx.type),
  blobGasUsed: blobGasUsed !== undefined ? bigIntToHex(blobGasUsed) : undefined,
  blobGasPrice:
    blobGasPrice !== undefined ? bigIntToHex(blobGasPrice) : undefined,
})
