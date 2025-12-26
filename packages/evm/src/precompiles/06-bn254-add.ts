import { bytesToHex, setLengthRight } from '@ts-ethereum/utils'
import type { EVM } from '../evm'
import { EVMErrorResult, OOGResult } from '../evm'
import type { ExecResult } from '../types'
import { getPrecompileName } from './index'
import type { PrecompileInput } from './types'
import { gasLimitCheck } from './util'

export function precompile06(opts: PrecompileInput): ExecResult {
  const pName = getPrecompileName('06')
  const gasUsed = opts.common.param('bn254AddGas')
  if (!gasLimitCheck(opts, gasUsed, pName)) {
    return OOGResult(opts.gasLimit)
  }

  // > 128 bytes: chop off extra bytes
  // < 128 bytes: right-pad with 0-s
  const input = setLengthRight(opts.data.subarray(0, 128), 128)

  let returnData
  try {
    returnData = (opts._EVM as EVM)['_bn254'].add(input)
  } catch (e: any) {
    if (opts._debug !== undefined) {
      opts._debug(`${pName} failed: ${e.message}`)
    }
    return EVMErrorResult(e, opts.gasLimit)
  }

  // check ecadd success or failure by comparing the output length
  if (returnData.length !== 64) {
    if (opts._debug !== undefined) {
      opts._debug(`${pName} failed: OOG`)
    }
    return OOGResult(opts.gasLimit)
  }

  if (opts._debug !== undefined) {
    opts._debug(`${pName} return value=${bytesToHex(returnData)}`)
  }

  return {
    executionGasUsed: gasUsed,
    returnValue: returnData,
  }
}
