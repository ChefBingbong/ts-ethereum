import {
  Address,
  bigIntToUnpaddedBytes,
  ecrecover,
  publicToAddress,
  SECP256K1_ORDER_DIV_2,
} from '@ts-ethereum/utils'
import type { Signer, TxManager } from '../types'
import { FrontierSigner } from './frontier'

/**
 * HomesteadSigner implements Signer using the Homestead rules.
 * Same as FrontierSigner but with stricter S validation (EIP-2).
 */
export class HomesteadSigner extends FrontierSigner {
  /**
   * HomesteadSigner has no chain ID (pre-EIP155).
   */
  chainID(): bigint | null {
    return null
  }

  /**
   * Recovers the sender address from the transaction signature.
   * Uses stricter S validation per EIP-2 (s <= secp256k1n/2).
   */
  getSenderAddress(tx: TxManager): Address {
    const [v, r, s] = tx.tx.inner.rawSignatureValues()
    if (v === undefined || r === undefined || s === undefined) {
      throw new Error('Cannot recover sender: transaction is not signed')
    }

    // EIP-2: Validate S value
    if (s > SECP256K1_ORDER_DIV_2) {
      throw new Error(
        'Invalid Signature: s-values greater than secp256k1n/2 are considered invalid',
      )
    }

    const sigHash = this.hash(tx)
    const publicKey = ecrecover(
      sigHash,
      v,
      bigIntToUnpaddedBytes(r),
      bigIntToUnpaddedBytes(s),
    )

    return new Address(publicToAddress(publicKey, false))
  }

  equal(other: Signer): boolean {
    return other instanceof HomesteadSigner
  }
}
