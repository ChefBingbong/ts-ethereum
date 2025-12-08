import { createBlock, genTransactionsTrieRoot } from "../block";
import { ConsensusType } from "../chain-config";
import { MerklePatriciaTrie } from "../mpt";
import * as RLP from "../rlp";
import {
	Address,
	BIGINT_0,
	BIGINT_1,
	EthereumJSErrorWithoutCode,
	KECCAK256_RLP,
	TypeOutput,
	createZeroAddress,
	toBytes,
	toType,
} from "../utils";

import { runTx } from ".";
import { Bloom } from "./bloom";
import {
	calculateMinerReward,
	encodeReceipt,
	rewardAccount,
} from "./runBlock.ts";

import type { Block, HeaderData } from "../block";
import type { TypedTransaction } from "../tx";
import type {
	BuildBlockOpts,
	BuilderOpts,
	RunTxResult,
	SealBlockOpts,
} from "./types.ts";
import type { VM } from "./vm.ts";

export type BuildStatus = (typeof BuildStatus)[keyof typeof BuildStatus];
export const BuildStatus = {
	Reverted: "reverted",
	Build: "build",
	Pending: "pending",
} as const;

type BlockStatus =
	| { status: typeof BuildStatus.Pending | typeof BuildStatus.Reverted }
	| { status: typeof BuildStatus.Build; block: Block };

export class BlockBuilder {
	/**
	 * The cumulative gas used by the transactions added to the block.
	 */
	gasUsed = BIGINT_0;
	/**
	 * Value of the block, represented by the final transaction fees
	 * accruing to the miner.
	 */
	private _minerValue = BIGINT_0;

	private readonly vm: VM;
	private blockOpts: BuilderOpts;
	private headerData: HeaderData;
	private transactions: TypedTransaction[] = [];
	private transactionResults: RunTxResult[] = [];
	private checkpointed = false;
	private blockStatus: BlockStatus = { status: BuildStatus.Pending };

	get transactionReceipts() {
		return this.transactionResults.map((result) => result.receipt);
	}

	get minerValue() {
		return this._minerValue;
	}

	constructor(vm: VM, opts: BuildBlockOpts) {
		this.vm = vm;
		this.blockOpts = {
			putBlockIntoBlockchain: true,
			common: this.vm.common,
			...opts.blockOpts,
		};

		this.headerData = {
			...opts.headerData,
			parentHash: opts.headerData?.parentHash ?? opts.parentBlock.hash(),
			number:
				opts.headerData?.number ?? opts.parentBlock.header.number + BIGINT_1,
			gasLimit: opts.headerData?.gasLimit ?? opts.parentBlock.header.gasLimit,
			timestamp: opts.headerData?.timestamp ?? Math.round(Date.now() / 1000),
		};

		// Frontier/Chainstart - no EIP-1559 base fee, no EIP-4844 blob gas
	}

	/**
	 * Throws if the block has already been built or reverted.
	 */
	private checkStatus() {
		if (this.blockStatus.status === BuildStatus.Build) {
			throw EthereumJSErrorWithoutCode("Block has already been built");
		}
		if (this.blockStatus.status === BuildStatus.Reverted) {
			throw EthereumJSErrorWithoutCode("State has already been reverted");
		}
	}

	public getStatus(): BlockStatus {
		return this.blockStatus;
	}

	/**
	 * Calculates and returns the transactionsTrie for the block.
	 */
	public async transactionsTrie() {
		return genTransactionsTrieRoot(
			this.transactions,
			new MerklePatriciaTrie({ common: this.vm.common }),
		);
	}

	/**
	 * Calculates and returns the logs bloom for the block.
	 */
	public logsBloom() {
		const bloom = new Bloom(undefined, this.vm.common);
		for (const txResult of this.transactionResults) {
			// Combine blooms via bitwise OR
			bloom.or(txResult.bloom);
		}
		return bloom.bitvector;
	}

	/**
	 * Calculates and returns the receiptTrie for the block.
	 */
	public async receiptTrie() {
		if (this.transactionResults.length === 0) {
			return KECCAK256_RLP;
		}
		const receiptTrie = new MerklePatriciaTrie({ common: this.vm.common });
		for (const [i, txResult] of this.transactionResults.entries()) {
			const tx = this.transactions[i];
			const encodedReceipt = encodeReceipt(txResult.receipt, tx.type);
			await receiptTrie.put(RLP.encode(i), encodedReceipt);
		}
		return receiptTrie.root();
	}

	/**
	 * Adds the block miner reward to the coinbase account.
	 */
	private async rewardMiner() {
		const minerReward = this.vm.common.param("minerReward");
		const reward = calculateMinerReward(minerReward, 0);
		const coinbase =
			this.headerData.coinbase !== undefined
				? new Address(toBytes(this.headerData.coinbase))
				: createZeroAddress();
		await rewardAccount(this.vm.evm, coinbase, reward, this.vm.common);
	}

	/**
	 * Run and add a transaction to the block being built.
	 * Please note that this modifies the state of the VM.
	 * Throws if the transaction's gasLimit is greater than
	 * the remaining gas in the block.
	 */
	async addTransaction(
		tx: TypedTransaction,
		{ skipHardForkValidation }: { skipHardForkValidation?: boolean } = {},
	) {
		this.checkStatus();

		if (!this.checkpointed) {
			await this.vm.evm.journal.checkpoint();
			this.checkpointed = true;
		}

		// According to the Yellow Paper, a transaction's gas limit
		// cannot be greater than the remaining gas in the block
		const blockGasLimit = toType(this.headerData.gasLimit, TypeOutput.BigInt);

		const blockGasRemaining = blockGasLimit - this.gasUsed;
		if (tx.gasLimit > blockGasRemaining) {
			throw EthereumJSErrorWithoutCode(
				"tx has a higher gas limit than the remaining gas in the block",
			);
		}

		const header = {
			...this.headerData,
			gasUsed: this.gasUsed,
		};

		const blockData = { header, transactions: this.transactions };
		const block = createBlock(blockData, this.blockOpts);

		const result = await runTx(this.vm, { tx, block, skipHardForkValidation });

		this.transactions.push(tx);
		this.transactionResults.push(result);
		this.gasUsed += result.totalGasSpent;
		this._minerValue += result.minerValue;

		return result;
	}

	/**
	 * Reverts the checkpoint on the StateManager to reset the state from any transactions that have been run.
	 */
	async revert() {
		if (this.checkpointed) {
			await this.vm.evm.journal.revert();
			this.checkpointed = false;
		}
		this.blockStatus = { status: BuildStatus.Reverted };
	}

	/**
	 * This method constructs the finalized block.
	 * It also:
	 *  - Assigns the reward for miner (PoW)
	 *  - Commits the checkpoint on the StateManager
	 *  - Sets the tip of the VM's blockchain to this block
	 * For PoW, optionally seals the block with params `nonce` and `mixHash`,
	 * which is validated along with the block number and difficulty by ethash.
	 */
	async build(sealOpts?: SealBlockOpts) {
		this.checkStatus();
		const blockOpts = this.blockOpts;
		const consensusType = this.vm.common.consensusType();

		if (consensusType === ConsensusType.ProofOfWork) {
			await this.rewardMiner();
		}

		const transactionsTrie = await this.transactionsTrie();
		const receiptTrie = await this.receiptTrie();
		const logsBloom = this.logsBloom();
		const gasUsed = this.gasUsed;
		// timestamp should already be set in constructor
		const timestamp = this.headerData.timestamp ?? BIGINT_0;

		// get stateRoot after all the processing
		const stateRoot = await this.vm.stateManager.getStateRoot();
		const headerData = {
			...this.headerData,
			stateRoot,
			transactionsTrie,
			receiptTrie,
			logsBloom,
			gasUsed,
			timestamp,
		};

		// PoW - allow setting nonce and mixHash for sealing
		if (consensusType === ConsensusType.ProofOfWork) {
			headerData.nonce = sealOpts?.nonce ?? headerData.nonce;
			headerData.mixHash = sealOpts?.mixHash ?? headerData.mixHash;
		}

		const blockData = {
			header: headerData,
			transactions: this.transactions,
		};

		const block = createBlock(blockData, blockOpts);

		if (this.blockOpts.putBlockIntoBlockchain === true) {
			await this.vm.blockchain.putBlock(block);
		}

		this.blockStatus = { status: BuildStatus.Build, block };
		if (this.checkpointed) {
			await this.vm.evm.journal.commit();
			this.checkpointed = false;
		}

		return { block };
	}

	async initState() {
		// Frontier/Chainstart - no special state initialization needed
	}
}

/**
 * Build a block on top of the current state
 * by adding one transaction at a time.
 *
 * Creates a checkpoint on the StateManager and modifies the state
 * as transactions are run. The checkpoint is committed on {@link BlockBuilder.build}
 * or discarded with {@link BlockBuilder.revert}.
 *
 * @param {VM} vm
 * @param {BuildBlockOpts} opts
 * @returns An instance of {@link BlockBuilder} with methods:
 * - {@link BlockBuilder.addTransaction}
 * - {@link BlockBuilder.build}
 * - {@link BlockBuilder.revert}
 */
export async function buildBlock(
	vm: VM,
	opts: BuildBlockOpts,
): Promise<BlockBuilder> {
	const blockBuilder = new BlockBuilder(vm, opts);
	await blockBuilder.initState();
	return blockBuilder;
}
