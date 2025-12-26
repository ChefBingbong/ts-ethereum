import { MerklePatriciaTrie } from '@ts-ethereum/mpt'
import { RLP } from '@ts-ethereum/rlp'
import type { TypedTransaction } from '@ts-ethereum/tx'
import type { PrefixedHexString } from '@ts-ethereum/utils'
import { isHexString, toType, TypeOutput } from '@ts-ethereum/utils'
import type { BlockHeaderBytes, HeaderData } from './types'

/**
 * Returns a 0x-prefixed hex number string from a hex string or string integer.
 * @param {string} input string to check, convert, and return
 */
export const numberToHex = (input?: string): PrefixedHexString | undefined => {
  if (input === undefined) return undefined
  if (!isHexString(input)) {
    const regex = new RegExp(/^\d+$/) // test to make sure input contains only digits
    if (!regex.test(input)) {
      const msg = `Cannot convert string to hex string. numberToHex only supports 0x-prefixed hex or integer strings but the given string was: ${input}`
      throw Error(msg)
    }
    return `0x${Number.parseInt(input, 10).toString(16)}`
  }
  return input
}

/**
 * Converts the canonical byte-array representation of a header into structured {@link HeaderData}.
 * Frontier headers have exactly 15 fields.
 * @param values Header field values in canonical order
 * @returns Parsed header data
 */
export function valuesArrayToHeaderData(values: BlockHeaderBytes): HeaderData {
  const [
    parentHash,
    uncleHash,
    coinbase,
    stateRoot,
    transactionsTrie,
    receiptTrie,
    logsBloom,
    difficulty,
    number,
    gasLimit,
    gasUsed,
    timestamp,
    extraData,
    mixHash,
    nonce,
  ] = values

  if (values.length > 15) {
    throw Error(
      `invalid header. More values than expected were received. Max: 15, got: ${values.length}`,
    )
  }
  if (values.length < 15) {
    throw Error(
      `invalid header. Less values than expected were received. Min: 15, got: ${values.length}`,
    )
  }

  return {
    parentHash,
    uncleHash,
    coinbase,
    stateRoot,
    transactionsTrie,
    receiptTrie,
    logsBloom,
    difficulty,
    number,
    gasLimit,
    gasUsed,
    timestamp,
    extraData,
    mixHash,
    nonce,
  }
}

/**
 * Retrieves the header difficulty as a bigint if the field is provided.
 * @param headerData Header data potentially containing a difficulty value
 * @returns Difficulty as bigint, or `null` when unset
 */
export function getDifficulty(headerData: HeaderData): bigint | null {
  const { difficulty } = headerData
  if (difficulty !== undefined) {
    return toType(difficulty, TypeOutput.BigInt)
  }
  return null
}

/**
 * Returns the txs trie root for array of TypedTransaction
 * @param txs array of TypedTransaction to compute the root of
 * @param emptyTrie Optional trie used to generate the root
 */
export async function genTransactionsTrieRoot(
  txs: TypedTransaction[],
  emptyTrie?: any,
) {
  const trie = emptyTrie ?? new MerklePatriciaTrie()
  for (const [i, tx] of txs.entries()) {
    await trie.put(RLP.encode(i), tx.serialize())
  }
  return trie.root()
}
