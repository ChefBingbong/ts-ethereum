import { EthereumJSErrorWithoutCode } from "../utils";
import type { Account } from "../utils";

import { modifyAccountFields } from "./util.ts";

import type { SimpleStateManagerOpts } from ".";
import type {
	AccountFields,
	Common,
	StateManagerInterface,
} from "../chain-config";
import type { Address, PrefixedHexString } from "../utils";

/**
 * Simple and dependency-free state manager for basic state access use cases
 * where a merkle-patricia or binary tree backed state manager is too heavy-weight.
 *
 * This state manager only supports value transfers - no smart contracts.
 *
 * This state manager comes with the basic state access logic for
 * accounts as well as a simple implementation of checkpointing but lacks
 * methods implementations of state root related logic.
 */
export class SimpleStateManager implements StateManagerInterface {
	public accountStack: Map<PrefixedHexString, Account | undefined>[] = [];

	public readonly common?: Common;

	constructor(opts: SimpleStateManagerOpts = {}) {
		this.checkpointSync();
		this.common = opts.common;
	}

	protected topAccountStack() {
		return this.accountStack[this.accountStack.length - 1];
	}

	// Synchronous version of checkpoint() to allow to call from constructor
	protected checkpointSync() {
		const newTopA = new Map(this.topAccountStack());
		for (const [address, account] of newTopA) {
			const accountCopy =
				account !== undefined
					? Object.assign(
							Object.create(Object.getPrototypeOf(account)),
							account,
						)
					: undefined;
			newTopA.set(address, accountCopy);
		}
		this.accountStack.push(newTopA);
	}

	async getAccount(address: Address): Promise<Account | undefined> {
		return this.topAccountStack().get(address.toString());
	}

	async putAccount(
		address: Address,
		account?: Account | undefined,
	): Promise<void> {
		this.topAccountStack().set(address.toString(), account);
	}

	async deleteAccount(address: Address): Promise<void> {
		this.topAccountStack().set(address.toString(), undefined);
	}

	async modifyAccountFields(
		address: Address,
		accountFields: AccountFields,
	): Promise<void> {
		await modifyAccountFields(this, address, accountFields);
	}

	async checkpoint(): Promise<void> {
		this.checkpointSync();
	}

	async commit(): Promise<void> {
		this.accountStack.splice(-2, 1);
	}

	async revert(): Promise<void> {
		this.accountStack.pop();
	}

	async flush(): Promise<void> {}
	clearCaches(): void {}

	shallowCopy(): StateManagerInterface {
		const copy = new SimpleStateManager({ common: this.common });
		for (let i = 0; i < this.accountStack.length; i++) {
			copy.accountStack.push(new Map(this.accountStack[i]));
		}
		return copy;
	}

	// State root functionality not implemented
	getStateRoot(): Promise<Uint8Array> {
		throw EthereumJSErrorWithoutCode("Method not implemented.");
	}
	setStateRoot(): Promise<void> {
		throw EthereumJSErrorWithoutCode("Method not implemented.");
	}
	hasStateRoot(): Promise<boolean> {
		throw EthereumJSErrorWithoutCode("Method not implemented.");
	}
}
