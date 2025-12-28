import {
  GlobalConfig,
  Hardfork,
  mainnetSchema,
} from '@ts-ethereum/chain-config'
import { MerkleStateManager } from '@ts-ethereum/state-manager'
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
    opts.common = GlobalConfig.fromSchema({
      schema: mainnetSchema,
      hardfork: Hardfork.Prague,
    })
  }

  if (opts.blockchain === undefined) {
    opts.blockchain = new EVMMockBlockchain()
  }

  if (opts.stateManager === undefined) {
    opts.stateManager = new MerkleStateManager(opts)
  }

  return new EVM(opts)
}
