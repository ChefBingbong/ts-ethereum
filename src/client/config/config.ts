import { EventEmitter } from "eventemitter3";
import { Level } from "level";
import { Logger } from "winston";
import type { Common } from "../../chain-config";
import { BIGINT_0 } from "../../utils/index.ts";
import { safeTry } from "../../utils/safe.ts";
import { genPrivateKey } from "../../utils/utils.ts";
import { Event, type EventParams } from "../types.ts";
import type { ConfigOptions } from "./types.ts";
import { DataDirectory } from "./types.ts";
import type { ResolvedConfigOptions } from "./utils.ts";
import { createConfigOptions } from "./utils.ts";

export interface SynchronizedState {
	synchronized: boolean;
	lastSynchronized: boolean;
	isAbleToSync: boolean;
	syncTargetHeight: bigint;
	lastSyncDate: number;
}

export class Config {
	public readonly events: EventEmitter<EventParams>;
	public readonly options: ResolvedConfigOptions;
	public readonly chainCommon: Common;
	public readonly execCommon: Common;

	public synchronized: boolean;
	public lastSynchronized: boolean;
	public isAbleToSync: boolean;
	public syncTargetHeight: bigint;
	public lastSyncDate: number;

	public shutdown: boolean;

	private readonly logger: Logger;

	constructor(options: ConfigOptions) {
		this.events = new EventEmitter<EventParams>();
		this.options = createConfigOptions(options);
		this.chainCommon = this.options.common.copy();
		this.execCommon = this.options.common.copy();
		this.logger = this.options.logger ?? new Logger();

		this.shutdown = false;
		this.synchronized = this.options.isSingleNode ?? this.options.mine;
		this.isAbleToSync = this.options.isSingleNode && this.options.mine;
		this.lastSynchronized = this.synchronized;
		this.syncTargetHeight = BIGINT_0;
		this.lastSyncDate = 0;

		this.events.on(Event.CLIENT_SHUTDOWN, () => {
			this.logger.warn(`CLIENT_SHUTDOWN event received `);
			this.shutdown = true;
		});
	}

	updateSynchronizedState(newState: SynchronizedState): void {
		this.synchronized = newState.synchronized;
		this.lastSynchronized = newState.lastSynchronized;
		this.isAbleToSync = newState.isAbleToSync;
		this.syncTargetHeight = newState.syncTargetHeight;
		this.lastSyncDate = newState.lastSyncDate;
	}

	getNetworkDirectory(): string {
		const networkDirName = this.chainCommon.chainName();
		return `${this.options.datadir}/${networkDirName}`;
	}

	getInvalidPayloadsDir(): string {
		return `${this.getNetworkDirectory()}/invalidPayloads`;
	}

	getDataDirectory(dir: DataDirectory): string {
		const networkDir = this.getNetworkDirectory();
		switch (dir) {
			case DataDirectory.Chain: {
				const chainDataDirName = "chain";
				return `${networkDir}/${chainDataDirName}`;
			}
			case DataDirectory.State:
				return `${networkDir}/state`;
			case DataDirectory.Meta:
				return `${networkDir}/meta`;
		}
	}

	static getConfigDB(networkDir: string) {
		return new Level<string | Uint8Array, Uint8Array>(`${networkDir}/config`);
	}

	static async getClientKey(datadir: string, common: Common) {
		const db = Config.getConfigDB(`${datadir}/${common.chainName()}`);
		const dbKey = "config:client_key";

		const encodingOpts = { keyEncoding: "utf8", valueEncoding: "view" };
		const [error, key] = await safeTry(() => db.get(dbKey, encodingOpts));

		if (!error) return key;

		const backupKey = genPrivateKey();
		await db.put(dbKey, backupKey, encodingOpts);
		return backupKey;
	}

	superMsg(msgs: string | string[], meta?: any) {
		if (typeof msgs === "string") {
			msgs = [msgs];
		}
		let len = 0;
		for (const msg of msgs) {
			len = msg.length > len ? msg.length : len;
		}
		this.options.logger?.info("-".repeat(len), meta);
		for (const msg of msgs) {
			this.options.logger?.info(msg, meta);
		}
		this.options.logger?.info("-".repeat(len), meta);
	}
}
