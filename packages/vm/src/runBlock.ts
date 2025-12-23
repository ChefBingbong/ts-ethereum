import debugDefault from 'debug'
import { runTx } from '.'
import type { Block } from '@ts-ethereum/block'
import { createBlock } from '@ts-ethereum/block'
import type { Common } from '@ts-ethereum/chain-config'
import { ConsensusType } from '@ts-ethereum/chain-config'
import type { EVMInterface } from '@ts-ethereum/evm'
import { MerklePatriciaTrie } from '@ts-ethereum/mpt'
import { RLP } from '@ts-ethereum/rlp'
import { TransactionType } from '@ts-ethereum/tx'
import type { PrefixedHexString } from '@ts-ethereum/utils'
import {
	Account,
	Address,
	BIGINT_0,
	BIGINT_8,
	bytesToHex,
	equalsBytes,
	EthereumJSErrorWithoutCode,
	intToBytes,
	KECCAK256_RLP,
	short,
} from '@ts-ethereum/utils'
import { Bloom } from './bloom'
import type {
	AfterBlockEvent,
	ApplyBlockResult,
	PostByzantiumTxReceipt,
	PreByzantiumTxReceipt,
	RunBlockOpts,
	RunBlockResult,
	RunTxResult,
	TxReceipt,
} from './types'
import type { VM } from './vm'

const debug = debugDefault('vm:block')

let enableProfiler = false
const stateRootCPLabel = 'New state root, checkpoints, block validation'
const processTxsLabel = 'Tx processing [ use per-tx profiler for more details ]'
const withdrawalsRewardsCommitLabel = 'Rewards, EVM journal commit'
const entireBlockLabel = 'Entire block'

/**
 * Run a block (Frontier/Chainstart).
 * @ignore
 */
export async function runBlock(
  vm: VM,
  opts: RunBlockOpts,
): Promise<RunBlockResult> {
  if (vm['_opts'].profilerOpts?.reportAfterBlock === true) {
    enableProfiler = true
  }
  const { skipBlockValidation } = opts
  const { generate } = opts
  let block = opts.block
  const generateFields = generate ?? false
  const stateManager = vm.stateManager

  if (enableProfiler) {
    // eslint-disable-next-line no-console
    console.time(entireBlockLabel)
    // eslint-disable-next-line no-console
    console.time(stateRootCPLabel)
  }

  /**
   * The `beforeBlock` event.
   *
   * @event Event: beforeBlock
   * @type {Object}
   * @property {Block} block emits the block that is about to be processed
   */
  await vm._emit('beforeBlock', block)

  if (vm.DEBUG) {
    debug('-'.repeat(100))
    debug(
      `Running block hash=${bytesToHex(block.hash())} number=${block.header.number}`,
    )
  }

  // Set state root if provided
  if (opts.root !== undefined) {
    if (vm.DEBUG) {
      debug(`Set provided state root ${bytesToHex(opts.root)}`)
    }
    await stateManager.setStateRoot(opts.root)
    if (opts.clearCache === true) {
      stateManager.clearCaches()
    }
  }

  // Checkpoint state
  await vm.evm.journal.checkpoint()
  if (vm.DEBUG) {
    debug(`block checkpoint`)
  }

  let result: ApplyBlockResult

  try {
    result = await applyBlock(vm, block, opts)
    if (vm.DEBUG) {
      debug(
        `Received block results gasUsed=${result.gasUsed} bloom=${short(result.bloom.bitvector)} (${
          result.bloom.bitvector.length
        } bytes) receiptsRoot=${bytesToHex(result.receiptsRoot)} receipts=${
          result.receipts.length
        } txResults=${result.results.length}`,
      )
    }
  } catch (err: any) {
    await vm.evm.journal.revert()
    if (vm.DEBUG) {
      debug(`block checkpoint reverted`)
    }
    if (enableProfiler) {
      // eslint-disable-next-line no-console
      console.timeEnd(withdrawalsRewardsCommitLabel)
    }
    throw err
  }

  // Persist state
  await vm.evm.journal.commit()
  if (vm.DEBUG) {
    debug(`block checkpoint committed`)
  }

  const stateRoot = await stateManager.getStateRoot()

  // Given the generate option, either set resulting header
  // values to the current block, or validate the resulting
  // header values against the current block.
  if (generateFields) {
    const logsBloom = result.bloom.bitvector
    const gasUsed = result.gasUsed
    const receiptTrie = result.receiptsRoot
    const transactionsTrie = await _genTxTrie(block)
    const generatedFields = {
      stateRoot,
      logsBloom,
      gasUsed,
      receiptTrie,
      transactionsTrie,
    }
    const blockData = {
      ...block,
      header: { ...block.header, ...generatedFields },
    }
    block = createBlock(blockData, { common: vm.common })
  } else {
    // Validate receipts root
    if (equalsBytes(result.receiptsRoot, block.header.receiptTrie) === false) {
      if (vm.DEBUG) {
        debug(
          `Invalid receiptTrie received=${bytesToHex(result.receiptsRoot)} expected=${bytesToHex(
            block.header.receiptTrie,
          )}`,
        )
      }
      const msg = _errorMsg('invalid receiptTrie', vm, block)
      throw EthereumJSErrorWithoutCode(msg)
    }
    if (
      !(equalsBytes(result.bloom.bitvector, block.header.logsBloom) === true)
    ) {
      if (vm.DEBUG) {
        debug(
          `Invalid bloom received=${bytesToHex(result.bloom.bitvector)} expected=${bytesToHex(
            block.header.logsBloom,
          )}`,
        )
      }
      const msg = _errorMsg('invalid bloom', vm, block)
      throw EthereumJSErrorWithoutCode(msg)
    }
    if (result.gasUsed !== block.header.gasUsed) {
      if (vm.DEBUG) {
        debug(
          `Invalid gasUsed received=${result.gasUsed} expected=${block.header.gasUsed}`,
        )
      }
      const msg = _errorMsg('invalid gasUsed', vm, block)
      throw EthereumJSErrorWithoutCode(msg)
    }
    if (!(equalsBytes(stateRoot, block.header.stateRoot) === true)) {
      if (vm.DEBUG) {
        debug(
          `Invalid stateRoot received=${bytesToHex(stateRoot)} expected=${bytesToHex(
            block.header.stateRoot,
          )}`,
        )
      }
      const msg = _errorMsg('invalid block stateRoot', vm, block)
      throw EthereumJSErrorWithoutCode(msg)
    }
  }

  if (enableProfiler) {
    // eslint-disable-next-line no-console
    console.timeEnd(withdrawalsRewardsCommitLabel)
    // eslint-disable-next-line no-console
    console.timeEnd(entireBlockLabel)
  }

  const runBlockResult: RunBlockResult = {
    receipts: result.receipts,
    logsBloom: result.bloom.bitvector,
    results: result.results,
    stateRoot,
    gasUsed: result.gasUsed,
    receiptsRoot: result.receiptsRoot,
    preimages: result.preimages,
  }

  /**
   * The `afterBlock` event
   *
   * @event Event: afterBlock
   * @type {AfterBlockEvent}
   * @property {AfterBlockEvent} result emits the results of processing a block
   */
  const event: AfterBlockEvent = { ...runBlockResult, block }
  await vm._emit('afterBlock', event)
  if (vm.DEBUG) {
    debug(
      `Finished running block hash=${bytesToHex(block.hash())} number=${block.header.number}`,
    )
  }

  return runBlockResult
}

/**
 * Apply the transactions in a block.
 */
async function applyBlock(vm: VM, block: Block, opts: RunBlockOpts) {
  if (enableProfiler) {
    // eslint-disable-next-line no-console
    console.time(stateRootCPLabel)
  }

  // Validate block
  if (opts.skipBlockValidation !== true) {
    if (block.header.gasLimit >= BigInt('0x8000000000000000')) {
      const msg = _errorMsg(
        'Invalid block with gas limit greater than (2^63 - 1)',
        vm,
        block,
      )
      throw EthereumJSErrorWithoutCode(msg)
    } else {
      if (vm.DEBUG) {
        debug(`Validate block`)
      }
      if (opts.skipHeaderValidation !== true) {
        if (typeof (vm.blockchain as any).validateHeader === 'function') {
          await (vm.blockchain as any).validateHeader(block.header)
        } else {
          throw EthereumJSErrorWithoutCode(
            'cannot validate header: blockchain has no `validateHeader` method',
          )
        }
      }
      await block.validateData(false)
    }
  }

  if (enableProfiler) {
    // eslint-disable-next-line no-console
    console.timeEnd(stateRootCPLabel)
  }

  // Apply transactions
  if (vm.DEBUG) {
    debug(`Apply transactions`)
  }

  const blockResults = await applyTransactions(vm, block, opts)

  if (enableProfiler) {
    // eslint-disable-next-line no-console
    console.time(withdrawalsRewardsCommitLabel)
  }

  // Pay ommers and miners (PoW)
  if (block.common.consensusType() === ConsensusType.ProofOfWork) {
    await assignBlockRewards(vm, block)
  }

  return blockResults
}

/**
 * Apply transactions to the current state.
 */
async function applyTransactions(vm: VM, block: Block, opts: RunBlockOpts) {
  if (enableProfiler) {
    // eslint-disable-next-line no-console
    console.time(processTxsLabel)
  }

  const bloom = new Bloom(undefined, vm.common)
  let gasUsed = BIGINT_0
  const receiptTrie =
    block.transactions.length > 0
      ? new MerklePatriciaTrie({ common: vm.common })
      : undefined
  const receipts: TxReceipt[] = []
  const txResults: RunTxResult[] = []

  for (let txIdx = 0; txIdx < block.transactions.length; txIdx++) {
    const tx = block.transactions[txIdx]

    if (vm.DEBUG) {
      debug(`Running tx index=${txIdx}`)
    }

    const txRes = await runTx(vm, {
      tx,
      block,
      blockGasUsed: gasUsed,
      skipHardForkValidation: opts.skipHardForkValidation,
      reportPreimages: opts.reportPreimages,
    })
    txResults.push(txRes)
    if (vm.DEBUG) {
      debug(`Tx run finished index=${txIdx}`)
    }

    // Add to total block gas usage
    gasUsed += txRes.totalGasSpent
    if (vm.DEBUG) {
      debug(`Add tx gas used (${txRes.totalGasSpent}) to block (-> ${gasUsed})`)
    }

    // Combine blooms via bitwise OR
    bloom.or(txRes.bloom)

    receipts.push(txRes.receipt)

    // Add receipt to trie
    const encodedReceipt = encodeReceipt(txRes.receipt, tx.type)
    await receiptTrie?.put(RLP.encode(txIdx), encodedReceipt)
  }

  if (enableProfiler) {
    // eslint-disable-next-line no-console
    console.timeEnd(processTxsLabel)
  }

  const receiptsRoot =
    receiptTrie !== undefined ? receiptTrie.root() : KECCAK256_RLP

  return {
    bloom,
    gasUsed,
    preimages: new Map<PrefixedHexString, Uint8Array>(),
    receiptsRoot,
    receipts,
    results: txResults,
  }
}

/**
 * Calculates block rewards for miner and ommers and puts
 * the updated balances of their accounts to state.
 */
async function assignBlockRewards(vm: VM, block: Block): Promise<void> {
  if (vm.DEBUG) {
    debug(`Assign block rewards`)
  }
  const minerReward = vm.common.param('minerReward')
  const ommers = block.uncleHeaders
  // Reward ommers
  for (const ommer of ommers) {
    const reward = calculateOmmerReward(
      ommer.number,
      block.header.number,
      minerReward,
    )
    const account = await rewardAccount(
      vm.evm,
      ommer.coinbase,
      reward,
      vm.common,
    )
    if (vm.DEBUG) {
      debug(
        `Add uncle reward ${reward} to account ${ommer.coinbase} (-> ${account.balance})`,
      )
    }
  }
  // Reward miner
  const reward = calculateMinerReward(minerReward, ommers.length)
  const account = await rewardAccount(
    vm.evm,
    block.header.coinbase,
    reward,
    vm.common,
  )
  if (vm.DEBUG) {
    debug(
      `Add miner reward ${reward} to account ${block.header.coinbase} (-> ${account.balance})`,
    )
  }
}

function calculateOmmerReward(
  ommerBlockNumber: bigint,
  blockNumber: bigint,
  minerReward: bigint,
): bigint {
  const heightDiff = blockNumber - ommerBlockNumber
  let reward = ((BIGINT_8 - heightDiff) * minerReward) / BIGINT_8
  if (reward < BIGINT_0) {
    reward = BIGINT_0
  }
  return reward
}

export function calculateMinerReward(
  minerReward: bigint,
  ommersNum: number,
): bigint {
  // calculate nibling reward
  const niblingReward = minerReward / BigInt(32)
  const totalNiblingReward = niblingReward * BigInt(ommersNum)
  const reward = minerReward + totalNiblingReward
  return reward
}

export async function rewardAccount(
  evm: EVMInterface,
  address: Address,
  reward: bigint,
  common: Common,
): Promise<Account> {
  let account = await evm.stateManager.getAccount(address)
  if (account === undefined) {
    account = new Account()
  }
  account.balance += reward
  await evm.journal.putAccount(address, account)
  return account
}

async function _genTxTrie(block: Block) {
  const trie = new MerklePatriciaTrie({ common: block.common })
  for (const [i, tx] of block.transactions.entries()) {
    await trie.put(RLP.encode(i), tx.serialize())
  }
  return trie.root()
}

/**
 * Encode receipt for trie.
 * Handles both Pre-Byzantium (stateRoot) and Post-Byzantium (status) receipts.
 */
export function encodeReceipt(
  receipt: TxReceipt,
  txType: TransactionType,
): Uint8Array {
  // Check for Pre-Byzantium (stateRoot) vs Post-Byzantium (status)
  const postStateOrStatus =
    'stateRoot' in receipt
      ? (receipt as PreByzantiumTxReceipt).stateRoot
      : intToBytes((receipt as PostByzantiumTxReceipt).status)

  const encoded = RLP.encode([
    postStateOrStatus,
    receipt.cumulativeBlockGasUsed,
    receipt.bitvector,
    receipt.logs,
  ])
  return encoded
}

/**
 * Internal helper function to create an annotated error message.
 */
function _errorMsg(msg: string, vm: VM, block: Block) {
  const blockErrorStr = block.errorStr()
  const errorMsg = `${msg} (${vm.errorStr()} -> ${blockErrorStr})`
  return errorMsg
}
