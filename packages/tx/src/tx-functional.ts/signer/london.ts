import { EIP2930Signer } from './eip2930'
import type { Signer } from '../types'

/**
 * LondonSigner implements Signer for EIP-1559 dynamic fee transactions.
 * Extends EIP2930Signer since it uses the same signing scheme but supports
 * additional transaction types (type 2).
 */
export class LondonSigner extends EIP2930Signer {
  constructor(chainId: bigint) {
    super(chainId)
  }

  equal(other: Signer): boolean {
    if (!(other instanceof LondonSigner)) {
      return false
    }
    return this.chainID() === other.chainID()
  }
}
