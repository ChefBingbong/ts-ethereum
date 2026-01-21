/**
 * EIP-2200: Structured Definitions for Net Gas Metering
 * Modifies SSTORE gas calculation starting in Istanbul
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
 * Dynamic gas handler for SSTORE with EIP-2200 (Istanbul) + EIP-2929 (Berlin)
 *
 * This follows go-ethereum's approach: check cold access FIRST and add the cost
 * upfront so all code paths include it.
 *
 * EIP-2929 modifies EIP-2200 parameters:
 * - SLOAD_GAS (800) -> WARM_STORAGE_READ_COST (100)
 * - SSTORE_RESET_GAS (5000) -> 5000 - COLD_SLOAD_COST (2900)
 */
const dynamicGasSstoreEIP2200: AsyncDynamicGasHandler = async (
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
  // Normalize value to 32 bytes for comparison
  const normalizedValue = setLengthLeftStorage(value)
  const hardfork = runState.interpreter.fork

  // Fail if not enough gas is left
  if (
    runState.interpreter.getGasLeft() <=
    common.getParamAtHardfork('sstoreSentryEIP2200Gas', hardfork)!
  ) {
    trap(EVMError.errorMessages.OUT_OF_GAS)
  }

  // EIP-2929: Check cold access FIRST and add cost upfront (like go-ethereum)
  // This ensures ALL code paths include the cold access gas
  let coldAccessCost = BIGINT_0
  if (common.isEIPActiveAtHardfork(2929, hardfork)) {
    const address = runState.interpreter.getAddress().bytes
    const slotIsCold = !runState.interpreter.journal.isWarmedStorage(
      address,
      keyBytes,
    )
    if (slotIsCold) {
      runState.interpreter.journal.addWarmedStorage(address, keyBytes)
      if (!common.isEIPActiveAtHardfork(6800, hardfork)) {
        coldAccessCost = common.getParamAtHardfork('coldsloadGas', hardfork)!
      }
    }
  }

  // Get gas values - params are already adjusted for EIP-2929 when hardfork >= Berlin
  // Pre-Berlin: sstoreNoopEIP2200Gas = 800, sstoreCleanEIP2200Gas = 5000
  // Berlin+: sstoreNoopEIP2200Gas = 100 (warmStorageReadCost), sstoreCleanEIP2200Gas = 2900
  const warmStorageReadCost = common.getParamAtHardfork(
    'sstoreNoopEIP2200Gas',
    hardfork,
  )!
  const sstoreResetGas = common.getParamAtHardfork(
    'sstoreCleanEIP2200Gas',
    hardfork,
  )!

  // Noop (1): current == value
  if (equalsBytes(currentStorage, normalizedValue)) {
    // EIP-2929: return cost + WARM_STORAGE_READ_COST
    return gas + coldAccessCost + warmStorageReadCost
  }

  if (equalsBytes(originalStorage, currentStorage)) {
    // Create slot (2.1.1): original == current && original == 0
    if (originalStorage.length === 0) {
      return (
        gas +
        coldAccessCost +
        common.getParamAtHardfork('sstoreInitEIP2200Gas', hardfork)!
      )
    }
    // Delete slot (2.1.2b): original == current && value == 0
    if (normalizedValue.length === 0) {
      runState.interpreter.refundGas(
        common.getParamAtHardfork('sstoreClearRefundEIP2200Gas', hardfork)!,
        'EIP-2200 -> sstoreClearRefundEIP2200',
      )
    }
    // Write existing slot (2.1.2): original == current
    // EIP-2929: return cost + (SSTORE_RESET_GAS - COLD_SLOAD_COST)
    return gas + coldAccessCost + sstoreResetGas
  }

  // Dirty updates (2.2): original != current
  if (originalStorage.length > 0) {
    if (currentStorage.length === 0) {
      // Recreate slot (2.2.1.1)
      runState.interpreter.subRefund(
        common.getParamAtHardfork('sstoreClearRefundEIP2200Gas', hardfork)!,
        'EIP-2200 -> sstoreClearRefundEIP2200',
      )
    } else if (normalizedValue.length === 0) {
      // Delete slot (2.2.1.2)
      runState.interpreter.refundGas(
        common.getParamAtHardfork('sstoreClearRefundEIP2200Gas', hardfork)!,
        'EIP-2200 -> sstoreClearRefundEIP2200',
      )
    }
  }

  if (equalsBytes(originalStorage, normalizedValue)) {
    if (originalStorage.length === 0) {
      // Reset to original non-existent slot (2.2.2.1)
      // EIP-2929: Refund = SSTORE_SET_GAS - WARM_STORAGE_READ_COST
      const sstoreInitGas = common.getParamAtHardfork(
        'sstoreInitEIP2200Gas',
        hardfork,
      )!
      runState.interpreter.refundGas(
        sstoreInitGas - warmStorageReadCost,
        'EIP-2200 -> initRefund',
      )
    } else {
      // Reset to original existing slot (2.2.2.2)
      // EIP-2929: Refund = (SSTORE_RESET_GAS - COLD_SLOAD_COST) - WARM_STORAGE_READ_COST
      runState.interpreter.refundGas(
        sstoreResetGas - warmStorageReadCost,
        'EIP-2200 -> cleanRefund',
      )
    }
  }

  // Dirty update (2.2): return cost + WARM_STORAGE_READ_COST
  return gas + coldAccessCost + warmStorageReadCost
}

/**
 * Enable EIP-2200 on a jump table
 * Modifies SSTORE gas calculation and SLOAD constant gas
 */
export function enableEIP2200(table: JumpTable): JumpTable {
  // Modify SSTORE to use EIP-2200 gas calculation
  table[Op.SSTORE].dynamicGas = dynamicGasSstoreEIP2200

  // Note: SLOAD constant gas is handled in buildJumpTable based on hardfork
  // The Go code sets jt[SLOAD].constantGas = params.SloadGasEIP2200
  // but in our system, this is determined by chain params in buildJumpTable

  return table
}
