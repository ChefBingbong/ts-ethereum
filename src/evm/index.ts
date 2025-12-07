import { EVMError } from './errors.ts'
import { EVM } from './evm.ts'
import { Message } from './message.ts'
import { EVMMockBlockchain } from './types.ts'

import type {
    EVMInterface,
    EVMMockBlockchainInterface,
    EVMOpts,
    EVMResult,
    EVMRunCallOpts,
    ExecResult,
} from './types.ts'

export type {
    EVMInterface,
    EVMMockBlockchainInterface,
    EVMOpts,
    EVMResult,
    EVMRunCallOpts,
    ExecResult,
}

export {
    EVM,
    EVMError,
    EVMMockBlockchain,
    Message,
}

export * from './binaryTreeAccessWitness.ts'
export * from './constructors.ts'
export * from './params.ts'
