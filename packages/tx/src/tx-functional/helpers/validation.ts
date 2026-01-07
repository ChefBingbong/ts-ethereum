import { bigIntMax } from '@ts-ethereum/utils'
import type { FrozenTransaction } from '../types'
import { getData, getGasLimit } from './accessors'
import { getIntrinsicGas } from './gas'
import { verifySignature } from './signature'

/**
 * Gets validation errors for a transaction.
 */
export function getValidationErrors(tx: FrozenTransaction): string[] {
  const errors: string[] = []

  // Check signature
  if (!verifySignature(tx)) {
    errors.push('Invalid Signature')
  }

  // Check gas limit
  const intrinsicGas = getIntrinsicGas(tx)
  const gasLimit = getGasLimit(tx)

  // EIP-7623: Transaction Gas Limit Cap
  const hardfork = tx.hardforkManager.getHardforkFromContext({
    blockNumber: 0n,
  })
  let adjustedIntrinsicGas = intrinsicGas

  if (tx.hardforkManager.isEIPActiveAtHardfork(7623, hardfork)) {
    const data = getData(tx)
    let tokens = 0
    for (let i = 0; i < data.length; i++) {
      tokens += data[i] === 0 ? 1 : 4
    }
    const txGas = tx.hardforkManager.getParamAtHardfork('txGas', hardfork)!
    const totalCostFloorPerToken = tx.hardforkManager.getParamAtHardfork(
      'totalCostFloorPerToken',
      hardfork,
    )!
    const floorCost = txGas + totalCostFloorPerToken * BigInt(tokens)
    adjustedIntrinsicGas = bigIntMax(intrinsicGas, floorCost)
  }

  if (adjustedIntrinsicGas > gasLimit) {
    errors.push(
      `gasLimit is too low. The gasLimit is lower than the minimum gas limit of ${adjustedIntrinsicGas}, the gas limit is: ${gasLimit}`,
    )
  }

  return errors
}

/**
 * Checks if a transaction is valid.
 */
export function isValid(tx: FrozenTransaction): boolean {
  return getValidationErrors(tx).length === 0
}
