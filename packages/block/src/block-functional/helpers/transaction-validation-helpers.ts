import { isBlobTxManager, isFeeMarketTxManager } from '@ts-ethereum/tx'
import { BIGINT_0 } from '@ts-ethereum/utils'
import type { FrozenBlock } from '../types'
import { getParam, isEIPActive } from './getters'

export function getTransactionsValidationErrors(block: FrozenBlock): string[] {
  const errors: string[] = []
  let blobGasUsed = BIGINT_0

  for (const [i, tx] of block.transactions.entries()) {
    const errs = tx.getValidationErrors()
    if (isEIPActive(block, 1559)) {
      if (isFeeMarketTxManager(tx)) {
        if (tx.maxFeePerGas! < block.header.data.baseFeePerGas!) {
          errs.push('tx unable to pay base fee (EIP-1559 tx)')
        }
      } else {
        if (tx.gasPrice < block.header.data.baseFeePerGas!) {
          errs.push('tx unable to pay base fee (non EIP-1559 tx)')
        }
      }
    }
    if (isEIPActive(block, 4844)) {
      const blobGasLimit = getParam(block, 'maxBlobGasPerBlock') ?? BIGINT_0
      const blobGasPerBlob = getParam(block, 'blobGasPerBlob') ?? 131072n
      if (isBlobTxManager(tx)) {
        blobGasUsed += BigInt(tx.numBlobs()) * blobGasPerBlob
        if (blobGasUsed > blobGasLimit) {
          errs.push(
            `tx causes total blob gas of ${blobGasUsed} to exceed maximum blob gas per block of ${blobGasLimit}`,
          )
        }
      }
    }
    if (errs.length > 0) {
      errors.push(`errors at tx ${i}: ${errs.join(', ')}`)
    }
  }

  if (isEIPActive(block, 4844)) {
    if (blobGasUsed !== block.header.data.blobGasUsed) {
      errors.push(
        `invalid blobGasUsed expected=${block.header.data.blobGasUsed} actual=${blobGasUsed}`,
      )
    }
  }

  return errors
}
