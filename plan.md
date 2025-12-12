# TxPool Geth-Style Refactor Plan

This plan transforms the current simplified TxPool into a full-featured Geth-like implementation with proper pending/queued transaction management, nonce gap handling, chain reorg support, and RPC inspection methods.

---

## Phase 1: Dual Pool Structure

### 1.1 Add New Data Structures to `txpool.ts`

Replace the single `pool` Map with two separate pools and add supporting structures:

```typescript
// In src/client/service/txpool.ts

// Pending: executable transactions (nonce matches account nonce)
public pending: Map<UnprefixedAddress, TxPoolObject[]>;

// Queued: future transactions (nonce > account nonce, waiting for gaps to fill)
public queued: Map<UnprefixedAddress, TxPoolObject[]>;

// Track expected nonce for each address (cache to avoid repeated DB lookups)
private accountNonces: Map<UnprefixedAddress, bigint>;

// Local transactions get priority and eviction protection
private locals: Set<UnprefixedHash>;

// Price-sorted index for eviction (all txs from both pools)
private priced: QHeap<TxPoolObject>;

// Counts for each pool
public pendingCount: number;
public queuedCount: number;
```

### 1.2 Add Pool Configuration Constants

Add Geth-compatible configuration at the top of `txpool.ts`:

```typescript
// Pool limits (matching Geth defaults)
const GLOBAL_SLOTS = 4096;      // Max pending tx slots globally
const GLOBAL_QUEUE = 1024;      // Max queued tx slots globally
const ACCOUNT_SLOTS = 16;       // Max pending per account
const ACCOUNT_QUEUE = 64;       // Max queued per account
const PRICE_BUMP = 10;          // Min % price bump for replacement
const LIFETIME = 3 * 60 * 60;   // Max time tx stays in pool (3 hours in seconds)
```

### 1.3 Update Constructor

Modify the constructor to initialize all new data structures:

```typescript
constructor(options: TxPoolOptions) {
    this.config = options.config;
    this.service = options.service;
    
    // Dual pool structure
    this.pending = new Map<UnprefixedAddress, TxPoolObject[]>();
    this.queued = new Map<UnprefixedAddress, TxPoolObject[]>();
    this.pendingCount = 0;
    this.queuedCount = 0;
    
    // Supporting structures
    this.accountNonces = new Map<UnprefixedAddress, bigint>();
    this.locals = new Set<UnprefixedHash>();
    this.priced = new Heap({
        comparBefore: (a: TxPoolObject, b: TxPoolObject) =>
            this.txGasPrice(a.tx).tip < this.txGasPrice(b.tx).tip,
    }) as QHeap<TxPoolObject>;
    
    this.handled = new Map<UnprefixedHash, HandledObject>();
    this.knownByPeer = new Map<PeerId, SentObject[]>();
    // ... rest of constructor
}
```

### 1.4 Implement Transaction Classification

Add a method to determine if a tx should go to pending or queued:

```typescript
/**
 * Determines which pool a transaction belongs to based on nonce
 * @param tx The transaction to classify
 * @param senderAddress The sender's address (unprefixed)
 * @returns 'pending' if executable, 'queued' if future
 */
private async classifyTransaction(
    tx: TypedTransaction,
    senderAddress: UnprefixedAddress
): Promise<'pending' | 'queued'> {
    // Get account nonce from cache or state
    let accountNonce = this.accountNonces.get(senderAddress);
    
    if (accountNonce === undefined) {
        // Fetch from state
        const block = await this.service.chain.getCanonicalHeadHeader();
        const vmCopy = await this.service.execution.vm.shallowCopy();
        await vmCopy.stateManager.setStateRoot(block.stateRoot);
        const address = new Address(hexToBytes(`0x${senderAddress}`));
        let account = await vmCopy.stateManager.getAccount(address);
        if (account === undefined) {
            account = new Account();
        }
        accountNonce = account.nonce;
        this.accountNonces.set(senderAddress, accountNonce);
    }
    
    // Check pending pool for the highest nonce we already have
    const pendingTxs = this.pending.get(senderAddress);
    if (pendingTxs && pendingTxs.length > 0) {
        const maxPendingNonce = pendingTxs.reduce(
            (max, obj) => obj.tx.nonce > max ? obj.tx.nonce : max,
            pendingTxs[0].tx.nonce
        );
        // If this tx fills the next slot after pending, it's pending
        if (tx.nonce === maxPendingNonce + BIGINT_1) {
            return 'pending';
        }
    }
    
    // If nonce matches account nonce, it's immediately executable
    if (tx.nonce === accountNonce) {
        return 'pending';
    }
    
    // Otherwise it's a future transaction
    return 'queued';
}
```

### 1.5 Refactor the `add()` Method

Update `add()` to route transactions to the correct pool:

```typescript
async add(tx: TypedTransaction, isLocalTransaction: boolean = false) {
    const hash: UnprefixedHash = bytesToUnprefixedHex(tx.hash());
    const added = Date.now();
    const address: UnprefixedAddress = tx.getSenderAddress().toString().slice(2);
    
    try {
        await this.validate(tx, isLocalTransaction);
        
        const pool = await this.classifyTransaction(tx, address);
        const targetPool = pool === 'pending' ? this.pending : this.queued;
        
        // Get existing txs for this address
        let existingTxs = targetPool.get(address) ?? [];
        
        // Check for replacement (same nonce)
        const existingIdx = existingTxs.findIndex(obj => obj.tx.nonce === tx.nonce);
        if (existingIdx !== -1) {
            // Remove old tx from priced heap
            this.removeFromPriced(existingTxs[existingIdx]);
            existingTxs = existingTxs.filter((_, idx) => idx !== existingIdx);
            if (pool === 'pending') this.pendingCount--;
            else this.queuedCount--;
        }
        
        // Check pool limits
        const accountLimit = pool === 'pending' ? ACCOUNT_SLOTS : ACCOUNT_QUEUE;
        if (!isLocalTransaction && existingTxs.length >= accountLimit) {
            throw EthereumJSErrorWithoutCode(
                `Cannot add tx: account ${address} exceeds ${pool} limit of ${accountLimit}`
            );
        }
        
        const txObj: TxPoolObject = { tx, added, hash };
        existingTxs.push(txObj);
        existingTxs.sort((a, b) => Number(a.tx.nonce - b.tx.nonce));
        targetPool.set(address, existingTxs);
        
        // Track in priced heap
        this.priced.insert(txObj);
        
        // Track as local if applicable
        if (isLocalTransaction) {
            this.locals.add(hash);
        }
        
        // Update counts
        if (pool === 'pending') this.pendingCount++;
        else this.queuedCount++;
        
        this.handled.set(hash, { address, added });
        
        // Try to promote queued txs if we added to pending
        if (pool === 'pending') {
            await this.promoteExecutables(address);
        }
        
        // Enforce global limits
        this.enforcePoolLimits();
        
    } catch (e) {
        this.handled.set(hash, { address, added, error: e as Error });
        throw e;
    }
}
```

### 1.6 Update `getByHash()` to Search Both Pools

```typescript
getByHash(txHashes: Uint8Array[]): TypedTransaction[] {
    const found: TypedTransaction[] = [];
    for (const txHash of txHashes) {
        const txHashStr = bytesToUnprefixedHex(txHash);
        const handled = this.handled.get(txHashStr);
        if (!handled || handled.error !== undefined) continue;
        
        // Search pending first (more likely)
        let inPool = this.pending.get(handled.address);
        if (!inPool) {
            // Try queued
            inPool = this.queued.get(handled.address);
        }
        if (!inPool) continue;
        
        const match = inPool.find((poolObj) => poolObj.hash === txHashStr);
        if (match) {
            found.push(match.tx);
        }
    }
    return found;
}
```

### 1.7 Update `removeByHash()` to Handle Both Pools

```typescript
removeByHash(txHash: UnprefixedHash, tx: TypedTransaction) {
    const handled = this.handled.get(txHash);
    if (!handled) return;
    const { address } = handled;
    
    // Try pending first
    let poolObjects = this.pending.get(address);
    let pool: 'pending' | 'queued' = 'pending';
    
    if (!poolObjects || !poolObjects.find(obj => obj.hash === txHash)) {
        // Try queued
        poolObjects = this.queued.get(address);
        pool = 'queued';
    }
    
    if (!poolObjects) return;
    
    const txObj = poolObjects.find(obj => obj.hash === txHash);
    if (!txObj) return;
    
    const newPoolObjects = poolObjects.filter(obj => obj.hash !== txHash);
    
    // Update the correct pool
    const targetPool = pool === 'pending' ? this.pending : this.queued;
    if (newPoolObjects.length === 0) {
        targetPool.delete(address);
    } else {
        targetPool.set(address, newPoolObjects);
    }
    
    // Update counts
    if (pool === 'pending') this.pendingCount--;
    else this.queuedCount--;
    
    // Remove from priced heap
    this.removeFromPriced(txObj);
    
    // Remove from locals if present
    this.locals.delete(txHash);
}
```

### 1.8 Update `txsByPriceAndNonce()` to Only Use Pending

This method should only return transactions from the pending pool since those are the only executable ones:

```typescript
async txsByPriceAndNonce(vm: VM, { baseFee }: { baseFee?: bigint } = {}) {
    const txs: TypedTransaction[] = [];
    const byNonce = new Map<string, TypedTransaction[]>();
    
    // Only iterate over pending pool - these are executable
    for (const [address, poolObjects] of this.pending) {
        const txsSortedByNonce = poolObjects
            .map((obj) => obj.tx)
            .sort((a, b) => Number(a.nonce - b.nonce));
        
        // Verify account nonce matches lowest tx nonce
        let account = await vm.stateManager.getAccount(
            new Address(hexToBytes(`0x${address}`))
        );
        if (account === undefined) {
            account = new Account();
        }
        
        if (txsSortedByNonce[0].nonce !== account.nonce) {
            // Shouldn't happen if promoteExecutables works correctly
            continue;
        }
        byNonce.set(address, txsSortedByNonce);
    }
    
    // ... rest of the method (price-based heap selection) remains the same
}
```

---

## Phase 2: Nonce Gap Handling and Promotion

### 2.1 Implement `promoteExecutables()`

This is the core method that moves transactions from queued to pending when gaps are filled:

```typescript
/**
 * Promotes transactions from queued to pending when they become executable.
 * Called after new blocks are processed or new transactions are added.
 * @param address Optional specific address to check (undefined = all addresses)
 */
async promoteExecutables(address?: UnprefixedAddress): Promise<void> {
    const addresses = address ? [address] : Array.from(this.queued.keys());
    
    for (const addr of addresses) {
        const queuedTxs = this.queued.get(addr);
        if (!queuedTxs || queuedTxs.length === 0) continue;
        
        // Get current account nonce
        let accountNonce = this.accountNonces.get(addr);
        if (accountNonce === undefined) {
            const block = await this.service.chain.getCanonicalHeadHeader();
            const vmCopy = await this.service.execution.vm.shallowCopy();
            await vmCopy.stateManager.setStateRoot(block.stateRoot);
            const addrObj = new Address(hexToBytes(`0x${addr}`));
            const account = await vmCopy.stateManager.getAccount(addrObj) ?? new Account();
            accountNonce = account.nonce;
            this.accountNonces.set(addr, accountNonce);
        }
        
        // Determine the next expected nonce (account nonce or highest pending + 1)
        const pendingTxs = this.pending.get(addr) ?? [];
        let nextExpectedNonce = accountNonce;
        if (pendingTxs.length > 0) {
            const maxPendingNonce = pendingTxs.reduce(
                (max, obj) => obj.tx.nonce > max ? obj.tx.nonce : max,
                pendingTxs[0].tx.nonce
            );
            nextExpectedNonce = maxPendingNonce + BIGINT_1;
        }
        
        // Sort queued by nonce
        queuedTxs.sort((a, b) => Number(a.tx.nonce - b.tx.nonce));
        
        // Promote consecutive executable txs
        const toPromote: TxPoolObject[] = [];
        const remaining: TxPoolObject[] = [];
        
        for (const txObj of queuedTxs) {
            if (txObj.tx.nonce === nextExpectedNonce) {
                toPromote.push(txObj);
                nextExpectedNonce = txObj.tx.nonce + BIGINT_1;
            } else if (txObj.tx.nonce < accountNonce) {
                // Stale tx - remove it entirely
                this.queuedCount--;
                this.removeFromPriced(txObj);
                this.handled.delete(txObj.hash);
            } else {
                // Still has a gap - keep in queued
                remaining.push(txObj);
            }
        }
        
        // Move promoted txs to pending
        if (toPromote.length > 0) {
            const newPending = [...pendingTxs, ...toPromote];
            newPending.sort((a, b) => Number(a.tx.nonce - b.tx.nonce));
            this.pending.set(addr, newPending);
            this.pendingCount += toPromote.length;
            this.queuedCount -= toPromote.length;
            
            this.config.logger?.debug(
                `Promoted ${toPromote.length} txs from queued to pending for ${addr}`
            );
        }
        
        // Update queued
        if (remaining.length === 0) {
            this.queued.delete(addr);
        } else {
            this.queued.set(addr, remaining);
        }
    }
}
```

### 2.2 Implement `demoteUnexecutables()`

This method moves transactions back to queued when they become non-executable (e.g., after reorgs):

```typescript
/**
 * Demotes transactions from pending to queued when they become non-executable.
 * Called after chain reorgs or when account state changes.
 */
async demoteUnexecutables(): Promise<void> {
    const block = await this.service.chain.getCanonicalHeadHeader();
    const vmCopy = await this.service.execution.vm.shallowCopy();
    await vmCopy.stateManager.setStateRoot(block.stateRoot);
    
    for (const [addr, pendingTxs] of this.pending) {
        const addrObj = new Address(hexToBytes(`0x${addr}`));
        const account = await vmCopy.stateManager.getAccount(addrObj) ?? new Account();
        const accountNonce = account.nonce;
        const accountBalance = account.balance;
        
        // Update nonce cache
        this.accountNonces.set(addr, accountNonce);
        
        const stillPending: TxPoolObject[] = [];
        const toDemote: TxPoolObject[] = [];
        const toRemove: TxPoolObject[] = [];
        
        // Sort by nonce first
        pendingTxs.sort((a, b) => Number(a.tx.nonce - b.tx.nonce));
        
        let lastValidNonce = accountNonce - BIGINT_1;
        
        for (const txObj of pendingTxs) {
            const tx = txObj.tx;
            const gasPrice = this.txGasPrice(tx);
            const cost = tx.value + gasPrice.maxFee * tx.gasLimit;
            
            if (tx.nonce < accountNonce) {
                // Already mined - remove
                toRemove.push(txObj);
            } else if (accountBalance < cost) {
                // Insufficient balance - demote to queued
                toDemote.push(txObj);
            } else if (tx.nonce !== lastValidNonce + BIGINT_1) {
                // Nonce gap - demote to queued
                toDemote.push(txObj);
            } else {
                // Still valid
                stillPending.push(txObj);
                lastValidNonce = tx.nonce;
            }
        }
        
        // Remove stale txs
        for (const txObj of toRemove) {
            this.pendingCount--;
            this.removeFromPriced(txObj);
            this.handled.delete(txObj.hash);
            this.locals.delete(txObj.hash);
        }
        
        // Demote to queued
        if (toDemote.length > 0) {
            const existingQueued = this.queued.get(addr) ?? [];
            const newQueued = [...existingQueued, ...toDemote];
            newQueued.sort((a, b) => Number(a.tx.nonce - b.tx.nonce));
            this.queued.set(addr, newQueued);
            this.pendingCount -= toDemote.length;
            this.queuedCount += toDemote.length;
            
            this.config.logger?.debug(
                `Demoted ${toDemote.length} txs from pending to queued for ${addr}`
            );
        }
        
        // Update pending
        if (stillPending.length === 0) {
            this.pending.delete(addr);
        } else {
            this.pending.set(addr, stillPending);
        }
    }
}
```

### 2.3 Hook into Block Events

In [fullethereumservice.ts](src/client/service/fullethereumservice.ts), add event listeners to trigger promotion/demotion after blocks are processed:

```typescript
// In FullEthereumService.open()
this.config.events.on(Event.SYNC_FETCHED_BLOCKS, async (blocks: Block[]) => {
    // Remove mined txs
    this.txPool.removeNewBlockTxs(blocks);
    
    // Clear nonce cache for affected addresses
    for (const block of blocks) {
        for (const tx of block.transactions) {
            const addr = tx.getSenderAddress().toString().slice(2);
            this.txPool.clearNonceCache(addr);
        }
    }
    
    // Re-evaluate pool state
    await this.txPool.demoteUnexecutables();
    await this.txPool.promoteExecutables();
});
```

Add the helper method to clear nonce cache in `txpool.ts`:

```typescript
clearNonceCache(address?: UnprefixedAddress): void {
    if (address) {
        this.accountNonces.delete(address);
    } else {
        this.accountNonces.clear();
    }
}
```

---

## Phase 3: Gas Price Eviction

### 3.1 Add Helper Methods for Priced Heap Management

```typescript
/**
 * Removes a transaction from the priced heap.
 * Note: QHeap doesn't support arbitrary removal, so we need to rebuild.
 */
private removeFromPriced(txObj: TxPoolObject): void {
    const newHeap = new Heap({
        comparBefore: (a: TxPoolObject, b: TxPoolObject) =>
            this.txGasPrice(a.tx).tip < this.txGasPrice(b.tx).tip,
    }) as QHeap<TxPoolObject>;
    
    while (this.priced.length > 0) {
        const item = this.priced.remove();
        if (item && item.hash !== txObj.hash) {
            newHeap.insert(item);
        }
    }
    this.priced = newHeap;
}

/**
 * Gets the minimum gas price in the pool (for underpriced detection).
 */
getMinPrice(): bigint {
    const lowest = this.priced.peek();
    if (!lowest) return BIGINT_0;
    return this.txGasPrice(lowest.tx).tip;
}
```

### 3.2 Implement `enforcePoolLimits()`

```typescript
/**
 * Enforces global pool size limits by evicting lowest-priced transactions.
 * Local transactions are protected from eviction.
 */
private enforcePoolLimits(): void {
    // Enforce pending limit
    while (this.pendingCount > GLOBAL_SLOTS) {
        const evicted = this.evictLowestPriced('pending');
        if (!evicted) break; // No more evictable txs
    }
    
    // Enforce queued limit
    while (this.queuedCount > GLOBAL_QUEUE) {
        const evicted = this.evictLowestPriced('queued');
        if (!evicted) break;
    }
}

/**
 * Evicts the lowest-priced non-local transaction from a pool.
 * @returns true if a tx was evicted, false if none could be evicted
 */
private evictLowestPriced(pool: 'pending' | 'queued'): boolean {
    const targetPool = pool === 'pending' ? this.pending : this.queued;
    
    // Find lowest priced non-local tx
    let lowestPrice = BigInt(Number.MAX_SAFE_INTEGER);
    let lowestTx: TxPoolObject | null = null;
    let lowestAddr: UnprefixedAddress | null = null;
    
    for (const [addr, txObjs] of targetPool) {
        for (const txObj of txObjs) {
            // Skip local transactions
            if (this.locals.has(txObj.hash)) continue;
            
            const price = this.txGasPrice(txObj.tx).tip;
            if (price < lowestPrice) {
                lowestPrice = price;
                lowestTx = txObj;
                lowestAddr = addr;
            }
        }
    }
    
    if (!lowestTx || !lowestAddr) return false;
    
    // Remove the tx
    this.removeByHash(lowestTx.hash, lowestTx.tx);
    this.config.logger?.debug(
        `Evicted underpriced tx ${lowestTx.hash} (price: ${lowestPrice}) from ${pool}`
    );
    
    return true;
}
```

### 3.3 Add Underpriced Detection in Validation

Update the `validate()` method to reject underpriced transactions when pool is full:

```typescript
private async validate(tx: TypedTransaction, isLocalTransaction: boolean = false) {
    // ... existing validation ...
    
    // Check if tx is underpriced when pool is near capacity
    if (!isLocalTransaction) {
        const totalTxs = this.pendingCount + this.queuedCount;
        if (totalTxs >= (GLOBAL_SLOTS + GLOBAL_QUEUE) * 0.9) {
            // Pool is >90% full, check if tx can compete
            const minPrice = this.getMinPrice();
            const txPrice = this.txGasPrice(tx).tip;
            if (txPrice <= minPrice) {
                throw EthereumJSErrorWithoutCode(
                    `Transaction underpriced: ${txPrice} <= pool minimum ${minPrice}`
                );
            }
        }
    }
    
    // ... rest of validation ...
}
```

---

## Phase 4: Chain Reorg Handling

### 4.1 Add Reorg Event to Types

In [types.ts](src/client/types.ts), add a new event for chain reorgs:

```typescript
export const Event = {
    // ... existing events ...
    CHAIN_REORG: "blockchain:chain:reorg",
} as const;

export interface EventParams {
    // ... existing params ...
    [Event.CHAIN_REORG]: [oldBlocks: Block[], newBlocks: Block[]];
}
```

### 4.2 Implement Reorg Handler in TxPool

Add a method to handle chain reorganizations in `txpool.ts`:

```typescript
/**
 * Handles chain reorganization by re-injecting transactions from orphaned blocks.
 * @param oldBlocks Blocks that were orphaned (removed from canonical chain)
 * @param newBlocks Blocks that became canonical
 */
async handleReorg(oldBlocks: Block[], newBlocks: Block[]): Promise<void> {
    this.config.logger?.info(
        `TxPool handling reorg: ${oldBlocks.length} old blocks, ${newBlocks.length} new blocks`
    );
    
    // Collect tx hashes from new blocks (these are now mined)
    const newBlockTxHashes = new Set<string>();
    for (const block of newBlocks) {
        for (const tx of block.transactions) {
            newBlockTxHashes.add(bytesToUnprefixedHex(tx.hash()));
        }
    }
    
    // Re-inject transactions from old blocks that aren't in new blocks
    for (const block of oldBlocks) {
        for (const tx of block.transactions) {
            const txHash = bytesToUnprefixedHex(tx.hash());
            
            // Skip if tx is in the new canonical chain
            if (newBlockTxHashes.has(txHash)) continue;
            
            // Skip if tx is already in pool
            if (this.handled.has(txHash)) continue;
            
            try {
                // Re-add as local to protect from immediate eviction
                await this.add(tx, true);
                this.config.logger?.debug(`Re-injected orphaned tx: ${txHash}`);
            } catch (error: any) {
                this.config.logger?.debug(
                    `Failed to re-inject orphaned tx ${txHash}: ${error.message}`
                );
            }
        }
    }
    
    // Clear all nonce caches since state has changed
    this.accountNonces.clear();
    
    // Remove txs that are in new blocks
    this.removeNewBlockTxs(newBlocks);
    
    // Re-evaluate all transactions
    await this.demoteUnexecutables();
    await this.promoteExecutables();
}
```

### 4.3 Wire Up Reorg Detection in FullEthereumService

In [fullethereumservice.ts](src/client/service/fullethereumservice.ts), add reorg detection. This requires modifying the chain module to detect reorgs, but for now, you can hook into block processing:

```typescript
// Add a listener in open() method
this.config.events.on(Event.CHAIN_REORG, async (oldBlocks, newBlocks) => {
    await this.txPool.handleReorg(oldBlocks, newBlocks);
});
```

Note: You'll need to emit `CHAIN_REORG` events from the blockchain/chain module when reorgs are detected during `putBlocks()`. This is detected when the parent of a new block doesn't match the current head.

---

## Phase 5: Transaction Fetcher

### 5.1 Create TxFetcher Class

Create a new file `src/client/sync/fetcher/txfetcher.ts`:

```typescript
import type { Config } from "../../config.ts";
import type { Peer } from "../../net/peer/peer.ts";
import type { PeerPool } from "../../net/peerpool.ts";
import type { TxPool } from "../../service/txpool.ts";
import { bytesToUnprefixedHex } from "../../../utils";

interface TxFetcherOptions {
    config: Config;
    pool: PeerPool;
    txPool: TxPool;
}

interface PendingAnnouncement {
    hash: string;
    peer: Peer;
    announced: number;
    fetching: boolean;
}

/**
 * Transaction fetcher for retrieving announced transactions from peers.
 * Implements batching, deduplication, and retry logic.
 */
export class TxFetcher {
    private config: Config;
    private pool: PeerPool;
    private txPool: TxPool;
    
    // Announced tx hashes waiting to be fetched
    private pending: Map<string, PendingAnnouncement>;
    
    // Batch fetch settings
    private readonly BATCH_SIZE = 256;
    private readonly FETCH_TIMEOUT = 5000; // 5 seconds
    private readonly ANNOUNCE_TIMEOUT = 60000; // 1 minute
    
    private fetchInterval: NodeJS.Timeout | undefined;
    private running: boolean = false;
    
    constructor(options: TxFetcherOptions) {
        this.config = options.config;
        this.pool = options.pool;
        this.txPool = options.txPool;
        this.pending = new Map();
    }
    
    start(): void {
        if (this.running) return;
        this.running = true;
        
        // Periodically process pending announcements
        this.fetchInterval = setInterval(() => {
            this.processPending().catch(e => {
                this.config.logger?.debug(`TxFetcher error: ${e.message}`);
            });
        }, 100); // Check every 100ms
    }
    
    stop(): void {
        this.running = false;
        if (this.fetchInterval) {
            clearInterval(this.fetchInterval);
            this.fetchInterval = undefined;
        }
    }
    
    /**
     * Notify the fetcher of new transaction announcements.
     */
    announce(hashes: Uint8Array[], peer: Peer): void {
        if (!this.running) return;
        
        const now = Date.now();
        for (const hash of hashes) {
            const hashStr = bytesToUnprefixedHex(hash);
            
            // Skip if already handled by txpool
            if (this.txPool.handled.has(hashStr)) continue;
            
            // Skip if already pending
            if (this.pending.has(hashStr)) continue;
            
            this.pending.set(hashStr, {
                hash: hashStr,
                peer,
                announced: now,
                fetching: false,
            });
        }
    }
    
    /**
     * Process pending announcements by fetching transactions in batches.
     */
    private async processPending(): Promise<void> {
        if (!this.running || this.pending.size === 0) return;
        
        const now = Date.now();
        
        // Clean up old announcements
        for (const [hash, ann] of this.pending) {
            if (now - ann.announced > this.ANNOUNCE_TIMEOUT) {
                this.pending.delete(hash);
            }
        }
        
        // Group announcements by peer
        const byPeer = new Map<string, PendingAnnouncement[]>();
        for (const ann of this.pending.values()) {
            if (ann.fetching) continue;
            
            const peerId = ann.peer.id;
            if (!byPeer.has(peerId)) {
                byPeer.set(peerId, []);
            }
            byPeer.get(peerId)!.push(ann);
        }
        
        // Fetch from each peer
        for (const [peerId, announcements] of byPeer) {
            const peer = this.pool.peers.find(p => p.id === peerId);
            if (!peer || !peer.eth) continue;
            
            const batch = announcements.slice(0, this.BATCH_SIZE);
            const hashes = batch.map(ann => hexToBytes(`0x${ann.hash}`));
            
            // Mark as fetching
            for (const ann of batch) {
                ann.fetching = true;
            }
            
            try {
                const result = await peer.eth.getPooledTransactions({ hashes });
                if (result) {
                    const [, txs] = result;
                    for (const tx of txs) {
                        const txHash = bytesToUnprefixedHex(tx.hash());
                        this.pending.delete(txHash);
                        
                        try {
                            await this.txPool.add(tx);
                        } catch (e: any) {
                            this.config.logger?.debug(
                                `Failed to add fetched tx ${txHash}: ${e.message}`
                            );
                        }
                    }
                }
            } catch (e: any) {
                this.config.logger?.debug(
                    `Failed to fetch txs from peer ${peerId}: ${e.message}`
                );
            }
            
            // Unmark fetching status for remaining
            for (const ann of batch) {
                if (this.pending.has(ann.hash)) {
                    this.pending.get(ann.hash)!.fetching = false;
                }
            }
        }
    }
}
```

### 5.2 Update Exports

Add to `src/client/sync/fetcher/index.ts`:

```typescript
export * from './txfetcher.ts';
```

### 5.3 Integrate TxFetcher into FullEthereumService

In [fullethereumservice.ts](src/client/service/fullethereumservice.ts):

```typescript
import { TxFetcher } from "../sync/fetcher/txfetcher.ts";

export class FullEthereumService extends Service {
    // ... existing properties ...
    public txFetcher: TxFetcher;
    
    constructor(options: ServiceOptions) {
        // ... existing setup ...
        
        this.txFetcher = new TxFetcher({
            config: this.config,
            pool: this.pool,
            txPool: this.txPool,
        });
    }
    
    override async start(): Promise<boolean> {
        // ... existing start logic ...
        this.txFetcher.start();
        return true;
    }
    
    override async stop(): Promise<boolean> {
        // ... existing stop logic ...
        this.txFetcher.stop();
        return super.stop();
    }
}
```

---

## Phase 6: Local Transaction Journaling

### 6.1 Add Journal File Support to TxPool

Add journal-related methods to `txpool.ts`:

```typescript
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// In TxPool class:

private journalPath: string;
private journalInterval: NodeJS.Timeout | undefined;
private readonly JOURNAL_INTERVAL = 60 * 1000; // Write every minute

// In constructor:
this.journalPath = `${this.config.getNetworkDirectory()}/txpool/journal.rlp`;

/**
 * Loads local transactions from the journal file.
 */
async loadJournal(): Promise<void> {
    if (!existsSync(this.journalPath)) {
        this.config.logger?.debug('No txpool journal found');
        return;
    }
    
    try {
        const data = readFileSync(this.journalPath);
        const txs = decode(data) as Uint8Array[];
        
        let loaded = 0;
        for (const txData of txs) {
            try {
                const tx = createTxFromRLP(txData, {
                    common: this.config.chainCommon,
                });
                await this.add(tx, true); // Add as local
                loaded++;
            } catch (e) {
                // Skip invalid transactions
            }
        }
        
        this.config.logger?.info(`Loaded ${loaded} local txs from journal`);
    } catch (e: any) {
        this.config.logger?.warn(`Failed to load txpool journal: ${e.message}`);
    }
}

/**
 * Writes local transactions to the journal file.
 */
writeJournal(): void {
    const localTxs: Uint8Array[] = [];
    
    // Collect all local txs from both pools
    const collectFromPool = (pool: Map<UnprefixedAddress, TxPoolObject[]>) => {
        for (const txObjs of pool.values()) {
            for (const txObj of txObjs) {
                if (this.locals.has(txObj.hash)) {
                    localTxs.push(txObj.tx.serialize());
                }
            }
        }
    };
    
    collectFromPool(this.pending);
    collectFromPool(this.queued);
    
    if (localTxs.length === 0) {
        // Remove journal if no local txs
        if (existsSync(this.journalPath)) {
            unlinkSync(this.journalPath);
        }
        return;
    }
    
    try {
        // Ensure directory exists
        const dir = dirname(this.journalPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        
        const encoded = encode(localTxs);
        writeFileSync(this.journalPath, encoded);
        this.config.logger?.debug(`Journaled ${localTxs.length} local txs`);
    } catch (e: any) {
        this.config.logger?.warn(`Failed to write txpool journal: ${e.message}`);
    }
}

// Update start() to load journal and start periodic writing:
start(): boolean {
    if (this.running) return false;
    
    // ... existing start logic ...
    
    // Load journal
    this.loadJournal().catch(e => {
        this.config.logger?.warn(`Failed to load journal: ${e.message}`);
    });
    
    // Start periodic journal writes
    this.journalInterval = setInterval(
        () => this.writeJournal(),
        this.JOURNAL_INTERVAL
    );
    
    return true;
}

// Update stop() to write final journal:
stop(): boolean {
    if (!this.running) return false;
    
    // Write final journal before stopping
    this.writeJournal();
    
    if (this.journalInterval) {
        clearInterval(this.journalInterval);
        this.journalInterval = undefined;
    }
    
    // ... existing stop logic ...
}
```

---

## Phase 7: RPC Methods

### 7.1 Expand the TxPool RPC Module

Update [src/client/rpc/modules/txpool.ts](src/client/rpc/modules/txpool.ts) with full Geth-compatible methods:

```typescript
import { callWithStackTrace, toJSONRPCTx } from "../helpers.ts";
import type { EthereumClient } from "../..";
import type { VM } from "../../../vm";
import type { FullEthereumService } from "../../service";
import type { TxPool as Pool } from "../../service/txpool.ts";
import { intToHex } from "../../../utils";

export class TxPool {
    private _txpool: Pool;
    private _vm: VM;
    private _rpcDebug: boolean;

    constructor(client: EthereumClient, rpcDebug: boolean) {
        const service = client.service as FullEthereumService;
        this._txpool = service.txPool;
        this._vm = service.execution.vm;
        this._rpcDebug = rpcDebug;

        this.content = callWithStackTrace(this.content.bind(this), this._rpcDebug);
        this.status = callWithStackTrace(this.status.bind(this), this._rpcDebug);
        this.inspect = callWithStackTrace(this.inspect.bind(this), this._rpcDebug);
        this.contentFrom = callWithStackTrace(this.contentFrom.bind(this), this._rpcDebug);
    }

    /**
     * txpool_content - Returns full pending and queued transactions.
     */
    content() {
        const formatPool = (pool: Map<string, any[]>) => {
            const result: Record<string, Record<string, any>> = {};
            for (const [addr, txObjs] of pool) {
                const txsByNonce: Record<string, any> = {};
                for (const txObj of txObjs) {
                    txsByNonce[txObj.tx.nonce.toString()] = toJSONRPCTx(txObj.tx);
                }
                if (Object.keys(txsByNonce).length > 0) {
                    result[`0x${addr}`] = txsByNonce;
                }
            }
            return result;
        };

        return {
            pending: formatPool(this._txpool.pending),
            queued: formatPool(this._txpool.queued),
        };
    }

    /**
     * txpool_status - Returns pending and queued transaction counts.
     */
    status() {
        return {
            pending: intToHex(this._txpool.pendingCount),
            queued: intToHex(this._txpool.queuedCount),
        };
    }

    /**
     * txpool_inspect - Returns text summaries of pending and queued transactions.
     */
    inspect() {
        const formatPool = (pool: Map<string, any[]>) => {
            const result: Record<string, Record<string, string>> = {};
            for (const [addr, txObjs] of pool) {
                const summaries: Record<string, string> = {};
                for (const txObj of txObjs) {
                    const tx = txObj.tx;
                    const to = tx.to?.toString() ?? 'contract creation';
                    const value = tx.value.toString();
                    const gas = tx.gasLimit.toString();
                    const gasPrice = tx.gasPrice?.toString() ?? '0';
                    summaries[tx.nonce.toString()] = 
                        `${to}: ${value} wei + ${gas} gas x ${gasPrice} wei`;
                }
                if (Object.keys(summaries).length > 0) {
                    result[`0x${addr}`] = summaries;
                }
            }
            return result;
        };

        return {
            pending: formatPool(this._txpool.pending),
            queued: formatPool(this._txpool.queued),
        };
    }

    /**
     * txpool_contentFrom - Returns transactions from a specific address.
     */
    contentFrom(params: [string]) {
        const [address] = params;
        const addr = address.toLowerCase().replace('0x', '');
        
        const formatTxs = (txObjs: any[] | undefined) => {
            if (!txObjs) return {};
            const result: Record<string, any> = {};
            for (const txObj of txObjs) {
                result[txObj.tx.nonce.toString()] = toJSONRPCTx(txObj.tx);
            }
            return result;
        };

        return {
            pending: formatTxs(this._txpool.pending.get(addr)),
            queued: formatTxs(this._txpool.queued.get(addr)),
        };
    }
}
```

---

## Phase 8: ETH Protocol Enhancements

### 8.1 Add Periodic Rebroadcast

In `txpool.ts`, add a rebroadcast mechanism:

```typescript
private rebroadcastInterval: NodeJS.Timeout | undefined;

// In start():
this.rebroadcastInterval = setInterval(
    () => this.rebroadcast(),
    this.REBROADCAST_INTERVAL
);

// In stop():
if (this.rebroadcastInterval) {
    clearInterval(this.rebroadcastInterval);
    this.rebroadcastInterval = undefined;
}

/**
 * Rebroadcasts pending transactions to peers.
 * Uses sqrt(peers) propagation as per Geth.
 */
private rebroadcast(): void {
    if (!this.running) return;
    
    const peers = this.service.pool.peers;
    if (peers.length === 0) return;
    
    // Collect all pending tx hashes
    const txHashes: [number[], number[], Uint8Array[]] = [[], [], []];
    for (const txObjs of this.pending.values()) {
        for (const txObj of txObjs) {
            txHashes[0].push(txObj.tx.type);
            txHashes[1].push(txObj.tx.serialize().byteLength);
            txHashes[2].push(hexToBytes(`0x${txObj.hash}`));
        }
    }
    
    if (txHashes[2].length === 0) return;
    
    // Send to sqrt(peers) for efficiency
    const numPeers = Math.max(1, Math.floor(Math.sqrt(peers.length)));
    const targetPeers = peers.slice(0, numPeers);
    
    this.sendNewTxHashes(txHashes, targetPeers);
    
    this.config.logger?.debug(
        `Rebroadcast ${txHashes[2].length} tx hashes to ${targetPeers.length} peers`
    );
}
```

### 8.2 Implement Sqrt Propagation for New Transactions

Update `sendTransactions` in `txpool.ts` to use sqrt propagation:

```typescript
sendTransactions(txs: TypedTransaction[], peers: Peer[]) {
    if (txs.length === 0 || !this.running || peers.length === 0) return;
    
    // Send full txs to sqrt(peers)
    const numFullPeers = Math.max(1, Math.floor(Math.sqrt(peers.length)));
    const fullPeers = peers.slice(0, numFullPeers);
    const hashPeers = peers.slice(numFullPeers);
    
    // Send full transactions to subset
    for (const peer of fullPeers) {
        const added = Date.now();
        const toSend: TypedTransaction[] = [];
        for (const tx of txs) {
            const hash = bytesToUnprefixedHex(tx.hash());
            if (this.knownByPeer.get(peer.id)?.find(o => o.hash === hash)) {
                continue;
            }
            toSend.push(tx);
            const newKnown: SentObject = { hash, added };
            const newKnownByPeer = this.knownByPeer.get(peer.id) ?? [];
            newKnownByPeer.push(newKnown);
            this.knownByPeer.set(peer.id, newKnownByPeer);
        }
        if (toSend.length > 0) {
            peer.eth?.send("Transactions", toSend);
        }
    }
    
    // Send only hashes to remaining peers
    if (hashPeers.length > 0) {
        const txHashes: [number[], number[], Uint8Array[]] = [[], [], []];
        for (const tx of txs) {
            txHashes[0].push(tx.type);
            txHashes[1].push(tx.serialize().byteLength);
            txHashes[2].push(tx.hash());
        }
        this.sendNewTxHashes(txHashes, hashPeers);
    }
}
```

---

## Summary of Files to Create/Modify

| File | Action | Description |

|------|--------|-------------|

| [src/client/service/txpool.ts](src/client/service/txpool.ts) | Major refactor | Dual pools, promotion/demotion, eviction, journaling |

| [src/client/service/fullethereumservice.ts](src/client/service/fullethereumservice.ts) | Modify | Add reorg handler, txfetcher integration |

| [src/client/types.ts](src/client/types.ts) | Modify | Add CHAIN_REORG event |

| [src/client/rpc/modules/txpool.ts](src/client/rpc/modules/txpool.ts) | Modify | Add status, inspect, contentFrom methods |

| `src/client/sync/fetcher/txfetcher.ts` | Create | New transaction fetcher class |

| `src/client/sync/fetcher/index.ts` | Modify | Export TxFetcher |

---

## Testing Checklist

After implementing each phase, verify:

1. **Phase 1**: Transactions correctly classified into pending/queued based on nonce
2. **Phase 2**: Transactions promote from queued to pending when gaps fill
3. **Phase 3**: Low-priced transactions evicted when pool is full; locals protected
4. **Phase 4**: Orphaned transactions re-injected after reorgs
5. **Phase 5**: Transaction announcements fetched in batches with deduplication
6. **Phase 6**: Local transactions persist across restarts
7. **Phase 7**: RPC methods return correct data structure
8. **Phase 8**: Transactions rebroadcast periodically with sqrt propagation