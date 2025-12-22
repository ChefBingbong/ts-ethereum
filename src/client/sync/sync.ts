import { BlockHeader } from "../../block/index.ts";
import { BIGINT_0, short } from "../../utils";
import type { Chain } from "../blockchain";
import type { Config } from "../config/index.ts";
import { timestampToMilliseconds } from "../config/utils.ts";
import { NetworkCore } from "../net/index.ts";
import type { Peer } from "../net/peer/peer.ts";
import { Event } from "../types.ts";
import { wait } from "../util/wait.ts";
import type { BlockFetcher } from "./fetcher";

export interface SynchronizerOptions {
	/* Refresh interval in ms (default: 1000) */
	interval?: number;
	core: NetworkCore;
}

/**
 * Base class for blockchain synchronizers
 * @memberof module:sync
 */
export abstract class Synchronizer {
	public config: Config;

	protected pool: NetworkCore;
	protected chain: Chain;

	protected interval: number;
	protected forceSync: boolean;

	public _fetcher: BlockFetcher | null;
	public opened: boolean;
	public running: boolean;
	public startingBlock: bigint;

	public lastSyncDate: number = 0;
	public syncTargetHeight: bigint = BIGINT_0;
	public synchronized: boolean;
	public lastSynchronized: boolean;
	public isAbleToSync: boolean;

	// Time (in ms) after which the synced state is reset
	private SYNCED_STATE_REMOVAL_PERIOD = 60000;
	private _syncedStatusCheckInterval:
		| NodeJS.Timeout
		| undefined; /* global NodeJS */

	/**
	 * Create new node
	 */
	constructor(options: SynchronizerOptions) {
		this.config = options.core.config;
		this.pool = options.core;
		this.chain = options.core.chain;
		this._fetcher = null;

		this.interval = options.interval ?? 1000;
		this.opened = false;
		this.running = false;
		this.forceSync = false;
		this.startingBlock = BIGINT_0;

		const isSingleNode = this.config.options.isSingleNode;
		const mine = this.config.options.mine;

		this.isAbleToSync = isSingleNode && mine;
		this.synchronized = isSingleNode ?? mine;
		this.lastSynchronized = this.synchronized;

		this.config.events.on(Event.POOL_PEER_ADDED, (peer) => {
			if (this.syncable(peer)) {
				this.config.options.logger?.debug(`Found ${this.type} peer: ${peer}`);
			}
		});

		this.config.events.on(Event.CHAIN_UPDATED, () => {
			this.updateSynchronizedState(this.chain.headers.latest, true);
		});
	}

	updateSynchronizedState(latest?: BlockHeader, emitSync?: boolean): void {
		this.updateConfigSynchronizedState(latest, emitSync);
		this.config.updateSynchronizedState({
			synchronized: this.synchronized,
			lastSynchronized: this.lastSynchronized,
			isAbleToSync: this.isAbleToSync,
			syncTargetHeight: this.syncTargetHeight,
			lastSyncDate: this.lastSyncDate,
		});
	}
	/**
	 * Update synchronized state based on latest block header
	 * Migrated from Config
	 */
	updateConfigSynchronizedState(
		latest?: BlockHeader,
		emitSync?: boolean,
	): void {
		// Early return only if we have no latest block AND no sync target AND can't sync
		// This allows non-miners to update sync state once they have blocks
		if (!latest && this.syncTargetHeight === 0n && !this.isAbleToSync) return;

		// If we have a latest block but syncTargetHeight is still 0, update it
		// This handles the case where non-miners haven't discovered peers yet
		if (latest && this.syncTargetHeight === 0n) {
			this.syncTargetHeight = latest.number;
		}

		// Check if we've reached or exceeded the sync target
		if (latest && latest.number >= this.syncTargetHeight) {
			const newSyncTargetHeight = latest.number;
			this.syncTargetHeight = newSyncTargetHeight;

			this.lastSyncDate = timestampToMilliseconds(latest.timestamp);
			const timeSinceLastSyncDate = Date.now() - this.lastSyncDate;

			if (
				timeSinceLastSyncDate < this.config.options.syncedStateRemovalPeriod
			) {
				if (!this.synchronized) this.synchronized = true;
				if (emitSync)
					this.config.events.emit(Event.SYNC_SYNCHRONIZED, newSyncTargetHeight);

				this.config.superMsg(
					`Synchronized blockchain at height=${newSyncTargetHeight} hash=${short(latest.hash())} 🎉`,
				);
			}
			if (this.synchronized !== this.lastSynchronized) {
				this.lastSynchronized = this.synchronized;
			}
			return;
		}

		// If synchronized but not able to sync, check if we should mark as unsynchronized
		if (this.synchronized && !this.isAbleToSync) {
			const timeSinceLastSyncDate = Date.now() - this.lastSyncDate;

			if (
				timeSinceLastSyncDate >= this.config.options.syncedStateRemovalPeriod
			) {
				this.synchronized = false;
			}
		}

		if (this.synchronized !== this.lastSynchronized) {
			this.lastSynchronized = this.synchronized;
		}
	}

	/**
	 * Returns synchronizer type
	 */
	get type() {
		return "sync";
	}

	get fetcher(): BlockFetcher | null {
		return this._fetcher;
	}

	set fetcher(fetcher: BlockFetcher | null) {
		this._fetcher = fetcher;
	}

	/**
	 * Open synchronizer. Must be called before sync() is called
	 */
	async open() {
		this.opened = true;
	}

	/**
	 * Returns true if peer can be used for syncing
	 */
	syncable(_peer: Peer) {
		// TODO: evaluate syncability of peer
		return true;
	}

	/**
	 * Start synchronization
	 */
	async start(): Promise<void | boolean> {
		if (this.running) {
			return false;
		}
		this.running = true;

		this._syncedStatusCheckInterval = setInterval(
			this._syncedStatusCheck.bind(this),
			this.SYNCED_STATE_REMOVAL_PERIOD,
		);

		const timeout = setTimeout(() => {
			this.forceSync = true;
		}, this.interval * 30);
		while (this.running) {
			try {
				await this.sync();
			} catch (error: any) {
				this.config.events.emit(Event.SYNC_ERROR, error);
			}
			await wait(this.interval);
		}
		this.running = false;
		clearTimeout(timeout);
	}

	abstract best(): Promise<Peer | undefined>;

	abstract syncWithPeer(peer?: Peer): Promise<boolean>;

	resolveSync(height?: bigint) {
		this.clearFetcher();
		const heightStr =
			typeof height === "bigint" && height !== BIGINT_0
				? ` height=${height}`
				: "";
		this.config.options.logger?.debug(
			`Finishing up sync with the current fetcher ${heightStr}`,
		);
		return true;
	}

	async syncWithFetcher() {
		try {
			if (this._fetcher) {
				await this._fetcher.blockingFetch();
			}
			this.config.options.logger?.debug(`Fetcher finished fetching...`);
			return this.resolveSync();
		} catch (error: any) {
			this.config.options.logger?.error(
				`Received sync error, stopping sync and clearing fetcher: ${error.message ?? error}`,
			);
			this.clearFetcher();
			throw error;
		}
	}

	/**
	 * Fetch all blocks from current height up to highest found amongst peers
	 * @returns when sync is completed
	 */
	async sync(): Promise<boolean> {
		let peer = await this.best();
		let numAttempts = 1;
		while (!peer && this.opened) {
			this.config.options.logger?.debug(
				`Waiting for best peer (attempt #${numAttempts})`,
			);
			await wait(5000);
			peer = await this.best();
			numAttempts += 1;
		}

		if (!(await this.syncWithPeer(peer))) return false;

		// syncWithFetcher should auto resolve when sync completes even if from any other independent
		// fetcher. We shouldn't be auto resolving the fetchers on sync events because SYNC events are
		// not precision based but we need precision to resolve the fetchers
		//
		// TODO: check this for the forward fetcher that it resolves on being close/on head or post merge
		return this.syncWithFetcher();
	}

	/**
	 * Clears and removes the fetcher.
	 */
	clearFetcher() {
		if (this._fetcher) {
			this._fetcher.clear();
			this._fetcher.destroy();
			this._fetcher = null;
		}
	}

	/**
	 * Stop synchronizer.
	 */
	async stop(): Promise<boolean> {
		this.clearFetcher();
		if (!this.running) {
			return false;
		}
		clearInterval(this._syncedStatusCheckInterval as NodeJS.Timeout);
		await new Promise((resolve) => setTimeout(resolve, this.interval));
		this.running = false;
		this.config.options.logger?.info("Stopped synchronization.");
		return true;
	}

	/**
	 * Close synchronizer.
	 */
	async close() {
		this.opened = false;
	}

	/**
	 * Reset synced status after a certain time with no chain updates
	 */
	_syncedStatusCheck() {
		this.updateSynchronizedState(this.chain.headers.latest, false);
	}
}
