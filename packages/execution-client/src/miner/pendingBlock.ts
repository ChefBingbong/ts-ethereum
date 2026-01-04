import type { Block, HeaderData } from '@ts-ethereum/block'
import { Hardfork } from '@ts-ethereum/chain-config'
import type { TypedTransaction } from '@ts-ethereum/tx'
import {
  BIGINT_1,
  BIGINT_2,
  bigIntToUnpaddedBytes,
  bytesToHex,
  bytesToUnprefixedHex,
  concatBytes,
  TypeOutput,
  toType,
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
  ) {
    const number = parentBlock.header.number + BIGINT_1
    const { timestamp, mixHash, parentBeaconBlockRoot, coinbase } = headerData
    const parentHash = bytesToUnprefixedHex(parentBlock.hash())

    let { gasLimit } = parentBlock.header

    vm.common.setHardforkBy({
      blockNumber: number,
      timestamp,
    })

    const baseFeePerGas = parentBlock.header.common.isActivatedEIP(1559)
      ? parentBlock.header.calcNextBaseFee()
      : undefined

    if (number === vm.common.hardforkBlock(Hardfork.London)) {
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
    const coinbaseBuf = toType(
      coinbase ?? new Uint8Array(20),
      TypeOutput.Uint8Array,
    )

    const keccakFunction = keccak256

    const payloadIdBytes = keccakFunction(
      concatBytes(
        parentBlock.hash(),
        mixHashBuf,
        timestampBuf,
        gasLimitBuf,
        coinbaseBuf,
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

    // Prune the builders
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
      blockOpts: {
        putBlockIntoBlockchain: false,
        setHardfork: true,
      },
    })

    // Cache the builder
    this.pendingPayloads.set(payloadId, {
      builder,
      parentHash,
      created: Date.now(),
    })

    // Add current txs in pool using incremental selection
    const txSet = await this.txPool.txsByPriceAndNonce(vm, {
      minGasPrice: this.config.options.minerGasPrice,
      priorityAddresses: this.config.options.minerPriorityAddresses
        ? [...this.config.options.minerPriorityAddresses]
        : undefined,
    })

    const { addedTxs, skippedByAddErrors } = await this.addTransactions(
      builder,
      txSet,
    )
    this.config.options.logger?.info(
      `Pending: Added txs=${addedTxs} skippedByAddErrors=${skippedByAddErrors}`,
    )

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
  }

  /**
   * Returns the completed block
   */
  async build(
    payloadIdBytes: Uint8Array | string,
  ): Promise<void | [block: Block, receipts: TxReceipt[], value: bigint]> {
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
      ]
    }
    const { vm, headerData } = builder as unknown as {
      vm: VM
      headerData: HeaderData
    }

    // Get existing transaction hashes
    const existingTxHashes = new Set<string>()
    for (const tx of (builder as any).transactions as TypedTransaction[]) {
      existingTxHashes.add(bytesToUnprefixedHex(tx.hash()))
    }

    // Get new transactions using incremental selection
    const txSet = await this.txPool.txsByPriceAndNonce(vm, {
      minGasPrice: this.config.options.minerGasPrice,
      priorityAddresses: this.config.options.minerPriorityAddresses
        ? [...this.config.options.minerPriorityAddresses]
        : undefined,
    })

    // Filter out already included transactions and add new ones
    const { skippedByAddErrors } = await this.addTransactions(
      builder,
      txSet,
      existingTxHashes,
    )

    const { block } = await builder.build()

    this.config.options.logger?.info(
      `Pending: Built block number=${block.header.number} txs=${
        block.transactions.length
      } skippedByAddErrors=${skippedByAddErrors} hash=${bytesToHex(
        block.hash(),
      )}`,
    )

    return [block, builder.transactionReceipts, builder.minerValue]
  }

  private async addTransactions(
    builder: BlockBuilder,
    txSet: TransactionsByPriceAndNonce,
    existingTxHashes?: Set<string>,
  ) {
    let addedTxs = 0
    let skippedByAddErrors = 0
    let blockFull = false
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
    }
  }

  private async addTransaction(builder: BlockBuilder, tx: TypedTransaction) {
    let addTxResult: AddTxResult

    try {
      await builder.addTransaction(tx, {
        skipHardForkValidation: this.skipHardForkValidation,
      })
      addTxResult = AddTxResult.Success
    } catch (error: any) {
      const errorMsg = error.message
      if (
        errorMsg ===
        'tx has a higher gas limit than the remaining gas in the block'
      ) {
        if (
          builder.gasUsed >
          (builder as any).headerData.gasLimit - BigInt(21000)
        ) {
          // If block has less than 21000 gas remaining, consider it full
          this.config.options.logger?.info(`Pending: Assembled block full`)
          addTxResult = AddTxResult.BlockFull
        } else {
          addTxResult = AddTxResult.SkippedByGasLimit
        }
      } else if (
        errorMsg.includes('insufficient balance') ||
        errorMsg.includes('invalid')
      ) {
        // Invalid transaction: should pop account
        this.config.options.logger?.debug(
          `Pending: Invalid tx ${bytesToHex(tx.hash())}: ${errorMsg}`,
        )
        addTxResult = AddTxResult.RemovedByErrors
      } else {
        // Other errors: skip transaction but continue with account
        this.config.options.logger?.debug(
          `Pending: Skipping tx ${bytesToHex(
            tx.hash(),
          )}, error encountered: ${errorMsg}`,
        )
        addTxResult = AddTxResult.SkippedByErrors
      }
    }
    return addTxResult
  }
}
