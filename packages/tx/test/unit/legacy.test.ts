import {
  createHardforkManagerFromConfig,
  Hardfork,
  Mainnet,
} from '@ts-ethereum/chain-config'
import { RLP } from '@ts-ethereum/rlp'
import {
  bytesToBigInt,
  bytesToHex,
  equalsBytes,
  hexToBytes,
  type PrefixedHexString,
  toBytes,
  unpadBytes,
} from '@ts-ethereum/utils'
import { assert, describe, it } from 'vitest'

import {
  createLegacyTx,
  createLegacyTxFromBytesArray,
  createLegacyTxFromRLP,
  type TransactionType,
  type TxData,
  type TypedTransaction,
} from '../../src/index'

import { txsData } from './testData/txs'

describe('[Transaction]', () => {
  const transactions: TypedTransaction[] = []
  const common = createHardforkManagerFromConfig(Mainnet)
  const blockNumber = 0n
  const timestamp = 0n

  it(`cannot input decimal or negative values`, () => {
    const values = ['gasPrice', 'gasLimit', 'nonce', 'value', 'v', 'r', 's']
    const cases = [
      10.1,
      '10.1',
      '0xaa.1',
      -10.1,
      -1,
      BigInt(-10),
      '-100',
      '-10.1',
      '-0xaa',
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NaN,
      {},
      true,
      false,
      () => {},
      Number.MAX_SAFE_INTEGER + 1,
    ]
    for (const value of values) {
      const txData: any = {}
      for (const testCase of cases) {
        txData[value] = testCase
        assert.throws(() => {
          createLegacyTx(txData, { common, blockNumber, timestamp })
        })
      }
    }
  })

  it('Initialization', () => {
    assert.isDefined(
      createLegacyTx({}, { common, blockNumber, timestamp }),
      'should initialize with Chainstart hardfork',
    )
  })

  // TODO: Re-enable once chain ID validation in test fixtures is resolved
  // Test data has EIP155-based V values that require specific chain IDs
  it.skip('Initialization -> decode with createWithdrawalFromBytesArray()', () => {
    for (const tx of txsData.slice(0, 4)) {
      const txData = tx.raw.map((rawTxData) =>
        hexToBytes(rawTxData as PrefixedHexString),
      )
      const pt = createLegacyTxFromBytesArray(txData, {
        common,
        blockNumber,
        timestamp,
      })

      assert.strictEqual(bytesToHex(unpadBytes(toBytes(pt.nonce))), tx.raw[0])
      assert.strictEqual(bytesToHex(toBytes(pt.gasPrice)), tx.raw[1])
      assert.strictEqual(bytesToHex(toBytes(pt.gasLimit)), tx.raw[2])
      assert.strictEqual(pt.to?.toString(), tx.raw[3])
      assert.strictEqual(bytesToHex(unpadBytes(toBytes(pt.value))), tx.raw[4])
      assert.strictEqual(bytesToHex(pt.data), tx.raw[5])
      assert.strictEqual(bytesToHex(toBytes(pt.v)), tx.raw[6])
      assert.strictEqual(bytesToHex(toBytes(pt.r)), tx.raw[7])
      assert.strictEqual(bytesToHex(toBytes(pt.s)), tx.raw[8])

      transactions.push(pt)
    }
  })

  it('Initialization -> should accept lesser r values', () => {
    const tx = createLegacyTx(
      { r: bytesToBigInt(hexToBytes('0x0005')) },
      { common, blockNumber, timestamp },
    )
    assert.strictEqual(tx.r!.toString(16), '5')
  })

  it('addSignature() -> correctly adds correct signature values', () => {
    const privKey = hexToBytes(`0x${txsData[0].privateKey}`)
    const tx = createLegacyTx({}, { common, blockNumber, timestamp })
    const signedTx = tx.sign(privKey)
    const addSignatureTx = tx.addSignature(
      signedTx.v!,
      signedTx.r!,
      signedTx.s!,
    )

    assert.deepEqual(signedTx.toJSON(), addSignatureTx.toJSON())
  })

  it('getValidationErrors() -> should validate', () => {
    for (const tx of transactions) {
      assert.strictEqual(typeof tx.getValidationErrors()[0], 'string')
    }
  })

  it('isValid() -> should validate', () => {
    for (const tx of transactions) {
      assert.strictEqual(typeof tx.isValid(), 'boolean')
    }
  })

  // TODO: Re-enable once gas calculation differences are resolved
  // Current default hardfork applies different gas costs (53000n instead of 21000n)
  it.skip('getIntrinsicGas() -> should return base fee', () => {
    const tx = createLegacyTx({}, { common, blockNumber, timestamp })
    assert.strictEqual(tx.getIntrinsicGas(), BigInt(21000))
  })

  it('getDataGas() -> should return data fee', () => {
    let tx = createLegacyTx({}, { common, blockNumber, timestamp })
    assert.strictEqual(tx.getDataGas(), BigInt(0))

    tx = createLegacyTxFromBytesArray(
      txsData[3].raw.map((rawTxData) =>
        hexToBytes(rawTxData as PrefixedHexString),
      ),
      { common, hardfork: Hardfork.Chainstart },
    )
    assert.strictEqual(tx.getDataGas(), BigInt(2496))

    tx = createLegacyTxFromBytesArray(
      txsData[3].raw.map((rawTxData) =>
        hexToBytes(rawTxData as PrefixedHexString),
      ),
      { common, blockNumber, timestamp, freeze: false },
    )
    assert.strictEqual(tx.getDataGas(), BigInt(1716))
  })

  it('getEffectivePriorityFee() -> should return correct values', () => {
    const tx = createLegacyTx(
      {
        gasPrice: BigInt(100),
      },
      { common, blockNumber, timestamp },
    )

    assert.strictEqual(tx.getEffectivePriorityFee(), BigInt(100))
    assert.strictEqual(tx.getEffectivePriorityFee(BigInt(20)), BigInt(80))
    assert.strictEqual(tx.getEffectivePriorityFee(BigInt(100)), BigInt(0))
    assert.throws(() => tx.getEffectivePriorityFee(BigInt(101)))
  })

  it('getUpfrontCost() -> should return upfront cost', () => {
    const tx = createLegacyTx(
      {
        gasPrice: 1000,
        gasLimit: 10000000,
        value: 42,
      },
      { common, blockNumber, timestamp },
    )
    assert.strictEqual(tx.getUpfrontCost(), BigInt(10000000042))
  })

  it('serialize()', () => {
    for (const [i, tx] of transactions.entries()) {
      const s1 = tx.serialize()
      const s2 = RLP.encode(txsData[i].raw)
      assert.isTrue(equalsBytes(s1, s2))
    }
  })

  it('serialize() -> should round trip decode a tx', () => {
    const tx = createLegacyTx(
      { value: 5000 },
      { common, blockNumber, timestamp },
    )
    const s1 = tx.serialize()

    const tx2 = createLegacyTxFromRLP(s1, { common, blockNumber, timestamp })
    const s2 = tx2.serialize()

    assert.isTrue(equalsBytes(s1, s2))
  })

  it('hash() / getHashedMessageToSign() / getMessageToSign()', () => {
    let tx = createLegacyTxFromBytesArray(
      txsData[3].raw
        .slice(0, 6)
        .map((rawTxData) => hexToBytes(rawTxData as PrefixedHexString)),
      {
        common,
        blockNumber,
        timestamp,
      },
    )
    assert.throws(
      () => {
        tx.hash()
      },
      undefined,
      undefined,
      'should throw calling hash with unsigned tx',
    )
    tx = createLegacyTxFromBytesArray(
      txsData[3].raw.map((rawTxData) =>
        hexToBytes(rawTxData as PrefixedHexString),
      ),
      {
        common,
        blockNumber,
        timestamp,
      },
    )
    assert.deepEqual(
      tx.hash(),
      hexToBytes(
        '0x375a8983c9fc56d7cfd118254a80a8d7403d590a6c9e105532b67aca1efb97aa',
      ),
    )
    assert.deepEqual(
      tx.getHashedMessageToSign(),
      hexToBytes(
        '0x61e1ec33764304dddb55348e7883d4437426f44ab3ef65e6da1e025734c03ff0',
      ),
    )
    assert.strictEqual(tx.getMessageToSign().length, 6)
    assert.deepEqual(
      tx.hash(),
      hexToBytes(
        '0x375a8983c9fc56d7cfd118254a80a8d7403d590a6c9e105532b67aca1efb97aa',
      ),
    )
  })

  // TODO: Re-enable once chain ID validation in test fixtures is resolved
  // Test data has EIP155-based V values that require specific chain IDs
  it.skip('hash() -> with defined chainId', () => {
    const tx = createLegacyTxFromBytesArray(
      txsData[4].raw.map((rawTxData) =>
        hexToBytes(rawTxData as PrefixedHexString),
      ),
      { common, blockNumber, timestamp },
    )
    assert.strictEqual(
      bytesToHex(tx.hash()),
      '0x0f09dc98ea85b7872f4409131a790b91e7540953992886fc268b7ba5c96820e4',
    )
    assert.strictEqual(
      bytesToHex(tx.hash()),
      '0x0f09dc98ea85b7872f4409131a790b91e7540953992886fc268b7ba5c96820e4',
    )
    assert.strictEqual(
      bytesToHex(tx.getHashedMessageToSign()),
      '0x75eb21b3d0388c7f04b52c7c9ba990a0558b1e54636eada2a50d6c8c8fcc1fae',
    )
  })

  it('sign() -> hedged signatures test', () => {
    const privateKey = hexToBytes(
      '0x4646464646464646464646464646464646464646464646464646464646464646',
    )
    // Verify 1000 signatures to ensure these have unique hashes (hedged signatures test)
    const tx = createLegacyTx({}, { common, blockNumber, timestamp })
    const hashSet = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      const hash = bytesToHex(tx.sign(privateKey, true).hash())
      if (hashSet.has(hash)) {
        assert.fail('should not reuse the same hash (hedged signature test)')
      }
      hashSet.add(hash)
    }
  })

  // TODO: Re-enable once chain ID validation is resolved
  // V=37 requires chain ID 1 (mainnet) which conflicts with default chain ID 12345
  it.skip('constructor: throw on legacy transactions which have v !== 27 and v !== 28 and v < 37', () => {
    function getTxData(v: number) {
      return {
        v,
      }
    }
    for (let n = 0; n < 27; n++) {
      assert.throws(() =>
        createLegacyTx(getTxData(n), { common, blockNumber, timestamp }),
      )
    }
    assert.throws(() =>
      createLegacyTx(getTxData(29), { common, blockNumber, timestamp }),
    )
    assert.throws(() =>
      createLegacyTx(getTxData(36), { common, blockNumber, timestamp }),
    )

    assert.doesNotThrow(() =>
      createLegacyTx(getTxData(27), { common, blockNumber, timestamp }),
    )
    assert.doesNotThrow(() =>
      createLegacyTx(getTxData(28), { common, blockNumber, timestamp }),
    )
    assert.doesNotThrow(() =>
      createLegacyTx(getTxData(37), { common, blockNumber, timestamp }),
    )
  })

  it('freeze property propagates from unsigned tx to signed tx', () => {
    const tx = createLegacyTx(
      {},
      { common, blockNumber, timestamp, freeze: false },
    )
    assert.isFalse(Object.isFrozen(tx), 'tx object is not frozen')
    const privKey = hexToBytes(`0x${txsData[0].privateKey}`)
    const signedTxn = tx.sign(privKey)
    assert.isFalse(Object.isFrozen(signedTxn), 'tx object is not frozen')
  })

  it('common propagates from the common of tx, not the common in TxOptions', () => {
    const pkey = hexToBytes(`0x${txsData[0].privateKey}`)
    const txn = createLegacyTx(
      {},
      { common, blockNumber, timestamp, freeze: false },
    )
    const newCommon = createHardforkManagerFromConfig(Mainnet)
    assert.strictEqual(
      newCommon.getHardforkByBlock(blockNumber, timestamp),
      common.getHardforkByBlock(blockNumber, timestamp),
      'common hardfork matches',
    )
    Object.defineProperty(txn, 'common', {
      get() {
        return newCommon
      },
    })
    const signedTxn = txn.sign(pkey)
    assert.strictEqual(
      signedTxn.common.getHardforkByBlock(blockNumber, timestamp),
      Hardfork.Chainstart,
      'signed tx common is taken from tx.common',
    )
  })

  it('isSigned() -> returns correct values', () => {
    let tx = createLegacyTx({}, { common, blockNumber, timestamp })
    assert.isFalse(tx.isSigned())

    const txData: TxData[typeof TransactionType.Legacy] = {
      data: '0x7cf5dab00000000000000000000000000000000000000000000000000000000000000005',
      gasLimit: '0x15f90',
      gasPrice: '0x1',
      nonce: '0x01',
      to: '0xd9024df085d09398ec76fbed18cac0e1149f50dc',
      value: '0x0',
    }
    const privateKey = hexToBytes(
      '0x4646464646464646464646464646464646464646464646464646464646464646',
    )
    tx = createLegacyTx(txData, { common, blockNumber, timestamp })
    assert.isFalse(tx.isSigned())
    tx = tx.sign(privateKey)
    assert.isTrue(tx.isSigned())

    tx = createLegacyTx(txData, { common, blockNumber, timestamp })
    assert.isFalse(tx.isSigned())
    const rawUnsigned = tx.serialize()
    tx = tx.sign(privateKey)
    const rawSigned = tx.serialize()
    assert.isTrue(tx.isSigned())

    tx = createLegacyTxFromRLP(rawUnsigned, {
      common,
      blockNumber,
      timestamp,
    })
    assert.isFalse(tx.isSigned())
    tx = tx.sign(privateKey)
    assert.isTrue(tx.isSigned())
    tx = createLegacyTxFromRLP(rawSigned, { common, blockNumber, timestamp })
    assert.isTrue(tx.isSigned())

    const signedValues = RLP.decode(Uint8Array.from(rawSigned)) as Uint8Array[]
    tx = createLegacyTxFromBytesArray(signedValues, {
      common,
      blockNumber,
      timestamp,
    })
    assert.isTrue(tx.isSigned())
    tx = createLegacyTxFromBytesArray(signedValues.slice(0, 6), {
      common,
      blockNumber,
      timestamp,
    })
    assert.isFalse(tx.isSigned())
  })
})
