/**
 * EIP-2929: Gas cost increases for state access opcodes
 * Address and storage warm/cold access tracking
 *
 * This EIP modifies multiple opcodes to add warm/cold access gas costs.
 * The helper functions are used by dynamic gas handlers.
 */
import type { HardforkManager } from '@ts-ethereum/chain-config'
import { BIGINT_0 } from '@ts-ethereum/utils'
import type { RunState } from '../../interpreter'
import type { JumpTable } from '../types'

/**
 * Adds address to accessedAddresses set if not already included.
 * Adjusts cost incurred for executing opcode based on whether address read
 * is warm/cold. (EIP 2929)
 */
export function accessAddressEIP2929(
  runState: RunState,
  address: Uint8Array,
  common: HardforkManager,
  hardfork: string,
  chargeGas = true,
  isSelfdestruct = false,
): bigint {
  if (!common.isEIPActiveAtHardfork(2929, hardfork)) return BIGINT_0

  const eip2929Hardfork = common.getHardforkForEIP(2929) ?? hardfork

  // Cold
  if (!runState.interpreter.journal.isWarmedAddress(address)) {
    runState.interpreter.journal.addWarmedAddress(address)

    // CREATE, CREATE2 opcodes have the address warmed for free.
    // selfdestruct beneficiary address reads are charged an *additional* cold access
    // if binary tree not activated
    if (chargeGas && !common.isEIPActiveAtHardfork(7864, hardfork)) {
      return common.getParamAtHardfork('coldaccountaccessGas', eip2929Hardfork)!
    } else if (chargeGas && common.isEIPActiveAtHardfork(7864, hardfork)) {
      // If binary tree is active, then the warmstoragereadGas should still be charged
      // This is because otherwise opcodes will have cost 0 (this is thus the base fee)
      return common.getParamAtHardfork('warmstoragereadGas', eip2929Hardfork)!
    }
    // Warm: (selfdestruct beneficiary address reads are not charged when warm)
  } else if (chargeGas && !isSelfdestruct) {
    return common.getParamAtHardfork('warmstoragereadGas', eip2929Hardfork)!
  }
  return BIGINT_0
}

/**
 * Adds (address, key) to accessedStorage tuple set if not already included.
 * Adjusts cost incurred for executing opcode based on whether storage read
 * is warm/cold. (EIP 2929)
 */
export function accessStorageEIP2929(
  runState: RunState,
  key: Uint8Array,
  isSstore: boolean,
  common: HardforkManager,
  hardfork: string,
  chargeGas = true,
): bigint {
  if (!common.isEIPActiveAtHardfork(2929, hardfork)) return BIGINT_0

  const eip2929Hardfork = common.getHardforkForEIP(2929) ?? hardfork
  const address = runState.interpreter.getAddress().bytes
  const slotIsCold = !runState.interpreter.journal.isWarmedStorage(address, key)

  // Cold (SLOAD and SSTORE)
  if (slotIsCold) {
    runState.interpreter.journal.addWarmedStorage(address, key)
    if (
      chargeGas &&
      !(
        common.isEIPActiveAtHardfork(6800, hardfork) ||
        common.isEIPActiveAtHardfork(7864, hardfork)
      )
    ) {
      return common.getParamAtHardfork('coldsloadGas', eip2929Hardfork)!
    }
  } else if (
    chargeGas &&
    (!isSstore ||
      common.isEIPActiveAtHardfork(6800, hardfork) ||
      common.isEIPActiveAtHardfork(7864, hardfork))
  ) {
    return common.getParamAtHardfork('warmstoragereadGas', eip2929Hardfork)!
  }
  return BIGINT_0
}

/**
 * Adjusts cost of SSTORE_RESET_GAS or SLOAD (aka sstorenoop) (EIP-2200) downward when storage
 * location is already warm
 */
export function adjustSstoreGasEIP2929(
  runState: RunState,
  key: Uint8Array,
  defaultCost: bigint,
  costName: string,
  common: HardforkManager,
  hardfork: string,
): bigint {
  if (!common.isEIPActiveAtHardfork(2929, hardfork)) return defaultCost

  const eip2929Hardfork = common.getHardforkForEIP(2929) ?? hardfork
  const eip2200Hardfork = common.getHardforkForEIP(2200) ?? hardfork
  const address = runState.interpreter.getAddress().bytes
  const warmRead = common.getParamAtHardfork(
    'warmstoragereadGas',
    eip2929Hardfork,
  )!
  const coldSload = common.getParamAtHardfork('coldsloadGas', eip2929Hardfork)!

  if (runState.interpreter.journal.isWarmedStorage(address, key)) {
    switch (costName) {
      case 'noop':
        return warmRead
      case 'initRefund':
        return (
          common.getParamAtHardfork('sstoreInitEIP2200Gas', eip2200Hardfork)! -
          warmRead
        )
      case 'cleanRefund':
        return (
          common.getParamAtHardfork('sstoreResetGas', hardfork)! -
          coldSload -
          warmRead
        )
    }
  }

  return defaultCost
}

/**
 * Enable EIP-2929 on a jump table
 * Modifies multiple opcodes to add warm/cold access gas costs
 *
 * Note: The dynamic gas handlers in instructions/gas.ts already incorporate
 * EIP-2929 logic conditionally. This enabler primarily ensures constantGas
 * values are set correctly (e.g., SLOAD constantGas -> 0, moved to dynamic).
 * The actual gas calculation logic is in the handlers which call the helper
 * functions above.
 */
export function enableEIP2929(table: JumpTable): JumpTable {
  // According to Go implementation, EIP-2929 modifies constantGas for several opcodes:
  // - SLOAD: constantGas = 0 (moved to dynamic)
  // - BALANCE, EXTCODESIZE, EXTCODECOPY, EXTCODEHASH, CALL, CALLCODE, STATICCALL, DELEGATECALL:
  //   constantGas = WarmStorageReadCostEIP2929 (base cost)

  // However, in our system, constantGas is populated from chain params in buildJumpTable.
  // The handlers already include the EIP-2929 logic conditionally, so we don't need to
  // modify the handlers here. The constantGas adjustments are handled by chain params.

  // We keep this enabler for consistency with the Go pattern and in case we need
  // to make explicit modifications in the future.

  return table
}
