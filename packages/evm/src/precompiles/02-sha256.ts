import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@ts-ethereum/utils'

import { OOGResult } from '../evm'
import type { ExecResult } from '../types'
import { getPrecompileName } from './index'
import type { PrecompileInput } from './types'
import { gasLimitCheck } from './util'

export function precompile02(opts: PrecompileInput): ExecResult {
  const pName = getPrecompileName('02')
  const data = opts.data
  const sha256Function = opts.common.customCrypto.sha256 ?? sha256
  let gasUsed = opts.common.getParamByEIP(1, 'sha256Gas')
  gasUsed +=
    opts.common.getParamByEIP(1, 'sha256WordGas') *
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
