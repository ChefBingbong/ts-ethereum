import { TransactionType } from '../../types'
import type { Signer } from '../types'
import { EIP2930Signer } from './eip2930'

/**
 * LondonSigner implements Signer for EIP-1559 dynamic fee transactions.
 * Equivalent to Go's modernSigner with London fork.
 *
 * Accepts:
 * - EIP-1559 dynamic fee transactions
 * - EIP-2930 access list transactions
 * - EIP-155 replay protected transactions
 * - Legacy Homestead transactions
 */
export class LondonSigner extends EIP2930Signer {
  /**
   * Check if this signer supports the given tx type.
   */
  protected supportsType(txType: TransactionType): boolean {
    return (
      super.supportsType(txType) || txType === TransactionType.FeeMarketEIP1559
    )
  }

  equal(other: Signer): boolean {
    if (!(other instanceof LondonSigner)) {
      return false
    }
    return this.chainID() === other.chainID()
  }
}
