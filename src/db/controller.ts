import type { AbstractLevel } from "abstract-level";
import { Level } from "level";
import type { Logger } from "../client/logging.ts";

export interface DbOptions {
	/** Database path */
	name: string;
	/** Optional existing DB instance */
	db?: AbstractLevel<
		string | Uint8Array,
		string | Uint8Array,
		string | Uint8Array
	>;
}

export interface DbModules {
	logger?: Logger;
	// metrics?: DbMetrics; // Optional for now
}

enum Status {
	started = "started",
	closed = "closed",
}

/**
 * Database controller abstraction similar to Lodestar's LevelDbController
 * Wraps Level DB with consistent interface
 */
export class DbController {
	private status = Status.started;
	private db: AbstractLevel<
		string | Uint8Array,
		string | Uint8Array,
		string | Uint8Array
	>;

	constructor(
		private readonly logger: Logger | undefined,
		db: AbstractLevel<
			string | Uint8Array,
			string | Uint8Array,
			string | Uint8Array
		>,
	) {
		this.db = db;
	}

	/**
	 * Create a new DB controller instance
	 */
	static async create(
		opts: DbOptions,
		modules: DbModules,
	): Promise<DbController> {
		let db: AbstractLevel<
			string | Uint8Array,
			string | Uint8Array,
			string | Uint8Array
		>;

		if (opts.db) {
			db = opts.db;
		} else {
			db = new Level<string | Uint8Array, string | Uint8Array>(
				opts.name,
			) as unknown as AbstractLevel<
				string | Uint8Array,
				string | Uint8Array,
				string | Uint8Array
			>;
		}

		try {
			await db.open();
		} catch (e: any) {
			if (e.cause?.code === "LEVEL_LOCKED") {
				throw new Error("Database already in use by another process");
			}
			throw e;
		}

		return new DbController(modules.logger, db);
	}

	/**
	 * Close the database connection
	 */
	async close(): Promise<void> {
		if (this.status === Status.closed) return;
		this.status = Status.closed;
		await this.db.close();
	}

	/**
	 * Get a value from the database
	 */
	async get(
		key: string | Uint8Array,
		opts?: { keyEncoding?: string; valueEncoding?: string },
	): Promise<Uint8Array | null> {
		try {
			const encodingOpts = {
				keyEncoding: opts?.keyEncoding ?? "view",
				valueEncoding: opts?.valueEncoding ?? "view",
			};
			return (await this.db.get(key, encodingOpts)) as Uint8Array | null;
		} catch (e: any) {
			if (e.code === "LEVEL_NOT_FOUND") {
				return null;
			}
			throw e;
		}
	}

	/**
	 * Put a value into the database
	 */
	async put(
		key: string | Uint8Array,
		value: string | Uint8Array,
		opts?: { keyEncoding?: string; valueEncoding?: string },
	): Promise<void> {
		const encodingOpts = {
			keyEncoding: opts?.keyEncoding ?? "view",
			valueEncoding: opts?.valueEncoding ?? "view",
		};
		await this.db.put(key, value, encodingOpts);
	}

	/**
	 * Delete a value from the database
	 */
	async del(
		key: string | Uint8Array,
		opts?: { keyEncoding?: string },
	): Promise<void> {
		const encodingOpts = {
			keyEncoding: opts?.keyEncoding ?? "view",
		};
		await this.db.del(key, encodingOpts);
	}

	/**
	 * Clear all entries from the database
	 */
	async clear(): Promise<void> {
		await this.db.clear();
	}

	/**
	 * Get the underlying database instance
	 */
	getDb(): AbstractLevel<
		string | Uint8Array,
		string | Uint8Array,
		string | Uint8Array
	> {
		return this.db;
	}
}
