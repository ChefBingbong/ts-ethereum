import type { Block } from "../../block";
import { isLegacyTx, LegacyTx, type TypedTransaction } from "../../tx";
import {
	Account,
	Address,
	BIGINT_0,
	bytesToHex,
	bytesToUnprefixedHex,
	equalsBytes,
	EthereumJSErrorWithoutCode,
	hexToBytes,
} from "../../utils";
import type { VM } from "../../vm";
import type { Config } from "../config.ts";
import type { QHeap } from "../ext/qheap.ts";
import { Heap } from "../ext/qheap.ts";
import type { Peer } from "../net/peer/peer.ts";
import type { PeerPool } from "../net/peerpool.ts";
import type { FullEthereumService } from "./fullethereumservice.ts";

// Configuration constants
const MIN_GAS_PRICE_BUMP_PERCENT = 10;
const MIN_GAS_PRICE = BigInt(100000000); // .1 GWei
const TX_MAX_DATA_SIZE = 128 * 1024; // 128KB
const MAX_POOL_SIZE = 5000;
const MAX_TXS_PER_ACCOUNT = 100;

export interface TxPoolOptions {
	/* Config */
	config: Config;

	/* FullEthereumService */
	service: FullEthereumService;
}

type TxPoolObject = {
	tx: TypedTransaction;
	hash: UnprefixedHash;
	added: number;
	error?: Error;
};

type HandledObject = {
	address: UnprefixedAddress;
	added: number;
	error?: Error;
};

type SentObject = {
	hash: UnprefixedHash;
	added: number;
	error?: Error;
};

type UnprefixedAddress = string;
type UnprefixedHash = string;
type PeerId = string;

type GasPrice = {
	tip: bigint;
	maxFee: bigint;
};

/**
 * @module service
 */

/**
 * Tx pool (mempool)
 * @memberof module:service
 */
export class TxPool {
	private config: Config;
	private service: FullEthereumService;

	private opened: boolean;

	public running: boolean;

	/* global NodeJS */
	private _cleanupInterval: NodeJS.Timeout | undefined;
	private _logInterval: NodeJS.Timeout | undefined;

	/**
	 * The central pool dataset.
	 *
	 * Maps an address to a `TxPoolObject`
	 */
	public pool: Map<UnprefixedAddress, TxPoolObject[]>;

	/**
	 * The number of txs currently in the pool
	 */
	public txsInPool: number;

	/**
	 * Map for handled tx hashes
	 * (have been added to the pool at some point)
	 *
	 * This is meant to be a superset of the tx pool
	 * so at any point it should be at least as large as the pool
	 */
	private handled: Map<UnprefixedHash, HandledObject>;

	/**
	 * Map for tx hashes a peer is known to have
	 */
	private knownByPeer: Map<PeerId, SentObject[]>;

	/**
	 * Activate before chain head is reached to start
	 * temporary tx pool serving (default: -1)
	 */
	public BLOCKS_BEFORE_TARGET_HEIGHT_ACTIVATION = -1;

	/**
	 * Max number of txs to request
	 */
	private TX_RETRIEVAL_LIMIT = 256;

	/**
	 * Number of minutes to keep txs in the pool
	 */
	public POOLED_STORAGE_TIME_LIMIT = 20;

	/**
	 * Number of minutes to forget about handled
	 * txs (for cleanup/memory reasons)
	 */
	public HANDLED_CLEANUP_TIME_LIMIT = 60;

	/**
	 * Rebroadcast full txs and new tx hashes
	 */
	private REBROADCAST_INTERVAL = 60 * 1000;

	/**
	 * Number of peers to rebroadcast to
	 */
	public NUM_PEERS_REBROADCAST_QUOTIENT = 1;

	/**
	 * Log pool statistics on the given interval
	 */
	private LOG_STATISTICS_INTERVAL = 20000; // ms

	/**
	 * Transactions waiting for retrieval
	 */
	private pending: UnprefixedHash[] = [];

	/**
	 * Create new tx pool
	 * @param options constructor parameters
	 */
	constructor(options: TxPoolOptions) {
		this.config = options.config;
		this.service = options.service;

		this.pool = new Map<UnprefixedAddress, TxPoolObject[]>();
		this.txsInPool = 0;
		this.handled = new Map<UnprefixedHash, HandledObject>();
		this.knownByPeer = new Map<PeerId, SentObject[]>();

		this.opened = false;
		this.running = false;
	}

	/**
	 * Open pool
	 */
	open(): boolean {
		if (this.opened) {
			return false;
		}
		this.opened = true;
		return true;
	}

	/**
	 * Start tx processing
	 */
	start(): boolean {
		if (this.running) {
			return false;
		}
		this._cleanupInterval = setInterval(
			this.cleanup.bind(this),
			this.POOLED_STORAGE_TIME_LIMIT * 1000 * 60,
		);
		this._logInterval = setInterval(
			this._logPoolStats.bind(this),
			this.LOG_STATISTICS_INTERVAL,
		);
		this.running = true;
		this.config.logger?.info("TxPool started.");
		return true;
	}

	/**
	 * Check if txpool should start based on sync state
	 */
	checkRunState(): void {
		// Start txpool if not already running
		if (!this.running) {
			this.start();
		}
	}

	private validateTxGasBump(
		existingTx: TypedTransaction,
		addedTx: TypedTransaction,
	) {
		const existingTxGasPrice = this.txGasPrice(existingTx);
		const newGasPrice = this.txGasPrice(addedTx);
		const minTipCap =
			existingTxGasPrice.tip +
			(existingTxGasPrice.tip * BigInt(MIN_GAS_PRICE_BUMP_PERCENT)) /
				BigInt(100);

		const minFeeCap =
			existingTxGasPrice.maxFee +
			(existingTxGasPrice.maxFee * BigInt(MIN_GAS_PRICE_BUMP_PERCENT)) /
				BigInt(100);
		if (newGasPrice.tip < minTipCap || newGasPrice.maxFee < minFeeCap) {
			throw EthereumJSErrorWithoutCode(
				`replacement gas too low, got tip ${newGasPrice.tip}, min: ${minTipCap}, got fee ${newGasPrice.maxFee}, min: ${minFeeCap}`,
			);
		}
	}

	/**
	 * Validates a transaction against the pool and other constraints
	 * @param tx The tx to validate
	 */
	private async validate(
		tx: TypedTransaction,
		isLocalTransaction: boolean = false,
	) {
		if (!tx.isSigned()) {
			throw EthereumJSErrorWithoutCode(
				"Attempting to add tx to txpool which is not signed",
			);
		}
		if (tx.data.length > TX_MAX_DATA_SIZE) {
			throw EthereumJSErrorWithoutCode(
				`Tx is too large (${tx.data.length} bytes) and exceeds the max data size of ${TX_MAX_DATA_SIZE} bytes`,
			);
		}
		const currentGasPrice = this.txGasPrice(tx);
		// This is the tip which the miner receives: miner does not want
		// to mine underpriced txs where miner gets almost no fees
		const currentTip = currentGasPrice.tip;
		if (!isLocalTransaction) {
			const txsInPool = this.txsInPool;
			if (txsInPool >= MAX_POOL_SIZE) {
				throw EthereumJSErrorWithoutCode("Cannot add tx: pool is full");
			}
			// Local txs are not checked against MIN_GAS_PRICE
			if (currentTip < MIN_GAS_PRICE) {
				throw EthereumJSErrorWithoutCode(
					`Tx does not pay the minimum gas price of ${MIN_GAS_PRICE}`,
				);
			}
		}
		const senderAddress = tx.getSenderAddress();
		const sender: UnprefixedAddress = senderAddress.toString().slice(2);
		const inPool = this.pool.get(sender);
		if (inPool) {
			if (!isLocalTransaction && inPool.length >= MAX_TXS_PER_ACCOUNT) {
				throw EthereumJSErrorWithoutCode(
					`Cannot add tx for ${senderAddress}: already have max amount of txs for this account`,
				);
			}
			// Replace pooled txs with the same nonce
			const existingTxn = inPool.find(
				(poolObj) => poolObj.tx.nonce === tx.nonce,
			);
			if (existingTxn) {
				if (equalsBytes(existingTxn.tx.hash(), tx.hash())) {
					throw EthereumJSErrorWithoutCode(
						`${bytesToHex(tx.hash())}: this transaction is already in the TxPool`,
					);
					// this.removeByHash(bytesToUnprefixedHex(tx.hash()), tx);
				}

				this.validateTxGasBump(existingTxn.tx, tx);
			}
		}
		const block = await this.service.chain.getCanonicalHeadHeader();
		if (tx.gasLimit > block.gasLimit) {
			throw EthereumJSErrorWithoutCode(
				`Tx gaslimit of ${tx.gasLimit} exceeds block gas limit of ${block.gasLimit} (exceeds last block gas limit)`,
			);
		}

		// Copy VM in order to not overwrite the state root of the VMExecution module which may be concurrently running blocks
		const vmCopy = await this.service.execution.vm.shallowCopy();
		// Set state root to latest block so that account balance is correct when doing balance check
		await vmCopy.stateManager.setStateRoot(block.stateRoot);
		let account = await vmCopy.stateManager.getAccount(senderAddress);
		if (account === undefined) {
			account = new Account();
		}
		if (account.nonce > tx.nonce) {
			throw EthereumJSErrorWithoutCode(
				`0x${sender} tries to send a tx with nonce ${tx.nonce}, but account has nonce ${account.nonce} (tx nonce too low)`,
			);
		}
		const minimumBalance = tx.value + currentGasPrice.maxFee * tx.gasLimit;
		if (account.balance < minimumBalance) {
			throw EthereumJSErrorWithoutCode(
				`0x${sender} does not have enough balance to cover transaction costs, need ${minimumBalance}, but have ${account.balance} (insufficient balance)`,
			);
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
	async add(tx: TypedTransaction, isLocalTransaction: boolean = false) {
		const hash: UnprefixedHash = bytesToUnprefixedHex(tx.hash());
		const added = Date.now();
		const address: UnprefixedAddress = tx
			.getSenderAddress()
			.toString()
			.slice(2);
		try {
			await this.validate(tx, isLocalTransaction);
			let add: TxPoolObject[] = this.pool.get(address) ?? [];
			const inPool = this.pool.get(address);
			if (inPool) {
				// Replace pooled txs with the same nonce
				add = inPool.filter((poolObj) => poolObj.tx.nonce !== tx.nonce);
			}
			add.push({ tx, added, hash });
			this.pool.set(address, add);
			this.handled.set(hash, { address, added });

			this.txsInPool++;

			if (isLegacyTx(tx)) {
				this.config.metrics?.legacyTxGauge?.inc();
			}
		} catch (e) {
			this.handled.set(hash, { address, added, error: e as Error });
			throw e;
		}
	}

	/**
	 * Returns the available txs from the pool
	 * @param txHashes
	 * @returns Array of tx objects
	 */
	getByHash(txHashes: Uint8Array[]): TypedTransaction[] {
		const found = [];
		for (const txHash of txHashes) {
			const txHashStr = bytesToUnprefixedHex(txHash);
			const handled = this.handled.get(txHashStr);
			if (!handled) continue;
			const inPool = this.pool
				.get(handled.address)
				?.filter((poolObj) => poolObj.hash === txHashStr);
			if (inPool && inPool.length === 1) {
				found.push(inPool[0].tx);
			}
		}
		return found;
	}

	/**
	 * Removes the given tx from the pool
	 * @param txHash Hash of the transaction
	 */
	removeByHash(txHash: UnprefixedHash, tx: TypedTransaction) {
		const handled = this.handled.get(txHash);
		if (!handled) return;
		const { address } = handled;
		const poolObjects = this.pool.get(address);
		if (!poolObjects) return;
		const newPoolObjects = poolObjects.filter(
			(poolObj) => poolObj.hash !== txHash,
		);
		this.txsInPool--;
		if (newPoolObjects.length === 0) {
			// List of txs for address is now empty, can delete
			this.pool.delete(address);
		} else {
			// There are more txs from this address
			this.pool.set(address, newPoolObjects);
		}

		if (isLegacyTx(tx)) {
			this.config.metrics?.legacyTxGauge?.dec();
		}
	}

	/**
	 * Broadcast transactions to peers
	 */
	sendTransactions(txs: TypedTransaction[], peers: Peer[]) {
		if (txs.length > 0) {
			const hashes = txs.map((tx) => tx.hash());
			for (const peer of peers) {
				// This is used to avoid re-sending along pooledTxHashes
				// announcements/re-broadcasts
				const newHashes = this.addToKnownByPeer(hashes, peer);
				const newHashesHex = newHashes.map((txHash) =>
					bytesToUnprefixedHex(txHash),
				);
				const newTxs = txs.filter((tx) =>
					newHashesHex.includes(bytesToUnprefixedHex(tx.hash())),
				);
				peer.eth?.request("Transactions", newTxs).catch((e) => {
					this.markFailedSends(peer, newHashes, e as Error);
				});
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
				)[0];
			if (sendobject) {
				sendobject.error = e;
			}
		}
	}

	/**
	 * Broadcast new tx hashes to peers
	 */
	sendNewTxHashes(txs: [number[], number[], Uint8Array[]], peers: Peer[]) {
		const txHashes = txs[2];
		for (const peer of peers) {
			// Make sure data structure is initialized
			if (!this.knownByPeer.has(peer.id)) {
				this.knownByPeer.set(peer.id, []);
			}
			// Add to known tx hashes and get hashes still to send to peer
			const hashesToSend = this.addToKnownByPeer(txHashes, peer);

			// Broadcast to peer if at least 1 new tx hash to announce
			if (hashesToSend.length > 0) {
				if (
					peer.eth !== undefined &&
					peer.eth["versions"] !== undefined &&
					peer.eth["versions"].includes(68)
				) {
					// If peer supports eth/68, send eth/68 formatted message (tx_types[], tx_sizes[], hashes[])
					const txsToSend: [number[], number[], Uint8Array[]] = [[], [], []];
					for (const hash of hashesToSend) {
						const index = txs[2].findIndex((el) => equalsBytes(el, hash));
						txsToSend[0].push(txs[0][index]);
						txsToSend[1].push(txs[1][index]);
						txsToSend[2].push(hash);
					}

					try {
						peer.eth?.send(
							"NewPooledTransactionHashes",
							txsToSend.slice(0, 4096),
						);
					} catch (e) {
						this.markFailedSends(peer, hashesToSend, e as Error);
					}
				}
				// If peer doesn't support eth/68, just send tx hashes
				else
					try {
						// We `send` this directly instead of using devp2p's async `request` since NewPooledTransactionHashes has no response and is just sent to peers
						// and this requires no tracking of a peer's response
						peer.eth?.send(
							"NewPooledTransactionHashes",
							hashesToSend.slice(0, 4096),
						);
					} catch (e) {
						this.markFailedSends(peer, hashesToSend, e as Error);
					}
			}
		}
	}

	async handleAnnouncedTxs(
		txs: TypedTransaction[],
		peer: Peer,
		peerPool: PeerPool,
	) {
		if (!this.running || txs.length === 0) return;
		this.config.logger?.debug(
			`TxPool: received new transactions number=${txs.length}`,
		);
		this.addToKnownByPeer(
			txs.map((tx) => tx.hash()),
			peer,
		);

		const newTxHashes: [number[], number[], Uint8Array[]] = [] as any;
		for (const tx of txs) {
			try {
				await this.add(tx);
				newTxHashes[0].push(tx.type);
				newTxHashes[1].push(tx.serialize().byteLength);
				newTxHashes[2].push(tx.hash());
			} catch (error: any) {
				this.config.logger?.debug(
					`Error adding tx to TxPool: ${error.message} (tx hash: ${bytesToHex(tx.hash())})`,
				);
			}
		}
		const peers = peerPool.peers;
		const numPeers = peers.length;
		const sendFull = Math.max(
			1,
			Math.floor(numPeers / this.NUM_PEERS_REBROADCAST_QUOTIENT),
		);
		this.sendTransactions(txs, peers.slice(0, sendFull));
		this.sendNewTxHashes(newTxHashes, peers.slice(sendFull));
	}

	addToKnownByPeer(txHashes: Uint8Array[], peer: Peer): Uint8Array[] {
		// Make sure data structure is initialized
		if (!this.knownByPeer.has(peer.id)) {
			this.knownByPeer.set(peer.id, []);
		}

		const newHashes: Uint8Array[] = [];
		for (const hash of txHashes) {
			const inSent = this.knownByPeer
				.get(peer.id)!
				.filter(
					(sentObject) => sentObject.hash === bytesToUnprefixedHex(hash),
				).length;
			if (inSent === 0) {
				const added = Date.now();
				const add = {
					hash: bytesToUnprefixedHex(hash),
					added,
				};
				this.knownByPeer.get(peer.id)!.push(add);
				newHashes.push(hash);
			}
		}
		return newHashes;
	}

	/**
	 * Handle new tx hashes
	 */
	async handleAnnouncedTxHashes(
		txHashes: Uint8Array[],
		peer: Peer,
		peerPool: PeerPool,
	) {
		if (!this.running || txHashes === undefined || txHashes.length === 0)
			return;
		this.addToKnownByPeer(txHashes, peer);

		const reqHashes = [];
		for (const txHash of txHashes) {
			const txHashStr: UnprefixedHash = bytesToUnprefixedHex(txHash);
			if (this.pending.includes(txHashStr) || this.handled.has(txHashStr)) {
				continue;
			}
			reqHashes.push(txHash);
		}

		if (reqHashes.length === 0) return;

		this.config.logger?.debug(
			`TxPool: received new tx hashes number=${reqHashes.length}`,
		);

		const reqHashesStr: UnprefixedHash[] = reqHashes.map(bytesToUnprefixedHex);
		this.pending = this.pending.concat(reqHashesStr);
		this.config.logger?.debug(
			`TxPool: requesting txs number=${reqHashes.length} pending=${this.pending.length}`,
		);
		const getPooledTxs = await peer.eth?.getPooledTransactions({
			hashes: reqHashes.slice(0, this.TX_RETRIEVAL_LIMIT),
		});

		// Remove from pending list regardless if tx is in result
		this.pending = this.pending.filter((hash) => !reqHashesStr.includes(hash));

		if (getPooledTxs === undefined) {
			return;
		}
		const [_, txs] = getPooledTxs;
		this.config.logger?.debug(
			`TxPool: received requested txs number=${txs.length}`,
		);

		const newTxHashes: [number[], number[], Uint8Array[]] = [[], [], []] as any;
		for (const tx of txs) {
			try {
				await this.add(tx);
			} catch (error: any) {
				this.config.logger?.debug(
					`Error adding tx to TxPool: ${error.message} (tx hash: ${bytesToHex(tx.hash())})`,
				);
			}
			newTxHashes[0].push(tx.type);
			newTxHashes[1].push(tx.serialize().length);
			newTxHashes[2].push(tx.hash());
		}
		this.sendNewTxHashes(newTxHashes, peerPool.peers);
	}

	/**
	 * Remove txs included in the latest blocks from the tx pool
	 */
	removeNewBlockTxs(newBlocks: Block[]) {
		if (!this.running) return;
		for (const block of newBlocks) {
			for (const tx of block.transactions) {
				const txHash: UnprefixedHash = bytesToUnprefixedHex(tx.hash());
				this.removeByHash(txHash, tx);
			}
		}
	}

	/**
	 * Regular tx pool cleanup
	 */
	cleanup() {
		// Remove txs older than POOLED_STORAGE_TIME_LIMIT from the pool
		// as well as the list of txs being known by a peer
		let compDate = Date.now() - this.POOLED_STORAGE_TIME_LIMIT * 1000 * 60;
		for (const [i, mapToClean] of [this.pool, this.knownByPeer].entries()) {
			for (const [key, objects] of mapToClean) {
				const updatedObjects = objects.filter((obj) => obj.added >= compDate);
				if (updatedObjects.length < objects.length) {
					if (i === 0) this.txsInPool -= objects.length - updatedObjects.length;
					if (updatedObjects.length === 0) {
						mapToClean.delete(key);
					} else {
						mapToClean.set(key, updatedObjects);
					}
				}
			}
		}

		// Cleanup handled txs
		compDate = Date.now() - this.HANDLED_CLEANUP_TIME_LIMIT * 1000 * 60;
		for (const [address, handleObj] of this.handled) {
			if (handleObj.added < compDate) {
				this.handled.delete(address);
			}
		}
	}

	/**
	 * Helper to return a normalized gas price across different
	 * transaction types. For legacy transactions, this is the gas price.
	 * @param tx The tx
	 * @param baseFee Unused for legacy transactions
	 */
	private normalizedGasPrice(tx: TypedTransaction, baseFee?: bigint) {
		return (tx as LegacyTx).gasPrice;
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
			};
		}

		throw EthereumJSErrorWithoutCode(
			`tx of type ${(tx as TypedTransaction).type} unknown`,
		);
	}

	/**
	 * Returns eligible txs to be mined sorted by price in such a way that the
	 * nonce orderings within a single account are maintained.
	 *
	 * @param baseFee Unused for legacy transactions
	 */
	async txsByPriceAndNonce(
		vm: VM,
		{ baseFee, allowedBlobs }: { baseFee?: bigint; allowedBlobs?: number } = {},
	) {
		const txs: TypedTransaction[] = [];
		// Separate the transactions by account and sort by nonce
		const byNonce = new Map<string, TypedTransaction[]>();
		const skippedStats = { byNonce: 0, byPrice: 0 };

		for (const [address, poolObjects] of this.pool) {
			let txsSortedByNonce = poolObjects
				.map((obj) => obj.tx)
				.sort((a, b) => Number(a.nonce - b.nonce));

			// Check if the account nonce matches the lowest known tx nonce
			let account = await vm.stateManager.getAccount(
				new Address(hexToBytes(`0x${address}`)),
			);
			if (account === undefined) {
				account = new Account();
			}
			const { nonce } = account;
			if (txsSortedByNonce[0].nonce !== nonce) {
				// Account nonce does not match the lowest known tx nonce,
				// therefore no txs from this address are currently executable
				skippedStats.byNonce += txsSortedByNonce.length;
				continue;
			}
			byNonce.set(address, txsSortedByNonce);
		}
		// Initialize a price based heap with the head transactions
		const byPrice = new Heap({
			comparBefore: (a: TypedTransaction, b: TypedTransaction) =>
				this.normalizedGasPrice(b, baseFee) -
					this.normalizedGasPrice(a, baseFee) <
				BIGINT_0,
		}) as QHeap<TypedTransaction>;
		for (const [address, txs] of byNonce) {
			byPrice.insert(txs[0]);
			byNonce.set(address, txs.slice(1));
		}
		// Merge by replacing the best with the next from the same account
		while (byPrice.length > 0) {
			// Retrieve the next best transaction by price
			const best = byPrice.remove();
			if (best === undefined) break;

			// Push in its place the next transaction from the same account
			const address = best.getSenderAddress().toString().slice(2);
			const accTxs = byNonce.get(address)!;

			if (accTxs.length > 0) {
				byPrice.insert(accTxs[0]);
				byNonce.set(address, accTxs.slice(1));
			}
			// Accumulate the best priced transaction
			txs.push(best);
		}
		this.config.logger?.info(
			`txsByPriceAndNonce selected txs=${txs.length}, skipped byNonce=${skippedStats.byNonce} byPrice=${skippedStats.byPrice}`,
		);
		return txs;
	}

	/**
	 * Stop pool execution
	 */
	stop(): boolean {
		if (!this.running) return false;
		clearInterval(this._cleanupInterval as NodeJS.Timeout);
		clearInterval(this._logInterval as NodeJS.Timeout);
		this.running = false;
		this.config.logger?.info("TxPool stopped.");
		return true;
	}

	/**
	 * Close pool
	 */
	close() {
		this.pool.clear();
		this.handled.clear();
		this.txsInPool = 0;
		if (this.config.metrics !== undefined) {
			// TODO: Only clear the metrics related to the transaction pool here
			for (const [_, metric] of Object.entries(this.config.metrics)) {
				metric.set(0);
			}
		}
		this.opened = false;
	}

	_logPoolStats() {
		let broadcasts = 0;
		let broadcasterrors = 0;
		let knownpeers = 0;
		for (const sendobjects of this.knownByPeer.values()) {
			broadcasts += sendobjects.length;
			broadcasterrors += sendobjects.filter(
				(sendobject) => sendobject.error !== undefined,
			).length;
			knownpeers++;
		}
		// Get average
		if (knownpeers > 0) {
			broadcasts = broadcasts / knownpeers;
			broadcasterrors = broadcasterrors / knownpeers;
		}
		if (this.txsInPool > 0) {
			broadcasts = broadcasts / this.txsInPool;
			broadcasterrors = broadcasterrors / this.txsInPool;
		}

		let handledadds = 0;
		let handlederrors = 0;
		for (const handledobject of this.handled.values()) {
			if (handledobject.error === undefined) {
				handledadds++;
			} else {
				handlederrors++;
			}
		}
		this.config.logger?.info(
			`TxPool Statistics txs=${this.txsInPool} senders=${this.pool.size} peers=${this.service.pool.peers.length}`,
		);
		this.config.logger?.info(
			`TxPool Statistics broadcasts=${broadcasts}/tx/peer broadcasterrors=${broadcasterrors}/tx/peer knownpeers=${knownpeers} since minutes=${this.POOLED_STORAGE_TIME_LIMIT}`,
		);
		this.config.logger?.info(
			`TxPool Statistics successfuladds=${handledadds} failedadds=${handlederrors} since minutes=${this.HANDLED_CLEANUP_TIME_LIMIT}`,
		);
	}
}
