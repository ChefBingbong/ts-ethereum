/**
 * Block opcode handlers
 * BLOCKHASH, COINBASE, TIMESTAMP, NUMBER, DIFFICULTY/PREVRANDAO,
 * GASLIMIT, CHAINID, SELFBALANCE, BASEFEE, BLOBHASH, BLOBBASEFEE
 */
import type { HardforkManager } from '@ts-ethereum/chain-config'
import {
  Address,
  BIGINT_0,
  BIGINT_256,
  bigIntToAddressBytes,
  bigIntToBytes,
  bytesToBigInt,
  setLengthLeft,
} from '@ts-ethereum/utils'
import type { RunState } from '../../interpreter'
import { Op } from '../constants'
import type { ExecuteFunc } from '../types'

/**
 * BLOCKHASH - Get the hash of one of the 256 most recent complete blocks
 * Stack: [number] -> [hash]
 */
export const opBlockhash: ExecuteFunc = async (
  runState: RunState,
  common: HardforkManager,
) => {
  const number = runState.stack.pop()

  const hardfork = runState.interpreter.fork
  if (common.isEIPActiveAtHardfork(7709, hardfork)) {
    if (number >= runState.interpreter.getBlockNumber()) {
      runState.stack.push(BIGINT_0)
      return
    }

    const diff = runState.interpreter.getBlockNumber() - number
    // block lookups must be within the original window even if historyStorageAddress's
    // historyServeWindow is much greater than 256
    if (diff > BIGINT_256 || diff <= BIGINT_0) {
      runState.stack.push(BIGINT_0)
      return
    }

    const eip2935Hardfork = common.getHardforkForEIP(2935) ?? hardfork
    const historyAddress = new Address(
      bigIntToAddressBytes(
        common.getParamAtHardfork('historyStorageAddress', eip2935Hardfork)!,
      ),
    )
    const historyServeWindow = common.getParamAtHardfork(
      'historyServeWindow',
      eip2935Hardfork,
    )!
    const key = setLengthLeft(bigIntToBytes(number % historyServeWindow), 32)

    if (common.isEIPActiveAtHardfork(6800, hardfork)) {
      // create witnesses and charge gas
      const statelessGas = runState.env.accessWitness!.readAccountStorage(
        historyAddress,
        number,
      )
      runState.interpreter.useGas(statelessGas, `BLOCKHASH`)
    }
    const storage = await runState.stateManager.getStorage(historyAddress, key)

    runState.stack.push(bytesToBigInt(storage))
  } else {
    const diff = runState.interpreter.getBlockNumber() - number
    // block lookups must be within the past 256 blocks
    if (diff > BIGINT_256 || diff <= BIGINT_0) {
      runState.stack.push(BIGINT_0)
      return
    }

    const block = await runState.blockchain.getBlock(Number(number))

    runState.stack.push(bytesToBigInt(block.hash()))
  }
}

/**
 * COINBASE - Get the block's beneficiary address
 * Stack: [] -> [address]
 */
export const opCoinbase: ExecuteFunc = (runState: RunState) => {
  runState.stack.push(runState.interpreter.getBlockCoinbase())
}

/**
 * TIMESTAMP - Get the block's timestamp
 * Stack: [] -> [timestamp]
 */
export const opTimestamp: ExecuteFunc = (runState: RunState) => {
  runState.stack.push(runState.interpreter.getBlockTimestamp())
}

/**
 * NUMBER - Get the block's number
 * Stack: [] -> [number]
 */
export const opNumber: ExecuteFunc = (runState: RunState) => {
  runState.stack.push(runState.interpreter.getBlockNumber())
}

/**
 * DIFFICULTY / PREVRANDAO - Get the block's difficulty or prevrandao
 * Stack: [] -> [difficulty/prevrandao]
 * Post-Paris (EIP-4399): Returns PREVRANDAO instead of DIFFICULTY
 */
export const opDifficulty: ExecuteFunc = (
  runState: RunState,
  common: HardforkManager,
) => {
  const hardfork = runState.interpreter.fork
  if (common.isEIPActiveAtHardfork(4399, hardfork)) {
    runState.stack.push(runState.interpreter.getBlockPrevRandao())
  } else {
    runState.stack.push(runState.interpreter.getBlockDifficulty())
  }
}

/**
 * GASLIMIT - Get the block's gas limit
 * Stack: [] -> [gasLimit]
 */
export const opGaslimit: ExecuteFunc = (runState: RunState) => {
  runState.stack.push(runState.interpreter.getBlockGasLimit())
}

/**
 * CHAINID - Get the chain ID (EIP-1344)
 * Stack: [] -> [chainId]
 */
export const opChainid: ExecuteFunc = (runState: RunState) => {
  runState.stack.push(runState.interpreter.getChainId())
}

/**
 * SELFBALANCE - Get balance of currently executing account (EIP-1884)
 * Stack: [] -> [balance]
 */
export const opSelfbalance: ExecuteFunc = (runState: RunState) => {
  runState.stack.push(runState.interpreter.getSelfBalance())
}

/**
 * BASEFEE - Get the base fee (EIP-3198)
 * Stack: [] -> [baseFee]
 */
export const opBasefee: ExecuteFunc = (runState: RunState) => {
  runState.stack.push(runState.interpreter.getBlockBaseFee())
}

/**
 * BLOBHASH - Get versioned blob hash (EIP-4844)
 * Stack: [index] -> [hash]
 */
export const opBlobhash: ExecuteFunc = (runState: RunState) => {
  const index = runState.stack.pop()
  if (runState.env.blobVersionedHashes.length > Number(index)) {
    runState.stack.push(BigInt(runState.env.blobVersionedHashes[Number(index)]))
  } else {
    runState.stack.push(BIGINT_0)
  }
}

/**
 * BLOBBASEFEE - Get the blob base fee (EIP-7516)
 * Stack: [] -> [blobBaseFee]
 */
export const opBlobbasefee: ExecuteFunc = (runState: RunState) => {
  runState.stack.push(runState.interpreter.getBlobBaseFee())
}

/**
 * Map of block opcodes to their handlers
 */
export const blockHandlers: Map<number, ExecuteFunc> = new Map([
  [Op.BLOCKHASH, opBlockhash],
  [Op.COINBASE, opCoinbase],
  [Op.TIMESTAMP, opTimestamp],
  [Op.NUMBER, opNumber],
  [Op.DIFFICULTY, opDifficulty], // Also handles PREVRANDAO
  [Op.GASLIMIT, opGaslimit],
  [Op.CHAINID, opChainid],
  [Op.SELFBALANCE, opSelfbalance],
  [Op.BASEFEE, opBasefee],
  [Op.BLOBHASH, opBlobhash],
  [Op.BLOBBASEFEE, opBlobbasefee],
])
