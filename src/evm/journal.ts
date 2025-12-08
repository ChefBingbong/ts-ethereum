import {
	EthereumJSErrorWithoutCode,
	RIPEMD160_ADDRESS_STRING,
	bytesToHex,
	bytesToUnprefixedHex,
	unprefixedHexToBytes,
} from "../utils";

import type { StateManagerInterface } from "../chain-config";
import type { Account, Address, PrefixedHexString } from "../utils";

type AddressString = string;
type SlotString = string;
type WarmSlots = Set<SlotString>;

type JournalType = Map<AddressString, WarmSlots>;

/**
 * Journal Diff Item:
 * Index 0: remove warm address
 * Index 1: remove warm slots for this warm address
 * Index 2: remove touched
 */
type JournalDiffItem = [
	Set<AddressString>,
	Map<AddressString, Set<SlotString>>,
	Set<AddressString>,
];

type JournalHeight = number;

/**
 * Journal for tracking state changes and warm addresses/slots.
 * Simplified for value-transfer-only blockchain (no access list reporting).
 */
export class Journal {
	private stateManager: StateManagerInterface;

	private journal!: JournalType;
	private alwaysWarmJournal!: Map<AddressString, Set<SlotString>>;
	private touched!: Set<AddressString>;
	private journalDiff!: [JournalHeight, JournalDiffItem][];

	private journalHeight: JournalHeight;

	public preimages?: Map<PrefixedHexString, Uint8Array>;

	constructor(stateManager: StateManagerInterface) {
		this.cleanJournal();
		this.journalHeight = 0;
		this.stateManager = stateManager;
	}

	/**
	 * Clears the internal `preimages` map, and marks this journal to start reporting
	 * the images (hashed addresses) of the accounts that have been accessed
	 */
	startReportingPreimages() {
		this.preimages = new Map();
	}

	async putAccount(address: Address, account: Account | undefined) {
		this.touchAddress(address);
		return this.stateManager.putAccount(address, account);
	}

	async deleteAccount(address: Address) {
		this.touchAddress(address);
		await this.stateManager.deleteAccount(address);
	}

	private touchAddress(address: Address): void {
		const str = address.toString().slice(2);
		this.touchAccount(str);
	}

	private touchAccount(address: string) {
		// If preimages are being reported, add the address to the preimages map
		if (this.preimages !== undefined) {
			const bytesAddress = unprefixedHexToBytes(address);
			if (this.stateManager.getAppliedKey === undefined) {
				throw EthereumJSErrorWithoutCode(
					"touchAccount: stateManager.getAppliedKey can not be undefined if preimage storing is enabled",
				);
			}
			const hashedKey = this.stateManager.getAppliedKey(bytesAddress);
			this.preimages.set(bytesToHex(hashedKey), bytesAddress);
		}

		if (!this.touched.has(address)) {
			this.touched.add(address);
			const diffArr = this.journalDiff[this.journalDiff.length - 1][1];
			diffArr[2].add(address);
		}
	}

	async commit() {
		this.journalHeight--;
		this.journalDiff.push([
			this.journalHeight,
			[new Set(), new Map(), new Set()],
		]);
		await this.stateManager.commit();
	}

	async checkpoint() {
		this.journalHeight++;
		this.journalDiff.push([
			this.journalHeight,
			[new Set(), new Map(), new Set()],
		]);
		await this.stateManager.checkpoint();
	}

	async revert() {
		let finalI: number = 0;
		for (let i = this.journalDiff.length - 1; i >= 0; i--) {
			finalI = i;
			const [height, diff] = this.journalDiff[i];
			if (height < this.journalHeight) {
				break;
			}

			const addressSet = diff[0];
			const slotsMap = diff[1];
			const touchedSet = diff[2];

			for (const address of addressSet) {
				if (this.journal.has(address)) {
					this.journal.delete(address);
				}
			}

			for (const [address, delSlots] of slotsMap) {
				if (this.journal.has(address)) {
					const slots = this.journal.get(address)!;
					for (const delSlot of delSlots) {
						slots.delete(delSlot);
					}
				}
			}

			for (const address of touchedSet) {
				if (address !== RIPEMD160_ADDRESS_STRING) {
					this.touched.delete(address);
				}
			}
		}

		this.journalDiff = this.journalDiff.slice(0, finalI + 1);
		this.journalHeight--;

		await this.stateManager.revert();
	}

	public cleanJournal() {
		this.journalHeight = 0;
		this.journal = new Map();
		this.alwaysWarmJournal = new Map();
		this.touched = new Set();
		this.journalDiff = [[0, [new Set(), new Map(), new Set()]]];
	}

	/**
	 * Cleans up journal state
	 */
	async cleanup(): Promise<void> {
		this.cleanJournal();
		delete this.preimages;
	}

	addAlwaysWarmAddress(addressStr: string) {
		const address = addressStr.startsWith("0x")
			? addressStr.slice(2)
			: addressStr;
		if (!this.alwaysWarmJournal.has(address)) {
			this.alwaysWarmJournal.set(address, new Set());
		}
	}

	addAlwaysWarmSlot(addressStr: string, slotStr: string) {
		const address = addressStr.startsWith("0x")
			? addressStr.slice(2)
			: addressStr;
		this.addAlwaysWarmAddress(address);
		const slotsSet = this.alwaysWarmJournal.get(address)!;
		const slot = slotStr.startsWith("0x") ? slotStr.slice(2) : slotStr;
		slotsSet.add(slot);
	}

	/**
	 * Returns true if the address is warm in the current context
	 * @param address - The address (as a Uint8Array) to check
	 */
	isWarmedAddress(address: Uint8Array): boolean {
		const addressHex = bytesToUnprefixedHex(address);
		return (
			this.journal.has(addressHex) || this.alwaysWarmJournal.has(addressHex)
		);
	}

	/**
	 * Add a warm address in the current context
	 * @param addressArr - The address (as a Uint8Array) to add
	 */
	addWarmedAddress(addressArr: Uint8Array): void {
		const address = bytesToUnprefixedHex(addressArr);
		if (!this.journal.has(address)) {
			this.journal.set(address, new Set());
			const diffArr = this.journalDiff[this.journalDiff.length - 1][1];
			diffArr[0].add(address);
		}
	}

	/**
	 * Returns true if the slot of the address is warm
	 * @param address - The address (as a Uint8Array) to check
	 * @param slot - The slot (as a Uint8Array) to check
	 */
	isWarmedStorage(address: Uint8Array, slot: Uint8Array): boolean {
		const addressHex = bytesToUnprefixedHex(address);
		const slots = this.journal.get(addressHex);
		if (slots === undefined) {
			if (this.alwaysWarmJournal.has(addressHex)) {
				return this.alwaysWarmJournal
					.get(addressHex)!
					.has(bytesToUnprefixedHex(slot));
			}
			return false;
		}
		if (slots.has(bytesToUnprefixedHex(slot))) {
			return true;
		} else if (this.alwaysWarmJournal.has(addressHex)) {
			return this.alwaysWarmJournal
				.get(addressHex)!
				.has(bytesToUnprefixedHex(slot));
		}
		return false;
	}

	/**
	 * Mark the storage slot in the address as warm in the current context
	 * @param address - The address (as a Uint8Array) to check
	 * @param slot - The slot (as a Uint8Array) to check
	 */
	addWarmedStorage(address: Uint8Array, slot: Uint8Array): void {
		const addressHex = bytesToUnprefixedHex(address);
		let slots = this.journal.get(addressHex);
		if (slots === undefined) {
			this.addWarmedAddress(address);
			slots = this.journal.get(addressHex);
		}
		const slotStr = bytesToUnprefixedHex(slot);
		if (!slots!.has(slotStr)) {
			slots!.add(slotStr);
			const diff = this.journalDiff[this.journalDiff.length - 1][1];
			const addressSlotMap = diff[1];
			if (!addressSlotMap.has(addressHex)) {
				addressSlotMap.set(addressHex, new Set());
			}
			const slotsSet = addressSlotMap.get(addressHex)!;
			slotsSet.add(slotStr);
		}
	}
}
