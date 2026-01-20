import { EIP155Signer } from './eip155'
import type { Signer } from '../types'

/**
 * EIP2930Signer implements Signer for EIP-2930 access list transactions.
 * Extends EIP155Signer since it uses the same signing scheme but supports
 * additional transaction types (type 1).
 */
export class EIP2930Signer extends EIP155Signer {
  constructor(chainId: bigint) {
    super(chainId)
  }

  equal(other: Signer): boolean {
    if (!(other instanceof EIP2930Signer)) {
      return false
    }
    return this.chainID() === other.chainID()
  }
}
