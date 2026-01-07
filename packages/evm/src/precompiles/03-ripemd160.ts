import { ripemd160 } from '@noble/hashes/legacy.js'
import { bytesToHex, setLengthLeft } from '@ts-ethereum/utils'

import { OOGResult } from '../evm'
import type { ExecResult } from '../types'
import { getPrecompileName } from './index'
import type { PrecompileInput } from './types'
import { gasLimitCheck } from './util'

export function precompile03(opts: PrecompileInput): ExecResult {
  const pName = getPrecompileName('03')
  const hardfork = opts._EVM.fork
  const data = opts.data
  const eip1Hardfork = opts.common.getHardforkForEIP(1) ?? hardfork

  let gasUsed = opts.common.getParamAtHardfork('ripemd160Gas', eip1Hardfork)!
  gasUsed +=
    opts.common.getParamAtHardfork('ripemd160WordGas', eip1Hardfork)! *
    BigInt(Math.ceil(data.length / 32))

  if (!gasLimitCheck(opts, gasUsed, pName)) {
    return OOGResult(opts.gasLimit)
  }

  const hash = setLengthLeft(ripemd160(data), 32)
  if (opts._debug !== undefined) {
    opts._debug(`${pName} return hash=${bytesToHex(hash)}`)
  }

  return {
    executionGasUsed: gasUsed,
    returnValue: setLengthLeft(ripemd160(data), 32),
  }
}
