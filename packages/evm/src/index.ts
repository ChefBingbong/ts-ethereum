import { EVMError } from './errors'
import { EVM } from './evm'
import { Message } from './message'
import { EVMMockBlockchain } from './types'

import type {
	EVMInterface,
	EVMMockBlockchainInterface,
	EVMOpts,
	EVMResult,
	EVMRunCallOpts,
	ExecResult,
} from './types'

export type {
	EVMInterface,
	EVMMockBlockchainInterface,
	EVMOpts,
	EVMResult,
	EVMRunCallOpts,
	ExecResult
}

export { EVM, EVMError, EVMMockBlockchain, Message }

export * from './binaryTreeAccessWitness'
export * from './constructors'
export * from './params'

