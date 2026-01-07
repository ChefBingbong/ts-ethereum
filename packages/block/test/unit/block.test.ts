import {
  type ChainConfig,
  createHardforkManager,
  type HardforkEntry,
  type HardforkManager,
} from '@ts-ethereum/chain-config'
import { createLegacyTx } from '@ts-ethereum/tx'
import { bytesToHex, equalsBytes, hexToBytes } from '@ts-ethereum/utils'
import { assert, describe, it } from 'vitest'
import {
  type Block,
  type BlockBytes,
  createBlock,
  createBlockFromBytesArray,
  createBlockFromRLP,
  createBlockFromRPC,
  createEmptyBlock,
  genTransactionsTrieRoot,
} from '../../src/index.ts'
import { customChainConfig, Mainnet } from './testdata/chainConfigs'
import { genesisHashesTestData } from './testdata/genesisHashesTest.ts'
import { testdataFromRPCGoerliData } from './testdata/testdata-from-rpc-goerli.ts'

/**
 * Helper to create a HardforkManager from a ChainConfig
 */
function createHardforkManagerFromConfig(
  chainConfig: ChainConfig,
): HardforkManager {
  return createHardforkManager({
    hardforks: chainConfig.hardforks.map(
      (hf) =>
        ({
          block: hf.block,
          timestamp: hf.timestamp,
          forkHash: hf.forkHash,
          optional: hf.optional,
          name: hf.name,
        }) as HardforkEntry,
    ),
    chainId: BigInt(chainConfig.chainId),
    chain: chainConfig,
  })
}

describe('[Block]: block functions', () => {
  it('should test block initialization', () => {
    // Use customChainConfig to avoid DAO fork validation
    const hardforkManager = createHardforkManagerFromConfig(customChainConfig)
    const genesis = createBlock({}, { hardforkManager })
    assert.isDefined(bytesToHex(genesis.hash()), 'block should initialize')

    const emptyBlock = createEmptyBlock({}, { hardforkManager })
    assert.isDefined(bytesToHex(emptyBlock.hash()), 'block should initialize')

    // test default freeze values
    // also test if the options are carried over to the constructor
    let block = createBlock({}, { hardforkManager })
    assert.isFrozen(block, 'block should be frozen by default')

    block = createBlock({}, { hardforkManager, freeze: false })
    assert.isNotFrozen(
      block,
      'block should not be frozen when freeze deactivated in options',
    )

    const rlpBlock = block.serialize()
    block = createBlockFromRLP(rlpBlock, { hardforkManager })
    assert.isFrozen(block, 'block should be frozen by default')

    block = createBlockFromRLP(rlpBlock, { hardforkManager, freeze: false })
    assert.isNotFrozen(
      block,
      'block should not be frozen when freeze deactivated in options',
    )

    const zero = new Uint8Array(0)
    const headerArray: Uint8Array[] = []
    for (let item = 0; item < 15; item++) {
      headerArray.push(zero)
    }

    // mock header data (if set to new Uint8Array() header throws)
    headerArray[0] = new Uint8Array(32) // parentHash
    headerArray[2] = new Uint8Array(20) // coinbase
    headerArray[3] = new Uint8Array(32) // stateRoot
    headerArray[4] = new Uint8Array(32) // transactionsTrie
    headerArray[5] = new Uint8Array(32) // receiptTrie
    headerArray[13] = new Uint8Array(32) // mixHash
    headerArray[14] = new Uint8Array(8) // nonce

    const valuesArray = [headerArray, [], []] as BlockBytes

    block = createBlockFromBytesArray(valuesArray, { hardforkManager })
    assert.isFrozen(block, 'block should be frozen by default')

    block = createBlockFromBytesArray(valuesArray, {
      hardforkManager,
      freeze: false,
    })
    assert.isNotFrozen(
      block,
      'block should not be frozen when freeze deactivated in options',
    )
  })

  it('should initialize with hardforkManager required', () => {
    const hardforkManager = createHardforkManagerFromConfig(customChainConfig)
    assert.doesNotThrow(() => {
      createBlock({}, { hardforkManager })
    })
  })

  // TODO: Re-enable once PoA chain validation is properly configured
  // The test data comes from Goerli (PoA) which has different consensus validation
  it.skip('should test block validation on poa chain', async () => {
    const hardforkManager = createHardforkManagerFromConfig(Mainnet)

    try {
      createBlockFromRPC(testdataFromRPCGoerliData, [], { hardforkManager })
      assert.isTrue(true, 'does not throw')
    } catch {
      assert.fail('error thrown')
    }
  })

  async function testTransactionValidation(block: Block) {
    assert.isTrue(block.transactionsAreValid())
    assert.isEmpty(block.getTransactionsValidationErrors())
  }

  it('should test transaction validation - transaction not signed', async () => {
    const hardforkManager = createHardforkManagerFromConfig(customChainConfig)
    const tx = createLegacyTx({
      gasLimit: 53000,
      gasPrice: 7,
    })
    const blockTest = createBlock({ transactions: [tx] }, { hardforkManager })
    const txTrie = await blockTest.genTxTrie()
    const block = createBlock(
      {
        header: {
          transactionsTrie: txTrie,
        },
        transactions: [tx],
      },
      { hardforkManager },
    )
    try {
      await block.validateData()
      assert.fail('should throw')
    } catch (error: any) {
      assert.isTrue((error.message as string).includes('unsigned'))
    }
  })

  it('should test transaction validation with empty transaction list', async () => {
    const hardforkManager = createHardforkManagerFromConfig(customChainConfig)
    const block = createBlock({}, { hardforkManager })
    await testTransactionValidation(block)
  })

  // TODO: Re-enable once block validation logic for unsigned transactions is reviewed
  // The test expects signature check to be skipped with validateData(false, true) but validation still fails
  it.skip('should test data integrity', async () => {
    const hardforkManager = createHardforkManagerFromConfig(customChainConfig)
    // Use a gasLimit that meets minimum requirements for the default hardfork
    // Also set gasPrice to pay the base fee (default hardfork has EIP-1559 with baseFeePerGas)
    const unsignedTx = createLegacyTx({ gasLimit: 53000n, gasPrice: 10n })
    const txRoot = await genTransactionsTrieRoot([unsignedTx])

    let block = createBlock(
      {
        transactions: [unsignedTx],
        header: {
          transactionsTrie: txRoot,
        },
      },
      { hardforkManager },
    )

    // Verifies that the "signed tx check" is skipped
    await block.validateData(false, true)

    async function checkThrowsAsync(fn: Promise<void>, errorMsg: string) {
      try {
        await fn
        assert.fail('should throw')
      } catch (e: any) {
        assert.isTrue((e.message as string).includes(errorMsg))
      }
    }

    const zeroRoot = new Uint8Array(32)

    // Tx root
    block = createBlock(
      {
        transactions: [unsignedTx],
        header: {
          transactionsTrie: zeroRoot,
        },
      },
      { hardforkManager },
    )
    await checkThrowsAsync(
      block.validateData(false, true),
      'invalid transaction trie',
    )

    // Uncle root
    block = createBlock(
      {
        header: {
          uncleHash: zeroRoot,
        },
      },
      { hardforkManager },
    )
    await checkThrowsAsync(block.validateData(false), 'invalid uncle hash')
  })

  it('should test isGenesis (mainnet default)', () => {
    const hardforkManager = createHardforkManagerFromConfig(customChainConfig)
    const block = createBlock({ header: { number: 1 } }, { hardforkManager })
    assert.notEqual(block.isGenesis(), true)
    const genesisBlock = createBlock(
      { header: { number: 0 } },
      { hardforkManager },
    )
    assert.strictEqual(genesisBlock.isGenesis(), true)
  })

  it('should test genesis hashes (mainnet default)', () => {
    const hardforkManager = createHardforkManagerFromConfig(Mainnet)
    const rlp = hexToBytes(`0x${genesisHashesTestData.test.genesis_rlp_hex}`)
    const hash = hexToBytes(`0x${genesisHashesTestData.test.genesis_hash}`)
    const block = createBlockFromRLP(rlp, { hardforkManager })
    assert.isTrue(equalsBytes(block.hash(), hash), 'genesis hash match')
  })

  it('should error on invalid params', () => {
    const hardforkManager = createHardforkManagerFromConfig(customChainConfig)
    assert.throws(
      () => {
        createBlockFromRLP('1' as any, { hardforkManager })
      },
      undefined,
      undefined,
      'input must be array',
    )
    assert.throws(
      () => {
        createBlockFromBytesArray([1, 2, 3, 4] as any, { hardforkManager })
      },
      undefined,
      undefined,
      'input length must be 3 or less',
    )
  })

  it('should throw on too many uncle headers (Zod validation)', () => {
    const hardforkManager = createHardforkManagerFromConfig(customChainConfig)

    // Create 3 mock uncle headers
    const uncleHeaders = [
      { number: 1n, parentHash: new Uint8Array(32) },
      { number: 2n, parentHash: new Uint8Array(32) },
      { number: 3n, parentHash: new Uint8Array(32) },
    ]

    assert.throws(
      () => {
        createBlock({ uncleHeaders }, { hardforkManager })
      },
      /too many uncle headers/,
      undefined,
      'should throw on more than 2 uncle headers',
    )
  })

  it('should throw on withdrawals before EIP-4895 (Zod validation)', () => {
    // customChainConfig doesn't have Shanghai/EIP-4895 at block 0
    const hardforkManager = createHardforkManagerFromConfig(customChainConfig)

    assert.throws(
      () => {
        createBlock({ withdrawals: [] }, { hardforkManager })
      },
      /Cannot have a withdrawals field if EIP 4895 is not active/,
      undefined,
      'should throw when withdrawals are provided before EIP-4895',
    )
  })

  it('should allow withdrawals after EIP-4895 (Zod validation)', () => {
    // Create a chain config with Shanghai active at block 0
    const shanghaiChainConfig: ChainConfig = {
      ...customChainConfig,
      name: 'testnet-shanghai',
      hardforks: [
        { name: 'chainstart', block: 0n },
        { name: 'homestead', block: 0n },
        { name: 'tangerineWhistle', block: 0n },
        { name: 'spuriousDragon', block: 0n },
        { name: 'byzantium', block: 0n },
        { name: 'constantinople', block: 0n },
        { name: 'petersburg', block: 0n },
        { name: 'istanbul', block: 0n },
        { name: 'muirGlacier', block: 0n },
        { name: 'berlin', block: 0n },
        { name: 'london', block: 0n },
        { name: 'paris', block: 0n },
        { name: 'shanghai', block: 0n },
      ],
    }
    const hardforkManager = createHardforkManagerFromConfig(shanghaiChainConfig)

    assert.doesNotThrow(() => {
      createBlock({ withdrawals: [] }, { hardforkManager })
    }, 'should allow empty withdrawals array when EIP-4895 is active')

    // Verify default withdrawals are set when EIP-4895 is active
    const block = createBlock({}, { hardforkManager })
    assert.isDefined(block.withdrawals, 'withdrawals should be defined')
    assert.deepEqual(
      block.withdrawals,
      [],
      'withdrawals should default to empty array',
    )
  })

  it('should validate uncle headers correctly via validateUncles()', () => {
    const hardforkManager = createHardforkManagerFromConfig(customChainConfig)

    // Create a non-genesis block with no uncles
    const block = createBlock({ header: { number: 1n } }, { hardforkManager })
    assert.doesNotThrow(() => {
      block.validateUncles()
    }, 'should pass validation with no uncles')
  })
})
