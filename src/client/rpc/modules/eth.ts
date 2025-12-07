import { createBlock } from '../../../block/index.ts'
import { MerkleStateManager, getMerkleStateProof } from '../../../state-manager/index.ts'
import {
  type LegacyTx,
  type TypedTransaction,
  createTx,
  createTxFromRLP,
} from '../../../tx/index.ts'
import {
  type Address,
  type PrefixedHexString,
  BIGINT_0,
  BIGINT_1,
  EthereumJSErrorWithoutCode,
  TypeOutput,
  bigIntToHex,
  bytesToHex,
  createAddressFromString,
  createZeroAddress,
  equalsBytes,
  hexToBytes,
  intToHex,
  isHexString,
  setLengthLeft,
  toType,
} from '../../../utils/index.ts'
import {
  type PostByzantiumTxReceipt,
  type PreByzantiumTxReceipt,
  type TxReceipt,
  type VM,
  runBlock,
  runTx,
} from '../../../vm/index.ts'

import { INTERNAL_ERROR, INVALID_PARAMS, PARSE_ERROR } from '../error-code.ts'
import { callWithStackTrace, getBlockByOption, toJSONRPCTx } from '../helpers.ts'
import { middleware, validators } from '../validation.ts'

import type { EthereumClient } from '../..'
import type { Block, JSONRPCBlock } from '../../../block/index.ts'
import type { Proof } from '../../../state-manager/index.ts'
import type { Chain } from '../../blockchain'
import type { ReceiptsManager } from '../../execution/receipt.ts'
import type { TxIndex } from '../../execution/txIndex.ts'
import type { EthProtocol } from '../../net/protocol'
import type { FullEthereumService, Service } from '../../service'
import type { RPCTx } from '../types.ts'

type JSONRPCReceipt = {
  transactionHash: string // DATA, 32 Bytes - hash of the transaction.
  transactionIndex: string // QUANTITY - integer of the transactions index position in the block.
  blockHash: string // DATA, 32 Bytes - hash of the block where this transaction was in.
  blockNumber: string // QUANTITY - block number where this transaction was in.
  from: string // DATA, 20 Bytes - address of the sender.
  to: string | null // DATA, 20 Bytes - address of the receiver.
  cumulativeGasUsed: string // QUANTITY  - The total amount of gas used when this transaction was executed in the block.
  effectiveGasPrice: string // QUANTITY - The final gas price per gas paid by the sender in wei.
  gasUsed: string // QUANTITY - The amount of gas used by this specific transaction alone.
  contractAddress: null // Always null - contract creation not supported
  logs: [] // Always empty - no logs in value-transfer-only mode
  logsBloom: string // DATA, 256 Bytes - Bloom filter for light clients to quickly retrieve related logs.
  // It also returns either:
  root?: string // DATA, 32 bytes of post-transaction stateroot (pre Byzantium)
  status?: string // QUANTITY, either 1 (success) or 0 (failure)
  type: string // QUANTITY, transaction type
}

/**
 * Returns block formatted to the standard JSON-RPC fields
 */
const toJSONRPCBlock = async (
  block: Block,
  chain: Chain,
  includeTransactions: boolean,
): Promise<JSONRPCBlock> => {
  const json = block.toJSON()
  const header = json!.header!
  const transactions = block.transactions.map((tx, txIndex) =>
    includeTransactions ? toJSONRPCTx(tx, block, txIndex) : bytesToHex(tx.hash()),
  )
  const td = await chain.getTd(block.hash(), block.header.number)
  return {
    number: header.number!,
    hash: bytesToHex(block.hash()),
    parentHash: header.parentHash!,
    mixHash: header.mixHash,
    nonce: header.nonce!,
    sha3Uncles: header.uncleHash!,
    logsBloom: header.logsBloom!,
    transactionsRoot: header.transactionsTrie!,
    stateRoot: header.stateRoot!,
    receiptsRoot: header.receiptTrie!,
    miner: header.coinbase!,
    difficulty: header.difficulty!,
    totalDifficulty: bigIntToHex(td),
    extraData: header.extraData!,
    size: intToHex(block.serialize().length),
    gasLimit: header.gasLimit!,
    gasUsed: header.gasUsed!,
    timestamp: header.timestamp!,
    transactions,
    uncles: block.uncleHeaders.map((uh) => bytesToHex(uh.hash())),
  }
}

/**
 * Returns receipt formatted to the standard JSON-RPC fields
 * Note: logs and contractAddress are always empty/null in value-transfer-only mode
 */
const toJSONRPCReceipt = async (
  receipt: TxReceipt,
  gasUsed: bigint,
  effectiveGasPrice: bigint,
  block: Block,
  tx: TypedTransaction,
  txIndex: number,
  _logIndex: number,
  _contractAddress?: Address,
): Promise<JSONRPCReceipt> => ({
  transactionHash: bytesToHex(tx.hash()),
  transactionIndex: intToHex(txIndex),
  blockHash: bytesToHex(block.hash()),
  blockNumber: bigIntToHex(block.header.number),
  from: tx.getSenderAddress().toString(),
  to: tx.to?.toString() ?? null,
  cumulativeGasUsed: bigIntToHex(receipt.cumulativeBlockGasUsed),
  effectiveGasPrice: bigIntToHex(effectiveGasPrice),
  gasUsed: bigIntToHex(gasUsed),
  contractAddress: null, // Always null - contract creation not supported
  logs: [], // Always empty - no logs in value-transfer-only mode
  logsBloom: bytesToHex(receipt.bitvector),
  root:
    (receipt as PreByzantiumTxReceipt).stateRoot instanceof Uint8Array
      ? bytesToHex((receipt as PreByzantiumTxReceipt).stateRoot)
      : undefined,
  status:
    (receipt as PostByzantiumTxReceipt).status !== undefined
      ? intToHex((receipt as PostByzantiumTxReceipt).status)
      : undefined,
  type: intToHex(tx.type),
})

/**
 * eth_* RPC module
 * @memberof module:rpc/modules
 */
export class Eth {
  private client: EthereumClient
  private service: Service
  private receiptsManager: ReceiptsManager | undefined
  private txIndex: TxIndex | undefined
  private _chain: Chain
  private _vm: VM | undefined
  private _rpcDebug: boolean
  public ethVersion: number

  /**
   * Create eth_* RPC module
   * @param client Client to which the module binds
   */
  constructor(client: EthereumClient, rpcDebug: boolean) {
    this.client = client
    this.service = client.service
    this._chain = this.service.chain
    this._vm = (this.service as FullEthereumService).execution?.vm
    this.receiptsManager = (this.service as FullEthereumService).execution?.receiptsManager
    this.txIndex = (this.service as FullEthereumService).execution?.txIndex
    this._rpcDebug = rpcDebug

    const ethProtocol = this.service.protocols.find((p) => p.name === 'eth') as EthProtocol
    this.ethVersion = Math.max(...ethProtocol.versions)

    this.blockNumber = callWithStackTrace(this.blockNumber.bind(this), this._rpcDebug)

    // Note: eth_call removed - smart contracts not supported

    this.chainId = callWithStackTrace(this.chainId.bind(this), this._rpcDebug)

    this.estimateGas = middleware(
      callWithStackTrace(this.estimateGas.bind(this), this._rpcDebug),
      1,
      [[validators.transaction()], [validators.blockOption]],
    )

    this.getBalance = middleware(
      callWithStackTrace(this.getBalance.bind(this), this._rpcDebug),
      2,
      [[validators.address], [validators.blockOption]],
    )

    this.coinbase = callWithStackTrace(this.coinbase.bind(this), this._rpcDebug)

    this.getBlockByNumber = middleware(
      callWithStackTrace(this.getBlockByNumber.bind(this), this._rpcDebug),
      2,
      [[validators.blockOption], [validators.bool]],
    )

    this.getBlockByHash = middleware(
      callWithStackTrace(this.getBlockByHash.bind(this), this._rpcDebug),
      2,
      [[validators.hex, validators.blockHash], [validators.bool]],
    )

    this.getBlockTransactionCountByHash = middleware(
      callWithStackTrace(this.getBlockTransactionCountByHash.bind(this), this._rpcDebug),
      1,
      [[validators.hex, validators.blockHash]],
    )

    // Note: eth_getCode removed - smart contracts not supported

    this.getUncleCountByBlockNumber = middleware(
      callWithStackTrace(this.getUncleCountByBlockNumber.bind(this), this._rpcDebug),
      1,
      [[validators.hex]],
    )

    // Note: eth_getStorageAt removed - smart contracts not supported

    this.getTransactionByBlockHashAndIndex = middleware(
      callWithStackTrace(this.getTransactionByBlockHashAndIndex.bind(this), this._rpcDebug),
      2,
      [[validators.hex, validators.blockHash], [validators.hex]],
    )

    this.getTransactionByBlockNumberAndIndex = middleware(
      callWithStackTrace(this.getTransactionByBlockNumberAndIndex.bind(this), this._rpcDebug),
      2,
      [[validators.hex, validators.blockOption], [validators.hex]],
    )

    this.getTransactionByHash = middleware(
      callWithStackTrace(this.getTransactionByHash.bind(this), this._rpcDebug),
      1,
      [[validators.hex]],
    )

    this.getTransactionCount = middleware(
      callWithStackTrace(this.getTransactionCount.bind(this), this._rpcDebug),
      2,
      [[validators.address], [validators.blockOption]],
    )

    this.getBlockReceipts = middleware(
      callWithStackTrace(this.getBlockReceipts.bind(this), this._rpcDebug),
      1,
      [[validators.blockOption]],
    )
    this.getTransactionReceipt = middleware(
      callWithStackTrace(this.getTransactionReceipt.bind(this), this._rpcDebug),
      1,
      [[validators.hex]],
    )

    this.getUncleCountByBlockNumber = middleware(
      callWithStackTrace(this.getUncleCountByBlockNumber.bind(this), this._rpcDebug),
      1,
      [[validators.hex]],
    )

    // Note: eth_getLogs removed - smart contracts not supported

    this.sendRawTransaction = middleware(
      callWithStackTrace(this.sendRawTransaction.bind(this), this._rpcDebug),
      1,
      [[validators.hex]],
    )

    this.protocolVersion = callWithStackTrace(this.protocolVersion.bind(this), this._rpcDebug)

    this.syncing = callWithStackTrace(this.syncing.bind(this), this._rpcDebug)

    this.getProof = middleware(callWithStackTrace(this.getProof.bind(this), this._rpcDebug), 3, [
      [validators.address],
      [validators.array(validators.hex)],
      [validators.blockOption],
    ])

    this.getBlockTransactionCountByNumber = middleware(
      callWithStackTrace(this.getBlockTransactionCountByNumber.bind(this), this._rpcDebug),
      1,
      [[validators.blockOption]],
    )

    this.gasPrice = callWithStackTrace(this.gasPrice.bind(this), this._rpcDebug)
  }

  /**
   * Returns number of the most recent block.
   */
  async blockNumber() {
    return bigIntToHex(this._chain.headers.latest?.number ?? BIGINT_0)
  }

  /**
   * Returns the currently configured chain id, a value used in replay-protected transaction signing as introduced by EIP-155.
   * @returns The chain ID.
   */
  async chainId() {
    const chainId = this._chain.config.chainCommon.chainId()
    return bigIntToHex(chainId)
  }

  /**
   * Generates and returns an estimate of how much gas is necessary to allow the transaction to complete.
   * The transaction will not be added to the blockchain.
   * Note that the estimate may be significantly more than the amount of gas actually used by the transaction,
   * for a variety of reasons including EVM mechanics and node performance.
   * @param params An array of two parameters:
   *   1. The transaction object
   *       * from (optional) - The address the transaction is sent from
   *       * to - The address the transaction is directed to
   *       * gas (optional) - Integer of the gas provided for the transaction execution
   *       * gasPrice (optional) - Integer of the gasPrice used for each paid gas
   *       * value (optional) - Integer of the value sent with this transaction
   *       * data (optional) - Hash of the method signature and encoded parameters.
   *   2. integer block number, or the string "latest", "earliest" or "pending" (optional)
   * @returns The amount of gas used.
   */
  async estimateGas(params: [RPCTx, string?]) {
    const [transaction, blockOpt] = params
    const block = await getBlockByOption(blockOpt ?? 'latest', this._chain)

    if (this._vm === undefined) {
      throw EthereumJSErrorWithoutCode('missing vm')
    }
    const vm = await this._vm.shallowCopy()
    await vm.stateManager.setStateRoot(block.header.stateRoot)

    if (transaction.gas === undefined) {
      // If no gas limit is specified use the last block gas limit as an upper bound.
      const latest = await this._chain.getCanonicalHeadHeader()
      transaction.gas = latest.gasLimit as any
    }

    const txData = {
      ...transaction,
      gasLimit: transaction.gas,
    }

    const blockToRunOn = createBlock(
      {
        header: {
          parentHash: block.hash(),
          number: block.header.number + BIGINT_1,
          timestamp: block.header.timestamp + BIGINT_1,
        },
      },
      { common: vm.common },
    )

    const tx = createTx(txData, { common: vm.common, freeze: false })

    // set from address
    const from =
      transaction.from !== undefined
        ? createAddressFromString(transaction.from)
        : createZeroAddress()
    tx.getSenderAddress = () => {
      return from
    }

    const { totalGasSpent } = await runTx(vm, {
      tx,
      skipNonce: true,
      skipBalance: true,
      skipBlockGasLimitValidation: true,
      block: blockToRunOn,
    })
    return `0x${totalGasSpent.toString(16)}`
  }

  /**
   * Returns the balance of the account at the given address.
   * @param params An array of two parameters:
   *   1. address of the account
   *   2. integer block number, or the string "latest", "earliest" or "pending"
   */
  async getBalance(params: [string, string]) {
    const [addressHex, blockOpt] = params
    const address = createAddressFromString(addressHex)
    const block = await getBlockByOption(blockOpt, this._chain)

    if (this._vm === undefined) {
      throw EthereumJSErrorWithoutCode('missing vm')
    }

    const vm = await this._vm.shallowCopy()
    await vm.stateManager.setStateRoot(block.header.stateRoot)
    const account = await vm.stateManager.getAccount(address)
    if (account === undefined) {
      return '0x0'
    }
    return bigIntToHex(account.balance)
  }

  /**
   * Returns the currently configured coinbase address.
   * @returns The chain ID.
   */
  async coinbase() {
    const cb = this.client.config.minerCoinbase
    if (cb === undefined) {
      throw {
        code: INTERNAL_ERROR,
        message: 'Coinbase must be explicitly specified',
      }
    }
    return cb.toString()
  }

  /**
   * Returns information about a block by hash.
   * @param params An array of two parameters:
   *   1. a block hash
   *   2. boolean - if true returns the full transaction objects, if false only the hashes of the transactions.
   */
  async getBlockByHash(params: [PrefixedHexString, boolean]) {
    const [blockHash, includeTransactions] = params

    try {
      const block = await this._chain.getBlock(hexToBytes(blockHash))
      return await toJSONRPCBlock(block, this._chain, includeTransactions)
    } catch {
      return null
    }
  }

  /**
   * Returns information about a block by block number.
   * @param params An array of two parameters:
   *   1. integer of a block number, or the string "latest", "earliest" or "pending"
   *   2. boolean - if true returns the full transaction objects, if false only the hashes of the transactions.
   */
  async getBlockByNumber(params: [string, boolean]) {
    const [blockOpt, includeTransactions] = params
    if (blockOpt === 'pending') {
      throw {
        code: INVALID_PARAMS,
        message: `"pending" is not yet supported`,
      }
    }
    try {
      const block = await getBlockByOption(blockOpt, this._chain)
      const response = await toJSONRPCBlock(block, this._chain, includeTransactions)
      return response
    } catch {
      return null
    }
  }

  /**
   * Returns the transaction count for a block given by the block hash.
   * @param params An array of one parameter: A block hash
   */
  async getBlockTransactionCountByHash(params: [PrefixedHexString]) {
    const [blockHash] = params
    try {
      const block = await this._chain.getBlock(hexToBytes(blockHash))
      return intToHex(block.transactions.length)
    } catch {
      throw {
        code: INVALID_PARAMS,
        message: 'Unknown block',
      }
    }
  }

  /**
   * Returns information about a transaction given a block hash and a transaction's index position.
   * @param params An array of two parameter:
   *   1. a block hash
   *   2. an integer of the transaction index position encoded as a hexadecimal.
   */
  async getTransactionByBlockHashAndIndex(params: [PrefixedHexString, string]) {
    try {
      const [blockHash, txIndexHex] = params
      const txIndex = parseInt(txIndexHex, 16)
      const block = await this._chain.getBlock(hexToBytes(blockHash))
      if (block.transactions.length <= txIndex) {
        return null
      }

      const tx = block.transactions[txIndex]
      return toJSONRPCTx(tx, block, txIndex)
    } catch (error: any) {
      throw {
        code: INVALID_PARAMS,
        message: error.message.toString(),
      }
    }
  }

  /**
   * Returns information about a transaction given a block hash and a transaction's index position.
   * @param params An array of two parameter:
   *   1. a block number
   *   2. an integer of the transaction index position encoded as a hexadecimal.
   */
  async getTransactionByBlockNumberAndIndex(params: [PrefixedHexString, string]) {
    try {
      const [blockNumber, txIndexHex] = params
      const txIndex = parseInt(txIndexHex, 16)
      const block = await getBlockByOption(blockNumber, this._chain)
      if (block.transactions.length <= txIndex) {
        return null
      }

      const tx = block.transactions[txIndex]
      return toJSONRPCTx(tx, block, txIndex)
    } catch (error: any) {
      throw {
        code: INVALID_PARAMS,
        message: error.message.toString(),
      }
    }
  }

  /**
   * Returns the transaction by hash when available within `--txLookupLimit`
   * @param params An array of one parameter:
   *   1. hash of the transaction
   */
  async getTransactionByHash(params: [PrefixedHexString]) {
    const [txHash] = params
    if (!this.receiptsManager) throw EthereumJSErrorWithoutCode('missing receiptsManager')
    if (!this.txIndex) throw EthereumJSErrorWithoutCode('missing txIndex')
    const txHashIndex = await this.txIndex.getIndex(hexToBytes(txHash))
    if (!txHashIndex) return null
    const [blockHash, txIndex] = txHashIndex
    const block = await this._chain.getBlock(blockHash)
    const tx = block.transactions[txIndex]
    return toJSONRPCTx(tx, block, txIndex)
  }

  /**
   * Returns the number of transactions sent from an address.
   * @param params An array of two parameters:
   *   1. address of the account
   *   2. integer block number, or the string "latest", "earliest" or "pending"
   */
  async getTransactionCount(params: [string, string]) {
    const [addressHex, blockOpt] = params
    let block
    if (blockOpt !== 'pending') block = await getBlockByOption(blockOpt, this._chain)
    else block = await getBlockByOption('latest', this._chain)

    if (this._vm === undefined) {
      throw EthereumJSErrorWithoutCode('missing vm')
    }

    const vm = await this._vm.shallowCopy()
    await vm.stateManager.setStateRoot(block.header.stateRoot)

    const address = createAddressFromString(addressHex)
    const account = await vm.stateManager.getAccount(address)
    if (account === undefined) {
      return '0x0'
    }

    let pendingTxsCount = BIGINT_0

    // Add pending txns to nonce if blockOpt is 'pending'
    if (blockOpt === 'pending') {
      pendingTxsCount = BigInt(
        (this.service as FullEthereumService).txPool.pool.get(addressHex.slice(2))?.length ?? 0,
      )
    }
    return bigIntToHex(account.nonce + pendingTxsCount)
  }

  /**
   * Returns the current ethereum protocol version as a hex-encoded string
   */
  protocolVersion() {
    return intToHex(this.ethVersion)
  }

  /**
   * Returns the number of uncles in a block from a block matching the given block number
   * @param params An array of one parameter:
   *   1: hexadecimal representation of a block number
   */
  async getUncleCountByBlockNumber(params: [string]) {
    const [blockNumberHex] = params
    const blockNumber = BigInt(blockNumberHex)
    const latest =
      this._chain.headers.latest?.number ?? (await this._chain.getCanonicalHeadHeader()).number

    if (blockNumber > latest) {
      throw {
        code: INVALID_PARAMS,
        message: 'specified block greater than current height',
      }
    }

    const block = await this._chain.getBlock(blockNumber)
    return block.uncleHeaders.length
  }

  async getBlockReceipts(params: [string]) {
    const [blockOpt] = params
    let block: Block
    try {
      if (isHexString(blockOpt, 64)) {
        block = await this._chain.getBlock(hexToBytes(blockOpt))
      } else {
        block = await getBlockByOption(blockOpt, this._chain)
      }
    } catch {
      return null
    }
    const blockHash = block.hash()
    if (!this.receiptsManager) throw EthereumJSErrorWithoutCode('missing receiptsManager')
    const result = await this.receiptsManager.getReceipts(blockHash, true, true)
    if (result.length === 0) return []
    const parentBlock = await this._chain.getBlock(block.header.parentHash)
    const vmCopy = await this._vm!.shallowCopy()
    vmCopy.common.setHardfork(block.common.hardfork())
    // Run tx through copied vm to get tx gasUsed
    const runBlockResult = await runBlock(vmCopy, {
      block,
      root: parentBlock.header.stateRoot,
      skipBlockValidation: true,
    })

    const receipts = await Promise.all(
      result.map(async (r, i) => {
        const tx = block.transactions[i]
        const { totalGasSpent } = runBlockResult.results[i]
        const effectiveGasPrice = (tx as LegacyTx).gasPrice

        // No createdAddress - contract creation not supported
        return toJSONRPCReceipt(
          r,
          totalGasSpent,
          effectiveGasPrice,
          block,
          tx,
          i,
          i,
          undefined,
        )
      }),
    )
    return receipts
  }

  /**
   * Returns the receipt of a transaction by transaction hash.
   * *Note* That the receipt is not available for pending transactions.
   * Only available with `--saveReceipts` enabled
   * Will return empty if tx is past set `--txLookupLimit`
   * (default = 2350000 = about one year, 0 = entire chain)
   * @param params An array of one parameter:
   *  1: Transaction hash
   */
  async getTransactionReceipt(params: [PrefixedHexString]) {
    const [txHash] = params

    if (!this.receiptsManager) throw EthereumJSErrorWithoutCode('missing receiptsManager')
    if (!this.txIndex) throw EthereumJSErrorWithoutCode('missing txIndex')
    const txHashIndex = await this.txIndex.getIndex(hexToBytes(txHash))
    if (!txHashIndex) return null
    const result = await this.receiptsManager.getReceiptByTxHashIndex(txHashIndex)
    if (!result) return null
    const [receipt, blockHash, txIndex, logIndex] = result
    const block = await this._chain.getBlock(blockHash)
    // Check if block is in canonical chain
    const blockByNumber = await this._chain.getBlock(block.header.number)
    if (!equalsBytes(blockByNumber.hash(), block.hash())) {
      return null
    }

    const parentBlock = await this._chain.getBlock(block.header.parentHash)
    const tx = block.transactions[txIndex]
    const effectiveGasPrice = (tx as LegacyTx).gasPrice

    const vmCopy = await this._vm!.shallowCopy()
    vmCopy.common.setHardfork(tx.common.hardfork())
    // Run tx through copied vm to get tx gasUsed
    const runBlockResult = await runBlock(vmCopy, {
      block,
      root: parentBlock.header.stateRoot,
      skipBlockValidation: true,
    })

    const { totalGasSpent } = runBlockResult.results[txIndex]
    // No createdAddress - contract creation not supported
    return toJSONRPCReceipt(
      receipt,
      totalGasSpent,
      effectiveGasPrice,
      block,
      tx,
      txIndex,
      logIndex,
      undefined,
    )
  }

  /**
   * Creates new message call transaction or a contract creation for signed transactions.
   * @param params An array of one parameter:
   *   1. the signed transaction data
   * @returns a 32-byte tx hash or the zero hash if the tx is not yet available.
   */
  async sendRawTransaction(params: [PrefixedHexString]) {
    const [serializedTx] = params

    const { syncTargetHeight } = this.client.config
    if (!this.client.config.synchronized) {
      throw {
        code: INTERNAL_ERROR,
        message: `client is not aware of the current chain height yet (give sync some more time)`,
      }
    }
    const common = this.client.config.chainCommon.copy()

    let tx
    try {
      const txBuf = hexToBytes(serializedTx)
      tx = createTxFromRLP(txBuf, { common })
    } catch (e: any) {
      throw {
        code: PARSE_ERROR,
        message: `serialized tx data could not be parsed (${e.message})`,
      }
    }

    if (!tx.isSigned()) {
      throw {
        code: INVALID_PARAMS,
        message: `tx needs to be signed`,
      }
    }

    // Add the tx to own tx pool
    const { txPool, pool } = this.service as FullEthereumService

    try {
      await txPool.add(tx, true)
      txPool.sendNewTxHashes([[tx.type], [tx.serialize().byteLength], [tx.hash()]], pool.peers)
    } catch (error: any) {
      throw {
        code: INVALID_PARAMS,
        message: error.message ?? error.toString(),
      }
    }

    const peerPool = this.service.pool
    if (
      peerPool.peers.length === 0 &&
      !this.client.config.mine &&
      this.client.config.isSingleNode === false
    ) {
      throw {
        code: INTERNAL_ERROR,
        message: `no peer connection available`,
      }
    }
    txPool.sendTransactions([tx], peerPool.peers)

    return bytesToHex(tx.hash())
  }

  /**
   * Returns an account object along with data about the proof.
   * @param params An array of three parameters:
   *   1. address of the account
   *   2. array of storage keys which should be proofed and included
   *   3. integer block number, or the string "latest" or "earliest"
   * @returns The {@link Proof}
   */
  async getProof(
    params: [PrefixedHexString, PrefixedHexString[], PrefixedHexString],
  ): Promise<Proof> {
    const [addressHex, slotsHex, blockOpt] = params
    const block = await getBlockByOption(blockOpt, this._chain)

    if (this._vm === undefined) {
      throw EthereumJSErrorWithoutCode('missing vm')
    }

    const vm = await this._vm.shallowCopy()

    await vm.stateManager.setStateRoot(block.header.stateRoot)

    const address = createAddressFromString(addressHex)
    const slots = slotsHex.map((slotHex) => setLengthLeft(hexToBytes(slotHex), 32))
    let proof: Proof
    if (vm.stateManager instanceof MerkleStateManager) {
      proof = await getMerkleStateProof(vm.stateManager, address, slots)
    } else {
      throw EthereumJSErrorWithoutCode(
        'getProof RPC method not supported with the StateManager provided',
      )
    }

    for (const p of proof.storageProof) {
      p.key = bigIntToHex(BigInt(p.key))
    }
    return proof
  }

  /**
   * Returns an object with data about the sync status or false.
   * @returns An object with sync status data or false (when not syncing)
   *   * startingBlock - The block at which the import started (will only be reset after the sync reached his head)
   *   * currentBlock - The current block, same as eth_blockNumber
   *   * highestBlock - The estimated highest block
   */
  async syncing() {
    if (this.client.config.synchronized) {
      return false
    }

    const currentBlockHeader =
      this._chain.headers?.latest ?? (await this._chain.getCanonicalHeadHeader())
    const currentBlock = bigIntToHex(currentBlockHeader.number)

    const synchronizer = this.client.service!.synchronizer
    if (!synchronizer) {
      return false
    }
    const { syncTargetHeight } = this.client.config
    const startingBlock = bigIntToHex(synchronizer.startingBlock)

    let highestBlock
    if (typeof syncTargetHeight === 'bigint' && syncTargetHeight !== BIGINT_0) {
      highestBlock = bigIntToHex(syncTargetHeight)
    } else {
      const bestPeer = await synchronizer.best()
      if (!bestPeer) {
        throw {
          code: INTERNAL_ERROR,
          message: `no peer available for synchronization`,
        }
      }
      const highestBlockHeader = await bestPeer.latest()
      if (!highestBlockHeader) {
        throw {
          code: INTERNAL_ERROR,
          message: `highest block header unavailable`,
        }
      }
      highestBlock = bigIntToHex(highestBlockHeader.number)
    }

    return { startingBlock, currentBlock, highestBlock }
  }

  /**
   * Returns the transaction count for a block given by the block number.
   * @param params An array of one parameter:
   *  1. integer of a block number, or the string "latest", "earliest" or "pending"
   */
  async getBlockTransactionCountByNumber(params: [string]) {
    const [blockOpt] = params
    const block = await getBlockByOption(blockOpt, this._chain)
    return intToHex(block.transactions.length)
  }

  /**
   * Gas price oracle.
   *
   * Returns a suggested gas price.
   * @returns a hex code of an integer representing the suggested gas price in wei.
   */
  async gasPrice() {
    const minGasPrice = BIGINT_0
    let gasPrice = BIGINT_0
    const latest = await this._chain.getCanonicalHeadHeader()

    // For PoW chains, iterate over the last 20 blocks to get an average gas price
    const blockIterations = 20 < latest.number ? 20 : latest.number
    let txCount = BIGINT_0
    for (let i = 0; i < blockIterations; i++) {
      const block = await this._chain.getBlock(latest.number - BigInt(i))
      if (block.transactions.length === 0) {
        continue
      }

      for (const tx of block.transactions) {
        const txGasPrice = (tx as LegacyTx).gasPrice
        gasPrice += txGasPrice
        txCount++
      }
    }

    if (txCount > 0) {
      const avgGasPrice = gasPrice / txCount
      gasPrice = avgGasPrice > minGasPrice ? avgGasPrice : minGasPrice
    } else {
      gasPrice = minGasPrice
    }

    return bigIntToHex(gasPrice)
  }
}
