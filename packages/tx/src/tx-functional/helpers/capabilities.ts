import type { Capability } from '../../types'
import { TransactionType } from '../../types'
import type { FrozenTransaction } from '../types'
import { getTxType } from './accessors'

/**
 * Checks if a transaction supports a specific capability.
 */
export function supports(tx: FrozenTransaction, capability: Capability): boolean {
  const txType = getTxType(tx)
  const chainId = tx.inner.chainId()

  switch (capability) {
    case 155: // EIP155ReplayProtection
      // Legacy transactions support EIP-155 if they have chainId in signature
      return chainId !== undefined

    case 1559: // EIP1559FeeMarket
      return (
        txType === TransactionType.FeeMarketEIP1559 ||
        txType === TransactionType.BlobEIP4844 ||
        txType === TransactionType.EOACodeEIP7702
      )

    case 2718: // EIP2718TypedTransaction
      return txType !== TransactionType.Legacy

    case 2930: // EIP2930AccessLists
      return (
        txType === TransactionType.AccessListEIP2930 ||
        txType === TransactionType.FeeMarketEIP1559 ||
        txType === TransactionType.BlobEIP4844 ||
        txType === TransactionType.EOACodeEIP7702
      )

    case 7702: // EIP7702EOACode
      return txType === TransactionType.EOACodeEIP7702

    default:
      return false
  }
}

/**
 * Checks if an EIP is active for this transaction's hardfork context.
 */
export function isEIPActive(tx: FrozenTransaction, eip: number): boolean {
  const hardfork = tx.hardforkManager.getHardforkFromContext({
    blockNumber: 0n,
  })
  return tx.hardforkManager.isEIPActiveAtHardfork(eip, hardfork)
}

