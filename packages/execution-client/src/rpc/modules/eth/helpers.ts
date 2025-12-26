import type { Block, JSONRPCBlock } from '@ts-ethereum/block'
import type { TypedTransaction } from '@ts-ethereum/tx'
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
  logs: []
  logsBloom: string
  root?: string
  status?: string
  type: string
  blobGasUsed?: string
  blobGasPrice?: string
}

/**
 * Returns receipt formatted to the standard JSON-RPC fields
 */
export const toJSONRPCReceipt = async (
  receipt: TxReceipt,
  gasUsed: bigint,
  effectiveGasPrice: bigint,
  block: Block,
  tx: TypedTransaction,
  txIndex: number,
  _logIndex: number,
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
  logs: [],
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
