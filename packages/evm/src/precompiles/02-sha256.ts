import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@ts-ethereum/utils'

import { OOGResult } from '../evm'
import type { ExecResult } from '../types'
import { getPrecompileName } from './index'
import type { PrecompileInput } from './types'
import { gasLimitCheck } from './util'

export function precompile02(opts: PrecompileInput): ExecResult {
  const pName = getPrecompileName('02')
  const hardfork = opts._EVM.fork
  const data = opts.data
  const sha256Function = opts.customCrypto?.sha256 ?? sha256
  const eip1Hardfork = opts.common.getHardforkForEIP(1) ?? hardfork
  let gasUsed = opts.common.getParamAtHardfork('sha256Gas', eip1Hardfork)!
  gasUsed +=
    opts.common.getParamAtHardfork('sha256WordGas', eip1Hardfork)! *
    BigInt(Math.ceil(data.length / 32))

  if (!gasLimitCheck(opts, gasUsed, pName)) {
    return OOGResult(opts.gasLimit)
  }

  const hash = sha256Function(data)
  if (opts._debug !== undefined) {
    opts._debug(`${pName} return hash=${bytesToHex(hash)}`)
  }

  return {
    executionGasUsed: gasUsed,
    returnValue: hash,
  }
}
