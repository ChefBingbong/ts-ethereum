import type { HardforkManager } from '@ts-ethereum/chain-config'
import { BIGINT_0 } from '@ts-ethereum/utils'
import type { RunState } from '../interpreter'

/**
 * Adds address to accessedAddresses set if not already included.
 * Adjusts cost incurred for executing opcode based on whether address read
 * is warm/cold. (EIP 2929)
 * @param {RunState} runState
 * @param {Address}  address
 * @param {GlobalConfig}   common
 * @param {Boolean}  chargeGas (default: true)
 * @param {Boolean}  isSelfdestruct (default: false)
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
 * @param {RunState} runState
 * @param {Uint8Array} key (to storage slot)
 * @param {GlobalConfig} common
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
 * @param  {RunState} runState
 * @param  {Uint8Array}   key          storage slot
 * @param  {BigInt}   defaultCost  SSTORE_RESET_GAS / SLOAD
 * @param  {string}   costName     parameter name ('noop')
 * @param  {GlobalConfig}   common
 * @return {BigInt}                adjusted cost
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
