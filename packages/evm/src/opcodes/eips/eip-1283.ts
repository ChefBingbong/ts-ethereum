/**
 * EIP-1283: Net gas metering for SSTORE operations
 * Modifies SSTORE gas calculation starting in Constantinople
 */

import {
  BIGINT_0,
  bigIntToBytes,
  equalsBytes,
  setLengthLeft,
} from '@ts-ethereum/utils'
import { EVMError } from '../../errors'
import { Op } from '../constants'
import type { AsyncDynamicGasHandler, JumpTable } from '../types'
import { setLengthLeftStorage, trap } from '../util'

/**
 * Dynamic gas handler for SSTORE with EIP-1283 (Constantinople)
 */
const dynamicGasSstoreEIP1283: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
) => {
  if (runState.interpreter.isStatic()) {
    trap(EVMError.errorMessages.STATIC_STATE_CHANGE)
  }
  const [key, val] = runState.stack.peek(2)

  const keyBytes = setLengthLeft(bigIntToBytes(key), 32)
  let value
  if (val === BIGINT_0) {
    value = Uint8Array.from([])
  } else {
    value = bigIntToBytes(val)
  }

  const currentStorage = setLengthLeftStorage(
    await runState.interpreter.storageLoad(keyBytes),
  )
  const originalStorage = setLengthLeftStorage(
    await runState.interpreter.storageLoad(keyBytes, true),
  )
  const hardfork = runState.interpreter.fork
  const eip1283Hardfork = common.getHardforkForEIP(1283) ?? hardfork

  if (equalsBytes(currentStorage, value)) {
    // If current value equals new value (this is a no-op), 200 gas is deducted.
    return gas + common.getParamAtHardfork('netSstoreNoopGas', eip1283Hardfork)!
  }

  // If current value does not equal new value
  if (equalsBytes(originalStorage, currentStorage)) {
    // If original value equals current value (this storage slot has not been changed by the current execution context)
    if (originalStorage.length === 0) {
      // If original value is 0, 20000 gas is deducted.
      return (
        gas + common.getParamAtHardfork('netSstoreInitGas', eip1283Hardfork)!
      )
    }
    if (value.length === 0) {
      // If new value is 0, add 15000 gas to refund counter.
      runState.interpreter.refundGas(
        common.getParamAtHardfork('netSstoreClearRefundGas', eip1283Hardfork)!,
        'EIP-1283 -> netSstoreClearRefund',
      )
    }
    // Otherwise, 5000 gas is deducted.
    return (
      gas + common.getParamAtHardfork('netSstoreCleanGas', eip1283Hardfork)!
    )
  }

  // If original value does not equal current value (this storage slot is dirty), 200 gas is deducted. Apply both of the following clauses.
  if (originalStorage.length !== 0) {
    // If original value is not 0
    if (currentStorage.length === 0) {
      // If current value is 0 (also means that new value is not 0), remove 15000 gas from refund counter. We can prove that refund counter will never go below 0.
      runState.interpreter.subRefund(
        common.getParamAtHardfork('netSstoreClearRefundGas', eip1283Hardfork)!,
        'EIP-1283 -> netSstoreClearRefund',
      )
    } else if (value.length === 0) {
      // If new value is 0 (also means that current value is not 0), add 15000 gas to refund counter.
      runState.interpreter.refundGas(
        common.getParamAtHardfork('netSstoreClearRefundGas', eip1283Hardfork)!,
        'EIP-1283 -> netSstoreClearRefund',
      )
    }
  }

  if (equalsBytes(originalStorage, value)) {
    // If original value equals new value (this storage slot is reset)
    if (originalStorage.length === 0) {
      // If original value is 0, add 19800 gas to refund counter.
      runState.interpreter.refundGas(
        common.getParamAtHardfork(
          'netSstoreResetClearRefundGas',
          eip1283Hardfork,
        )!,
        'EIP-1283 -> netSstoreResetClearRefund',
      )
    } else {
      // Otherwise, add 4800 gas to refund counter.
      runState.interpreter.refundGas(
        common.getParamAtHardfork('netSstoreResetRefundGas', eip1283Hardfork)!,
        'EIP-1283 -> netSstoreResetRefund',
      )
    }
  }

  // Note: EIP-1283 (Constantinople) does not include EIP-2929 logic.
  // EIP-2200 (Istanbul+) will override this handler and include EIP-2929.

  return gas + common.getParamAtHardfork('netSstoreDirtyGas', eip1283Hardfork)!
}

/**
 * Enable EIP-1283 on a jump table
 * Modifies SSTORE gas calculation
 */
export function enableEIP1283(table: JumpTable): JumpTable {
  // Modify SSTORE to use EIP-1283 gas calculation
  table[Op.SSTORE].dynamicGas = dynamicGasSstoreEIP1283

  return table
}
