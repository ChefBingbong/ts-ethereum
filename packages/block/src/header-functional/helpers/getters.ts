import { type AllParamNames, type ParamType } from '@ts-ethereum/chain-config'
import { EthereumJSErrorWithoutCode } from '@ts-ethereum/utils'
import type { BlockNumContext, FrozenBlockHeader } from '../types'

export function getBlockNum(header: FrozenBlockHeader): BlockNumContext {
  return {
    blockNumber: header.data.number,
    timestamp: header.data.timestamp,
  }
}

export function getHardfork(header: FrozenBlockHeader): string {
  return header.hardforkManager.getHardforkByBlock(
    header.data.number,
    header.data.timestamp,
  )
}

export function getPrevRandao(header: FrozenBlockHeader): Uint8Array {
  const blockNum = getBlockNum(header)
  if (!header.hardforkManager.isEIPActiveAtBlock(4399, blockNum)) {
    throw EthereumJSErrorWithoutCode(
      'prevRandao can only be accessed when EIP-4399 is activated',
    )
  }
  return header.data.mixHash
}

export function getConsensusType(header: FrozenBlockHeader): string {
  return header.hardforkManager.config.spec.chain?.consensus?.type ?? 'pow'
}

export function getConsensusAlgorithm(header: FrozenBlockHeader): string {
  return (
    header.hardforkManager.config.spec.chain?.consensus?.algorithm ?? 'ethash'
  )
}

export function isEIPActive(header: FrozenBlockHeader, eip: number): boolean {
  return header.hardforkManager.isEIPActiveAtBlock(eip, getBlockNum(header))
}

export function getParam<P extends AllParamNames>(
  header: FrozenBlockHeader,
  name: P,
): ParamType<P> | undefined {
  const hardfork = getHardfork(header)
  return header.hardforkManager.getParamAtHardfork(name, hardfork)
}
