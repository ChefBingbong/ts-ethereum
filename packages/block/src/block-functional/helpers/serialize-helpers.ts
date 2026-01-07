import { RLP } from '@ts-ethereum/rlp'
import { Capability } from '@ts-ethereum/tx'
import { bytesToHex } from '@ts-ethereum/utils'
import { createBlockHeaderManagerFromHeader } from '../../header-functional'
import { getHash as headerGetHash } from '../../header-functional/helpers'
import type { BlockBytes, ExecutionPayload, JSONBlock } from '../../types'
import type { FrozenBlock } from '../types'

export function toRaw(block: FrozenBlock): BlockBytes {
  const headerManager = createBlockHeaderManagerFromHeader(block.header)
  const bytesArray: BlockBytes = [
    headerManager.raw(),
    block.transactions.map((tx) =>
      tx.supports(Capability.EIP2718TypedTransaction)
        ? tx.serialize()
        : tx.raw(),
    ) as Uint8Array[],
    block.uncleHeaders.map((uh) => {
      const uhManager = createBlockHeaderManagerFromHeader(uh)
      return uhManager.raw()
    }),
  ]
  const withdrawalsRaw = block.withdrawals?.map((wt) => wt.raw())
  if (withdrawalsRaw) {
    bytesArray.push(withdrawalsRaw)
  }

  return bytesArray
}

export function getHash(block: FrozenBlock): Uint8Array {
  // Block hash is the same as header hash
  return headerGetHash(block.header)
}

export function serialize(block: FrozenBlock): Uint8Array {
  return RLP.encode(toRaw(block))
}

export function toJSON(block: FrozenBlock): JSONBlock {
  const headerManager = createBlockHeaderManagerFromHeader(block.header)
  const withdrawalsAttr = block.withdrawals
    ? {
        withdrawals: block.withdrawals.map((wt) => wt.toJSON()),
      }
    : {}
  return {
    header: headerManager.toJSON(),
    transactions: block.transactions.map((tx) => tx.toJSON()),
    uncleHeaders: block.uncleHeaders.map((uh) => {
      const uhManager = createBlockHeaderManagerFromHeader(uh)
      return uhManager.toJSON()
    }),
    ...withdrawalsAttr,
  }
}

export function toExecutionPayload(block: FrozenBlock): ExecutionPayload {
  const blockJSON = toJSON(block)
  const header = blockJSON.header!
  const transactions =
    block.transactions.map((tx) => bytesToHex(tx.serialize())) ?? []
  const withdrawalsArr = blockJSON.withdrawals
    ? { withdrawals: blockJSON.withdrawals }
    : {}

  const executionPayload: ExecutionPayload = {
    blockNumber: header.number!,
    parentHash: header.parentHash!,
    feeRecipient: header.coinbase!,
    stateRoot: header.stateRoot!,
    receiptsRoot: header.receiptTrie!,
    logsBloom: header.logsBloom!,
    gasLimit: header.gasLimit!,
    gasUsed: header.gasUsed!,
    timestamp: header.timestamp!,
    extraData: header.extraData!,
    baseFeePerGas: header.baseFeePerGas!,
    blobGasUsed: header.blobGasUsed,
    excessBlobGas: header.excessBlobGas,
    blockHash: bytesToHex(getHash(block)),
    prevRandao: header.mixHash!,
    transactions,
    ...withdrawalsArr,
    parentBeaconBlockRoot: header.parentBeaconBlockRoot,
    requestsHash: header.requestsHash,
  }

  return executionPayload
}
