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
 * HomesteadSigner implements Signer using the homestead rules.
 * Equivalent to Go's HomesteadSigner.
 *
 * The only valid reason to use this type is creating legacy transactions
 * which are intentionally not replay-protected.
 *
 * Extends FrontierSigner and adds strict S value validation (EIP-2).
 */
export class HomesteadSigner extends FrontierSigner {
  /**
   * HomesteadSigner has no chain ID.
   */
  chainID(): bigint | null {
    return null
  }

  /**
   * Inherits SignatureValues from FrontierSigner.
   */
  signatureValues(
    tx: TxManager,
    sig: Uint8Array,
  ): { r: bigint; s: bigint; v: bigint } {
    return super.signatureValues(tx, sig)
  }

  /**
   * Recovers the sender address from the transaction signature.
   * Uses strict S validation (Homestead/EIP-2 rule).
   * Equivalent to Go's HomesteadSigner.Sender(tx).
   */
  sender(tx: TxManager): Address {
    if (tx.type !== 0) {
      throw new Error('Transaction type not supported by HomesteadSigner')
    }

    const [v, r, s] = tx.rawSignatureValues()
    if (v === undefined || r === undefined || s === undefined) {
      throw new Error('Invalid signature: transaction is not signed')
    }

    // Validate S value (EIP-2 / Homestead rule)
    if (s > SECP256K1_ORDER_DIV_2) {
      throw new Error(
        'Invalid signature: s-values greater than secp256k1n/2 are invalid',
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
