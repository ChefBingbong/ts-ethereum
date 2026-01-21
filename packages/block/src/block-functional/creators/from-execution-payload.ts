import { MerklePatriciaTrie } from '@ts-ethereum/mpt'
import { createTxManagerFromRLP, type TxManager } from '@ts-ethereum/tx'
import {
  bytesToHex,
  createWithdrawal,
  equalsBytes,
  hexToBytes,
} from '@ts-ethereum/utils'
import { getHash } from '../../header-functional/helpers'
import { genTransactionsTrieRoot, genWithdrawalsTrieRoot } from '../../helpers'
import type { ExecutionPayload, HeaderData } from '../../types'
import type { CreateBlockOptions, FrozenBlock } from '../types'
import { fromBlockData } from './from-block-data'

export async function fromExecutionPayload(
  payload: ExecutionPayload,
  opts: CreateBlockOptions,
): Promise<FrozenBlock> {
  const {
    blockNumber: number,
    receiptsRoot: receiptTrie,
    prevRandao: mixHash,
    feeRecipient: coinbase,
    transactions,
    withdrawals: withdrawalsData,
  } = payload

  const txs: TxManager[] = []
  for (const [index, serializedTx] of transactions.entries()) {
    try {
      const tx = createTxManagerFromRLP(hexToBytes(serializedTx), {
        ...opts,
        common: opts.hardforkManager,
      })
      txs.push(tx)
    } catch (error) {
      const validationError = `Invalid tx at index ${index}: ${error}`
      throw Error(validationError)
    }
  }

  const transactionsTrie = await genTransactionsTrieRoot(
    txs,
    new MerklePatriciaTrie({ common: opts.hardforkManager }),
  )
  const withdrawals = withdrawalsData?.map((wData) => createWithdrawal(wData))
  const withdrawalsRoot = withdrawals
    ? await genWithdrawalsTrieRoot(
        withdrawals,
        new MerklePatriciaTrie({ common: opts.hardforkManager }),
      )
    : undefined

  const header: HeaderData = {
    ...payload,
    number,
    receiptTrie,
    transactionsTrie,
    withdrawalsRoot,
    mixHash,
    coinbase,
  }

  const block = fromBlockData({ header, transactions: txs, withdrawals }, opts)

  // Validate block hash matches payload
  // Block hash is the same as header hash
  const blockHash = getHash(block.header)
  if (!equalsBytes(blockHash, hexToBytes(payload.blockHash))) {
    const validationError = `Invalid blockHash, expected: ${
      payload.blockHash
    }, received: ${bytesToHex(blockHash)}`
    throw Error(validationError)
  }

  return block
}
