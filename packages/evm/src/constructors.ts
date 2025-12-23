import type { EVMOpts } from '.'
import { EVM } from '.'
import { SimpleStateManager } from '@ts-ethereum/state-manager'
import { EVMMockBlockchain } from './types'

/**
 * Use this async static constructor for the initialization
 * of an EVM object (simplified for value transfers only)
 *
 * @param createOpts The EVM options
 * @returns A new EVM
 */
export async function createEVM(createOpts?: EVMOpts) {
  const opts = createOpts ?? ({} as EVMOpts)

  // if (opts.common === undefined) {
  //   opts.common = new Common({ chain: Mainnet })
  // }

  if (opts.blockchain === undefined) {
    opts.blockchain = new EVMMockBlockchain()
  }

  if (opts.stateManager === undefined) {
    opts.stateManager = new SimpleStateManager()
  }

  return new EVM(opts)
}
