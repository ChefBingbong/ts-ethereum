import { GlobalConfig, Hardfork, Mainnet } from '@ts-ethereum/chain-config'
import { SimpleStateManager } from '@ts-ethereum/state-manager'
import type { EVMOpts } from './index'
import { EVM } from './index'
import { NobleBN254 } from './precompiles/index'
import { EVMMockBlockchain } from './types'

/**
 * Use this async static constructor for the initialization
 * of an EVM object
 *
 * @param createOpts The EVM options
 * @returns A new EVM
 */
export async function createEVM(createOpts?: EVMOpts) {
  const opts = createOpts ?? ({} as EVMOpts)

  opts.bn254 = new NobleBN254()

  if (opts.common === undefined) {
    opts.common = new GlobalConfig({
      chain: Mainnet,
      hardfork: Hardfork.Prague,
    })
  }

  if (opts.blockchain === undefined) {
    opts.blockchain = new EVMMockBlockchain()
  }

  if (opts.stateManager === undefined) {
    opts.stateManager = new SimpleStateManager()
  }

  return new EVM(opts)
}
