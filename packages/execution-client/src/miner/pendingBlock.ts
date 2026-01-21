import type { Block, HeaderData } from '@ts-ethereum/block'
import { Hardfork } from '@ts-ethereum/chain-config'
import { isBlobTxManager, type TxManager } from '@ts-ethereum/tx'
import {
  BIGINT_1,
  BIGINT_2,
  bigIntToUnpaddedBytes,
  bytesToHex,
  bytesToUnprefixedHex,
  type CLRequest,
  type CLRequestType,
  concatBytes,
  createZeroAddress,
  type PrefixedHexString,
  TypeOutput,
  toType,
  type WithdrawalData,
} from '@ts-ethereum/utils'
import {
  type BlockBuilder,
  BuildStatus,
  buildBlock,
  type TxReceipt,
  type VM,
} from '@ts-ethereum/vm'
import { keccak256 } from 'ethereum-cryptography/keccak.js'
import type { Config } from '../config/index'
import type { TxPool } from '../service/txpool'
import type { TransactionsByPriceAndNonce } from './ordering'

interface PendingBlockOpts {
  /* Config */
  config: Config

  /* Tx Pool */
  txPool: TxPool

  /* Skip hardfork validation */
  skipHardForkValidation?: boolean
}

export interface BlobsBundle {
  blobs: PrefixedHexString[]
  commitments: PrefixedHexString[]
  proofs: PrefixedHexString[]
}

/**
 * In the future this class should build a pending block by keeping the
 * transaction set up-to-date with the state of local mempool until called.
 *
 * For now this simple implementation just adds txs from the pool when
 * started and called.
 */

// Max two payload to be cached
const MAX_PAYLOAD_CACHE = 2
// TTL for pending block cache (2 seconds, matching Geth's pendingTTL)
const PENDING_TTL = 2000

type AddTxResult = (typeof AddTxResult)[keyof typeof AddTxResult]

const AddTxResult = {
  Success: 'Success',
  BlockFull: 'BlockFull',
  SkippedByGasLimit: 'SkippedByGasLimit',
  SkippedByErrors: 'SkippedByErrors',
  RemovedByErrors: 'RemovedByErrors',
} as const

interface CachedPendingBlock {
  builder: BlockBuilder
  parentHash: string // Unprefixed hash
  created: number // Timestamp
}

export class PendingBlock {
  config: Config
  txPool: TxPool

  pendingPayloads: Map<string, CachedPendingBlock> = new Map()
  blobsBundles: Map<string, BlobsBundle> = new Map()
  executionRequests: Map<string, CLRequest<CLRequestType>[]> = new Map()

  private skipHardForkValidation?: boolean

  constructor(opts: PendingBlockOpts) {
    this.config = opts.config
    this.txPool = opts.txPool
    this.skipHardForkValidation = opts.skipHardForkValidation
  }

  pruneSetToMax(maxItems: number): number {
    let itemsToDelete = this.pendingPayloads.size - maxItems
    const deletedItems = Math.max(0, itemsToDelete)

    if (itemsToDelete > 0) {
      // keys are in fifo order
      for (const payloadId of this.pendingPayloads.keys()) {
        this.stop(payloadId)
        itemsToDelete--
        if (itemsToDelete <= 0) {
          break
        }
      }
    }
    return deletedItems
  }

  /**
   * Resolves a cached pending block if available and valid.
   * Returns null if cache miss or invalid.
   */
  private resolveCached(
    payloadId: string,
    parentHash: string,
  ): BlockBuilder | null {
    const cached = this.pendingPayloads.get(payloadId)
    if (!cached) return null

    // Check parent hash matches
    if (cached.parentHash !== parentHash) {
      this.pendingPayloads.delete(payloadId)
      return null
    }

    // Check TTL
    const age = Date.now() - cached.created
    if (age > PENDING_TTL) {
      this.pendingPayloads.delete(payloadId)
      return null
    }

    return cached.builder
  }

  /**
   * Starts building a pending block with the given payload
   * @returns an 8-byte payload identifier to call {@link BlockBuilder.build} with
   */
  async start(
    vm: VM,
    parentBlock: Block,
    headerData: Partial<HeaderData> = {},
    withdrawals?: WithdrawalData[],
  ) {
    const number = parentBlock.header.number + BIGINT_1
    const { timestamp, mixHash, parentBeaconBlockRoot, coinbase } = headerData
    const parentHash = bytesToUnprefixedHex(parentBlock.hash())

    let { gasLimit } = parentBlock.header

    const baseFeePerGas = vm.hardforkManager.isEIPActiveAtHardfork(
      1559,
      vm.hardforkManager.getHardforkFromContext({
        blockNumber: number,
      }),
    )
      ? parentBlock.header.calcNextBaseFee()
      : undefined

    if (number === vm.hardforkManager.hardforkBlock(Hardfork.London)) {
      gasLimit = gasLimit * BIGINT_2
    }

    // payload is uniquely defined by timestamp, parent and mixHash, gasLimit can also be
    // potentially included in the fcU in future and can be safely added in uniqueness calc
    const timestampBuf = bigIntToUnpaddedBytes(
      toType(timestamp ?? 0, TypeOutput.BigInt),
    )
    const gasLimitBuf = bigIntToUnpaddedBytes(gasLimit)
    const mixHashBuf =
      toType(mixHash!, TypeOutput.Uint8Array) ?? new Uint8Array(32)
    const parentBeaconBlockRootBuf =
      toType(parentBeaconBlockRoot!, TypeOutput.Uint8Array) ??
      new Uint8Array(32)
    const coinbaseBuf = toType(
      coinbase ?? new Uint8Array(20),
      TypeOutput.Uint8Array,
    )

    // Encode withdrawals for payload ID calculation (post-Shanghai)
    let withdrawalsBuf = new Uint8Array()
    if (withdrawals !== undefined && withdrawals !== null) {
      const withdrawalsBufTemp: Uint8Array[] = []
      for (const withdrawal of withdrawals) {
        const indexBuf = bigIntToUnpaddedBytes(
          toType(withdrawal.index ?? 0, TypeOutput.BigInt),
        )
        const validatorIndex = bigIntToUnpaddedBytes(
          toType(withdrawal.validatorIndex ?? 0, TypeOutput.BigInt),
        )
        const address = toType(
          withdrawal.address ?? createZeroAddress(),
          TypeOutput.Uint8Array,
        )
        const amount = bigIntToUnpaddedBytes(
          toType(withdrawal.amount ?? 0, TypeOutput.BigInt),
        )
        withdrawalsBufTemp.push(
          concatBytes(indexBuf, validatorIndex, address, amount),
        )
      }
      withdrawalsBuf = concatBytes(...withdrawalsBufTemp)
    }

    const keccakFunction = keccak256

    const payloadIdBytes = keccakFunction(
      concatBytes(
        parentBlock.hash(),
        mixHashBuf,
        timestampBuf,
        gasLimitBuf,
        parentBeaconBlockRootBuf,
        coinbaseBuf,
        withdrawalsBuf,
      ),
    ).subarray(0, 8)

    const payloadId = bytesToHex(payloadIdBytes)

    // Check cache first
    const cachedBuilder = this.resolveCached(payloadId, parentHash)
    if (cachedBuilder) {
      this.config.options.logger?.debug(
        `Pending: Using cached pending block for payload ${payloadId}`,
      )
      return payloadIdBytes
    }

    // Prune the builders and blobsBundles
    this.pruneSetToMax(MAX_PAYLOAD_CACHE)

    // Set the state root to ensure the resulting state
    // is based on the parent block's state
    await vm.stateManager.setStateRoot(parentBlock.header.stateRoot)

    const builder = await buildBlock(vm, {
      parentBlock,
      // excessBlobGas will be correctly calculated and set in buildBlock constructor,
      // unless already explicity provided in headerData
      headerData: {
        ...headerData,
        number,
        gasLimit,
        baseFeePerGas,
      },
      withdrawals,
      blockOpts: {
        putBlockIntoBlockchain: false,
        setHardfork: true,
        hardforkManager: vm.hardforkManager,
      },
    })

    // Cache the builder
    this.pendingPayloads.set(payloadId, {
      builder,
      parentHash,
      created: Date.now(),
    })

    // Get if and how many blobs are allowed in the tx
    let allowedBlobs: number
    const blockHardfork = vm.hardforkManager.getHardforkFromContext({
      blockNumber: number,
    })
    if (vm.hardforkManager.isEIPActiveAtHardfork(4844, blockHardfork)) {
      const blobGasLimit =
        vm.hardforkManager.getParamAtHardfork(
          'maxBlobGasPerBlock',
          blockHardfork,
        ) ?? 0n
      const blobGasPerBlob =
        vm.hardforkManager.getParamAtHardfork(
          'blobGasPerBlob',
          blockHardfork,
        ) ?? 1n
      allowedBlobs = Number(blobGasLimit / blobGasPerBlob)
    } else {
      allowedBlobs = 0
    }

    // Add current txs in pool using incremental selection
    const txSet = await this.txPool.txsByPriceAndNonce(vm, {
      minGasPrice: this.config.options.minerGasPrice,
      baseFee: baseFeePerGas,
      allowedBlobs,
      priorityAddresses: this.config.options.minerPriorityAddresses
        ? [...this.config.options.minerPriorityAddresses]
        : undefined,
    })

    const { addedTxs, skippedByAddErrors, blobTxs } =
      await this.addTransactions(builder, txSet)
    this.config.options.logger?.info(
      `Pending: Added txs=${addedTxs} skippedByAddErrors=${skippedByAddErrors}`,
    )

    // Construct initial blobs bundle when payload is constructed (EIP-4844)
    if (
      vm.hardforkManager.isEIPActiveAtHardfork(
        4844,
        vm.hardforkManager.getHardforkFromContext({ blockNumber: number }),
      )
    ) {
      this.constructBlobsBundle(payloadId, blobTxs)
    }

    return payloadIdBytes
  }

  /**
   * Stops a pending payload
   */
  stop(payloadIdBytes: Uint8Array | string) {
    const payloadId =
      typeof payloadIdBytes !== 'string'
        ? bytesToHex(payloadIdBytes)
        : payloadIdBytes
    const cached = this.pendingPayloads.get(payloadId)
    if (cached === undefined) return
    // Revert blockBuilder
    void cached.builder.revert()
    // Remove from pendingPayloads
    this.pendingPayloads.delete(payloadId)
    this.blobsBundles.delete(payloadId)
    this.executionRequests.delete(payloadId)
  }

  /**
   * Returns the completed block
   */
  async build(
    payloadIdBytes: Uint8Array | string,
  ): Promise<
    | void
    | [
        block: Block,
        receipts: TxReceipt[],
        value: bigint,
        blobs?: BlobsBundle,
        requests?: CLRequest<CLRequestType>[],
      ]
  > {
    const payloadId =
      typeof payloadIdBytes !== 'string'
        ? bytesToHex(payloadIdBytes)
        : payloadIdBytes
    const cached = this.pendingPayloads.get(payloadId)
    if (cached === undefined) {
      return
    }
    const builder = cached.builder
    const blockStatus = builder.getStatus()
    if (blockStatus.status === BuildStatus.Build) {
      return [
        blockStatus.block,
        builder.transactionReceipts,
        builder.minerValue,
        this.blobsBundles.get(payloadId),
        this.executionRequests.get(payloadId),
      ]
    }
    const { vm, headerData } = builder as unknown as {
      vm: VM
      headerData: HeaderData
    }

    // Get the number of blobs that can be further added
    let allowedBlobs: number
    const buildHardfork = vm.hardforkManager.getHardforkFromContext({
      blockNumber: headerData.number as bigint,
    })
    if (vm.hardforkManager.isEIPActiveAtHardfork(4844, buildHardfork)) {
      const bundle = this.blobsBundles.get(payloadId) ?? {
        blobs: [],
        commitments: [],
        proofs: [],
      }
      const blobGasLimit =
        vm.hardforkManager.getParamAtHardfork(
          'maxBlobGasPerBlock',
          buildHardfork,
        ) ?? 0n
      const blobGasPerBlob =
        vm.hardforkManager.getParamAtHardfork(
          'blobGasPerBlob',
          buildHardfork,
        ) ?? 1n
      allowedBlobs = Number(blobGasLimit / blobGasPerBlob) - bundle.blobs.length
    } else {
      allowedBlobs = 0
    }

    // Get existing transaction hashes
    const existingTxHashes = new Set<string>()
    for (const tx of (builder as any).transactions as TxManager[]) {
      existingTxHashes.add(bytesToUnprefixedHex(tx.hash()))
    }

    // Get new transactions using incremental selection
    const txSet = await this.txPool.txsByPriceAndNonce(vm, {
      minGasPrice: this.config.options.minerGasPrice,
      baseFee: headerData.baseFeePerGas as bigint | undefined,
      allowedBlobs,
      priorityAddresses: this.config.options.minerPriorityAddresses
        ? [...this.config.options.minerPriorityAddresses]
        : undefined,
    })

    // Filter out already included transactions and add new ones
    const { skippedByAddErrors, blobTxs } = await this.addTransactions(
      builder,
      txSet,
      existingTxHashes,
    )

    const { block, requests } = await builder.build()

    // Store execution requests if present
    if (requests !== undefined) {
      this.executionRequests.set(payloadId, requests)
    }

    // Construct blobs bundle (EIP-4844)
    const blobs = vm.hardforkManager.isEIPActiveAtHardfork(
      4844,
      vm.hardforkManager.getHardforkFromContext({
        blockNumber: block.header.number,
      }),
    )
      ? this.constructBlobsBundle(payloadId, blobTxs)
      : undefined

    const withdrawalsStr =
      block.withdrawals !== undefined
        ? ` withdrawals=${block.withdrawals.length}`
        : ''
    const blobsStr = blobs ? ` blobs=${blobs.blobs.length}` : ''

    this.config.options.logger?.info(
      `Pending: Built block number=${block.header.number} txs=${
        block.transactions.length
      }${withdrawalsStr}${blobsStr} skippedByAddErrors=${skippedByAddErrors} hash=${bytesToHex(
        block.hash(),
      )}`,
    )

    return [
      block,
      builder.transactionReceipts,
      builder.minerValue,
      blobs,
      requests,
    ]
  }

  private async addTransactions(
    builder: BlockBuilder,
    txSet: TransactionsByPriceAndNonce,
    existingTxHashes?: Set<string>,
  ) {
    let addedTxs = 0
    let skippedByAddErrors = 0
    let blockFull = false
    const blobTxs: TxManager[] = []
    const gasLimit = (builder as any).headerData.gasLimit as bigint

    // Incremental transaction selection
    while (!txSet.empty() && !blockFull) {
      const peeked = txSet.peek()
      if (!peeked) break

      const { tx } = peeked

      // Skip if already included
      if (existingTxHashes?.has(bytesToUnprefixedHex(tx.hash()))) {
        txSet.shift()
        continue
      }

      // Check gas limit
      const remainingGas = gasLimit - builder.gasUsed
      if (remainingGas < tx.gasLimit) {
        if (remainingGas < BigInt(21000)) {
          blockFull = true
          this.config.options.logger?.info(`Pending: Assembled block full`)
        }
        txSet.shift()
        continue
      }

      // Try to add transaction
      const addTxResult = await this.addTransaction(builder, tx)

      switch (addTxResult) {
        case AddTxResult.Success:
          addedTxs++
          // Track blob transactions for bundle construction
          if (isBlobTxManager(tx)) {
            blobTxs.push(tx)
          }
          txSet.shift()
          break
        case AddTxResult.BlockFull:
          blockFull = true
          skippedByAddErrors++
          txSet.shift()
          break
        case AddTxResult.SkippedByGasLimit:
          skippedByAddErrors++
          txSet.shift()
          break
        case AddTxResult.SkippedByErrors:
          // Nonce issue or recoverable error: shift
          skippedByAddErrors++
          txSet.shift()
          break
        case AddTxResult.RemovedByErrors:
          // Invalid transaction: pop account
          skippedByAddErrors++
          txSet.pop()
          break
      }
    }

    return {
      addedTxs,
      skippedByAddErrors,
      blobTxs,
    }
  }

  private async addTransaction(builder: BlockBuilder, tx: TxManager) {
    let addTxResult: AddTxResult

    try {
      await builder.addTransaction(tx, {
        skipHardForkValidation: this.skipHardForkValidation,
      })
      addTxResult = AddTxResult.Success
    } catch (error: any) {
      if (
        error.message ===
        'tx has a higher gas limit than the remaining gas in the block'
      ) {
        if (
          builder.gasUsed >
          (builder as any).headerData.gasLimit - BigInt(21000)
        ) {
          // If block has less than 21000 gas remaining, consider it full
          this.config.logger?.info(`Pending: Assembled block full`)
          addTxResult = AddTxResult.BlockFull
        } else {
          addTxResult = AddTxResult.SkippedByGasLimit
        }
      } else if ((error as Error).message.includes('blobs missing')) {
        // Remove the blob tx which doesn't has blobs bundled
        this.txPool.removeByHash(bytesToHex(tx.hash()), tx)
        this.config.logger?.error(
          `Pending: Removed from txPool a blob tx ${bytesToHex(tx.hash())} with missing blobs`,
        )
        addTxResult = AddTxResult.RemovedByErrors
      } else {
        // If there is an error adding a tx, it will be skipped
        this.config.logger?.debug(
          `Pending: Skipping tx ${bytesToHex(
            tx.hash(),
          )}, error encountered when trying to add tx:\n${error}`,
        )
        addTxResult = AddTxResult.SkippedByErrors
      }
    }
    return addTxResult
  }

  /**
   * An internal helper for storing the blob bundle associated with each transaction in an EIP4844 world
   * @param payloadId the payload Id of the pending block
   * @param txs an array of blob TxManager transactions
   */
  private constructBlobsBundle = (payloadId: string, txs: TxManager[]) => {
    let blobs: PrefixedHexString[] = []
    let commitments: PrefixedHexString[] = []
    let proofs: PrefixedHexString[] = []
    const bundle = this.blobsBundles.get(payloadId)
    if (bundle !== undefined) {
      blobs = bundle.blobs
      commitments = bundle.commitments
      proofs = bundle.proofs
    }

    for (const tx of txs) {
      // Access sidecar data from inner BlobTxData
      const blobTxData = tx.tx.inner as import('@ts-ethereum/tx').BlobTxData
      const sidecar = blobTxData.sidecar
      if (sidecar?.blobs !== undefined && sidecar.blobs.length > 0) {
        blobs = blobs.concat(sidecar.blobs)
        commitments = commitments.concat(sidecar.commitments)
        proofs = proofs.concat(sidecar.proofs)
      }
    }

    const blobsBundle = {
      blobs,
      commitments,
      proofs,
    }
    this.blobsBundles.set(payloadId, blobsBundle)
    return blobsBundle
  }
}
