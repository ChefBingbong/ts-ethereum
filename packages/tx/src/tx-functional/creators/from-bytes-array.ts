import type { TxValuesArray } from '../../types'
import { TransactionType } from '../../types'
import type { CreateTxOptions, FrozenTransaction } from '../types'
import { fromTxData } from './from-tx-data'

/**
 * Creates a FrozenTransaction from a bytes array (raw transaction format).
 */
export function fromBytesArray(
  values: TxValuesArray,
  opts: CreateTxOptions,
): FrozenTransaction {
  // Legacy transaction format: [nonce, gasPrice, gasLimit, to, value, data, v, r, s]
  if (values.length === 6 || values.length === 9) {
    const [nonce, gasPrice, gasLimit, to, value, data, v, r, s] = values

    return fromTxData(
      {
        nonce,
        gasPrice,
        gasLimit,
        to,
        value,
        data,
        v,
        r,
        s,
      },
      opts,
    )
  }

  // Typed transaction formats would be handled here
  // For now, throw an error for unsupported formats
  throw new Error(
    `Unsupported transaction format: expected 6 or 9 values, got ${values.length}`,
  )
}

