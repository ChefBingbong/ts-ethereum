import type { Common } from '@ts-ethereum/chain-config'
import type { EVMInterface, ExecResult } from '../types'

export type PrecompileFunc = (
  input: PrecompileInput,
) => Promise<ExecResult> | ExecResult

export interface PrecompileInput {
  data: Uint8Array
  gasLimit: bigint
  common: Common
  _EVM: EVMInterface
  _debug?: debug.Debugger
}
