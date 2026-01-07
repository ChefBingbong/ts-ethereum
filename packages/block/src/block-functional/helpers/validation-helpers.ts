import { EIP } from '@ts-ethereum/chain-config'
import { Blob4844Tx } from '@ts-ethereum/tx'
import { BIGINT_0, EthereumJSErrorWithoutCode } from '@ts-ethereum/utils'
import type { BlockHeaderManager } from '../../header-functional'
import { createBlockHeaderManagerFromHeader } from '../../header-functional'
import { validateGasLimit as validateHeaderGasLimit } from '../../header-functional/helpers'
import { validateUncleHeaders } from '../../validation/block'
import type { FrozenBlock } from '../types'
import { errorStr, getHardfork, getParam, isEIPActive } from './getters'
import { serialize } from './serialize-helpers'
import { getTransactionsValidationErrors } from './transaction-validation-helpers'
import {
  transactionsTrieIsValid,
  uncleHashIsValid,
  withdrawalsTrieIsValid,
} from './trie-helpers'

export function transactionsAreValid(block: FrozenBlock): boolean {
  const errors = getTransactionsValidationErrors(block)
  return errors.length === 0
}

export async function validateData(
  block: FrozenBlock,
  onlyHeader = false,
  verifyTxs = true,
  validateBlockSize = false,
): Promise<void> {
  // EIP-7934: RLP Execution Block Size Limit validation
  if (validateBlockSize && isEIPActive(block, EIP.EIP_7934)) {
    const rlpEncoded = serialize(block)
    const maxRlpBlockSize = getParam(block, 'maxRlpBlockSize') ?? 1000000000n
    if (rlpEncoded.length > maxRlpBlockSize) {
      const msg = `${errorStr(block)}: Block size exceeds maximum RLP block size limit: ${rlpEncoded.length} bytes > ${maxRlpBlockSize} bytes`
      throw EthereumJSErrorWithoutCode(msg)
    }
  }

  if (verifyTxs) {
    const txErrors = getTransactionsValidationErrors(block)
    if (txErrors.length > 0) {
      const msg = `${errorStr(block)}: invalid transactions: ${txErrors.join(' ')}`
      throw EthereumJSErrorWithoutCode(msg)
    }
  }

  if (onlyHeader) {
    return
  }

  if (verifyTxs) {
    for (const [index, tx] of block.transactions.entries()) {
      if (!tx.isSigned()) {
        const msg = `${errorStr(block)}: invalid transactions: transaction at index ${index} is unsigned`
        throw EthereumJSErrorWithoutCode(msg)
      }
    }
  }

  if (!(await transactionsTrieIsValid(block))) {
    const msg = `${errorStr(block)}: invalid transaction trie`
    throw EthereumJSErrorWithoutCode(msg)
  }

  if (!uncleHashIsValid(block)) {
    const msg = `${errorStr(block)}: invalid uncle hash`
    throw EthereumJSErrorWithoutCode(msg)
  }

  if (isEIPActive(block, 4895) && !(await withdrawalsTrieIsValid(block))) {
    const msg = `${errorStr(block)}: invalid withdrawals trie`
    throw EthereumJSErrorWithoutCode(msg)
  }
}

export function validateBlobTransactions(
  block: FrozenBlock,
  parentHeader: BlockHeaderManager,
): void {
  if (isEIPActive(block, 4844)) {
    const blobGasLimit = getParam(block, 'maxBlobGasPerBlock') ?? BIGINT_0
    const blobGasPerBlob = getParam(block, 'blobGasPerBlob') ?? 131072n
    let blobGasUsed = BIGINT_0

    const hardfork = getHardfork(block)
    const expectedExcessBlobGas = parentHeader.calcNextExcessBlobGas(hardfork)
    if (block.header.data.excessBlobGas !== expectedExcessBlobGas) {
      throw EthereumJSErrorWithoutCode(
        `block excessBlobGas mismatch: have ${block.header.data.excessBlobGas}, want ${expectedExcessBlobGas}`,
      )
    }

    let blobGasPrice: bigint | undefined

    for (const tx of block.transactions) {
      if (tx instanceof Blob4844Tx) {
        blobGasPrice = blobGasPrice ?? parentHeader.getBlobGasPrice()
        if (tx.maxFeePerBlobGas < blobGasPrice) {
          throw EthereumJSErrorWithoutCode(
            `blob transaction maxFeePerBlobGas ${
              tx.maxFeePerBlobGas
            } < than block blob gas price ${blobGasPrice} - ${errorStr(block)}`,
          )
        }

        blobGasUsed += BigInt(tx.blobVersionedHashes.length) * blobGasPerBlob

        if (blobGasUsed > blobGasLimit) {
          throw EthereumJSErrorWithoutCode(
            `tx causes total blob gas of ${blobGasUsed} to exceed maximum blob gas per block of ${blobGasLimit}`,
          )
        }
      }
    }

    if (block.header.data.blobGasUsed !== blobGasUsed) {
      throw EthereumJSErrorWithoutCode(
        `block blobGasUsed mismatch: have ${block.header.data.blobGasUsed}, want ${blobGasUsed}`,
      )
    }
  }
}

export function validateUncles(block: FrozenBlock): void {
  if (block.header.data.number === 0n) {
    return
  }
  // Convert frozen headers to managers for validation
  const uncleManagers = block.uncleHeaders.map((uh) =>
    createBlockHeaderManagerFromHeader(uh),
  )
  validateUncleHeaders(uncleManagers)
}

export function validateGasLimit(
  block: FrozenBlock,
  parentBlock: FrozenBlock,
): void {
  validateHeaderGasLimit(block.header, parentBlock.header.data.gasLimit)
}
