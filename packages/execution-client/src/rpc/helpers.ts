import type { Block } from '@ts-ethereum/block'
import type { JSONRPCTx, TxManager } from '@ts-ethereum/tx'
import { BIGINT_0, bigIntToHex, bytesToHex, intToHex } from '@ts-ethereum/utils'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status.js'
import type { Chain } from '../blockchain/index'
import { INVALID_BLOCK, INVALID_PARAMS } from './error-code'
import type { RPCError, RpcApiEnv } from './types'

/**
 * Returns tx formatted to the standard JSON-RPC fields (legacy transactions only)
 */
export const toJSONRPCTx = (
  tx: TxManager,
  block?: Block,
  txIndex?: number,
): JSONRPCTx => {
  const txJSON = tx.toJSON()
  return {
    blockHash: block ? bytesToHex(block.hash()) : null,
    blockNumber: block ? bigIntToHex(block.header.number) : null,
    from: tx.getSenderAddress().toString(),
    gas: txJSON.gasLimit!,
    gasPrice: txJSON.gasPrice!,
    type: intToHex(tx.type),
    hash: bytesToHex(tx.hash()),
    input: txJSON.data!,
    nonce: txJSON.nonce!,
    to: tx.to?.toString() ?? null,
    transactionIndex: txIndex !== undefined ? intToHex(txIndex) : null,
    value: txJSON.value!,
    v: txJSON.v!,
    r: txJSON.r!,
    s: txJSON.s!,
  }
}

/**
 * Get block by option
 */
export const getBlockByOption = async (blockOpt: string, chain: Chain) => {
  if (blockOpt === 'pending') {
    throw {
      code: INVALID_PARAMS,
      message: `"pending" is not yet supported`,
    }
  }

  let block: Block
  let tempBlock: Block | undefined // Used in `safe` and `finalized` blocks
  const latest = chain.blocks.latest ?? (await chain.getCanonicalHeadBlock())

  switch (blockOpt) {
    case 'earliest':
      block = await chain.getBlock(BIGINT_0)
      break
    case 'latest':
      block = latest
      break
    case 'safe':
      tempBlock = chain.blocks.safe ?? (await chain.getCanonicalSafeBlock())
      if (tempBlock === null || tempBlock === undefined) {
        throw {
          message: 'Unknown block',
          code: INVALID_BLOCK,
        }
      }
      block = tempBlock
      break
    case 'finalized':
      tempBlock =
        chain.blocks.finalized ?? (await chain.getCanonicalFinalizedBlock())
      if (tempBlock === null || tempBlock === undefined) {
        throw {
          message: 'Unknown block',
          code: INVALID_BLOCK,
        }
      }
      block = tempBlock
      break
    default: {
      const blockNumber = BigInt(blockOpt)
      if (blockNumber === latest.header.number) {
        block = latest
      } else if (blockNumber > latest.header.number) {
        throw {
          code: INVALID_PARAMS,
          message: 'specified block greater than current height',
        }
      } else {
        block = await chain.getBlock(blockNumber)
      }
    }
  }
  return block
}

export const getRpcResponse = (
  c: Context<RpcApiEnv>,
  result: any,
  status?: ContentfulStatusCode,
) => {
  const jsonrpc = c.get('jsonrpc')
  const id = c.get('rpcId')
  return c.json(
    {
      jsonrpc,
      id,
      result,
    },
    status,
  )
}

export const getRpcErrorResponse = (
  c: Context<RpcApiEnv>,
  error: RPCError,
  status?: ContentfulStatusCode,
) => {
  const jsonrpc = c.get('jsonrpc')
  const id = c.get('rpcId')
  return c.json(
    {
      jsonrpc,
      id,
      error,
    },
    status,
  )
}
