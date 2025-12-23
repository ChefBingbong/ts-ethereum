import { RLP } from '@ts-ethereum/rlp'
import {
  bigIntToUnpaddedBytes,
  bytesToBigInt,
  bytesToHex,
  equalsBytes,
} from '@ts-ethereum/utils'
import type { Chain } from '../../../client/blockchain'
import type { Config } from '../../../client/config'
import type { EthStatus } from './types'

/**
 * Encode STATUS message for sending
 */
export function encodeStatus(chain: Chain, config: Config): Uint8Array {
  const header = chain.headers.latest
  if (!header) {
    throw new Error('No chain header available for STATUS')
  }

  const genesis = chain.genesis
  if (!genesis) {
    throw new Error('No genesis block available for STATUS')
  }

  const chainId = config.chainCommon.chainId()
  const td = chain.headers.td
  const bestHash = header.hash()
  const genesisHash = genesis.hash()

  // Convert to RLP array format expected by devp2p
  const statusArray: (Uint8Array | Uint8Array[])[] = [
    bigIntToUnpaddedBytes(BigInt(68)), // protocol version (eth/68)
    bigIntToUnpaddedBytes(chainId), // networkId (chainId)
    bigIntToUnpaddedBytes(td), // total difficulty
    bestHash, // best hash
    genesisHash, // genesis hash
  ]

  // Add forkId for eth/64+
  const common = config.chainCommon
  if (common.hardfork() !== undefined) {
    // Simplified forkId for chainstart
    const forkHash = new Uint8Array(4) // 4 bytes
    const nextFork = new Uint8Array(8) // 8 bytes (bigint)
    statusArray.push([forkHash, nextFork])
  }

  return RLP.encode(statusArray)
}

/**
 * Decode STATUS message received from peer
 */
export function decodeStatus(data: Uint8Array): EthStatus {
  const decoded = RLP.decode(data) as Uint8Array[]

  if (decoded.length < 5) {
    throw new Error('Invalid STATUS message format')
  }

  const chainId = bytesToBigInt(decoded[1] as Uint8Array) // decoded[0] is protocol version, decoded[1] is networkId/chainId
  const td = bytesToBigInt(decoded[2] as Uint8Array)
  const bestHash = decoded[3] as Uint8Array
  const genesisHash = decoded[4] as Uint8Array
  const forkId =
    decoded.length > 5
      ? (decoded[5] as unknown as [Uint8Array, Uint8Array])
      : undefined

  return {
    chainId,
    td,
    bestHash,
    genesisHash,
    forkId,
  }
}

/**
 * Validate STATUS message compatibility
 */
export function validateStatus(
  localStatus: EthStatus,
  remoteStatus: EthStatus,
): void {
  // Check chain ID match
  if (localStatus.chainId !== remoteStatus.chainId) {
    throw new Error(
      `Chain ID mismatch: local=${localStatus.chainId}, remote=${remoteStatus.chainId}`,
    )
  }

  // Check genesis hash match
  if (!equalsBytes(localStatus.genesisHash, remoteStatus.genesisHash)) {
    throw new Error(
      `Genesis hash mismatch: local=${bytesToHex(localStatus.genesisHash)}, remote=${bytesToHex(remoteStatus.genesisHash)}`,
    )
  }

  // Fork ID validation (if present)
  if (localStatus.forkId && remoteStatus.forkId) {
    const localForkHash = bytesToHex(localStatus.forkId[0])
    const remoteForkHash = bytesToHex(remoteStatus.forkId[0])
    if (localForkHash !== remoteForkHash) {
      throw new Error(
        `Fork hash mismatch: local=${localForkHash}, remote=${remoteForkHash}`,
      )
    }
  }
}
