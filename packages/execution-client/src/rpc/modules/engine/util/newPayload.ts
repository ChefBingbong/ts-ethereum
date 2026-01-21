import { sha256 } from '@noble/hashes/sha2.js'
import type { Block, ExecutionPayload } from '@ts-ethereum/block'
import {
  createBlockFromExecutionPayload,
  genRequestsRoot,
} from '@ts-ethereum/block'
import type { HardforkManager } from '@ts-ethereum/chain-config'
import { isBlobTxManager } from '@ts-ethereum/tx'
import {
  bytesToHex,
  CLRequest,
  CLRequestType,
  EthereumJSErrorWithoutCode,
  hexToBytes,
  type PrefixedHexString,
} from '@ts-ethereum/utils'
import type { Chain } from '../../../../blockchain/index'
import { short } from '../../../../util/index'
import type { ChainCache, PayloadStatusV1 } from '../types'
import { Status } from '../types'
import { validHash } from './generic'

type CLData = {
  parentBeaconBlockRoot?: PrefixedHexString
  blobVersionedHashes?: PrefixedHexString[]
  executionRequests?: PrefixedHexString[]
}

export const validate4844BlobVersionedHashes = (
  headBlock: Block,
  blobVersionedHashes: PrefixedHexString[],
): string | null => {
  let validationError: string | null = null

  // Collect versioned hashes in the flat array `txVersionedHashes` to match with received
  const txVersionedHashes = []
  for (const tx of headBlock.transactions) {
    if (isBlobTxManager(tx)) {
      for (const vHash of tx.blobVersionedHashes!) {
        txVersionedHashes.push(vHash)
      }
    }
  }

  if (blobVersionedHashes.length !== txVersionedHashes.length) {
    validationError = `Error verifying blobVersionedHashes: expected=${txVersionedHashes.length} received=${blobVersionedHashes.length}`
  } else {
    // match individual hashes
    for (let vIndex = 0; vIndex < blobVersionedHashes.length; vIndex++) {
      // if mismatch, record error and break
      if (blobVersionedHashes[vIndex] !== txVersionedHashes[vIndex]) {
        validationError = `Error verifying blobVersionedHashes: mismatch at index=${vIndex} expected=${short(
          txVersionedHashes[vIndex],
        )} received=${short(blobVersionedHashes[vIndex])}`
        break
      }
    }
  }
  return validationError
}

export const validateAndGen7685RequestsHash = (
  hardforkManager: HardforkManager,
  hardfork: string,
  executionRequests: PrefixedHexString[],
): PrefixedHexString => {
  const requests: CLRequest<CLRequestType>[] = []

  for (const request of executionRequests) {
    const bytes = hexToBytes(request)
    if (bytes.length === 0) {
      throw EthereumJSErrorWithoutCode(
        'Got a request without a request-identifier',
      )
    }
    switch (bytes[0]) {
      case CLRequestType.Deposit:
        if (!hardforkManager.isEIPActiveAtHardfork(6110, hardfork)) {
          throw EthereumJSErrorWithoutCode(`Deposit requests are not active`)
        }
        requests.push(new CLRequest(CLRequestType.Deposit, bytes.slice(1)))
        break
      case CLRequestType.Withdrawal:
        if (!hardforkManager.isEIPActiveAtHardfork(7002, hardfork)) {
          throw EthereumJSErrorWithoutCode(`Withdrawal requests are not active`)
        }
        requests.push(new CLRequest(CLRequestType.Withdrawal, bytes.slice(1)))
        break
      case CLRequestType.Consolidation:
        if (!hardforkManager.isEIPActiveAtHardfork(7251, hardfork)) {
          throw EthereumJSErrorWithoutCode(
            `Consolidation requests are not active`,
          )
        }
        requests.push(
          new CLRequest(CLRequestType.Consolidation, bytes.slice(1)),
        )
        break
      default:
        throw EthereumJSErrorWithoutCode(
          `Unknown request identifier: got ${bytes[0]}`,
        )
    }
  }

  const requestsHash = genRequestsRoot(requests, sha256)

  return bytesToHex(requestsHash)
}

/**
 * Returns a block from a payload.
 * If errors, returns {@link PayloadStatusV1}
 */
export const assembleBlock = async (
  payload: Omit<ExecutionPayload, 'requestsHash' | 'parentBeaconBlockRoot'>,
  clValidationData: CLData,
  chain: Chain,
  chainCache: ChainCache,
): Promise<{ block?: Block; error?: PayloadStatusV1 }> => {
  const { blockNumber, timestamp } = payload
  const { config } = chain
  const hardforkManager = config.hardforkManager
  const hardfork = hardforkManager.getHardforkByBlock(
    BigInt(blockNumber),
    BigInt(timestamp),
  )

  try {
    // Validate CL data to see if it matches with the assembled block
    const { blobVersionedHashes, executionRequests, parentBeaconBlockRoot } =
      clValidationData

    let requestsHash: PrefixedHexString | undefined
    if (executionRequests !== undefined) {
      requestsHash = validateAndGen7685RequestsHash(
        hardforkManager,
        hardfork,
        executionRequests,
      )
    } else if (hardforkManager.isEIPActiveAtHardfork(7685, hardfork)) {
      throw `Invalid executionRequests=undefined for EIP-7685 activated block`
    }

    const block = await createBlockFromExecutionPayload(
      { ...payload, parentBeaconBlockRoot, requestsHash },
      { hardforkManager },
    )
    // TODO: validateData is also called in applyBlock while runBlock, may be it can be optimized
    // by removing/skipping block data validation from there
    await block.validateData()

    /**
     * Validate blob versioned hashes in the context of EIP-4844 blob transactions
     */
    if (hardforkManager.isEIPActiveAtHardfork(4844, hardfork)) {
      let validationError: string | null = null
      if (blobVersionedHashes === undefined) {
        validationError = `Error verifying blobVersionedHashes: received none`
      } else {
        validationError = validate4844BlobVersionedHashes(
          block,
          blobVersionedHashes,
        )
      }

      // if there was a validation error return invalid
      if (validationError !== null) {
        throw validationError
      }
    } else if (blobVersionedHashes !== undefined) {
      const validationError = `Invalid blobVersionedHashes before EIP-4844 is activated`
      throw validationError
    }

    return { block }
  } catch (error) {
    const validationError = `Error assembling block from payload: ${error}`
    config.logger?.error(validationError)
    const latestValidHash = await validHash(
      hexToBytes(payload.parentHash as PrefixedHexString),
      chain,
      chainCache,
    )
    const response = {
      status: `${error}`.includes('Invalid blockHash')
        ? Status.INVALID_BLOCK_HASH
        : Status.INVALID,
      latestValidHash,
      validationError,
    }
    return { error: response }
  }
}
