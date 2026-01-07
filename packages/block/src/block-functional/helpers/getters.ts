import type { AllParamNames, ParamType } from '@ts-ethereum/chain-config'
import { bytesToHex } from '@ts-ethereum/utils'
import type { FrozenBlock } from '../types'
import { getHash } from './serialize-helpers'

export function isGenesis(block: FrozenBlock): boolean {
  return block.header.data.number === 0n
}

export function isEIPActive(block: FrozenBlock, eip: number): boolean {
  return block.hardforkManager.isEIPActiveAtBlock(eip, {
    blockNumber: block.header.data.number,
    timestamp: block.header.data.timestamp,
  })
}

export function getParam<P extends AllParamNames>(
  block: FrozenBlock,
  name: P,
): ParamType<P> | undefined {
  const hardfork = block.hardforkManager.getHardforkByBlock(
    block.header.data.number,
    block.header.data.timestamp,
  )
  return block.hardforkManager.getParamAtHardfork(name, hardfork)
}

export function getHardfork(block: FrozenBlock): string {
  return block.hardforkManager.getHardforkByBlock(
    block.header.data.number,
    block.header.data.timestamp,
  )
}

export function errorStr(block: FrozenBlock): string {
  let hash = ''
  try {
    hash = bytesToHex(getHash(block))
  } catch {
    hash = 'error'
  }
  let hf = ''
  try {
    hf = getHardfork(block)
  } catch {
    hf = 'error'
  }
  let errorStr = `block number=${block.header.data.number} hash=${hash} `
  errorStr += `hf=${hf} baseFeePerGas=${block.header.data.baseFeePerGas ?? 'none'} `
  errorStr += `txs=${block.transactions.length} uncles=${block.uncleHeaders.length}`
  return errorStr
}
