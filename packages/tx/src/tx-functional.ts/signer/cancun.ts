import { LondonSigner } from './london'
import type { Signer } from '../types'

/**
 * CancunSigner implements Signer for EIP-4844 blob transactions.
 * Extends LondonSigner since it uses the same signing scheme but supports
 * additional transaction types (type 3).
 */
export class CancunSigner extends LondonSigner {
  constructor(chainId: bigint) {
    super(chainId)
  }

  equal(other: Signer): boolean {
    if (!(other instanceof CancunSigner)) {
      return false
    }
    return this.chainID() === other.chainID()
  }
}
