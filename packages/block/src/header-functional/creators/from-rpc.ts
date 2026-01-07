import { numberToHex } from '../../helpers'
import type {
  CreateHeaderOptions,
  FrozenBlockHeader,
  JSONRPCHeaderInput,
} from '../types'
import { fromHeaderData } from './from-header-data'

export function fromRPC(
  blockParams: JSONRPCHeaderInput,
  opts: CreateHeaderOptions,
): FrozenBlockHeader {
  const {
    parentHash,
    sha3Uncles,
    miner,
    stateRoot,
    transactionsRoot,
    receiptsRoot,
    logsBloom,
    difficulty,
    number,
    gasLimit,
    gasUsed,
    timestamp,
    extraData,
    mixHash,
    nonce,
    baseFeePerGas,
    withdrawalsRoot,
    blobGasUsed,
    excessBlobGas,
    parentBeaconBlockRoot,
    requestsHash,
  } = blockParams

  return fromHeaderData(
    {
      parentHash,
      uncleHash: sha3Uncles,
      coinbase: miner,
      stateRoot,
      transactionsTrie: transactionsRoot,
      receiptTrie: receiptsRoot,
      logsBloom,
      difficulty: numberToHex(difficulty),
      number,
      gasLimit,
      gasUsed,
      timestamp,
      extraData,
      mixHash,
      nonce,
      baseFeePerGas,
      withdrawalsRoot,
      blobGasUsed,
      excessBlobGas,
      parentBeaconBlockRoot,
      requestsHash,
    },
    opts,
  )
}
