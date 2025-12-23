/**
 * ETH Protocol Wire Format Utilities
 *
 * Handles RLP encoding/decoding, Snappy compression, and STATUS message encoding
 * for ETH protocol messages. This replaces direct use of devp2p ETH protocol's
 * sendMessage() and sendStatus() methods.
 *
 * Architecture:
 * - devp2p/protocol/eth.ts: Thin adapter that handles RLP decoding of incoming messages
 *   and emits events. Used only for event listening from RLPxConnection.
 * - This wire module: Handles all encoding/compression for outgoing messages.
 * - EthHandler: Uses wire module to encode and sends via RLPxConnection.sendSubprotocolMessage()
 *   directly, bypassing devp2p's sendMessage().
 */

import * as snappy from 'snappyjs'
import { RLP } from '@ts-ethereum/rlp'
import {
  bigIntToBytes,
  bigIntToUnpaddedBytes,
  bytesToBigInt,
  bytesToHex,
  bytesToInt,
  hexToBytes,
  intToBytes,
  isHexString,
  type PrefixedHexString,
} from '@ts-ethereum/utils'
import type { RLPxConnection } from '../../transport/rlpx/connection'
import { EthMessageCode } from '../../../client/net/protocol/eth/definitions'

const BIGINT_0 = BigInt(0)

export interface EthStatusOpts {
  td: Uint8Array
  bestHash: Uint8Array
  latestBlock?: Uint8Array
  genesisHash: Uint8Array
  forkHash?: string
  nextForkBlock?: bigint
}

export interface EthStatusEncoded {
  chainId: Uint8Array
  td: Uint8Array
  bestHash: Uint8Array
  genesisHash: Uint8Array
  forkId?: Uint8Array | Uint8Array[]
}

/**
 * Check if peer supports Snappy compression (DevP2P >= v5)
 */
function supportsSnappy(connection: RLPxConnection): boolean {
  const hello = connection.getHelloMessage()
  return hello !== null && hello.protocolVersion >= 5
}

/**
 * Encode and optionally compress payload
 */
export function encodePayload(
  payload: Uint8Array,
  connection: RLPxConnection,
): Uint8Array {
  if (supportsSnappy(connection)) {
    return snappy.compress(payload)
  }
  return payload
}

/**
 * Decode and optionally decompress payload
 */
export function decodePayload(
  payload: Uint8Array,
  connection: RLPxConnection,
): Uint8Array {
  // Try to decompress - if it fails, assume uncompressed
  try {
    return snappy.uncompress(payload)
  } catch {
    return payload
  }
}

/**
 * Encode STATUS message for ETH protocol
 * @param version Protocol version (e.g., 68)
 * @param chainId Chain ID
 * @param status Status options
 * @returns RLP-encoded STATUS message
 */
export function encodeStatus(
  version: number,
  chainId: bigint,
  status: EthStatusOpts,
): Uint8Array {
  const statusArray: any[] = [
    intToBytes(version),
    bigIntToBytes(chainId),
    status.td,
    status.bestHash,
    status.genesisHash,
  ]

  // Add fork ID for ETH/64+
  if (version >= 64) {
    const forkHashB = status.forkHash
      ? hexToBytes(
          isHexString(status.forkHash)
            ? status.forkHash
            : `0x${status.forkHash}`,
        )
      : new Uint8Array(4) // Default fork hash

    const nextForkB =
      status.nextForkBlock !== undefined && status.nextForkBlock !== BIGINT_0
        ? bigIntToBytes(status.nextForkBlock)
        : new Uint8Array()

    statusArray.push([forkHashB, nextForkB])
  }

  return RLP.encode(statusArray)
}

/**
 * Decode STATUS message from ETH protocol
 * @param data RLP-encoded STATUS message
 * @returns Decoded status object
 */
export function decodeStatus(data: Uint8Array): EthStatusEncoded {
  const decoded = RLP.decode(data) as Uint8Array[]

  const status: EthStatusEncoded = {
    chainId: decoded[1] as Uint8Array,
    td: decoded[2] as Uint8Array,
    bestHash: decoded[3] as Uint8Array,
    genesisHash: decoded[4] as Uint8Array,
  }

  if (decoded.length > 5) {
    status.forkId = decoded[5] as Uint8Array | Uint8Array[]
  }

  return status
}

/**
 * Encode a protocol message payload
 * @param payload RLP-encodable payload
 * @param connection RLPx connection (for Snappy compression check)
 * @returns Encoded and optionally compressed payload
 */
export function encodeMessage(
  payload: any,
  connection: RLPxConnection,
): Uint8Array {
  const encoded = RLP.encode(payload)
  return encodePayload(encoded, connection)
}

/**
 * Decode a protocol message payload
 * @param data Encoded (and possibly compressed) payload
 * @param connection RLPx connection (for Snappy decompression)
 * @returns Decoded payload
 */
export function decodeMessage(
  data: Uint8Array,
  connection: RLPxConnection,
): any {
  const decompressed = decodePayload(data, connection)
  return RLP.decode(decompressed)
}

/**
 * Validate message code against protocol version
 * @param code Message code
 * @param version Protocol version
 * @returns true if message is valid for this version
 */
export function validateMessageCode(
  code: EthMessageCode,
  version: number,
): boolean {
  switch (code) {
    case EthMessageCode.STATUS:
      return true // Always valid

    case EthMessageCode.NEW_BLOCK_HASHES:
    case EthMessageCode.TRANSACTIONS:
    case EthMessageCode.GET_BLOCK_HEADERS:
    case EthMessageCode.BLOCK_HEADERS:
    case EthMessageCode.GET_BLOCK_BODIES:
    case EthMessageCode.BLOCK_BODIES:
    case EthMessageCode.NEW_BLOCK:
      return version >= 62

    case EthMessageCode.GET_RECEIPTS:
    case EthMessageCode.RECEIPTS:
      return version >= 63

    case EthMessageCode.NEW_POOLED_TRANSACTION_HASHES:
    case EthMessageCode.GET_POOLED_TRANSACTIONS:
    case EthMessageCode.POOLED_TRANSACTIONS:
      return version >= 65

    case EthMessageCode.GET_NODE_DATA:
    case EthMessageCode.NODE_DATA:
      return version >= 63 && version <= 66

    default:
      return false
  }
}
