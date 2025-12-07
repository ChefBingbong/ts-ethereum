import debugDefault from 'debug'
import { createBlockHeader } from '../block'
import {
  Account,
  BIGINT_0,
  EthereumJSErrorWithoutCode,
  bytesToHex,
  short,
} from '../utils'

import { Bloom } from './bloom'

import type { Block } from '../block'
import type { Common } from '../chain-config'
import type {
  LegacyTx,
  TypedTransaction,
} from '../tx'
import type {
  AfterTxEvent,
  BaseTxReceipt,
  PreByzantiumTxReceipt,
  RunTxOpts,
  RunTxResult,
  TxReceipt,
} from './types.ts'
import type { VM } from './vm.ts'

const debug = debugDefault('vm:tx')
const debugGas = debugDefault('vm:tx:gas')

const DEFAULT_HEADER = createBlockHeader()

/**
 * Run a transaction (Frontier/Chainstart - Legacy transactions only)
 * Value transfers only - contract creation is NOT supported.
 * @ignore
 */
export async function runTx(vm: VM, opts: RunTxOpts): Promise<RunTxResult> {
  const gasLimit = opts.block?.header.gasLimit ?? DEFAULT_HEADER.gasLimit
  if (opts.skipBlockGasLimitValidation !== true && gasLimit < opts.tx.gasLimit) {
    const msg = _errorMsg('tx has a higher gas limit than the block', vm, opts.block, opts.tx)
    throw EthereumJSErrorWithoutCode(msg)
  }

  // Reject contract creation transactions
  if (opts.tx.to === undefined) {
    const msg = _errorMsg(
      'Contract creation is not supported. This blockchain only supports value transfers.',
      vm,
      opts.block,
      opts.tx,
    )
    throw EthereumJSErrorWithoutCode(msg)
  }

  // Ensure we start with a clear warmed accounts Map
  await vm.evm.journal.cleanup()

  if (opts.reportPreimages === true) {
    vm.evm.journal.startReportingPreimages!()
  }

  await vm.evm.journal.checkpoint()
  if (vm.DEBUG) {
    debug('-'.repeat(100))
    debug(`tx checkpoint`)
  }

  try {
    const result = await _runTx(vm, opts)
    await vm.evm.journal.commit()
    if (vm.DEBUG) {
      debug(`tx checkpoint committed`)
    }
    return result
  } catch (e: unknown) {
    await vm.evm.journal.revert()
    if (vm.DEBUG) {
      debug(`tx checkpoint reverted`)
    }
    throw e
  } finally {
    vm.evm.stateManager.originalStorageCache.clear()
  }
}

async function _runTx(vm: VM, opts: RunTxOpts): Promise<RunTxResult> {
  const state = vm.stateManager

  const { tx, block } = opts

  /**
   * The `beforeTx` event
   *
   * @event Event: beforeTx
   * @type {Object}
   * @property {Transaction} tx emits the Transaction that is about to be processed
   */
  await vm._emit('beforeTx', tx)

  const caller = tx.getSenderAddress()
  if (vm.DEBUG) {
    debug(
      `New tx run hash=${
        opts.tx.isSigned() ? bytesToHex(opts.tx.hash()) : 'unsigned'
      } sender=${caller}`,
    )
  }

  // Validate gas limit against tx base fee (DataFee + TxFee)
  const intrinsicGas = tx.getIntrinsicGas()

  let gasLimit = tx.gasLimit
  if (gasLimit < intrinsicGas) {
    const msg = _errorMsg(
      `tx gas limit ${Number(gasLimit)} is lower than the minimum gas limit of ${Number(
        intrinsicGas,
      )}`,
      vm,
      block,
      tx,
    )
    throw EthereumJSErrorWithoutCode(msg)
  }
  gasLimit -= intrinsicGas
  if (vm.DEBUG) {
    debugGas(`Subtracting base fee (${intrinsicGas}) from gasLimit (-> ${gasLimit})`)
  }

  // Check from account's balance and nonce
  let fromAccount = await state.getAccount(caller)
  if (fromAccount === undefined) {
    fromAccount = new Account()
  }
  const { nonce, balance } = fromAccount
  if (vm.DEBUG) {
    debug(`Sender's pre-tx balance is ${balance}`)
  }

  // Check balance against upfront tx cost
  const upFrontCost = tx.getUpfrontCost()
  if (balance < upFrontCost) {
    if (opts.skipBalance === true && fromAccount.balance < upFrontCost) {
      // if skipBalance, ensure caller balance is enough to run transaction
      fromAccount.balance = upFrontCost
      await vm.evm.journal.putAccount(caller, fromAccount)
    } else {
      const msg = _errorMsg(
        `sender doesn't have enough funds to send tx. The upfront cost is: ${upFrontCost} and the sender's account (${caller}) only has: ${balance}`,
        vm,
        block,
        tx,
      )
      throw EthereumJSErrorWithoutCode(msg)
    }
  }

  // Check max cost (value + gas * gasPrice)
  const maxCost = tx.value + tx.gasLimit * (tx as LegacyTx).gasPrice

  if (fromAccount.balance < maxCost) {
    if (opts.skipBalance === true && fromAccount.balance < maxCost) {
      // if skipBalance, ensure caller balance is enough to run transaction
      fromAccount.balance = maxCost
      await vm.evm.journal.putAccount(caller, fromAccount)
    } else {
      const msg = _errorMsg(
        `sender doesn't have enough funds to send tx. The max cost is: ${maxCost} and the sender's account (${caller}) only has: ${balance}`,
        vm,
        block,
        tx,
      )
      throw EthereumJSErrorWithoutCode(msg)
    }
  }

  if (opts.skipNonce !== true) {
    if (nonce !== tx.nonce) {
      const msg = _errorMsg(
        `the tx doesn't have the correct nonce. account has nonce of: ${nonce} tx has nonce of: ${tx.nonce}`,
        vm,
        block,
        tx,
      )
      throw EthereumJSErrorWithoutCode(msg)
    }
  }

  // Legacy transaction - gas price is the price
  const gasPrice = (tx as LegacyTx).gasPrice

  // Update from account's balance
  const txCost = tx.gasLimit * gasPrice
  fromAccount.balance -= txCost
  if (opts.skipBalance === true && fromAccount.balance < BIGINT_0) {
    fromAccount.balance = BIGINT_0
  }
  await vm.evm.journal.putAccount(caller, fromAccount)

  if (vm.DEBUG) {
    debug(`Update fromAccount (caller) balance (-> ${fromAccount.balance}))`)
  }

  /*
   * Execute message (value transfer only)
   */
  const { value, data, to } = tx

  if (vm.DEBUG) {
    debug(
      `Running tx=${
        tx.isSigned() ? bytesToHex(tx.hash()) : 'unsigned'
      } with caller=${caller} gasLimit=${gasLimit} to=${
        to?.toString() ?? 'none'
      } value=${value} data=${short(data)}`,
    )
  }

  const results = (await vm.evm.runCall({
    block,
    gasPrice,
    caller,
    gasLimit,
    to,
    value,
    data,
  })) as RunTxResult

  if (vm.DEBUG) {
    debug(`Update fromAccount (caller) nonce (-> ${fromAccount.nonce})`)
  }

  if (vm.DEBUG) {
    const { executionGasUsed, exceptionError } = results.execResult
    debug('-'.repeat(100))
    debug(
      `Received tx execResult: [ executionGasUsed=${executionGasUsed} exceptionError=${
        exceptionError !== undefined ? `'${exceptionError.error}'` : 'none'
      } gasRefund=${results.gasRefund ?? 0} ]`,
    )
  }

  /*
   * Parse results
   */
  // Generate the bloom for the tx (empty for value transfers)
  results.bloom = txLogsBloom(undefined, vm.common)
  if (vm.DEBUG) {
    debug(`Generated tx bloom with logs=0`)
  }

  // Calculate the total gas used
  results.totalGasSpent = results.execResult.executionGasUsed + intrinsicGas
  if (vm.DEBUG) {
    debugGas(`tx add baseFee ${intrinsicGas} to totalGasSpent (-> ${results.totalGasSpent})`)
  }

  // Process any gas refund
  let gasRefund = results.execResult.gasRefund ?? BIGINT_0
  results.gasRefund = gasRefund
  const maxRefundQuotient = vm.common.param('maxRefundQuotient')
  if (gasRefund !== BIGINT_0) {
    const maxRefund = results.totalGasSpent / maxRefundQuotient
    gasRefund = gasRefund < maxRefund ? gasRefund : maxRefund
    results.totalGasSpent -= gasRefund
    if (vm.DEBUG) {
      debug(`Subtract tx gasRefund (${gasRefund}) from totalGasSpent (-> ${results.totalGasSpent})`)
    }
  } else {
    if (vm.DEBUG) {
      debug(`No tx gasRefund`)
    }
  }

  results.amountSpent = results.totalGasSpent * gasPrice

  // Update sender's balance
  fromAccount = await state.getAccount(caller)
  if (fromAccount === undefined) {
    fromAccount = new Account()
  }
  const actualTxCost = results.totalGasSpent * gasPrice
  const txCostDiff = txCost - actualTxCost
  fromAccount.balance += txCostDiff
  await vm.evm.journal.putAccount(caller, fromAccount)
  if (vm.DEBUG) {
    debug(
      `Refunded txCostDiff (${txCostDiff}) to fromAccount (caller) balance (-> ${fromAccount.balance})`,
    )
  }

  // Update miner's balance
  const miner = block?.header.coinbase ?? DEFAULT_HEADER.coinbase

  let minerAccount = await state.getAccount(miner)
  if (minerAccount === undefined) {
    minerAccount = new Account()
  }
  // add the amount spent on gas to the miner's account
  results.minerValue = results.amountSpent
  minerAccount.balance += results.minerValue

  await vm.evm.journal.putAccount(miner, minerAccount)
  if (vm.DEBUG) {
    debug(`tx update miner account (${miner}) balance (-> ${minerAccount.balance})`)
  }

  if (opts.reportPreimages === true && vm.evm.journal.preimages !== undefined) {
    results.preimages = vm.evm.journal.preimages
  }

  await vm.evm.journal.cleanup()
  state.originalStorageCache.clear()

  // Generate the tx receipt
  const gasUsed = opts.blockGasUsed ?? block?.header.gasUsed ?? DEFAULT_HEADER.gasUsed
  const cumulativeGasUsed = gasUsed + results.totalGasSpent
  results.receipt = await generateTxReceipt(vm, tx, results, cumulativeGasUsed)

  /**
   * The `afterTx` event
   *
   * @event Event: afterTx
   * @type {Object}
   * @property {Object} result result of the transaction
   */
  const event: AfterTxEvent = { transaction: tx, ...results }
  await vm._emit('afterTx', event)
  if (vm.DEBUG) {
    debug(
      `tx run finished hash=${
        opts.tx.isSigned() ? bytesToHex(opts.tx.hash()) : 'unsigned'
      } sender=${caller}`,
    )
  }

  return results
}

/**
 * @method txLogsBloom
 * @private
 */
function txLogsBloom(_logs?: unknown[], common?: Common): Bloom {
  // For value-transfer-only blockchain, there are no logs
  return new Bloom(undefined, common)
}

/**
 * Returns the tx receipt (Pre-Byzantium style for Frontier).
 * @param vm The vm instance
 * @param tx The transaction
 * @param txResult The tx result
 * @param cumulativeGasUsed The gas used in the block including this tx
 */
export async function generateTxReceipt(
  vm: VM,
  tx: TypedTransaction,
  txResult: RunTxResult,
  cumulativeGasUsed: bigint,
): Promise<TxReceipt> {
  const baseReceipt: BaseTxReceipt = {
    cumulativeBlockGasUsed: cumulativeGasUsed,
    bitvector: txResult.bloom.bitvector,
    logs: [], // No logs in value-transfer-only blockchain
  }

  if (vm.DEBUG) {
    debug(
      `Generate tx receipt transactionType=${
        tx.type
      } cumulativeBlockGasUsed=${cumulativeGasUsed} bitvector=${short(baseReceipt.bitvector)} (${
        baseReceipt.bitvector.length
      } bytes) logs=0`,
    )
  }

  // Pre-Byzantium receipt (Frontier) - includes stateRoot
  const stateRoot = await vm.stateManager.getStateRoot()
  const receipt = {
    stateRoot,
    ...baseReceipt,
  } as PreByzantiumTxReceipt

  return receipt
}

/**
 * Internal helper function to create an annotated error message
 *
 * @param msg Base error message
 * @hidden
 */
function _errorMsg(msg: string, vm: VM, block: Block | undefined, tx: TypedTransaction) {
  const blockOrHeader = block ?? DEFAULT_HEADER
  const blockErrorStr = 'errorStr' in blockOrHeader ? blockOrHeader.errorStr() : 'block'
  const txErrorStr = 'errorStr' in tx ? tx.errorStr() : 'tx'

  const errorMsg = `${msg} (${vm.errorStr()} -> ${blockErrorStr} -> ${txErrorStr})`
  return errorMsg
}
