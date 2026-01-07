import { Hardfork } from '@ts-ethereum/chain-config'
import { BIGINT_0 } from '@ts-ethereum/utils'
import { TransactionType } from '../../types'
import type { FrozenTransaction } from '../types'
import {
  getData,
  getGasLimit,
  getGasPrice,
  getMaxFeePerGas,
  getMaxPriorityFeePerGas,
  getTo,
  getTxType,
  getValue,
} from './accessors'

/**
 * Calculates the data gas cost for a transaction.
 */
export function getDataGas(tx: FrozenTransaction): bigint {
  const hardfork = tx.hardforkManager.getHardforkFromContext({
    blockNumber: 0n,
  })
  const txDataZero = tx.hardforkManager.getParamAtHardfork(
    'txDataZeroGas',
    hardfork,
  )!
  const txDataNonZero = tx.hardforkManager.getParamAtHardfork(
    'txDataNonZeroGas',
    hardfork,
  )!

  const data = getData(tx)
  let cost = BIGINT_0

  for (let i = 0; i < data.length; i++) {
    cost += data[i] === 0 ? txDataZero : txDataNonZero
  }

  // EIP-3860: Limit and meter initcode
  const to = getTo(tx)
  if (
    (to === undefined || to.bytes.length === 0) &&
    tx.hardforkManager.isEIPActiveAtHardfork(3860, hardfork)
  ) {
    const dataLength = BigInt(Math.ceil(data.length / 32))
    const initCodeCost =
      tx.hardforkManager.getParamAtHardfork('initCodeWordGas', hardfork)! *
      dataLength
    cost += initCodeCost
  }

  return cost
}

/**
 * Calculates the intrinsic gas cost for a transaction.
 */
export function getIntrinsicGas(tx: FrozenTransaction): bigint {
  const hardfork = tx.hardforkManager.getHardforkFromContext({
    blockNumber: 0n,
  })
  const txFee = tx.hardforkManager.getParamAtHardfork('txGas', hardfork)!
  let fee = getDataGas(tx)
  if (txFee) fee += txFee

  const to = getTo(tx)
  const isContractCreation = to === undefined || to.bytes.length === 0

  if (
    tx.hardforkManager.hardforkGte(Hardfork.Homestead, hardfork) &&
    isContractCreation
  ) {
    const txCreationFee = tx.hardforkManager.getParamAtHardfork(
      'txCreationGas',
      hardfork,
    )!
    if (txCreationFee) fee += txCreationFee
  }

  return fee
}

/**
 * Calculates the effective gas price for a transaction given a base fee.
 */
export function effectiveGasPrice(
  tx: FrozenTransaction,
  baseFee?: bigint,
): bigint {
  return tx.inner.effectiveGasPrice(baseFee)
}

/**
 * Calculates the upfront cost for a transaction.
 * @param baseFee - Optional base fee for EIP-1559 transactions (defaults to 0)
 */
export function getUpfrontCost(
  tx: FrozenTransaction,
  baseFee: bigint = BIGINT_0,
): bigint {
  const gasLimit = getGasLimit(tx)
  const txType = getTxType(tx)
  const value = getValue(tx)

  // EIP-1559 transactions use effective gas price
  if (
    txType === TransactionType.FeeMarketEIP1559 ||
    txType === TransactionType.BlobEIP4844 ||
    txType === TransactionType.EOACodeEIP7702
  ) {
    const effectiveGasPriceValue = effectiveGasPrice(tx, baseFee)
    return gasLimit * effectiveGasPriceValue + value
  } else {
    // Legacy and AccessList transactions
    const gasPrice = getGasPrice(tx)
    return gasLimit * gasPrice + value
  }
}

/**
 * Gets the effective priority fee for a transaction given a base fee.
 * For EIP-1559 transactions, this is min(maxFeePerGas - baseFee, maxPriorityFeePerGas).
 * For legacy transactions, this is gasPrice - baseFee (if baseFee provided).
 */
export function getEffectivePriorityFee(
  tx: FrozenTransaction,
  baseFee: bigint | undefined,
): bigint {
  const txType = getTxType(tx)

  if (
    txType === TransactionType.FeeMarketEIP1559 ||
    txType === TransactionType.BlobEIP4844 ||
    txType === TransactionType.EOACodeEIP7702
  ) {
    if (baseFee === undefined) {
      throw new Error('Tx cannot pay baseFee')
    }
    const maxFeePerGas = getMaxFeePerGas(tx)!
    if (baseFee > maxFeePerGas) {
      throw new Error('Tx cannot pay baseFee')
    }
    const maxPriorityFeePerGas = getMaxPriorityFeePerGas(tx)!
    const remainingFee = maxFeePerGas - baseFee
    return maxPriorityFeePerGas < remainingFee
      ? maxPriorityFeePerGas
      : remainingFee
  } else {
    // Legacy or AccessList transactions
    const gasPrice = getGasPrice(tx)
    if (baseFee !== undefined && baseFee > gasPrice) {
      throw new Error('Tx cannot pay baseFee')
    }
    return baseFee === undefined ? gasPrice : gasPrice - baseFee
  }
}
