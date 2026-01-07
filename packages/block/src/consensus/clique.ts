import {
  type CliqueConfig,
  ConsensusAlgorithm,
} from '@ts-ethereum/chain-config'
import { RLP } from '@ts-ethereum/rlp'
import {
  Address,
  BIGINT_0,
  BIGINT_27,
  bytesToBigInt,
  concatBytes,
  createAddressFromPublicKey,
  createZeroAddress,
  EthereumJSErrorWithoutCode,
  ecrecover,
  equalsBytes,
} from '@ts-ethereum/utils'
import { keccak256 } from 'ethereum-cryptography/keccak'
import { secp256k1 } from 'ethereum-cryptography/secp256k1.js'

import type { BlockHeaderManager } from '../header-functional'

// Fixed number of extra-data prefix bytes reserved for signer vanity
export const CLIQUE_EXTRA_VANITY = 32
// Fixed number of extra-data suffix bytes reserved for signer seal
export const CLIQUE_EXTRA_SEAL = 65

// This function is not exported in the index file to keep it internal
export function requireClique(header: BlockHeaderManager, name: string) {
  if (header.consensusAlgorithm !== ConsensusAlgorithm.Clique) {
    const msg = `BlockHeader.${name}() call only supported for clique PoA networks`

    throw EthereumJSErrorWithoutCode(msg)
  }
}

/**
 * PoA clique signature hash without the seal.
 */
export function cliqueSigHash(header: BlockHeaderManager) {
  requireClique(header, 'cliqueSigHash')
  const raw = header.raw()
  const extraData = header.header.data.extraData
  raw[12] = extraData.subarray(0, extraData.length - CLIQUE_EXTRA_SEAL)
  return keccak256(RLP.encode(raw))
}

/**
 * Checks if the block header is an epoch transition
 * header (only clique PoA, throws otherwise)
 */
export function cliqueIsEpochTransition(header: BlockHeaderManager): boolean {
  requireClique(header, 'cliqueIsEpochTransition')
  // Get clique config from chain config
  const cliqueConfig = header.header.hardforkManager.config.spec.chain
    ?.consensus?.clique as CliqueConfig | undefined
  const epoch = BigInt(cliqueConfig?.epoch ?? 30000)
  // Epoch transition block if the block number has no
  // remainder on the division by the epoch length
  return header.header.data.number % epoch === BIGINT_0
}

/**
 * Returns extra vanity data
 * (only clique PoA, throws otherwise)
 */
export function cliqueExtraVanity(header: BlockHeaderManager): Uint8Array {
  requireClique(header, 'cliqueExtraVanity')
  return header.header.data.extraData.subarray(0, CLIQUE_EXTRA_VANITY)
}

/**
 * Returns extra seal data
 * (only clique PoA, throws otherwise)
 */
export function cliqueExtraSeal(header: BlockHeaderManager): Uint8Array {
  requireClique(header, 'cliqueExtraSeal')
  return header.header.data.extraData.subarray(-CLIQUE_EXTRA_SEAL)
}

/**
 * Returns a list of signers
 * (only clique PoA, throws otherwise)
 *
 * This function throws if not called on an epoch
 * transition block and should therefore be used
 * in conjunction with {@link cliqueIsEpochTransition}
 */
export function cliqueEpochTransitionSigners(
  header: BlockHeaderManager,
): Address[] {
  requireClique(header, 'cliqueEpochTransitionSigners')
  if (!cliqueIsEpochTransition(header)) {
    const msg = 'Signers are only included in epoch transition blocks (clique)'
    throw EthereumJSErrorWithoutCode(msg)
  }

  const extraData = header.header.data.extraData
  const start = CLIQUE_EXTRA_VANITY
  const end = extraData.length - CLIQUE_EXTRA_SEAL
  const signerBytes = extraData.subarray(start, end)

  const signerList: Uint8Array[] = []
  const signerLength = 20
  for (
    let start = 0;
    start <= signerBytes.length - signerLength;
    start += signerLength
  ) {
    signerList.push(signerBytes.subarray(start, start + signerLength))
  }
  return signerList.map((buf) => new Address(buf))
}

/**
 * Returns the signer address
 */
export function cliqueSigner(header: BlockHeaderManager): Address {
  requireClique(header, 'cliqueSigner')
  const extraSeal = cliqueExtraSeal(header)
  // Reasonable default for default blocks
  if (extraSeal.length === 0 || equalsBytes(extraSeal, new Uint8Array(65))) {
    return createZeroAddress()
  }
  const r = extraSeal.subarray(0, 32)
  const s = extraSeal.subarray(32, 64)
  const v = bytesToBigInt(extraSeal.subarray(64, 65)) + BIGINT_27
  const pubKey = ecrecover(cliqueSigHash(header), v, r, s)
  return createAddressFromPublicKey(pubKey)
}

/**
 * Verifies the signature of the block (last 65 bytes of extraData field)
 * (only clique PoA, throws otherwise)
 *
 *  Method throws if signature is invalid
 */
export function cliqueVerifySignature(
  header: BlockHeaderManager,
  signerList: Address[],
): boolean {
  requireClique(header, 'cliqueVerifySignature')
  const signerAddress = cliqueSigner(header)
  const signerFound = signerList.find((signer) => {
    return signer.equals(signerAddress)
  })
  return !!signerFound
}

/**
 * Generates the extraData from a sealed block header
 * @param header block header from which to retrieve extraData
 * @param cliqueSigner clique signer key used for creating sealed block
 * @returns clique seal (i.e. extradata) for the block
 */
export function generateCliqueBlockExtraData(
  header: BlockHeaderManager,
  cliqueSigner: Uint8Array,
): Uint8Array {
  requireClique(header, 'generateCliqueBlockExtraData')

  // Ensure extraData is at least length CLIQUE_EXTRA_VANITY + CLIQUE_EXTRA_SEAL
  const minExtraDataLength = CLIQUE_EXTRA_VANITY + CLIQUE_EXTRA_SEAL
  let extraData = header.header.data.extraData
  if (extraData.length < minExtraDataLength) {
    const remainingLength = minExtraDataLength - extraData.length
    extraData = concatBytes(extraData, new Uint8Array(remainingLength))
  }

  // Create a temporary header manager with updated extraData for signature hash calculation
  // We need to create a modified raw array for the signature hash
  const raw = header.raw()
  raw[12] = extraData.subarray(0, extraData.length - CLIQUE_EXTRA_SEAL)
  const msgHash = keccak256(RLP.encode(raw))

  // Use secp256k1.sign for signing
  const ecSignFunction = secp256k1.sign

  // Use noble/curves secp256k1.sign with recovered format (returns 65-byte Uint8Array)
  // sigBytes format: [recovery (1 byte) | r (32 bytes) | s (32 bytes)]
  const sigBytes = ecSignFunction(msgHash, cliqueSigner, {
    prehash: false,
  }) as any

  // clique format: [r (32 bytes) | s (32 bytes) | recovery (1 byte)]
  const cliqueSignature = concatBytes(
    sigBytes.subarray(1),
    sigBytes.subarray(0, 1),
  )

  const extraDataWithoutSeal = extraData.subarray(
    0,
    extraData.length - CLIQUE_EXTRA_SEAL,
  )
  const finalExtraData = concatBytes(extraDataWithoutSeal, cliqueSignature)
  return finalExtraData
}
