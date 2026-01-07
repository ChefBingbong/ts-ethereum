import { MerklePatriciaTrie } from '@ts-ethereum/mpt'
import { RLP } from '@ts-ethereum/rlp'
import type { TypedTransaction } from '@ts-ethereum/tx'
import {
  EthereumJSErrorWithoutCode,
  equalsBytes,
  KECCAK256_RLP,
  KECCAK256_RLP_ARRAY,
  type Withdrawal,
} from '@ts-ethereum/utils'
import { keccak256 } from 'ethereum-cryptography/keccak'
import { createBlockHeaderManagerFromHeader } from '../../header-functional'
import { genTransactionsTrieRoot, genWithdrawalsTrieRoot } from '../../helpers'
import type { FrozenBlock } from '../types'
import { isEIPActive } from './getters'

export async function genTxTrie(block: FrozenBlock): Promise<Uint8Array> {
  return genTransactionsTrieRoot(
    block.transactions as TypedTransaction[],
    new MerklePatriciaTrie({ common: block.hardforkManager }),
  )
}

export async function transactionsTrieIsValid(
  block: FrozenBlock,
): Promise<boolean> {
  if (block.transactions.length === 0) {
    return equalsBytes(block.header.data.transactionsTrie, KECCAK256_RLP)
  }

  if (block._cache.txTrieRoot === undefined) {
    // We can't mutate the cache in a pure function, so we compute it
    const computedRoot = await genTxTrie(block)
    return equalsBytes(computedRoot, block.header.data.transactionsTrie)
  }

  return equalsBytes(
    block._cache.txTrieRoot,
    block.header.data.transactionsTrie,
  )
}

export function uncleHashIsValid(block: FrozenBlock): boolean {
  if (block.uncleHeaders.length === 0) {
    return equalsBytes(KECCAK256_RLP_ARRAY, block.header.data.uncleHash)
  }
  // Use header manager's raw() method for proper serialization
  const uncles = block.uncleHeaders.map((uh) => {
    const uhManager = createBlockHeaderManagerFromHeader(uh)
    return uhManager.raw()
  })
  const raw = RLP.encode(uncles)
  return equalsBytes(keccak256(raw), block.header.data.uncleHash)
}

export async function withdrawalsTrieIsValid(
  block: FrozenBlock,
): Promise<boolean> {
  if (!isEIPActive(block, 4895)) {
    throw EthereumJSErrorWithoutCode('EIP 4895 is not activated')
  }

  if (block.withdrawals === undefined || block.withdrawals.length === 0) {
    return equalsBytes(block.header.data.withdrawalsRoot!, KECCAK256_RLP)
  }

  if (block._cache.withdrawalsTrieRoot === undefined) {
    const computedRoot = await genWithdrawalsTrieRoot(
      block.withdrawals as Withdrawal[],
      new MerklePatriciaTrie({ common: block.hardforkManager }),
    )
    return equalsBytes(computedRoot, block.header.data.withdrawalsRoot!)
  }

  return equalsBytes(
    block._cache.withdrawalsTrieRoot,
    block.header.data.withdrawalsRoot!,
  )
}
