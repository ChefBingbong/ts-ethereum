import { short } from '@ts-ethereum/utils'

import { OOGResult } from '../evm'
import type { ExecResult } from '../types'
import { getPrecompileName } from './index'
import type { PrecompileInput } from './types'
import { gasLimitCheck } from './util'

export function precompile04(opts: PrecompileInput): ExecResult {
  const pName = getPrecompileName('04')
  const hardfork = opts._EVM.fork
  const data = opts.data
  const eip1Hardfork = opts.common.getHardforkForEIP(1) ?? hardfork

  let gasUsed = opts.common.getParamAtHardfork('identityGas', eip1Hardfork)!
  gasUsed +=
    opts.common.getParamAtHardfork('identityWordGas', eip1Hardfork)! *
    BigInt(Math.ceil(data.length / 32))
  if (!gasLimitCheck(opts, gasUsed, pName)) {
    return OOGResult(opts.gasLimit)
  }

  if (opts._debug !== undefined) {
    opts._debug(`${pName} return data=${short(opts.data)}`)
  }

  return {
    executionGasUsed: gasUsed,
    returnValue: Uint8Array.from(data), // Copy the memory (`Uint8Array.from()`)
  }
}
