import { Common, Mainnet } from '../chain-config'
import { EVMMockBlockchain, createEVM } from '../evm'
import { MerkleStateManager } from '../state-manager'
import {
  EthereumJSErrorWithoutCode,
} from '../utils'

import { VM } from './vm.ts'

import type { VMOpts } from './types.ts'

/**
 * VM async constructor. Creates engine instance and initializes it.
 *
 * @param opts VM engine constructor options
 */
export async function createVM(opts: VMOpts = {}): Promise<VM> {
  // Add common, SM, blockchain, EVM here
  if (opts.common === undefined) {
    opts.common = new Common({ chain: Mainnet })
  }

  if (opts.stateManager === undefined) {
    opts.stateManager = new MerkleStateManager({
      common: opts.common,
    })
  }

  if (opts.blockchain === undefined) {
    opts.blockchain = new EVMMockBlockchain()
  }

  if (opts.profilerOpts !== undefined) {
    const profilerOpts = opts.profilerOpts
    if (profilerOpts.reportAfterBlock === true && profilerOpts.reportAfterTx === true) {
      throw EthereumJSErrorWithoutCode(
        'Cannot have `reportProfilerAfterBlock` and `reportProfilerAfterTx` set to `true` at the same time',
      )
    }
  }

  if (opts.evm !== undefined && opts.evmOpts !== undefined) {
    throw EthereumJSErrorWithoutCode('the evm and evmOpts options cannot be used in conjunction')
  }

  if (opts.evm === undefined) {
    const evmOpts = opts.evmOpts ?? {}
    opts.evm = await createEVM({
      common: opts.common,
      stateManager: opts.stateManager,
      blockchain: opts.blockchain,
      ...evmOpts,
    })
  }

  // Note: activatePrecompiles is ignored - precompiles not supported in value-transfer-only mode

  return new VM(opts)
}
