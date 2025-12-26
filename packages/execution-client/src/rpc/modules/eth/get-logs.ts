import type { Block } from '@ts-ethereum/block'
import type { Log } from '@ts-ethereum/evm'
import type { TypedTransaction } from '@ts-ethereum/tx'
import {
  BIGINT_0,
  bigIntToHex,
  bytesToHex,
  EthereumJSErrorWithoutCode,
  hexToBytes,
  intToHex,
  safeError,
  safeResult,
} from '@ts-ethereum/utils'
import type { ReceiptsManager } from '../../../execution/receipt'
import type { ExecutionNode } from '../../../node/index'
import { createRpcMethod } from '../../validation'
import { getLogsSchema } from './schema'

type GetLogsParams = {
  fromBlock?: string // QUANTITY, block number or "earliest" or "latest" (default: "latest")
  toBlock?: string // QUANTITY, block number or "latest" (default: "latest")
  address?: string | string[] // DATA, 20 Bytes, contract address from which logs should originate
  topics?: (string | string[] | null)[] // DATA, array, topics are order-dependent
  blockHash?: string // DATA, 32 Bytes. With the addition of EIP-234,
  // blockHash restricts the logs returned to the single block with
  // the 32-byte hash blockHash. Using blockHash is equivalent to
  // fromBlock = toBlock = the block number with hash blockHash.
  // If blockHash is present in in the filter criteria, then
  // neither fromBlock nor toBlock are allowed.
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
}

/**
 * Returns log formatted to the standard JSON-RPC fields
 */
const toJSONRPCLog = async (
  log: Log,
  block?: Block,
  tx?: TypedTransaction,
  txIndex?: number,
  logIndex?: number,
): Promise<JSONRPCLog> => ({
  removed: false, // TODO implement
  logIndex: logIndex !== undefined ? intToHex(logIndex) : null,
  transactionIndex: txIndex !== undefined ? intToHex(txIndex) : null,
  transactionHash: tx !== undefined ? bytesToHex(tx.hash()) : null,
  blockHash: block ? bytesToHex(block.hash()) : null,
  blockNumber: block ? bigIntToHex(block.header.number) : null,
  blockTimestamp: block ? bytesToHex(block.header.timestamp as any) : null,
  address: bytesToHex(log[0]),
  topics: log[1].map(bytesToHex),
  data: bytesToHex(log[2]),
})

export const getLogs = (node: ExecutionNode) => {
  const chain = node.chain
  const receiptsManager: ReceiptsManager | undefined =
    node.execution.execution.receiptsManager

  return createRpcMethod(getLogsSchema, async (params: [GetLogsParams], _c) => {
    const { fromBlock, toBlock, blockHash, address, topics } = params[0]

    if (!receiptsManager) {
      return safeError(EthereumJSErrorWithoutCode('missing receiptsManager'))
    }

    if (
      blockHash !== undefined &&
      (fromBlock !== undefined || toBlock !== undefined)
    ) {
      return safeError(
        new Error(
          `Can only specify a blockHash if fromBlock or toBlock are not provided`,
        ),
      )
    }

    let from: Block, to: Block
    if (blockHash !== undefined) {
      try {
        from = to = await chain.getBlock(hexToBytes(blockHash as any))
      } catch {
        return safeError(new Error('unknown blockHash'))
      }
    } else {
      if (fromBlock === 'earliest') {
        from = await chain.getBlock(BIGINT_0)
      } else if (fromBlock === 'latest' || fromBlock === undefined) {
        const latest =
          chain.blocks.latest ?? (await chain.getCanonicalHeadBlock())
        from = latest
      } else {
        const blockNum = BigInt(fromBlock)
        if (blockNum > chain.headers.height) {
          return safeError(
            new Error(
              'specified `fromBlock` greater than current height' as any,
            ),
          )
        }
        from = await chain.getBlock(blockNum)
      }
      if (toBlock === fromBlock) {
        to = from
      } else if (toBlock === 'latest' || toBlock === undefined) {
        const latest =
          chain.blocks.latest ?? (await chain.getCanonicalHeadBlock())
        to = latest
      } else {
        const blockNum = BigInt(toBlock)
        if (blockNum > chain.headers.height) {
          return safeError(
            new Error('specified `toBlock` greater than current height' as any),
          )
        }
        to = await chain.getBlock(blockNum)
      }
    }

    if (
      to.header.number - from.header.number >
      BigInt(receiptsManager.GET_LOGS_BLOCK_RANGE_LIMIT)
    ) {
      return safeError(
        new Error(
          `block range limit is ${receiptsManager.GET_LOGS_BLOCK_RANGE_LIMIT} blocks` as any,
        ),
      )
    }

    const formattedTopics = topics?.map((t) => {
      if (t === null) {
        return null
      } else if (Array.isArray(t)) {
        return t.map((x) => hexToBytes(x as any))
      } else {
        return hexToBytes(t as any)
      }
    })

    let addressBytes: Uint8Array[] | undefined
    if (address !== undefined && address !== null) {
      if (Array.isArray(address)) {
        addressBytes = address.map((a) => hexToBytes(a as any))
      } else {
        addressBytes = [hexToBytes(address as any)]
      }
    }

    const logs = await receiptsManager.getLogs(
      from,
      to,
      addressBytes,
      formattedTopics,
    )
    const formattedLogs = await Promise.all(
      logs.map(({ log, block, tx, txIndex, logIndex }) =>
        toJSONRPCLog(log, block, tx, txIndex, logIndex),
      ),
    )

    return safeResult(formattedLogs)
  })
}
