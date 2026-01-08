import type { Block } from '@ts-ethereum/block'
import {
  isAccessList2930Tx,
  isBlob4844Tx,
  isFeeMarket1559Tx,
  isLegacyTx,
  type LegacyTx,
  type TypedTransaction,
} from '@ts-ethereum/tx'
import {
  Account,
  Address,
  BIGINT_0,
  BIGINT_1,
  bytesToHex,
  bytesToUnprefixedHex,
  EthereumJSErrorWithoutCode,
  equalsBytes,
  hexToBytes,
} from '@ts-ethereum/utils'
import type { VM } from '@ts-ethereum/vm'
import type { Chain } from '../blockchain/chain'
import type { Config } from '../config/index'
import type { VMExecution } from '../execution/vmexecution'
import type { QHeap } from '../ext/qheap'
import { Heap } from '../ext/qheap'
import { TransactionsByPriceAndNonce } from '../miner/ordering'
import type { NetworkCore } from '../net/index'
import type { Peer } from '../net/peer/peer'
import type { PeerPoolLike } from '../net/peerpool-types'

// Configuration constants
const MIN_GAS_PRICE_BUMP_PERCENT = 10
const TX_MAX_DATA_SIZE = 128 * 1024 // 128KB
const MAX_TXS_PER_ACCOUNT = 100

// Pool limits (matching Geth defaults)
const GLOBAL_SLOTS = 4096 // Max pending tx slots globally
const GLOBAL_QUEUE = 1024 // Max queued tx slots globally
const ACCOUNT_SLOTS = 16 // Max pending per account
const ACCOUNT_QUEUE = 64 // Max queued per account

export interface TxPoolOptions {
  /* Config */
  config: Config
  pool: NetworkCore
  chain: Chain
  execution: VMExecution
}

type TxPoolObject = {
  tx: TypedTransaction
  hash: UnprefixedHash
  added: number
  error?: Error
}

type HandledObject = {
  address: UnprefixedAddress
  added: number
  error?: Error
}

type SentObject = {
  hash: UnprefixedHash
  added: number
  error?: Error
}

type UnprefixedAddress = string
type UnprefixedHash = string
type PeerId = string

type GasPrice = {
  tip: bigint
  maxFee: bigint
}

/**
 * @module service
 */

/**
 * Tx pool (mempool)
 * @memberof module:service
 */
export class TxPool {
  private config: Config
  private pool: NetworkCore
  private chain: Chain
  private execution: VMExecution

  private opened: boolean

  public running: boolean

  /* global NodeJS */
  private _cleanupInterval: NodeJS.Timeout | undefined
  private _logInterval: NodeJS.Timeout | undefined

  /**
   * Map for handled tx hashes
   * (have been added to the pool at some point)
   *
   * This is meant to be a superset of the tx pool
   * so at any point it should be at least as large as the pool
   */
  private handled: Map<UnprefixedHash, HandledObject>

  /**
   * Hash index for O(1) lookup: hash -> {address, poolType}
   * Optimizes getByHash() performance
   */
  private hashIndex: Map<
    UnprefixedHash,
    { address: UnprefixedAddress; poolType: 'pending' | 'queued' }
  >

  /**
   * Map for tx hashes a peer is known to have
   */
  private knownByPeer: Map<PeerId, SentObject[]>

  /**
   * Activate before chain head is reached to start
   * temporary tx pool serving (default: -1)
   */
  public BLOCKS_BEFORE_TARGET_HEIGHT_ACTIVATION = -1

  /**
   * Max number of txs to request
   */
  private TX_RETRIEVAL_LIMIT = 256

  /**
   * Number of minutes to keep txs in the pool
   */
  public POOLED_STORAGE_TIME_LIMIT = 20

  /**
   * Number of minutes to forget about handled
   * txs (for cleanup/memory reasons)
   */
  public HANDLED_CLEANUP_TIME_LIMIT = 60

  /**
   * Rebroadcast full txs and new tx hashes
   */
  private REBROADCAST_INTERVAL = 60 * 1000

  /**
   * Minimum number of peers to send full transactions to
   */
  private MIN_BROADCAST_PEERS = 2

  /**
   * Log pool statistics on the given interval
   */
  private LOG_STATISTICS_INTERVAL = 20000 // ms

  /**
   * Transaction hashes currently being fetched from peers
   */
  private fetchingHashes: UnprefixedHash[] = []

  // Pending: executable transactions (nonce matches account nonce)
  public pending: Map<UnprefixedAddress, TxPoolObject[]>

  // Queued: future transactions (nonce > account nonce, waiting for gaps to fill)
  public queued: Map<UnprefixedAddress, TxPoolObject[]>

  // Track expected nonce for each address (cache to avoid repeated DB lookups)
  private accountNonces: Map<UnprefixedAddress, bigint>

  // Local transactions get priority and eviction protection
  private locals: Set<UnprefixedHash>

  // Price-sorted index for eviction (all txs from both pools)
  private priced: QHeap<TxPoolObject>

  // Counts for each pool
  public pendingCount: number
  public queuedCount: number
  private rebroadcastInterval: NodeJS.Timeout | undefined

  /**
   * Create new tx pool
   * @param options constructor parameters
   */
  constructor(options: TxPoolOptions) {
    this.config = options.config
    this.pool = options.pool
    this.chain = options.chain
    this.execution = options.execution

    // Dual pool structure
    this.pending = new Map<UnprefixedAddress, TxPoolObject[]>()
    this.queued = new Map<UnprefixedAddress, TxPoolObject[]>()
    this.pendingCount = 0
    this.queuedCount = 0

    // Supporting structures
    this.accountNonces = new Map<UnprefixedAddress, bigint>()
    this.locals = new Set<UnprefixedHash>()
    this.priced = new Heap({
      comparBefore: (a: TxPoolObject, b: TxPoolObject) =>
        this.txGasPrice(a.tx).tip < this.txGasPrice(b.tx).tip,
    }) as QHeap<TxPoolObject>

    this.handled = new Map<UnprefixedHash, HandledObject>()
    this.knownByPeer = new Map<PeerId, SentObject[]>()
    this.hashIndex = new Map<
      UnprefixedHash,
      { address: UnprefixedAddress; poolType: 'pending' | 'queued' }
    >()

    this.opened = false
    this.running = false
  }

  /**
   * Rebroadcasts pending transactions to peers.
   * Uses sqrt(peers) propagation as per Geth.
   */
  private rebroadcast(): void {
    if (!this.running) return

    const peers = this.pool.getConnectedPeers()
    if (peers.length === 0) return

    // Collect all pending tx hashes
    const txHashes: [number[], number[], Uint8Array[]] = [[], [], []]
    for (const txObjs of this.pending.values()) {
      for (const txObj of txObjs) {
        txHashes[0].push(txObj.tx.type)
        txHashes[1].push(txObj.tx.serialize().byteLength)
        txHashes[2].push(hexToBytes(`0x${txObj.hash}`))
      }
    }

    if (txHashes[2].length === 0) return

    // Send to sqrt(peers) for efficiency
    const numPeers = Math.max(1, Math.floor(Math.sqrt(peers.length)))
    const targetPeers = peers.slice(0, numPeers)

    this.sendNewTxHashes(txHashes, targetPeers)

    this.config.options.logger?.debug(
      `Rebroadcast ${txHashes[2].length} tx hashes to ${targetPeers.length} peers`,
    )
  }

  /**
   * Determines which pool a transaction belongs to based on nonce
   * @param tx The transaction to classify
   * @param senderAddress The sender's address (unprefixed)
   * @returns 'pending' if executable, 'queued' if future
   */
  private async classifyTransaction(
    tx: TypedTransaction,
    senderAddress: UnprefixedAddress,
  ): Promise<'pending' | 'queued'> {
    // Get account nonce from cache or state
    let accountNonce = this.accountNonces.get(senderAddress)

    if (accountNonce === undefined) {
      // Fetch from state
      const block = await this.chain.getCanonicalHeadHeader()
      const vmCopy = await this.execution.vm.shallowCopy()
      await vmCopy.stateManager.setStateRoot(block.stateRoot)
      const address = new Address(hexToBytes(`0x${senderAddress}`))
      let account = await vmCopy.stateManager.getAccount(address)
      if (account === undefined) {
        account = new Account()
      }
      accountNonce = account.nonce
      this.accountNonces.set(senderAddress, accountNonce)
    }

    // Check pending pool for the highest nonce we already have
    const pendingTxs = this.pending.get(senderAddress)
    if (pendingTxs && pendingTxs.length > 0) {
      const maxPendingNonce = pendingTxs.reduce(
        (max, obj) => (obj.tx.nonce > max ? obj.tx.nonce : max),
        pendingTxs[0].tx.nonce,
      )
      // If this tx fills the next slot after pending, it's pending
      if (tx.nonce === maxPendingNonce + BIGINT_1) {
        return 'pending'
      }
    }

    // If nonce matches account nonce, it's immediately executable
    if (tx.nonce === accountNonce) {
      return 'pending'
    }

    // Otherwise it's a future transaction
    return 'queued'
  }

  /**
   * Open pool
   */
  open(): boolean {
    if (this.opened) {
      return false
    }
    this.opened = true
    return true
  }

  /**
   * Start tx processing
   */
  start(): boolean {
    if (this.running) {
      return false
    }
    this._cleanupInterval = setInterval(
      this.cleanup.bind(this),
      this.POOLED_STORAGE_TIME_LIMIT * 1000 * 60,
    )
    this._logInterval = setInterval(
      this._logPoolStats.bind(this),
      this.LOG_STATISTICS_INTERVAL,
    )
    // In start():
    this.rebroadcastInterval = setInterval(
      () => this.rebroadcast(),
      this.REBROADCAST_INTERVAL,
    )

    this.running = true
    this.config.options.logger?.info('TxPool started.')
    return true
  }

  /**
   * Check if txpool should start based on sync state
   */
  checkRunState(): void {
    // Start txpool if not already running
    if (!this.running) {
      this.start()
    }
  }

  private validateTxGasBump(
    existingTx: TypedTransaction,
    addedTx: TypedTransaction,
  ) {
    const existingTxGasPrice = this.txGasPrice(existingTx)
    const newGasPrice = this.txGasPrice(addedTx)
    const minTipCap =
      existingTxGasPrice.tip +
      (existingTxGasPrice.tip * BigInt(MIN_GAS_PRICE_BUMP_PERCENT)) /
        BigInt(100)

    const minFeeCap =
      existingTxGasPrice.maxFee +
      (existingTxGasPrice.maxFee * BigInt(MIN_GAS_PRICE_BUMP_PERCENT)) /
        BigInt(100)
    if (newGasPrice.tip < minTipCap || newGasPrice.maxFee < minFeeCap) {
      throw EthereumJSErrorWithoutCode(
        `replacement gas too low, got tip ${newGasPrice.tip}, min: ${minTipCap}, got fee ${newGasPrice.maxFee}, min: ${minFeeCap}`,
      )
    }
  }

  /**
   * Handles chain reorganization by re-injecting transactions from orphaned blocks.
   * @param oldBlocks Blocks that were orphaned (removed from canonical chain)
   * @param newBlocks Blocks that became canonical
   */
  async handleReorg(oldBlocks: Block[], newBlocks: Block[]): Promise<void> {
    this.config.options.logger?.info(
      `TxPool handling reorg: ${oldBlocks.length} old blocks, ${newBlocks.length} new blocks`,
    )

    // Collect tx hashes from new blocks (these are now mined)
    const newBlockTxHashes = new Set<string>()
    for (const block of newBlocks) {
      for (const tx of block.transactions) {
        newBlockTxHashes.add(bytesToUnprefixedHex(tx.hash()))
      }
    }

    // Re-inject transactions from old blocks that aren't in new blocks
    for (const block of oldBlocks) {
      for (const tx of block.transactions) {
        const txHash = bytesToUnprefixedHex(tx.hash())

        // Skip if tx is in the new canonical chain
        if (newBlockTxHashes.has(txHash)) continue

        // Skip if tx is already in pool
        if (this.handled.has(txHash)) continue

        try {
          // Re-add as local to protect from immediate eviction
          await this.add(tx, true)
          this.config.options.logger?.debug(
            `Re-injected orphaned tx: ${txHash}`,
          )
        } catch (error: any) {
          this.config.options.logger?.debug(
            `Failed to re-inject orphaned tx ${txHash}: ${error.message}`,
          )
        }
      }
    }

    // Clear all nonce caches since state has changed
    this.accountNonces.clear()

    // Remove txs that are in new blocks
    this.removeNewBlockTxs(newBlocks)

    // Re-evaluate all transactions
    await this.demoteUnexecutables()
    await this.promoteExecutables()
  }

  /**
   * Validates a transaction against the pool and other constraints
   * @param tx The tx to validate
   */
  private async validate(tx: TypedTransaction, isLocalTransaction = false) {
    if (!tx.isSigned()) {
      throw EthereumJSErrorWithoutCode(
        'Attempting to add tx to txpool which is not signed',
      )
    }
    if (tx.data.length > TX_MAX_DATA_SIZE) {
      throw EthereumJSErrorWithoutCode(
        `Tx is too large (${tx.data.length} bytes) and exceeds the max data size of ${TX_MAX_DATA_SIZE} bytes`,
      )
    }
    const currentGasPrice = this.txGasPrice(tx)
    // This is the tip which the miner receives: miner does not want
    // to mine underpriced txs where miner gets almost no fees
    // Check if tx is underpriced when pool is near capacity
    if (!isLocalTransaction) {
      const totalTxs = this.pendingCount + this.queuedCount
      if (totalTxs >= (GLOBAL_SLOTS + GLOBAL_QUEUE) * 0.9) {
        // Pool is >90% full, check if tx can compete
        const minPrice = this.getMinPrice()
        const txPrice = this.txGasPrice(tx).tip
        if (txPrice <= minPrice) {
          throw EthereumJSErrorWithoutCode(
            `Transaction underpriced: ${txPrice} <= pool minimum ${minPrice}`,
          )
        }
      }
    }
    const senderAddress = tx.getSenderAddress()
    const sender: UnprefixedAddress = senderAddress.toString().slice(2)

    // Check both pending and queued pools
    const pendingTxs = this.pending.get(sender) ?? []
    const queuedTxs = this.queued.get(sender) ?? []
    const allTxsForSender = [...pendingTxs, ...queuedTxs]

    if (allTxsForSender.length > 0) {
      if (
        !isLocalTransaction &&
        allTxsForSender.length >= MAX_TXS_PER_ACCOUNT
      ) {
        throw EthereumJSErrorWithoutCode(
          `Cannot add tx for ${senderAddress}: already have max amount of txs for this account`,
        )
      }
      // Check for existing tx with same nonce in either pool
      const existingTxn = allTxsForSender.find(
        (poolObj) => poolObj.tx.nonce === tx.nonce,
      )
      if (existingTxn) {
        if (equalsBytes(existingTxn.tx.hash(), tx.hash())) {
          throw EthereumJSErrorWithoutCode(
            `${bytesToHex(tx.hash())}: this transaction is already in the TxPool`,
          )
        }

        this.validateTxGasBump(existingTxn.tx, tx)
      }
    }
    const block = await this.chain.getCanonicalHeadHeader()
    if (tx.gasLimit > block.gasLimit) {
      throw EthereumJSErrorWithoutCode(
        `Tx gaslimit of ${tx.gasLimit} exceeds block gas limit of ${block.gasLimit} (exceeds last block gas limit)`,
      )
    }

    // Copy VM in order to not overwrite the state root of the VMExecution module which may be concurrently running blocks
    const vmCopy = await this.execution.vm.shallowCopy()
    // Set state root to latest block so that account balance is correct when doing balance check
    await vmCopy.stateManager.setStateRoot(block.stateRoot)
    let account = await vmCopy.stateManager.getAccount(senderAddress)
    if (account === undefined) {
      account = new Account()
    }
    if (account.nonce > tx.nonce) {
      throw EthereumJSErrorWithoutCode(
        `0x${sender} tries to send a tx with nonce ${tx.nonce}, but account has nonce ${account.nonce} (tx nonce too low)`,
      )
    }
    const minimumBalance = tx.value + currentGasPrice.maxFee * tx.gasLimit
    if (account.balance < minimumBalance) {
      throw EthereumJSErrorWithoutCode(
        `0x${sender} does not have enough balance to cover transaction costs, need ${minimumBalance}, but have ${account.balance} (insufficient balance)`,
      )
    }
  }

  /**
   * Adds a tx to the pool.
   *
   * If there is a tx in the pool with the same address and
   * nonce it will be replaced by the new tx, if it has a sufficient gas bump.
   * This also verifies certain constraints, if these are not met, tx will not be added to the pool.
   * @param tx Transaction
   * @param isLocalTransaction if this is a local transaction (loosens some constraints) (default: false)
   */
  async add(tx: TypedTransaction, isLocalTransaction = false) {
    const hash: UnprefixedHash = bytesToUnprefixedHex(tx.hash())
    const added = Date.now()
    const address: UnprefixedAddress = tx.getSenderAddress().toString().slice(2)

    try {
      await this.validate(tx, isLocalTransaction)

      const pool = await this.classifyTransaction(tx, address)
      const targetPool = pool === 'pending' ? this.pending : this.queued

      // Get existing txs for this address
      let existingTxs = targetPool.get(address) ?? []

      // Check for replacement (same nonce)
      const existingIdx = existingTxs.findIndex(
        (obj) => obj.tx.nonce === tx.nonce,
      )
      if (existingIdx !== -1) {
        // Remove old tx from priced heap and hash index
        const oldTxObj = existingTxs[existingIdx]
        this.removeFromPriced(oldTxObj)
        this.hashIndex.delete(oldTxObj.hash)
        existingTxs = existingTxs.filter((_, idx) => idx !== existingIdx)
        if (pool === 'pending') this.pendingCount--
        else this.queuedCount--
      }

      // Check pool limits
      const accountLimit = pool === 'pending' ? ACCOUNT_SLOTS : ACCOUNT_QUEUE
      if (!isLocalTransaction && existingTxs.length >= accountLimit) {
        throw EthereumJSErrorWithoutCode(
          `Cannot add tx: account ${address} exceeds ${pool} limit of ${accountLimit}`,
        )
      }

      const txObj: TxPoolObject = { tx, added, hash }
      existingTxs.push(txObj)
      existingTxs.sort((a, b) => Number(a.tx.nonce - b.tx.nonce))
      targetPool.set(address, existingTxs)

      // Track in priced heap
      this.priced.insert(txObj)

      // Track as local if applicable
      if (isLocalTransaction) {
        this.locals.add(hash)
      }

      // Update counts
      if (pool === 'pending') this.pendingCount++
      else this.queuedCount++

      this.handled.set(hash, { address, added })

      // Update hash index for O(1) lookup
      this.hashIndex.set(hash, { address, poolType: pool })

      // Try to promote queued txs if we added to pending
      if (pool === 'pending') {
        await this.promoteExecutables(address)
      }

      // Enforce global limits
      this.enforcePoolLimits()
    } catch (e) {
      this.handled.set(hash, { address, added, error: e as Error })
      throw e
    }
  }

  /**
   * Promotes transactions from queued to pending when they become executable.
   * Called after new blocks are processed or new transactions are added.
   * @param address Optional specific address to check (undefined = all addresses)
   */
  async promoteExecutables(address?: UnprefixedAddress): Promise<void> {
    const addresses = address ? [address] : Array.from(this.queued.keys())

    for (const addr of addresses) {
      const queuedTxs = this.queued.get(addr)
      if (!queuedTxs || queuedTxs.length === 0) continue

      // Get current account nonce
      let accountNonce = this.accountNonces.get(addr)
      if (accountNonce === undefined) {
        const block = await this.chain.getCanonicalHeadHeader()
        const vmCopy = await this.execution.vm.shallowCopy()
        await vmCopy.stateManager.setStateRoot(block.stateRoot)
        const addrObj = new Address(hexToBytes(`0x${addr}`))
        const account =
          (await vmCopy.stateManager.getAccount(addrObj)) ?? new Account()
        accountNonce = account.nonce
        this.accountNonces.set(addr, accountNonce)
      }

      // Determine the next expected nonce (account nonce or highest pending + 1)
      const pendingTxs = this.pending.get(addr) ?? []
      let nextExpectedNonce = accountNonce
      if (pendingTxs.length > 0) {
        const maxPendingNonce = pendingTxs.reduce(
          (max, obj) => (obj.tx.nonce > max ? obj.tx.nonce : max),
          pendingTxs[0].tx.nonce,
        )
        nextExpectedNonce = maxPendingNonce + BIGINT_1
      }

      // Sort queued by nonce
      queuedTxs.sort((a, b) => Number(a.tx.nonce - b.tx.nonce))

      // Promote consecutive executable txs
      const toPromote: TxPoolObject[] = []
      const remaining: TxPoolObject[] = []

      for (const txObj of queuedTxs) {
        if (txObj.tx.nonce === nextExpectedNonce) {
          toPromote.push(txObj)
          nextExpectedNonce = txObj.tx.nonce + BIGINT_1
        } else if (txObj.tx.nonce < accountNonce) {
          // Stale tx - remove it entirely
          this.queuedCount--
          this.removeFromPriced(txObj)
          this.handled.delete(txObj.hash)
          this.hashIndex.delete(txObj.hash)
        } else {
          // Still has a gap - keep in queued
          remaining.push(txObj)
        }
      }

      // Move promoted txs to pending
      if (toPromote.length > 0) {
        const newPending = [...pendingTxs, ...toPromote]
        newPending.sort((a, b) => Number(a.tx.nonce - b.tx.nonce))
        this.pending.set(addr, newPending)
        this.pendingCount += toPromote.length
        this.queuedCount -= toPromote.length

        // Update hash index for promoted txs
        for (const txObj of toPromote) {
          this.hashIndex.set(txObj.hash, {
            address: addr,
            poolType: 'pending',
          })
        }

        this.config.options.logger?.debug(
          `Promoted ${toPromote.length} txs from queued to pending for ${addr}`,
        )
      }

      // Update queued
      if (remaining.length === 0) {
        this.queued.delete(addr)
      } else {
        this.queued.set(addr, remaining)
      }
    }
  }

  /**
   * Demotes transactions from pending to queued when they become non-executable.
   * Called after chain reorgs or when account state changes.
   */
  async demoteUnexecutables(): Promise<void> {
    // Use VM head (last executed block) instead of canonical head (last imported block)
    // to avoid race conditions where blocks are imported but not yet executed
    const vmHeadBlock = await this.chain.getCanonicalVmHead()
    const vmCopy = await this.execution.vm.shallowCopy()

    // Check if the VM head's state root exists in the state trie
    // If not, use the VM's current state root as a fallback
    let stateRoot = vmHeadBlock.header.stateRoot
    const hasStateRoot = await vmCopy.stateManager.hasStateRoot(stateRoot)

    if (!hasStateRoot) {
      // Fallback to VM's current state root if VM head state root doesn't exist yet
      // This can happen during initial sync when blocks are imported faster than executed
      stateRoot = await vmCopy.stateManager.getStateRoot()
      this.config.options.logger?.debug(
        `VM head state root not found, using VM current state root for demoteUnexecutables`,
      )
    }

    try {
      await vmCopy.stateManager.setStateRoot(stateRoot)
    } catch (error) {
      console.log(error)
      this.config.options.logger?.error(`Error setting state root: ${error}`)
      return
    }

    for (const [addr, pendingTxs] of this.pending) {
      const addrObj = new Address(hexToBytes(`0x${addr}`))
      const account =
        (await vmCopy.stateManager.getAccount(addrObj)) ?? new Account()
      const accountNonce = account.nonce
      const accountBalance = account.balance

      // Update nonce cache
      this.accountNonces.set(addr, accountNonce)

      const stillPending: TxPoolObject[] = []
      const toDemote: TxPoolObject[] = []
      const toRemove: TxPoolObject[] = []

      // Sort by nonce first
      pendingTxs.sort((a, b) => Number(a.tx.nonce - b.tx.nonce))

      let lastValidNonce = accountNonce - BIGINT_1

      for (const txObj of pendingTxs) {
        const tx = txObj.tx
        const gasPrice = this.txGasPrice(tx)
        const cost = tx.value + gasPrice.maxFee * tx.gasLimit

        if (tx.nonce < accountNonce) {
          // Already mined - remove
          toRemove.push(txObj)
        } else if (accountBalance < cost) {
          // Insufficient balance - demote to queued
          toDemote.push(txObj)
        } else if (tx.nonce !== lastValidNonce + BIGINT_1) {
          // Nonce gap - demote to queued
          toDemote.push(txObj)
        } else {
          // Still valid
          stillPending.push(txObj)
          lastValidNonce = tx.nonce
        }
      }

      // Remove stale txs
      for (const txObj of toRemove) {
        this.pendingCount--
        this.removeFromPriced(txObj)
        this.handled.delete(txObj.hash)
        this.locals.delete(txObj.hash)
      }

      // Demote to queued
      if (toDemote.length > 0) {
        const existingQueued = this.queued.get(addr) ?? []
        const newQueued = [...existingQueued, ...toDemote]
        newQueued.sort((a, b) => Number(a.tx.nonce - b.tx.nonce))
        this.queued.set(addr, newQueued)
        this.pendingCount -= toDemote.length
        this.queuedCount += toDemote.length

        this.config.options.logger?.debug(
          `Demoted ${toDemote.length} txs from pending to queued for ${addr}`,
        )
      }

      // Update pending
      if (stillPending.length === 0) {
        this.pending.delete(addr)
      } else {
        this.pending.set(addr, stillPending)
      }
    }
  }

  /**
   * Removes a transaction from the priced heap.
   * Note: QHeap doesn't support arbitrary removal, so we need to rebuild.
   */
  private removeFromPriced(txObj: TxPoolObject): void {
    const newHeap = new Heap({
      comparBefore: (a: TxPoolObject, b: TxPoolObject) =>
        this.txGasPrice(a.tx).tip < this.txGasPrice(b.tx).tip,
    }) as QHeap<TxPoolObject>

    while (this.priced.length > 0) {
      const item = this.priced.remove()
      if (item && item.hash !== txObj.hash) {
        newHeap.insert(item)
      }
    }
    this.priced = newHeap
  }

  /**
   * Gets the minimum gas price in the pool (for underpriced detection).
   */
  getMinPrice(): bigint {
    const lowest = this.priced.peek()
    if (!lowest) return BIGINT_0
    return this.txGasPrice(lowest.tx).tip
  }

  clearNonceCache(address?: UnprefixedAddress): void {
    if (address) {
      this.accountNonces.delete(address)
    } else {
      this.accountNonces.clear()
    }
  }

  /**
   * Enforces global pool size limits by evicting lowest-priced transactions.
   * Local transactions are protected from eviction.
   */
  private enforcePoolLimits(): void {
    // Enforce pending limit
    while (this.pendingCount > GLOBAL_SLOTS) {
      const evicted = this.evictLowestPriced('pending')
      if (!evicted) break // No more evictable txs
    }

    // Enforce queued limit
    while (this.queuedCount > GLOBAL_QUEUE) {
      const evicted = this.evictLowestPriced('queued')
      if (!evicted) break
    }
  }

  /**
   * Evicts the lowest-priced non-local transaction from a pool.
   * @returns true if a tx was evicted, false if none could be evicted
   */
  private evictLowestPriced(pool: 'pending' | 'queued'): boolean {
    const targetPool = pool === 'pending' ? this.pending : this.queued

    // Find lowest priced non-local tx
    let lowestPrice = BigInt(Number.MAX_SAFE_INTEGER)
    let lowestTx: TxPoolObject | null = null
    let lowestAddr: UnprefixedAddress | null = null

    for (const [addr, txObjs] of targetPool) {
      for (const txObj of txObjs) {
        // Skip local transactions
        if (this.locals.has(txObj.hash)) continue

        const price = this.txGasPrice(txObj.tx).tip
        if (price < lowestPrice) {
          lowestPrice = price
          lowestTx = txObj
          lowestAddr = addr
        }
      }
    }

    if (!lowestTx || !lowestAddr) return false

    // Remove the tx
    this.removeByHash(lowestTx.hash, lowestTx.tx)
    this.config.options.logger?.debug(
      `Evicted underpriced tx ${lowestTx.hash} (price: ${lowestPrice}) from ${pool}`,
    )

    return true
  }

  /**
   * Check if a transaction hash has been handled (added to pool or rejected)
   * @param txHash Transaction hash (unprefixed hex string)
   * @returns true if the tx has been handled
   */
  hasHandled(txHash: UnprefixedHash): boolean {
    return this.handled.has(txHash)
  }

  /**
   * Returns the available txs from the pool
   * @param txHashes
   * @returns Array of tx objects
   */
  getByHash(txHashes: Uint8Array[]): TypedTransaction[] {
    const found: TypedTransaction[] = []
    for (const txHash of txHashes) {
      const txHashStr = bytesToUnprefixedHex(txHash)
      const handled = this.handled.get(txHashStr)
      if (!handled || handled.error !== undefined) continue

      // Optimize: Use hash index for O(1) lookup instead of searching pools
      const indexEntry = this.hashIndex.get(txHashStr)
      if (!indexEntry) continue

      const inPool =
        indexEntry.poolType === 'pending'
          ? this.pending.get(indexEntry.address)
          : this.queued.get(indexEntry.address)

      if (!inPool) continue

      const match = inPool.find((poolObj) => poolObj.hash === txHashStr)
      if (match) {
        found.push(match.tx)
      }
    }
    return found
  }

  /**
   * Removes the given tx from the pool
   * @param txHash Hash of the transaction
   */
  removeByHash(txHash: UnprefixedHash, tx: TypedTransaction) {
    const handled = this.handled.get(txHash)
    if (!handled) return
    const { address } = handled

    // Try pending first
    let poolObjects = this.pending.get(address)
    let pool: 'pending' | 'queued' = 'pending'

    if (!poolObjects || !poolObjects.find((obj) => obj.hash === txHash)) {
      // Try queued
      poolObjects = this.queued.get(address)
      pool = 'queued'
    }

    if (!poolObjects) return

    const txObj = poolObjects.find((obj) => obj.hash === txHash)
    if (!txObj) return

    const newPoolObjects = poolObjects.filter((obj) => obj.hash !== txHash)

    // Update the correct pool
    const targetPool = pool === 'pending' ? this.pending : this.queued
    if (newPoolObjects.length === 0) {
      targetPool.delete(address)
    } else {
      targetPool.set(address, newPoolObjects)
    }

    // Update counts
    if (pool === 'pending') this.pendingCount--
    else this.queuedCount--

    // Remove from priced heap
    this.removeFromPriced(txObj)

    // Remove from hash index
    this.hashIndex.delete(txHash)

    // Remove from locals if present
    this.locals.delete(txHash)
  }

  /**
   * Broadcast transactions to peers using Geth-style sqrt propagation.
   * Full transactions go to sqrt(n) peers, hashes to the rest.
   * @param txs Transactions to broadcast
   * @param peers Optional peer list (defaults to all connected peers)
   */
  broadcastTransactions(txs: TypedTransaction[], peers?: Peer[]) {
    if (txs.length === 0) return

    const targetPeers = peers ?? this.pool.getConnectedPeers()
    const numPeers = targetPeers.length
    if (numPeers === 0) return

    // Calculate sqrt(n) peers for full tx broadcast
    const numFullBroadcast = Math.max(
      this.MIN_BROADCAST_PEERS,
      Math.floor(Math.sqrt(numPeers)),
    )

    // Prepare hash announcement data
    const txHashes: [number[], number[], Uint8Array[]] = [[], [], []]
    for (const tx of txs) {
      txHashes[0].push(tx.type)
      txHashes[1].push(tx.serialize().byteLength)
      txHashes[2].push(tx.hash())
    }

    // Send full transactions to sqrt(n) peers
    this.sendTransactions(txs, targetPeers.slice(0, numFullBroadcast))

    // Send only hashes to remaining peers
    if (numFullBroadcast < numPeers) {
      this.sendNewTxHashes(txHashes, targetPeers.slice(numFullBroadcast))
    }
  }

  /**
   * Send full transactions to specific peers (internal use)
   */
  sendTransactions(txs: TypedTransaction[], peers: Peer[]) {
    if (txs.length === 0 || peers.length === 0) return

    const hashes = txs.map((tx) => tx.hash())
    for (const peer of peers) {
      // This is used to avoid re-sending along pooledTxHashes
      // announcements/re-broadcasts
      const newHashes = this.addToKnownByPeer(hashes, peer)
      const newHashesHex = newHashes.map((txHash) =>
        bytesToUnprefixedHex(txHash),
      )
      const newTxs = txs.filter((tx) =>
        newHashesHex.includes(bytesToUnprefixedHex(tx.hash())),
      )
      if (newTxs.length > 0) {
        peer.eth?.request('Transactions', newTxs).catch((e) => {
          this.markFailedSends(peer, newHashes, e as Error)
        })
      }
    }
  }

  private markFailedSends(
    peer: Peer,
    failedHashes: Uint8Array[],
    e: Error,
  ): void {
    for (const txHash of failedHashes) {
      const sendobject = this.knownByPeer
        .get(peer.id)
        ?.filter(
          (sendObject) => sendObject.hash === bytesToUnprefixedHex(txHash),
        )[0]
      if (sendobject) {
        sendobject.error = e
      }
    }
  }

  /**
   * Broadcast new tx hashes to peers
   */
  sendNewTxHashes(txs: [number[], number[], Uint8Array[]], peers: Peer[]) {
    const txHashes = txs[2]
    for (const peer of peers) {
      // Make sure data structure is initialized
      if (!this.knownByPeer.has(peer.id)) {
        this.knownByPeer.set(peer.id, [])
      }
      // Add to known tx hashes and get hashes still to send to peer
      const hashesToSend = this.addToKnownByPeer(txHashes, peer)

      // Broadcast to peer if at least 1 new tx hash to announce
      if (hashesToSend.length > 0) {
        if (
          peer.eth !== undefined &&
          (peer.eth as any)['versions'] !== undefined &&
          (peer.eth as any)['versions'].includes(68)
        ) {
          // If peer supports eth/68, send eth/68 formatted message (tx_types[], tx_sizes[], hashes[])
          const txsToSend: [number[], number[], Uint8Array[]] = [[], [], []]
          for (const hash of hashesToSend) {
            const index = txs[2].findIndex((el) => equalsBytes(el, hash))
            txsToSend[0].push(txs[0][index])
            txsToSend[1].push(txs[1][index])
            txsToSend[2].push(hash)
          }

          try {
            peer.eth?.send(
              'NewPooledTransactionHashes',
              txsToSend.slice(0, 4096),
            )
          } catch (e) {
            this.markFailedSends(peer, hashesToSend, e as Error)
          }
        }
        // If peer doesn't support eth/68, just send tx hashes
        else
          try {
            // We `send` this directly instead of using devp2p's async `request` since NewPooledTransactionHashes has no response and is just sent to peers
            // and this requires no tracking of a peer's response
            peer.eth?.send(
              'NewPooledTransactionHashes',
              hashesToSend.slice(0, 4096),
            )
          } catch (e) {
            this.markFailedSends(peer, hashesToSend, e as Error)
          }
      }
    }
  }

  async handleAnnouncedTxs(
    txs: TypedTransaction[],
    peer: Peer,
    peerPool: PeerPoolLike,
  ) {
    if (!this.running || txs.length === 0) return
    this.config.options.logger?.debug(
      `TxPool: received new transactions number=${txs.length}`,
    )
    this.addToKnownByPeer(
      txs.map((tx) => tx.hash()),
      peer,
    )

    const newTxHashes: [number[], number[], Uint8Array[]] = [[], [], []]
    for (const tx of txs) {
      try {
        await this.add(tx)
        newTxHashes[0].push(tx.type)
        newTxHashes[1].push(tx.serialize().byteLength)
        newTxHashes[2].push(tx.hash())
      } catch (error: any) {
        this.config.options.logger?.debug(
          `Error adding tx to TxPool: ${error.message} (tx hash: ${bytesToHex(tx.hash())})`,
        )
      }
    }

    // Geth-style sqrt propagation:
    // - Send full transactions to sqrt(n) peers (minimum MIN_BROADCAST_PEERS)
    // - Send only hashes to remaining peers
    const peers = peerPool.getConnectedPeers()
    const numPeers = peers.length
    const numFullBroadcast = Math.max(
      this.MIN_BROADCAST_PEERS,
      Math.floor(Math.sqrt(numPeers)),
    )

    // Send full transactions to sqrt(n) peers
    this.sendTransactions(txs, peers.slice(0, numFullBroadcast))
    // Send only hashes to remaining peers
    if (numFullBroadcast < numPeers) {
      this.sendNewTxHashes(newTxHashes, peers.slice(numFullBroadcast))
    }
  }

  addToKnownByPeer(txHashes: Uint8Array[], peer: Peer): Uint8Array[] {
    // Make sure data structure is initialized
    if (!this.knownByPeer.has(peer.id)) {
      this.knownByPeer.set(peer.id, [])
    }

    const newHashes: Uint8Array[] = []
    for (const hash of txHashes) {
      const inSent = this.knownByPeer
        .get(peer.id)!
        .filter(
          (sentObject) => sentObject.hash === bytesToUnprefixedHex(hash),
        ).length
      if (inSent === 0) {
        const added = Date.now()
        const add = {
          hash: bytesToUnprefixedHex(hash),
          added,
        }
        this.knownByPeer.get(peer.id)!.push(add)
        newHashes.push(hash)
      }
    }
    return newHashes
  }

  /**
   * Handle new tx hashes
   */
  async handleAnnouncedTxHashes(
    txHashes: Uint8Array[],
    peer: Peer,
    peerPool: PeerPoolLike,
  ) {
    if (!this.running || txHashes === undefined || txHashes.length === 0) return
    this.addToKnownByPeer(txHashes, peer)

    const reqHashes = []
    for (const txHash of txHashes) {
      const txHashStr: UnprefixedHash = bytesToUnprefixedHex(txHash)
      // Skip if already being fetched or already handled
      if (
        this.fetchingHashes.includes(txHashStr) ||
        this.handled.has(txHashStr)
      ) {
        continue
      }
      reqHashes.push(txHash)
    }

    if (reqHashes.length === 0) return

    this.config.options.logger?.debug(
      `TxPool: received new tx hashes number=${reqHashes.length}`,
    )

    const reqHashesStr: UnprefixedHash[] = reqHashes.map(bytesToUnprefixedHex)
    this.fetchingHashes = this.fetchingHashes.concat(reqHashesStr)
    this.config.options.logger?.debug(
      `TxPool: requesting txs number=${reqHashes.length} fetching=${this.fetchingHashes.length}`,
    )
    const getPooledTxs = await peer.eth?.getPooledTransactions({
      hashes: reqHashes.slice(0, this.TX_RETRIEVAL_LIMIT),
    })

    // Remove from fetching list regardless if tx is in result
    this.fetchingHashes = this.fetchingHashes.filter(
      (hash) => !reqHashesStr.includes(hash),
    )

    if (getPooledTxs === undefined) {
      return
    }
    const [_, txs] = getPooledTxs
    this.config.options.logger?.debug(
      `TxPool: received requested txs number=${txs.length}`,
    )

    const newTxHashes: [number[], number[], Uint8Array[]] = [[], [], []] as any
    for (const tx of txs) {
      try {
        await this.add(tx)
      } catch (error: any) {
        this.config.options.logger?.debug(
          `Error adding tx to TxPool: ${error.message} (tx hash: ${bytesToHex(tx.hash())})`,
        )
      }
      newTxHashes[0].push(tx.type)
      newTxHashes[1].push(tx.serialize().length)
      newTxHashes[2].push(tx.hash())
    }
    this.sendNewTxHashes(newTxHashes, peerPool.getConnectedPeers())
  }

  /**
   * Remove txs included in the latest blocks from the tx pool
   */
  removeNewBlockTxs(newBlocks: Block[]) {
    if (!this.running) return
    for (const block of newBlocks) {
      for (const tx of block.transactions) {
        const txHash: UnprefixedHash = bytesToUnprefixedHex(tx.hash())
        this.removeByHash(txHash, tx)
      }
    }
  }

  /**
   * Regular tx pool cleanup
   */
  cleanup() {
    // Remove txs older than POOLED_STORAGE_TIME_LIMIT from the pools
    const compDate = Date.now() - this.POOLED_STORAGE_TIME_LIMIT * 1000 * 60

    // Cleanup pending pool
    for (const [address, txObjs] of this.pending) {
      const updatedObjects = txObjs.filter((obj) => obj.added >= compDate)
      const removedCount = txObjs.length - updatedObjects.length
      if (removedCount > 0) {
        this.pendingCount -= removedCount
        // Remove from priced heap for each removed tx
        for (const txObj of txObjs) {
          if (txObj.added < compDate) {
            this.removeFromPriced(txObj)
            this.handled.delete(txObj.hash)
            this.hashIndex.delete(txObj.hash)
            this.locals.delete(txObj.hash)
          }
        }
        if (updatedObjects.length === 0) {
          this.pending.delete(address)
        } else {
          this.pending.set(address, updatedObjects)
        }
      }
    }

    // Cleanup queued pool
    for (const [address, txObjs] of this.queued) {
      const updatedObjects = txObjs.filter((obj) => obj.added >= compDate)
      const removedCount = txObjs.length - updatedObjects.length
      if (removedCount > 0) {
        this.queuedCount -= removedCount
        // Remove from priced heap for each removed tx
        for (const txObj of txObjs) {
          if (txObj.added < compDate) {
            this.removeFromPriced(txObj)
            this.handled.delete(txObj.hash)
            this.hashIndex.delete(txObj.hash)
            this.locals.delete(txObj.hash)
          }
        }
        if (updatedObjects.length === 0) {
          this.queued.delete(address)
        } else {
          this.queued.set(address, updatedObjects)
        }
      }
    }

    // Cleanup knownByPeer
    for (const [peerId, sentObjects] of this.knownByPeer) {
      const updatedObjects = sentObjects.filter((obj) => obj.added >= compDate)
      if (updatedObjects.length < sentObjects.length) {
        if (updatedObjects.length === 0) {
          this.knownByPeer.delete(peerId)
        } else {
          this.knownByPeer.set(peerId, updatedObjects)
        }
      }
    }

    // Cleanup handled txs
    const handledCompDate =
      Date.now() - this.HANDLED_CLEANUP_TIME_LIMIT * 1000 * 60
    for (const [hash, handleObj] of this.handled) {
      if (handleObj.added < handledCompDate) {
        this.handled.delete(hash)
      }
    }
  }

  /**
   * Helper to return a normalized gas price across different
   * transaction types. For legacy transactions, this is the gas price.
   * @param tx The tx
   * @param baseFee Unused for legacy transactions
   */
  protected normalizedGasPrice(tx: TypedTransaction, baseFee?: bigint) {
    return (tx as LegacyTx).gasPrice
  }

  /**
   * Returns the GasPrice object to provide information of the tx' gas prices
   * @param tx Tx to use
   * @returns Gas price (both tip and max fee)
   */
  private txGasPrice(tx: TypedTransaction): GasPrice {
    if (isLegacyTx(tx)) {
      return {
        maxFee: tx.gasPrice,
        tip: tx.gasPrice,
      }
    }

    if (isAccessList2930Tx(tx)) {
      return {
        maxFee: tx.gasPrice,
        tip: tx.gasPrice,
      }
    }

    if (isFeeMarket1559Tx(tx) || isBlob4844Tx(tx)) {
      return {
        maxFee: tx.maxFeePerGas,
        tip: tx.maxPriorityFeePerGas,
      }
    } else {
      throw EthereumJSErrorWithoutCode(
        `tx of type ${(tx as TypedTransaction).type} unknown`,
      )
    }
  }

  /**
   * Returns eligible txs to be mined sorted by price in such a way that the
   * nonce orderings within a single account are maintained.
   *
   * Returns a TransactionsByPriceAndNonce instance for incremental selection.
   *
   * @param vm VM instance for account nonce verification
   * @param options Options including baseFee (unused for legacy), minGasPrice, and priorityAddresses
   */
  async txsByPriceAndNonce(
    vm: VM,
    {
      baseFee,
      allowedBlobs,
      minGasPrice,
      priorityAddresses,
    }: {
      baseFee?: bigint
      allowedBlobs?: number
      minGasPrice?: bigint
      priorityAddresses?: Address[]
    } = {},
  ): Promise<TransactionsByPriceAndNonce> {
    const byNonce = new Map<string, TxPoolObject[]>()
    let skippedByNonce = 0

    // Convert priority addresses to unprefixed strings for comparison
    const priorityAddressSet = new Set<string>()
    if (priorityAddresses) {
      for (const addr of priorityAddresses) {
        priorityAddressSet.add(addr.toString().slice(2))
      }
    }

    // Split into priority and normal transactions
    const priorityTxs = new Map<string, TxPoolObject[]>()
    const normalTxs = new Map<string, TxPoolObject[]>()

    // Only iterate over pending pool - these are executable
    for (const [address, poolObjects] of this.pending) {
      // Sort by nonce
      const txsSortedByNonce = [...poolObjects].sort((a, b) =>
        Number(a.tx.nonce - b.tx.nonce),
      )

      // Verify account nonce matches lowest tx nonce
      let account = await vm.stateManager.getAccount(
        new Address(hexToBytes(`0x${address}`)),
      )
      if (account === undefined) {
        account = new Account()
      }

      if (txsSortedByNonce[0].tx.nonce !== account.nonce) {
        // Shouldn't happen if promoteExecutables works correctly
        skippedByNonce += txsSortedByNonce.length
        continue
      }

      // Split by priority
      if (priorityAddressSet.has(address)) {
        priorityTxs.set(address, txsSortedByNonce)
      } else {
        normalTxs.set(address, txsSortedByNonce)
      }
    }

    // Combine priority first, then normal
    // Priority transactions will be processed first due to how TransactionsByPriceAndNonce works
    const allTxs = new Map<string, TxPoolObject[]>()
    for (const [address, txs] of priorityTxs) {
      allTxs.set(address, txs)
    }
    for (const [address, txs] of normalTxs) {
      allTxs.set(address, txs)
    }

    // Create TransactionsByPriceAndNonce instance
    const minGasPriceValue = minGasPrice ?? BIGINT_0
    const txSet = new TransactionsByPriceAndNonce(
      allTxs,
      (tx) => this.txGasPrice(tx).tip,
      minGasPriceValue,
    )

    this.config.options.logger?.info(
      `txsByPriceAndNonce created txSet with ${allTxs.size} accounts, skipped byNonce=${skippedByNonce}`,
    )

    return txSet
  }

  /**
   * Stop pool execution
   */
  stop(): boolean {
    if (!this.running) return false
    clearInterval(this._cleanupInterval as NodeJS.Timeout)
    clearInterval(this._logInterval as NodeJS.Timeout)
    // In stop():
    if (this.rebroadcastInterval) {
      clearInterval(this.rebroadcastInterval)
      this.rebroadcastInterval = undefined
    }
    this.running = false
    this.config.options.logger?.info('TxPool stopped.')
    return true
  }

  /**
   * Close pool
   */
  close() {
    this.pending.clear()
    this.queued.clear()
    this.handled.clear()
    this.accountNonces.clear()
    this.locals.clear()
    this.knownByPeer.clear()
    this.fetchingHashes = []
    this.pendingCount = 0
    this.queuedCount = 0

    // Rebuild empty priced heap
    this.priced = new Heap({
      comparBefore: (a: TxPoolObject, b: TxPoolObject) =>
        this.txGasPrice(a.tx).tip < this.txGasPrice(b.tx).tip,
    }) as QHeap<TxPoolObject>

    if (this.config.options.metrics !== undefined) {
      // TODO: Only clear the metrics related to the transaction pool here
      for (const [_, metric] of Object.entries(
        this.config.options.metrics as any,
      )) {
        ;(metric as any).set(0)
      }
    }
    this.opened = false
  }

  _logPoolStats() {
    let broadcasts = 0
    let broadcasterrors = 0
    let knownpeers = 0
    for (const sendobjects of this.knownByPeer.values()) {
      broadcasts += sendobjects.length
      broadcasterrors += sendobjects.filter(
        (sendobject) => sendobject.error !== undefined,
      ).length
      knownpeers++
    }

    const totalTxs = this.pendingCount + this.queuedCount
    const totalSenders = this.pending.size + this.queued.size

    // Get average
    if (knownpeers > 0) {
      broadcasts = broadcasts / knownpeers
      broadcasterrors = broadcasterrors / knownpeers
    }
    if (totalTxs > 0) {
      broadcasts = broadcasts / totalTxs
      broadcasterrors = broadcasterrors / totalTxs
    }

    let handledadds = 0
    let handlederrors = 0
    for (const handledobject of this.handled.values()) {
      if (handledobject.error === undefined) {
        handledadds++
      } else {
        handlederrors++
      }
    }
    this.config.options.logger?.info(
      `TxPool Statistics pending=${this.pendingCount} queued=${this.queuedCount} senders=${totalSenders} peers=${this.pool.getPeerCount()}`,
    )
    this.config.options.logger?.info(
      `TxPool Statistics broadcasts=${broadcasts}/tx/peer broadcasterrors=${broadcasterrors}/tx/peer knownpeers=${knownpeers} since minutes=${this.POOLED_STORAGE_TIME_LIMIT}`,
    )
    this.config.options.logger?.info(
      `TxPool Statistics successfuladds=${handledadds} failedadds=${handlederrors} since minutes=${this.HANDLED_CLEANUP_TIME_LIMIT}`,
    )
  }
}
