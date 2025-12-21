import { bytesToUnprefixedHex, hexToBytes } from "../../../utils";
import type { Config } from "../../config.ts";
import type { Peer } from "../../net/peer/peer.ts";
import type { PeerPoolLike } from "../../net/peerpool-types.ts";
import type { TxPool } from "../../service/txpool.ts";

interface TxFetcherOptions {
	config: Config;
	pool: PeerPoolLike;
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
	private pool: PeerPoolLike;
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
			this.processPending().catch((e) => {
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
			if (this.txPool.hasHandled(hashStr)) continue;

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
			const peer = this.pool.peers.find((p) => p.id === peerId);
			if (!peer || !peer.eth) continue;

			const batch = announcements.slice(0, this.BATCH_SIZE);
			const hashes = batch.map((ann) => hexToBytes(`0x${ann.hash}`));

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
								`Failed to add fetched tx ${txHash}: ${e.message}`,
							);
						}
					}
				}
			} catch (e: any) {
				this.config.logger?.debug(
					`Failed to fetch txs from peer ${peerId}: ${e.message}`,
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
