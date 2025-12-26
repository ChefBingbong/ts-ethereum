import { bytesToHex, setLengthLeft } from '@ts-ethereum/utils'
import { ripemd160 } from '@noble/hashes/legacy.js'

import { OOGResult } from '../evm'

import { getPrecompileName } from './index'
import { gasLimitCheck } from './util'

import type { ExecResult } from '../types'
import type { PrecompileInput } from './types'

export function precompile03(opts: PrecompileInput): ExecResult {
  const pName = getPrecompileName('03')
  const data = opts.data

  let gasUsed = opts.common.param('ripemd160Gas')
  gasUsed += opts.common.param('ripemd160WordGas') * BigInt(Math.ceil(data.length / 32))

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
