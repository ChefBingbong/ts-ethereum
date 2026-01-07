import { RLP } from '@ts-ethereum/rlp'
import {
  BIGINT_0,
  bigIntToHex,
  bigIntToUnpaddedBytes,
  bytesToHex,
} from '@ts-ethereum/utils'
import type { BlockHeaderBytes, FrozenBlockHeader, JSONHeader } from '../types'
import { isEIPActive } from './getters'

export function toRaw(header: FrozenBlockHeader): BlockHeaderBytes {
  const data = header.data
  const rawItems: Uint8Array[] = [
    data.parentHash,
    data.uncleHash,
    data.coinbase.bytes,
    data.stateRoot,
    data.transactionsTrie,
    data.receiptTrie,
    data.logsBloom,
    bigIntToUnpaddedBytes(data.difficulty),
    bigIntToUnpaddedBytes(data.number),
    bigIntToUnpaddedBytes(data.gasLimit),
    bigIntToUnpaddedBytes(data.gasUsed),
    bigIntToUnpaddedBytes(data.timestamp ?? BIGINT_0),
    data.extraData,
    data.mixHash,
    data.nonce,
  ]

  if (isEIPActive(header, 1559)) {
    rawItems.push(bigIntToUnpaddedBytes(data.baseFeePerGas!))
  }
  if (isEIPActive(header, 4895)) {
    rawItems.push(data.withdrawalsRoot!)
  }
  if (isEIPActive(header, 4844)) {
    rawItems.push(bigIntToUnpaddedBytes(data.blobGasUsed!))
    rawItems.push(bigIntToUnpaddedBytes(data.excessBlobGas!))
  }
  if (isEIPActive(header, 4788)) {
    rawItems.push(data.parentBeaconBlockRoot!)
  }
  if (isEIPActive(header, 7685)) {
    rawItems.push(data.requestsHash!)
  }

  return rawItems
}

export function serialize(header: FrozenBlockHeader): Uint8Array {
  return RLP.encode(toRaw(header))
}

export function toJSON(header: FrozenBlockHeader): JSONHeader {
  const data = header.data
  const withdrawalAttr = data.withdrawalsRoot
    ? { withdrawalsRoot: bytesToHex(data.withdrawalsRoot) }
    : {}

  const JSONDict: JSONHeader = {
    parentHash: bytesToHex(data.parentHash),
    uncleHash: bytesToHex(data.uncleHash),
    coinbase: data.coinbase.toString(),
    stateRoot: bytesToHex(data.stateRoot),
    transactionsTrie: bytesToHex(data.transactionsTrie),
    ...withdrawalAttr,
    receiptTrie: bytesToHex(data.receiptTrie),
    logsBloom: bytesToHex(data.logsBloom),
    difficulty: bigIntToHex(data.difficulty),
    number: bigIntToHex(data.number),
    gasLimit: bigIntToHex(data.gasLimit),
    gasUsed: bigIntToHex(data.gasUsed),
    timestamp: bigIntToHex(data.timestamp),
    extraData: bytesToHex(data.extraData),
    mixHash: bytesToHex(data.mixHash),
    nonce: bytesToHex(data.nonce),
  }

  if (isEIPActive(header, 1559)) {
    JSONDict.baseFeePerGas = bigIntToHex(data.baseFeePerGas!)
  }
  if (isEIPActive(header, 4844)) {
    JSONDict.blobGasUsed = bigIntToHex(data.blobGasUsed!)
    JSONDict.excessBlobGas = bigIntToHex(data.excessBlobGas!)
  }
  if (isEIPActive(header, 4788)) {
    JSONDict.parentBeaconBlockRoot = bytesToHex(data.parentBeaconBlockRoot!)
  }
  if (isEIPActive(header, 7685)) {
    JSONDict.requestsHash = bytesToHex(data.requestsHash!)
  }

  return JSONDict
}
