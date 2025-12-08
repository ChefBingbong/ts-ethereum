import { AccountCache } from "./account.ts";
import {
	type CacheOpts,
	CacheType,
	type CachesStateManagerOpts,
} from "./types.ts";

import type { Address } from "../../utils";

export class Caches {
	account?: AccountCache;

	settings: Record<"account", CacheOpts>;

	constructor(opts: CachesStateManagerOpts = {}) {
		const accountSettings = {
			type: opts.account?.type ?? CacheType.ORDERED_MAP,
			size: opts.account?.size ?? 100000,
		};

		this.settings = {
			account: accountSettings,
		};

		if (this.settings.account.size !== 0) {
			this.account = new AccountCache({
				size: this.settings.account.size,
				type: this.settings.account.type,
			});
		}
	}

	checkpoint() {
		this.account?.checkpoint();
	}

	clear() {
		this.account?.clear();
	}

	commit() {
		this.account?.commit();
	}

	deleteAccount(address: Address) {
		this.account?.del(address);
	}

	shallowCopy(downlevelCaches: boolean) {
		let cacheOptions: CachesStateManagerOpts | undefined;

		// Account cache options
		if (this.settings.account.size !== 0) {
			cacheOptions = {
				account: downlevelCaches
					? { size: this.settings.account.size, type: CacheType.ORDERED_MAP }
					: this.settings.account,
			};
		}

		if (cacheOptions !== undefined) {
			return new Caches(cacheOptions);
		} else return undefined;
	}

	revert() {
		this.account?.revert();
	}
}
