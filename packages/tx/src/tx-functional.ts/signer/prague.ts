import { TransactionType } from '../../types'
import type { Signer } from '../types'
import { CancunSigner } from './cancun'

/**
 * PragueSigner implements Signer for EIP-7702 EOA code transactions.
 * Equivalent to Go's modernSigner with Prague fork.
 *
 * Accepts:
 * - EIP-7702 EOA code transactions
 * - EIP-4844 blob transactions
 * - EIP-1559 dynamic fee transactions
 * - EIP-2930 access list transactions
 * - EIP-155 replay protected transactions
 * - Legacy Homestead transactions
 */
export class PragueSigner extends CancunSigner {
  /**
   * Check if this signer supports the given tx type.
   */
  protected supportsType(txType: TransactionType): boolean {
    return (
      super.supportsType(txType) || txType === TransactionType.EOACodeEIP7702
    )
  }

  equal(other: Signer): boolean {
    if (!(other instanceof PragueSigner)) {
      return false
    }
    return this.chainID() === other.chainID()
  }
}
