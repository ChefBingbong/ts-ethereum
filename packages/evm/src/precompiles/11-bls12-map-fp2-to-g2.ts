import { bytesToHex } from '@ts-ethereum/utils'

import { EVMError } from '../errors'
import type { EVM } from '../evm'
import { EVMErrorResult, OOGResult } from '../evm'
import type { ExecResult } from '../types'
import { leading16ZeroBytesCheck } from './bls12_381/index'
import { getPrecompileName } from './index'
import type { PrecompileInput } from './types'
import { equalityLengthCheck, gasLimitCheck } from './util'

export async function precompile11(opts: PrecompileInput): Promise<ExecResult> {
  const pName = getPrecompileName('13')
  const bls = (opts._EVM as EVM)['_bls']!

  const hardfork = opts._EVM.fork
  const eip2537Hardfork = opts.common.getHardforkForEIP(2537) ?? hardfork
  // note: the gas used is constant; even if the input is incorrect.
  const gasUsed = opts.common.getParamAtHardfork(
    'bls12381MapG2Gas',
    eip2537Hardfork,
  )!
  if (!gasLimitCheck(opts, gasUsed, pName)) {
    return OOGResult(opts.gasLimit)
  }

  if (!equalityLengthCheck(opts, 128, pName)) {
    return EVMErrorResult(
      new EVMError(EVMError.errorMessages.BLS_12_381_INVALID_INPUT_LENGTH),
      opts.gasLimit,
    )
  }

  // check if some parts of input are zero bytes.
  const zeroByteRanges = [
    [0, 16],
    [64, 80],
  ]
  if (!leading16ZeroBytesCheck(opts, zeroByteRanges, pName)) {
    return EVMErrorResult(
      new EVMError(EVMError.errorMessages.BLS_12_381_POINT_NOT_ON_CURVE),
      opts.gasLimit,
    )
  }

  let returnValue
  try {
    returnValue = bls.mapFP2toG2(opts.data)
  } catch (e: any) {
    if (opts._debug !== undefined) {
      opts._debug(`${pName} failed: ${e.message}`)
    }
    return EVMErrorResult(e, opts.gasLimit)
  }

  if (opts._debug !== undefined) {
    opts._debug(`${pName} return value=${bytesToHex(returnValue)}`)
  }

  return {
    executionGasUsed: gasUsed,
    returnValue,
  }
}
