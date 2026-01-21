import { TransactionType } from '../../types'
import type { Signer } from '../types'
import { LondonSigner } from './london'

/**
 * CancunSigner implements Signer for EIP-4844 blob transactions.
 * Equivalent to Go's modernSigner with Cancun fork.
 *
 * Accepts:
 * - EIP-4844 blob transactions
 * - EIP-1559 dynamic fee transactions
 * - EIP-2930 access list transactions
 * - EIP-155 replay protected transactions
 * - Legacy Homestead transactions
 */
export class CancunSigner extends LondonSigner {
  /**
   * Check if this signer supports the given tx type.
   */
  protected supportsType(txType: TransactionType): boolean {
    return super.supportsType(txType) || txType === TransactionType.BlobEIP4844
  }

  equal(other: Signer): boolean {
    if (!(other instanceof CancunSigner)) {
      return false
    }
    return this.chainID() === other.chainID()
  }
}
