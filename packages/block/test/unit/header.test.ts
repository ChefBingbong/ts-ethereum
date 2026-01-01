import { createCustomCommon, Hardfork } from '@ts-ethereum/chain-config'
import { RLP } from '@ts-ethereum/rlp'
import {
  bytesToHex,
  concatBytes,
  createZeroAddress,
  equalsBytes,
  KECCAK256_RLP,
  KECCAK256_RLP_ARRAY,
} from '@ts-ethereum/utils'
import { assert, describe, it } from 'vitest'
import type { BlockHeader } from '../../src/index.ts'
import {
  Block,
  createBlock,
  createBlockHeader,
  createBlockHeaderFromBytesArray,
  createBlockHeaderFromRLP,
} from '../../src/index.ts'
import { goerliChainConfig, Mainnet } from './testdata/chainConfigs'
import { mainnetBlocks } from './testdata/mainnetBlocks.ts'

describe('[Block]: Header functions', () => {
  it('should create with default constructor', () => {
    function compareDefaultHeader(header: BlockHeader) {
      assert.isTrue(equalsBytes(header.parentHash, new Uint8Array(32)))
      assert.isTrue(equalsBytes(header.uncleHash, KECCAK256_RLP_ARRAY))
      assert.isTrue(header.coinbase.equals(createZeroAddress()))
      assert.isTrue(equalsBytes(header.stateRoot, new Uint8Array(32)))
      assert.isTrue(equalsBytes(header.transactionsTrie, KECCAK256_RLP))
      assert.isTrue(equalsBytes(header.receiptTrie, KECCAK256_RLP))
      assert.isTrue(equalsBytes(header.logsBloom, new Uint8Array(256)))
      assert.strictEqual(header.difficulty, BigInt(0))
      assert.strictEqual(header.number, BigInt(0))
      assert.strictEqual(header.gasLimit, BigInt('0xffffffffffffff'))
      assert.strictEqual(header.gasUsed, BigInt(0))
      assert.strictEqual(header.timestamp, BigInt(0))
      assert.isTrue(equalsBytes(header.extraData, new Uint8Array(0)))
      assert.isTrue(equalsBytes(header.mixHash, new Uint8Array(32)))
      assert.isTrue(equalsBytes(header.nonce, new Uint8Array(8)))
    }

    const header = createBlockHeader()
    compareDefaultHeader(header)

    const block = new Block()
    compareDefaultHeader(block.header)
  })

  it('Initialization -> fromHeaderData()', () => {
    const common = createCustomCommon({}, Mainnet, {
      hardfork: Hardfork.Chainstart,
    })
    let header = createBlockHeader(undefined, { common })
    assert.isDefined(
      bytesToHex(header.hash()),
      'genesis block should initialize',
    )
    assert.strictEqual(
      header.common.hardfork(),
      'chainstart',
      'should initialize with correct HF provided',
    )

    header = createBlockHeader({}, { common })
    assert.isDefined(
      bytesToHex(header.hash()),
      'default block should initialize',
    )

    // test default freeze values
    // also test if the options are carried over to the constructor
    header = createBlockHeader({})
    assert.isFrozen(header, 'block should be frozen by default')

    header = createBlockHeader({}, { freeze: false })
    assert.isNotFrozen(
      header,
      'block should not be frozen when freeze deactivated in options',
    )
  })

  it('Initialization -> fromRLPSerializedHeader()', () => {
    const common = createCustomCommon({}, Mainnet, {
      hardfork: Hardfork.Chainstart,
    })
    let header = createBlockHeader({}, { common, freeze: false })

    const rlpHeader = header.serialize()
    header = createBlockHeaderFromRLP(rlpHeader, {
      common,
    })
    assert.isFrozen(header, 'block should be frozen by default')

    header = createBlockHeaderFromRLP(rlpHeader, {
      common,
      freeze: false,
    })
    assert.isNotFrozen(
      header,
      'block should not be frozen when freeze deactivated in options',
    )
  })

  it('Initialization -> fromRLPSerializedHeader() -> error cases', () => {
    try {
      createBlockHeaderFromRLP(RLP.encode('a'))
    } catch (e: any) {
      const expectedError = 'Invalid serialized header input. Must be array'
      assert.isTrue(
        e.message.includes(expectedError),
        'should throw with header as rlp encoded string',
      )
    }
  })

  it('Initialization -> createWithdrawalFromBytesArray()', () => {
    const common = createCustomCommon({}, Mainnet, {
      hardfork: Hardfork.Chainstart,
    })
    const zero = new Uint8Array(0)
    const headerArray: Uint8Array[] = []
    for (let item = 0; item < 15; item++) {
      headerArray.push(zero)
    }

    // mock header data (if set to new Uint8Array() header throws)
    headerArray[0] = new Uint8Array(32) //parentHash
    headerArray[2] = new Uint8Array(20) //coinbase
    headerArray[3] = new Uint8Array(32) //stateRoot
    headerArray[4] = new Uint8Array(32) //transactionsTrie
    headerArray[5] = new Uint8Array(32) //receiptTrie
    headerArray[13] = new Uint8Array(32) // mixHash
    headerArray[14] = new Uint8Array(8) // nonce

    let header = createBlockHeaderFromBytesArray(headerArray, { common })
    assert.isFrozen(header, 'block should be frozen by default')

    header = createBlockHeaderFromBytesArray(headerArray, {
      common,
      freeze: false,
    })
    assert.isNotFrozen(
      header,
      'block should not be frozen when freeze deactivated in options',
    )
  })

  it('Initialization -> createWithdrawalFromBytesArray() -> error cases', () => {
    const headerArray = Array(22).fill(new Uint8Array(0))

    // mock header data (if set to new Uint8Array() header throws)
    headerArray[0] = new Uint8Array(32) //parentHash
    headerArray[2] = new Uint8Array(20) //coinbase
    headerArray[3] = new Uint8Array(32) //stateRoot
    headerArray[4] = new Uint8Array(32) //transactionsTrie
    headerArray[5] = new Uint8Array(32) //receiptTrie
    headerArray[13] = new Uint8Array(32) // mixHash
    headerArray[14] = new Uint8Array(8) // nonce
    headerArray[15] = new Uint8Array(4) // bad data

    assert.throw(
      () => createBlockHeaderFromBytesArray(headerArray),
      'invalid header. More values than expected were received',
    )

    try {
      createBlockHeaderFromBytesArray(headerArray.slice(0, 5))
    } catch (e: any) {
      const expectedError =
        'invalid header. Less values than expected were received'
      assert.isTrue(
        e.message.includes(expectedError),
        'should throw on less values than expected',
      )
    }
  })

  // TODO: Re-enable once Clique/PoA consensus validation is properly configured
  // Current chain config doesn't properly handle PoA extraData requirements
  it.skip('Initialization -> Clique Blocks', () => {
    const common = createCustomCommon({}, goerliChainConfig, {
      hardfork: Hardfork.Chainstart,
    })
    const header = createBlockHeader(
      { extraData: new Uint8Array(97) },
      { common },
    )
    assert.isDefined(
      bytesToHex(header.hash()),
      'default block should initialize',
    )
  })

  it('should validate extraData', () => {
    // PoW
    const common = createCustomCommon({}, Mainnet, {
      hardfork: Hardfork.Chainstart,
    })
    const genesis = createBlock({}, { common })

    const number = 1
    const parentHash = genesis.hash()
    const timestamp = Date.now()
    const { gasLimit } = genesis.header
    const data = { number, parentHash, timestamp, gasLimit }
    const opts = { common, calcDifficultyFromHeader: genesis.header }

    // valid extraData: at limit
    assert.doesNotThrow(
      () => createBlockHeader({ ...data, extraData: new Uint8Array(32) }, opts),
      undefined,
      undefined,
      'pow block should validate with 32 bytes of extraData',
    )

    // valid extraData: fewer than limit
    assert.doesNotThrow(
      () => createBlockHeader({ ...data, extraData: new Uint8Array(12) }, opts),
      undefined,
      undefined,
      'pow block should validate with 12 bytes of extraData',
    )

    // extraData beyond limit
    assert.throw(
      () => createBlockHeader({ ...data, extraData: new Uint8Array(42) }, opts),
      'invalid amount of extra data',
      undefined,
      'pow block should throw with excess amount of extraData',
    )

    // TODO: Re-enable PoA tests once Clique consensus validation is properly configured
    // PoA
    // common = createCustomCommon({}, goerliChainConfig, {
    //   hardfork: Hardfork.Chainstart,
    // })
    // genesis = createBlock(
    //   { header: { extraData: new Uint8Array(97) } },
    //   { common },
    // )

    // parentHash = genesis.hash()
    // gasLimit = genesis.header.gasLimit
    // data = {
    //   number,
    //   parentHash,
    //   timestamp,
    //   gasLimit,
    //   difficulty: BigInt(1),
    // } as any
    // opts = { common } as any

    // // valid extraData (32 byte vanity + 65 byte seal)
    // assert.doesNotThrow(
    //   () =>
    //     createBlockHeader(
    //       {
    //         ...data,
    //         extraData: concatBytes(new Uint8Array(32), new Uint8Array(65)),
    //       },
    //       opts,
    //     ),
    //   undefined,
    //   undefined,
    //   'clique block should validate with valid number of bytes in extraData: 32 byte vanity + 65 byte seal',
    // )

    // invalid extraData length
  })

  it('should skip consensusFormatValidation if flag is set to false', () => {
    const common = createCustomCommon({}, goerliChainConfig, {
      hardfork: Hardfork.Chainstart,
    })

    assert.doesNotThrow(
      () =>
        createBlockHeader(
          { extraData: concatBytes(new Uint8Array(1)) },
          { common, skipConsensusFormatValidation: true },
        ),
      undefined,
      undefined,
      'should instantiate header with invalid extraData when skipConsensusFormatValidation === true',
    )
  })

  it('_genericFormatValidation checks', () => {
    const badHash = new Uint8Array(31)

    assert.throws(
      () => createBlockHeader({ parentHash: badHash }),
      'parentHash must be 32 bytes',
      undefined,
      'throws on invalid parent hash length',
    )
    assert.throws(
      () => createBlockHeader({ stateRoot: badHash }),
      'stateRoot must be 32 bytes',
      undefined,
      'throws on invalid state root hash length',
    )
    assert.throws(
      () => createBlockHeader({ transactionsTrie: badHash }),
      'transactionsTrie must be 32 bytes',
      undefined,
      'throws on invalid transactionsTrie root hash length',
    )

    assert.throws(
      () => createBlockHeader({ nonce: new Uint8Array(5) }),
      'nonce must be 8 bytes',
      undefined,
      'contains nonce length error message',
    )
  })
  /*
  TODO: Decide if we need to move these tests to blockchain
  it('header validation -> poa checks',  () => {
    const headerData = testDataPreLondon.blocks[0].blockHeader

    const common = new GlobalConfig({ chain: goerliChainConfig, hardfork: Hardfork.Istanbul })
    const blockchain = new Mockchain()

    const genesisRlp = hexToBytes(testDataPreLondon.genesisRLP)
    const block = createBlockFromRLP(genesisRlp, { common })
    await blockchain.putBlock(block)

    headerData.number = 1
    headerData.timestamp = BigInt(1422494850)
    headerData.extraData = new Uint8Array(97)
    headerData.mixHash = new Uint8Array(32)
    headerData.difficulty = BigInt(2)

    let testCase = 'should throw on lower than period timestamp diffs'
    let header = createBlockHeader(headerData, { common })
    try {
      await header.validate(blockchain)
      assert.fail(testCase)
    } catch (error: any) {
      assert.isTrue((error.message as string).includes('invalid timestamp diff (lower than period)'), testCase)
    }

    testCase = 'should not throw on timestamp diff equal to period'
    headerData.timestamp = BigInt(1422494864)
    header = createBlockHeader(headerData, { common })
    try {
      await header.validate(blockchain)
      assert.isTrue(true, testCase)
    } catch (error: any) {
      assert.fail(testCase)
    }

    testCase = 'should throw on non-zero beneficiary (coinbase) for epoch transition block'
    headerData.number = common.consensusConfig().epoch
    headerData.coinbase = createAddressFromString('0x091dcd914fCEB1d47423e532955d1E62d1b2dAEf')
    header = createBlockHeader(headerData, { common })
    try {
      await header.validate(blockchain)
      assert.fail('should throw')
    } catch (error: any) {
      if ((error.message as string).includes('coinbase must be filled with zeros on epoch transition blocks')) {
        assert.isTrue(true, 'error thrown')
      } else {
        assert.fail('should throw with appropriate error')
      }
    }
    headerData.number = 1
    headerData.coinbase = createZeroAddress()

    testCase = 'should throw on non-zero mixHash'
    headerData.mixHash = new Uint8Array(32).fill(1)
    header = createBlockHeader(headerData, { common })
    try {
      await header.validate(blockchain)
      assert.fail('should throw')
    } catch (error: any) {
      if ((error.message as string).includes('mixHash must be filled with zeros')) {
        assert.isTrue(true, 'error thrown')
      } else {
        assert.fail('should throw with appropriate error')
      }
    }
    headerData.mixHash = new Uint8Array(32)

    testCase = 'should throw on invalid clique difficulty'
    headerData.difficulty = BigInt(3)
    header = createBlockHeader(headerData, { common })
    try {
      header.validateCliqueDifficulty(blockchain)
      assert.fail(testCase)
    } catch (error: any) {
      if ((error.message as string).includes('difficulty for clique block must be INTURN (2) or NOTURN (1)')) {
        assert.isTrue(true, 'error thrown on invalid clique difficulty')
      } else {
        assert.fail('should throw with appropriate error')
      }
    }

    testCase = 'validateCliqueDifficulty() should return true with NOTURN difficulty and one signer'
    headerData.difficulty = BigInt(2)
    const poaBlockchain = new PoaMockchain()
    const cliqueSigner = hexToBytes(
      '64bf9cc30328b0e42387b3c82c614e6386259136235e20c1357bd11cdee86993'
    )
    const poaBlock = createBlockFromRLP(genesisRlp, { common, cliqueSigner })
    await poaBlockchain.putBlock(poaBlock)

    header = createBlockHeader(headerData, { common, cliqueSigner })
    try {
      const res = header.validateCliqueDifficulty(poaBlockchain)
      assert.strictEqual(res, true, testCase)
    } catch (error: any) {
      assert.fail(testCase)
    }

    testCase =
      'validateCliqueDifficulty() should return false with INTURN difficulty and one signer'
    headerData.difficulty = BigInt(1)
    header = createBlockHeader(headerData, { common, cliqueSigner })
    try {
      const res = header.validateCliqueDifficulty(poaBlockchain)
      assert.strictEqual(res, false, testCase)
    } catch (error: any) {
      assert.fail(testCase)
    }
      })
*/

  it('should test isGenesis()', () => {
    const header1 = createBlockHeader({ number: 1 })
    assert.strictEqual(header1.isGenesis(), false)

    const header2 = createBlockHeader()
    assert.strictEqual(header2.isGenesis(), true)
  })

  it('should test hash() function', () => {
    const common = createCustomCommon({}, Mainnet, {
      hardfork: Hardfork.Chainstart,
    })
    const header = createBlockHeader(mainnetBlocks[0]['header'], { common })
    assert.strictEqual(
      bytesToHex(header.hash()),
      '0x88e96d4537bea4d9c05d12549907b32561d3bf31f45aae734cdc119f13406cb6',
      'correct PoW hash (mainnet block 1)',
    )

    // TODO: Re-enable once Clique/PoA consensus validation is properly configured
    // common = createCustomCommon({}, goerliChainConfig, {
    //   hardfork: Hardfork.Chainstart,
    // })
    // header = createBlockHeader(goerliBlocks[0]['header'], { common })
    // assert.strictEqual(
    //   bytesToHex(header.hash()),
    //   '0x8f5bab218b6bb34476f51ca588e9f4553a3a7ce5e13a66c660a5283e97e9a85a',
    //   'correct PoA clique hash (goerli block 1)',
    // )
  })
})
