import type { TypedTransaction } from '@ts-ethereum/tx'
import { BIGINT_0 } from '@ts-ethereum/utils'
import type { QHeap } from '../ext/qheap'
import { Heap } from '../ext/qheap'

/**
 * Transaction pool object structure (matches TxPoolObject from txpool.ts)
 */
export interface TxPoolObject {
  tx: TypedTransaction
  hash: string // Unprefixed hash
  added: number // Timestamp when tx was added to pool
  error?: Error
}

/**
 * Wraps a transaction with its miner fee and metadata for heap-based ordering
 */
class TxWithMinerFee {
  txObj: TxPoolObject
  from: string // Unprefixed address
  fees: bigint // Miner fee (gas price for legacy txs)

  constructor(txObj: TxPoolObject, from: string, fees: bigint) {
    this.txObj = txObj
    this.from = from
    this.fees = fees
  }

  get tx(): TypedTransaction {
    return this.txObj.tx
  }

  get added(): number {
    return this.txObj.added
  }
}

/**
 * Represents a set of transactions that can return transactions in a
 * profit-maximizing sorted order, while supporting removing entire batches
 * of transactions for non-executable accounts.
 *
 * This implements incremental heap-based transaction selection matching
 * Geth's behavior for Chainstart/Frontier era.
 */
export class TransactionsByPriceAndNonce {
  // Per account nonce-sorted list of transaction pool objects
  private txs: Map<string, TxPoolObject[]>
  // Next transaction for each unique account (price heap)
  private heads: QHeap<TxWithMinerFee>
  // Function to extract gas price from transaction
  private getGasPrice: (tx: TypedTransaction) => bigint

  /**
   * Creates a transaction set that can retrieve price sorted transactions
   * in a nonce-honouring way.
   *
   * @param txsByAccount Map of address -> nonce-sorted transaction pool objects
   * @param getGasPrice Function to extract gas price from transaction
   * @param minGasPrice Minimum gas price filter (default: 0)
   */
  constructor(
    txsByAccount: Map<string, TxPoolObject[]>,
    getGasPrice: (tx: TypedTransaction) => bigint,
    minGasPrice: bigint = BIGINT_0,
  ) {
    this.txs = new Map()
    this.getGasPrice = getGasPrice

    // Initialize a price and received time based heap with the head transactions
    const heads: TxWithMinerFee[] = []

    for (const [address, accTxObjs] of txsByAccount) {
      if (accTxObjs.length === 0) continue

      // Filter by minimum gas price
      const filteredTxObjs = accTxObjs.filter((txObj) => {
        const gasPrice = getGasPrice(txObj.tx)
        return gasPrice >= minGasPrice
      })

      if (filteredTxObjs.length === 0) continue

      // Get head transaction
      const headTxObj = filteredTxObjs[0]
      const gasPrice = getGasPrice(headTxObj.tx)

      // Store remaining transactions
      this.txs.set(address, filteredTxObjs.slice(1))

      // Add head to heap
      heads.push(new TxWithMinerFee(headTxObj, address, gasPrice))
    }

    // Initialize heap with time-based tie-breaking comparator
    // Higher price = higher priority (lower in heap)
    // If prices equal, older transaction (lower timestamp) = higher priority
    this.heads = new Heap({
      comparBefore: (a: TxWithMinerFee, b: TxWithMinerFee) => {
        // Compare prices first
        if (a.fees > b.fees) return false // a has higher priority (should be lower in heap)
        if (a.fees < b.fees) return true // b has higher priority

        // Prices are equal, use time for tie-breaking
        // Older transaction (lower timestamp) has higher priority
        return a.added > b.added
      },
    }) as QHeap<TxWithMinerFee>

    // Insert all heads into heap
    for (const head of heads) {
      this.heads.insert(head)
    }
  }

  /**
   * Returns the next transaction by price without removing it.
   * @returns Transaction and its miner fee, or undefined if empty
   */
  peek(): { tx: TypedTransaction; fees: bigint } | undefined {
    const head = this.heads.peek()
    if (!head) return undefined
    return { tx: head.tx, fees: head.fees }
  }

  /**
   * Replaces the current best head with the next one from the same account.
   * This is used when a transaction is successfully added to the block.
   */
  shift(): void {
    const head = this.heads.peek()
    if (!head) return

    const address = head.from
    const accTxObjs = this.txs.get(address)

    if (accTxObjs && accTxObjs.length > 0) {
      // Get next transaction from same account
      const nextTxObj = accTxObjs[0]
      const remainingTxObjs = accTxObjs.slice(1)

      // Get gas price for next transaction
      const gasPrice = this.getGasPrice(nextTxObj.tx)

      // Remove current head
      this.heads.remove()

      // Create new head with next transaction
      const newHead = new TxWithMinerFee(nextTxObj, address, gasPrice)

      // Insert new head into heap
      this.heads.insert(newHead)

      // Update remaining transactions
      this.txs.set(address, remainingTxObjs)
    } else {
      // No more transactions from this account, remove from heap
      this.heads.remove()
      this.txs.delete(address)
    }
  }

  /**
   * Removes the best transaction, *not* replacing it with the next one from
   * the same account. This should be used when a transaction cannot be executed
   * and hence all subsequent ones should be discarded from the same account.
   */
  pop(): void {
    const head = this.heads.remove()
    if (!head) return

    const address = head.from
    // Remove all remaining transactions from this account
    this.txs.delete(address)
  }

  /**
   * Returns if the price heap is empty.
   */
  empty(): boolean {
    return this.heads.length === 0
  }

  /**
   * Clears the entire content of the heap.
   */
  clear(): void {
    this.heads = new Heap({
      comparBefore: (a: TxWithMinerFee, b: TxWithMinerFee) => {
        if (a.fees > b.fees) return false
        if (a.fees < b.fees) return true
        return a.added > b.added
      },
    }) as QHeap<TxWithMinerFee>
    this.txs.clear()
  }
}
