import { bytesToHex } from '@ts-ethereum/utils'

import { EVMError } from '../errors'
import type { EVM } from '../evm'
import { EVMErrorResult, OOGResult } from '../evm'
import type { ExecResult } from '../types'
import { getPrecompileName } from './index'
import type { PrecompileInput } from './types'
import { gasLimitCheck, moduloLengthCheck } from './util'

export function precompile08(opts: PrecompileInput): ExecResult {
  const pName = getPrecompileName('08')
  if (!moduloLengthCheck(opts, 192, pName)) {
    return EVMErrorResult(
      new EVMError(EVMError.errorMessages.INVALID_INPUT_LENGTH),
      opts.gasLimit,
    )
  }

  const inputDataSize = BigInt(Math.floor(opts.data.length / 192))
  const gasUsed =
    opts.common.getParamByEIP(609, 'bn254PairingGas') +
    inputDataSize * opts.common.getParamByEIP(609, 'bn254PairingWordGas')

  if (!gasLimitCheck(opts, gasUsed, pName)) {
    return OOGResult(opts.gasLimit)
  }

  let returnData
  try {
    returnData = (opts._EVM as EVM)['_bn254'].pairing(opts.data)
  } catch (e: any) {
    if (opts._debug !== undefined) {
      opts._debug(`${pName} failed: ${e.message}`)
    }
    return EVMErrorResult(e, opts.gasLimit)
  }

  // check ecpairing success or failure by comparing the output length
  if (returnData.length !== 32) {
    if (opts._debug !== undefined) {
      opts._debug(`${pName} failed: OOG`)
    }
    // TODO: should this really return OOG?
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
