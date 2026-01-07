import type { HardforkManager } from '@ts-ethereum/chain-config'
import { equalsBytes } from '@ts-ethereum/utils'
import { EVMError } from '../errors'
import type { RunState } from '../interpreter'
import { adjustSstoreGasEIP2929 } from './EIP2929'
import { trap } from './util'

/**
 * Adjusts gas usage and refunds of SStore ops per EIP-2200 (Istanbul)
 *
 * @param {RunState} runState
 * @param {Uint8Array}   currentStorage
 * @param {Uint8Array}   originalStorage
 * @param {Uint8Array}   value
 * @param {GlobalConfig}   common
 */
export function updateSstoreGasEIP2200(
  runState: RunState,
  currentStorage: Uint8Array,
  originalStorage: Uint8Array,
  value: Uint8Array,
  key: Uint8Array,
  common: HardforkManager,
  hardfork: string,
) {
  const eip2200Hardfork = common.getHardforkForEIP(2200) ?? hardfork

  // Fail if not enough gas is left
  if (
    runState.interpreter.getGasLeft() <=
    common.getParamAtHardfork('sstoreSentryEIP2200Gas', eip2200Hardfork)!
  ) {
    trap(EVMError.errorMessages.OUT_OF_GAS)
  }

  // Noop
  if (equalsBytes(currentStorage, value)) {
    const sstoreNoopCost = common.getParamAtHardfork(
      'sstoreNoopEIP2200Gas',
      eip2200Hardfork,
    )!
    return adjustSstoreGasEIP2929(
      runState,
      key,
      sstoreNoopCost,
      'noop',
      common,
      hardfork,
    )
  }
  if (equalsBytes(originalStorage, currentStorage)) {
    // Create slot
    if (originalStorage.length === 0) {
      return common.getParamAtHardfork('sstoreInitEIP2200Gas', eip2200Hardfork)!
    }
    // Delete slot
    if (value.length === 0) {
      runState.interpreter.refundGas(
        common.getParamAtHardfork(
          'sstoreClearRefundEIP2200Gas',
          eip2200Hardfork,
        )!,
        'EIP-2200 -> sstoreClearRefundEIP2200',
      )
    }
    // Write existing slot
    return common.getParamAtHardfork('sstoreCleanEIP2200Gas', eip2200Hardfork)!
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
    } else if (value.length === 0) {
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
  if (equalsBytes(originalStorage, value)) {
    if (originalStorage.length === 0) {
      // Reset to original non-existent slot
      const sstoreInitRefund = common.getParamAtHardfork(
        'sstoreInitRefundEIP2200Gas',
        eip2200Hardfork,
      )!
      runState.interpreter.refundGas(
        adjustSstoreGasEIP2929(
          runState,
          key,
          sstoreInitRefund,
          'initRefund',
          common,
          hardfork,
        ),
        'EIP-2200 -> initRefund',
      )
    } else {
      // Reset to original existing slot
      const sstoreCleanRefund = common.getParamAtHardfork(
        'sstoreCleanRefundEIP2200Gas',
        eip2200Hardfork,
      )!
      runState.interpreter.refundGas(
        BigInt(
          adjustSstoreGasEIP2929(
            runState,
            key,
            sstoreCleanRefund,
            'cleanRefund',
            common,
            hardfork,
          ),
        ),
        'EIP-2200 -> cleanRefund',
      )
    }
  }
  // Dirty update
  return common.getParamAtHardfork('sstoreDirtyEIP2200Gas', eip2200Hardfork)!
}
