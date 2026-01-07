import type { Block } from '@ts-ethereum/block'
import { bytesToHex } from '@ts-ethereum/utils'
import { DataDirectory } from '..'
import type { VMExecution } from '../execution'

/**
 * Generates a code snippet which can be used to replay an erroneous block
 * locally in the VM
 *
 * @param block
 */
export async function debugCodeReplayBlock(
  execution: VMExecution,
  block: Block,
) {
  const code = `
/**
 * Script for locally executing a block in the EthereumJS VM,
 * meant to be used from packages/vm directory within the
 * https://github.com/ethereumjs/ethereumjs-monorepo repository.
 *
 * Block: ${block.header.number}
 * Hardfork: ${execution.config.hardforkManager.getHardforkByBlock(block.header.number, block.header.timestamp)}
 *
 * Run with: DEBUG=ethjs,vm:*:*,vm:*,-vm:ops:* tsx [SCRIPT_NAME].ts
 *
 */

import { Level } from 'level';
import { GlobalConfig } from '../../chain-config'
import { Block } from '../../block'
import { VM, runBlock, createVM }  from './src'
import { MerklePatriciaTrie } from '../../mpt'
import { MerkleStateManager } from './src/state'
import { Blockchain } from '../../blockchain'

const main = async () => {
  const blockHardfork = execution.config.hardforkManager.getHardforkByBlock(${block.header.number}, ${block.header.timestamp})
  const common = createHardforkManagerFromConfig({ chain: '${execution.config.hardforkManager.chainName()}', hardfork: blockHardfork })
  const block = createBlockFromRLP(hexToBytes('${bytesToHex(block.serialize())}'), { common })

  const stateDB = new Level('${execution.config.getDataDirectory(DataDirectory.State)}')
  const trie = new MerklePatriciaTrie({ db: stateDB, useKeyHashing: true })
  const stateManager = new MerkleStateManager({ trie, common })
  // Ensure we run on the right root
  stateManager.setStateRoot(hexToBytes('${bytesToHex(
    await execution.vm.stateManager.getStateRoot(),
  )}'))


  const chainDB = new Level('${execution.config.getDataDirectory(DataDirectory.Chain)}')
  const blockchain = await createBlockchain({
    db: chainDB,
    common,
    validateBlocks: true,
    validateConsensus: false,
  })
  const vm = await createVM({ stateManager, blockchain, common })

  await runBlock({ block })
}

main()
    `
  execution.config.options.logger?.info(code)
}
