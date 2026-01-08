import { EOFContainer, validateEOF } from './eof/container'
import { EVMError } from './errors'
import { EVM } from './evm'
import type { InterpreterStep } from './interpreter'
import { Message } from './message'
import { jumpTableToOpcodeList } from './opcodes/index'
import {
  getActivePrecompiles,
  MCLBLS,
  NobleBLS,
  NobleBN254,
  type PrecompileInput,
  RustBN254,
} from './precompiles/index'
import type {
  EVMBLSInterface,
  EVMBN254Interface,
  EVMInterface,
  EVMMockBlockchainInterface,
  EVMOpts,
  EVMResult,
  EVMRunCallOpts,
  EVMRunCodeOpts,
  ExecResult,
  Log,
} from './types'
import { EVMMockBlockchain } from './types'

export * from './logger'

export type {
  EVMBLSInterface,
  EVMBN254Interface,
  EVMInterface,
  EVMMockBlockchainInterface,
  EVMOpts,
  EVMResult,
  EVMRunCallOpts,
  EVMRunCodeOpts,
  ExecResult,
  InterpreterStep,
  Log,
  PrecompileInput,
}

export {
  EOFContainer,
  EVM,
  EVMError,
  EVMMockBlockchain,
  MCLBLS,
  Message,
  NobleBLS,
  NobleBN254,
  RustBN254,
  getActivePrecompiles,
  jumpTableToOpcodeList,
  validateEOF,
}

export * from './binaryTreeAccessWitness'
export * from './constructors'
export * from './params'
