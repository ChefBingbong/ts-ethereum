import { CancunSigner } from './cancun'
import type { Signer } from '../types'

/**
 * PragueSigner implements Signer for EIP-7702 set code transactions.
 * Extends CancunSigner since it uses the same signing scheme but supports
 * additional transaction types (type 4).
 */
export class PragueSigner extends CancunSigner {
  constructor(chainId: bigint) {
    super(chainId)
  }

  equal(other: Signer): boolean {
    if (!(other instanceof PragueSigner)) {
      return false
    }
    return this.chainID() === other.chainID()
  }
}
