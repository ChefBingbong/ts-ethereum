import { Common, Hardfork } from '@ts-ethereum/chain-config'
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
  paramsBlock,
} from '../../src/index.ts'
import { goerliChainConfig, Mainnet } from './testdata/chainConfigs/index.ts'
import { genesisHashesTestData } from './testdata/genesisHashesTest.ts'
import { testdataFromRPCGoerliData } from './testdata/testdata-from-rpc-goerli.ts'

describe('[Block]: block functions', () => {
  it('should test block initialization', () => {
    const common = new Common({
      chain: Mainnet,
      hardfork: Hardfork.Chainstart,
      params: paramsBlock[1],
    })
    const genesis = createBlock({}, { common })
    assert.isDefined(bytesToHex(genesis.hash()), 'block should initialize')

    const params = JSON.parse(JSON.stringify(paramsBlock))
    params['1']['minGasLimit'] = 3000 // 5000
    let block = createBlock({}, { params })
    assert.strictEqual(
      block.common.param('minGasLimit'),
      BigInt(3000),
      'should use custom parameters provided',
    )

    const emptyBlock = createEmptyBlock({}, { common })
    assert.isDefined(bytesToHex(emptyBlock.hash()), 'block should initialize')

    // test default freeze values
    // also test if the options are carried over to the constructor
    block = createBlock({})
    assert.isFrozen(block, 'block should be frozen by default')

    block = createBlock({}, { freeze: false })
    assert.isNotFrozen(
      block,
      'block should not be frozen when freeze deactivated in options',
    )

    const rlpBlock = block.serialize()
    block = createBlockFromRLP(rlpBlock)
    assert.isFrozen(block, 'block should be frozen by default')

    block = createBlockFromRLP(rlpBlock, { freeze: false })
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

    block = createBlockFromBytesArray(valuesArray, { common })
    assert.isFrozen(block, 'block should be frozen by default')

    block = createBlockFromBytesArray(valuesArray, { common, freeze: false })
    assert.isNotFrozen(
      block,
      'block should not be frozen when freeze deactivated in options',
    )
  })

  it('should initialize with undefined parameters without throwing', () => {
    assert.doesNotThrow(() => {
      createBlock()
    })
  })

  it('should initialize with null parameters without throwing', () => {
    const common = new Common({ chain: Mainnet, params: paramsBlock[1] })
    const opts = { common }
    assert.doesNotThrow(() => {
      createBlock({}, opts)
    })
  })

  it('should test block validation on poa chain', async () => {
    const common = new Common({
      chain: goerliChainConfig,
      hardfork: Hardfork.Chainstart,
      params: paramsBlock[1],
    })

    try {
      createBlockFromRPC(testdataFromRPCGoerliData, [], { common })
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
    const tx = createLegacyTx({
      gasLimit: 53000,
      gasPrice: 7,
    })
    const blockTest = createBlock({ transactions: [tx] })
    const txTrie = await blockTest.genTxTrie()
    const block = createBlock({
      header: {
        transactionsTrie: txTrie,
      },
      transactions: [tx],
    })
    try {
      await block.validateData()
      assert.fail('should throw')
    } catch (error: any) {
      assert.isTrue((error.message as string).includes('unsigned'))
    }
  })

  it('should test transaction validation with empty transaction list', async () => {
    const block = createBlock({})
    await testTransactionValidation(block)
  })

  it('should test data integrity', async () => {
    const unsignedTx = createLegacyTx({})
    const txRoot = await genTransactionsTrieRoot([unsignedTx])

    let block = createBlock({
      transactions: [unsignedTx],
      header: {
        transactionsTrie: txRoot,
      },
    })

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
    block = createBlock({
      transactions: [unsignedTx],
      header: {
        transactionsTrie: zeroRoot,
      },
    })
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
      {
        common: new Common({
          chain: Mainnet,
          hardfork: Hardfork.Chainstart,
          params: paramsBlock[1],
        }),
      },
    )
    await checkThrowsAsync(block.validateData(false), 'invalid uncle hash')
  })

  it('should test isGenesis (mainnet default)', () => {
    const block = createBlock({ header: { number: 1 } })
    assert.notEqual(block.isGenesis(), true)
    const genesisBlock = createBlock({ header: { number: 0 } })
    assert.strictEqual(genesisBlock.isGenesis(), true)
  })

  it('should test genesis hashes (mainnet default)', () => {
    const common = new Common({
      chain: Mainnet,
      hardfork: Hardfork.Chainstart,
      params: paramsBlock[1],
    })
    const rlp = hexToBytes(`0x${genesisHashesTestData.test.genesis_rlp_hex}`)
    const hash = hexToBytes(`0x${genesisHashesTestData.test.genesis_hash}`)
    const block = createBlockFromRLP(rlp, { common })
    assert.isTrue(equalsBytes(block.hash(), hash), 'genesis hash match')
  })

  it('should error on invalid params', () => {
    assert.throws(
      () => {
        createBlockFromRLP('1' as any)
      },
      undefined,
      undefined,
      'input must be array',
    )
    assert.throws(
      () => {
        createBlockFromBytesArray([1, 2, 3, 4] as any)
      },
      undefined,
      undefined,
      'input length must be 3 or less',
    )
  })
})
