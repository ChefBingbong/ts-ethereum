import {
  Blob4844Tx,
  Capability,
  type FeeMarket1559Tx,
  type LegacyTx,
} from '@ts-ethereum/tx'
import { BIGINT_0 } from '@ts-ethereum/utils'
import type { FrozenBlock } from '../types'
import { getParam, isEIPActive } from './getters'

export function getTransactionsValidationErrors(block: FrozenBlock): string[] {
  const errors: string[] = []
  let blobGasUsed = BIGINT_0

  // eslint-disable-next-line prefer-const
  for (let [i, tx] of block.transactions.entries()) {
    const errs = tx.getValidationErrors()
    if (isEIPActive(block, 1559)) {
      if (tx.supports(Capability.EIP1559FeeMarket)) {
        tx = tx as FeeMarket1559Tx
        if (tx.maxFeePerGas < block.header.data.baseFeePerGas!) {
          errs.push('tx unable to pay base fee (EIP-1559 tx)')
        }
      } else {
        tx = tx as LegacyTx
        if (tx.gasPrice < block.header.data.baseFeePerGas!) {
          errs.push('tx unable to pay base fee (non EIP-1559 tx)')
        }
      }
    }
    if (isEIPActive(block, 4844)) {
      const blobGasLimit = getParam(block, 'maxBlobGasPerBlock') ?? BIGINT_0
      const blobGasPerBlob = getParam(block, 'blobGasPerBlob') ?? 131072n
      if (tx instanceof Blob4844Tx) {
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
