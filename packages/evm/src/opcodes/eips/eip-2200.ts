/**
 * EIP-2200: Structured Definitions for Net Gas Metering
 * Modifies SSTORE gas calculation starting in Istanbul
 */

import { Hardfork } from '@ts-ethereum/chain-config'
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
import { accessStorageEIP2929, adjustSstoreGasEIP2929 } from './eip-2929'

/**
 * Dynamic gas handler for SSTORE with EIP-2200 (Istanbul)
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
  const eip2200Hardfork = common.getHardforkForEIP(2200) ?? Hardfork.Istanbul

  // Fail if not enough gas is left
  if (
    runState.interpreter.getGasLeft() <=
    common.getParamAtHardfork('sstoreSentryEIP2200Gas', eip2200Hardfork)!
  ) {
    trap(EVMError.errorMessages.OUT_OF_GAS)
  }

  // Noop
  if (equalsBytes(currentStorage, normalizedValue)) {
    const sstoreNoopCost = common.getParamAtHardfork(
      'sstoreNoopEIP2200Gas',
      eip2200Hardfork,
    )!
    return (
      gas +
      adjustSstoreGasEIP2929(
        runState,
        keyBytes,
        sstoreNoopCost,
        'noop',
        common,
        hardfork,
      )
    )
  }

  if (equalsBytes(originalStorage, currentStorage)) {
    // Create slot
    if (originalStorage.length === 0) {
      return (
        gas +
        common.getParamAtHardfork('sstoreInitEIP2200Gas', eip2200Hardfork)!
      )
    }
    // Delete slot
    if (normalizedValue.length === 0) {
      runState.interpreter.refundGas(
        common.getParamAtHardfork(
          'sstoreClearRefundEIP2200Gas',
          eip2200Hardfork,
        )!,
        'EIP-2200 -> sstoreClearRefundEIP2200',
      )
    }
    // Write existing slot
    return (
      gas + common.getParamAtHardfork('sstoreCleanEIP2200Gas', eip2200Hardfork)!
    )
  }

  if (originalStorage.length > 0) {
    if (currentStorage.length === 0) {
      // Recreate slot
      runState.interpreter.subRefund(
        common.getParamAtHardfork(
          'sstoreClearRefundEIP2200Gas',
          eip2200Hardfork,
        )!,
        'EIP-2200 -> sstoreClearRefundEIP2200',
      )
    } else if (normalizedValue.length === 0) {
      // Delete slot
      runState.interpreter.refundGas(
        common.getParamAtHardfork(
          'sstoreClearRefundEIP2200Gas',
          eip2200Hardfork,
        )!,
        'EIP-2200 -> sstoreClearRefundEIP2200',
      )
    }
  }

  if (equalsBytes(originalStorage, normalizedValue)) {
    if (originalStorage.length === 0) {
      // Reset to original non-existent slot
      // Refund = sstoreInitEIP2200Gas - sstoreNoopEIP2200Gas = 20000 - 800 = 19200
      const sstoreInitGas = common.getParamAtHardfork(
        'sstoreInitEIP2200Gas',
        eip2200Hardfork,
      )!
      const sstoreNoopGas = common.getParamAtHardfork(
        'sstoreNoopEIP2200Gas',
        eip2200Hardfork,
      )!
      const refund = sstoreInitGas - sstoreNoopGas
      runState.interpreter.refundGas(
        adjustSstoreGasEIP2929(
          runState,
          keyBytes,
          refund,
          'initRefund',
          common,
          hardfork,
        ),
        'EIP-2200 -> initRefund',
      )
    } else {
      // Reset to original existing slot
      // Refund = sstoreCleanEIP2200Gas - sstoreNoopEIP2200Gas = 5000 - 800 = 4200
      const sstoreCleanGas = common.getParamAtHardfork(
        'sstoreCleanEIP2200Gas',
        eip2200Hardfork,
      )!
      const sstoreNoopGas = common.getParamAtHardfork(
        'sstoreNoopEIP2200Gas',
        eip2200Hardfork,
      )!
      const refund = sstoreCleanGas - sstoreNoopGas
      runState.interpreter.refundGas(
        adjustSstoreGasEIP2929(
          runState,
          keyBytes,
          refund,
          'cleanRefund',
          common,
          hardfork,
        ),
        'EIP-2200 -> cleanRefund',
      )
    }
  }

  // Dirty update (returns SloadGasEIP2200 which equals sstoreNoopEIP2200Gas)
  gas += common.getParamAtHardfork('sstoreNoopEIP2200Gas', eip2200Hardfork)!

  // EIP-2929: Add warm/cold storage access gas
  let charge2929Gas = true
  if (
    common.isEIPActiveAtHardfork(6800, hardfork) ||
    common.isEIPActiveAtHardfork(7864, hardfork)
  ) {
    const contract = runState.interpreter.getAddress()
    const coldAccessGas = runState.env.accessWitness!.writeAccountStorage(
      contract,
      key,
    )
    gas += coldAccessGas
    charge2929Gas = coldAccessGas === BIGINT_0
  }

  if (common.isEIPActiveAtHardfork(2929, hardfork)) {
    gas += accessStorageEIP2929(
      runState,
      keyBytes,
      true,
      common,
      hardfork,
      charge2929Gas,
    )
  }

  return gas
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
