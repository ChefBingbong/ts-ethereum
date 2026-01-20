import {
  createHardforkManagerFromConfig,
  Hardfork,
  Mainnet,
} from '@ts-ethereum/chain-config'
import {
  bytesToBigInt,
  equalsBytes,
  hexToBytes,
  privateToPublic,
  SECP256K1_ORDER,
  utf8ToBytes,
} from '@ts-ethereum/utils'
import { assert, describe, it } from 'vitest'
import type { LegacyTxData } from '../../src/index'
import {
  createLegacyTx,
  createLegacyTxFromBytesArray,
  createLegacyTxFromRLP,
  LegacyTx,
  TransactionType,
} from '../../src/index'
import { txsData } from './testData/txs'

describe.skip('[BaseTransaction]', () => {
  const common = createHardforkManagerFromConfig(Mainnet)
  const blockNumber = 0n
  const timestamp = 0n

  const legacyTxs: LegacyTx[] = []
  for (const tx of txsData.slice(0, 4)) {
    legacyTxs.push(
      createLegacyTx(tx.data as LegacyTxData, {
        common,
        blockNumber,
        timestamp,
      }),
    )
  }

  const zero = new Uint8Array(0)
  const txTypes = [
    {
      class: LegacyTx,
      name: 'LegacyTx',
      type: TransactionType.Legacy,
      values: Array(6).fill(zero),
      txs: legacyTxs,
      fixtures: txsData,
      activeCapabilities: [],
      create: {
        txData: createLegacyTx,
        rlp: createLegacyTxFromRLP,
        bytesArray: createLegacyTxFromBytesArray,
      },
    },
  ]

  it('Initialization', () => {
    for (const txType of txTypes) {
      let tx = txType.create.txData({}, { common, blockNumber, timestamp })
      assert.strictEqual(
        tx.common.getHardforkByBlock(blockNumber, timestamp),
        Hardfork.Chainstart,
        `${txType.name}: should initialize with correct HF provided`,
      )
      assert.isFrozen(tx, `${txType.name}: tx should be frozen by default`)

      const initCommon = createHardforkManagerFromConfig(Mainnet)
      tx = txType.create.txData(
        {},
        { common: initCommon, blockNumber, timestamp },
      )
      assert.strictEqual(
        tx.common.getHardforkByBlock(blockNumber, timestamp),
        Hardfork.Chainstart,
        `${txType.name}: should initialize with correct HF provided`,
      )

      tx = txType.create.txData(
        {},
        { common, blockNumber, timestamp, freeze: false },
      )
      assert.isNotFrozen(
        tx,
        `${txType.name}: tx should not be frozen when freeze deactivated in options`,
      )

      tx = txType.create.txData({}, { common, blockNumber, timestamp })
      assert.strictEqual(
        tx.common.getParamAtHardfork('txGas', Hardfork.Chainstart),
        BigInt(21000),
        'should use default parameters',
      )

      // Perform the same test as above, but now using a different construction method. This also implies that passing on the
      // options object works as expected.
      tx = txType.create.txData(
        {},
        { common, blockNumber, timestamp, freeze: false },
      )
      const rlpData = tx.serialize()

      tx = txType.create.rlp(rlpData, { common, blockNumber, timestamp })
      assert.strictEqual(
        tx.type,
        txType.type,
        `${txType.name}: fromSerializedTx() -> should initialize correctly`,
      )

      assert.isFrozen(tx, `${txType.name}: tx should be frozen by default`)

      tx = txType.create.rlp(rlpData, {
        common,
        blockNumber,
        timestamp,
        freeze: false,
      })
      assert.isNotFrozen(
        tx,
        `${txType.name}: tx should not be frozen when freeze deactivated in options`,
      )

      tx = txType.create.bytesArray(txType.values as any, {
        common,
        blockNumber,
        timestamp,
      })
      assert.isFrozen(tx, `${txType.name}: tx should be frozen by default`)

      tx = txType.create.bytesArray(txType.values as any, {
        common,
        blockNumber,
        timestamp,
        freeze: false,
      })
      assert.isNotFrozen(
        tx,
        `${txType.name}: tx should not be frozen when freeze deactivated in options`,
      )
    }
  })

  it('createWithdrawalFromBytesArray()', () => {
    const rlpData: any = legacyTxs[0].raw()
    rlpData[0] = hexToBytes('0x0')
    try {
      createLegacyTxFromBytesArray(rlpData, {
        common,
        blockNumber,
        timestamp,
      })
      assert.fail('should have thrown when nonce has leading zeroes')
    } catch (err: any) {
      assert.isTrue(
        err.message.includes('nonce cannot have leading zeroes'),
        'should throw with nonce with leading zeroes',
      )
    }
    rlpData[0] = hexToBytes('0x')
    rlpData[6] = hexToBytes('0x0')
    try {
      createLegacyTxFromBytesArray(rlpData, {
        common,
        blockNumber,
        timestamp,
      })
      assert.fail('should have thrown when v has leading zeroes')
    } catch (err: any) {
      assert.isTrue(
        err.message.includes('v cannot have leading zeroes'),
        'should throw with v with leading zeroes',
      )
    }
  })

  it('serialize()', () => {
    for (const txType of txTypes) {
      for (const tx of txType.txs) {
        assert.isDefined(
          txType.create.rlp(tx.serialize(), {
            common,
            blockNumber,
            timestamp,
          }),
          `${txType.name}: should do roundtrip serialize() -> fromSerializedTx()`,
        )
        assert.isDefined(
          txType.create.rlp(tx.serialize(), {
            common,
            blockNumber,
            timestamp,
          }),
          `${txType.name}: should do roundtrip serialize() -> fromSerializedTx()`,
        )
      }
    }
  })

  it('supports()', () => {
    for (const txType of txTypes) {
      for (const tx of txType.txs) {
        for (const activeCapability of txType.activeCapabilities) {
          assert.isDefined(
            tx.supports(activeCapability),
            `${txType.name}: should recognize all supported capabilities`,
          )
        }
      }
    }
  })

  it('raw()', () => {
    for (const txType of txTypes) {
      for (const tx of txType.txs) {
        assert.isDefined(
          txType.create.bytesArray(tx.raw() as any, {
            common,
            blockNumber,
            timestamp,
          }),
          `${txType.name}: should do roundtrip raw() -> createWithdrawalFromBytesArray()`,
        )
      }
    }
  })

  it('verifySignature()', () => {
    for (const txType of txTypes) {
      for (const tx of txType.txs) {
        assert.strictEqual(
          tx.verifySignature(),
          true,
          `${txType.name}: signature should be valid`,
        )
      }
    }
  })

  it('verifySignature() -> invalid', () => {
    for (const txType of txTypes) {
      for (const txFixture of txType.fixtures.slice(0, 4)) {
        // set `s` to a single zero
        txFixture.data.s = '0x' + '0'
        const tx = txType.create.txData((txFixture as any).data, {
          common,
          blockNumber,
          timestamp,
        })
        assert.strictEqual(
          tx.verifySignature(),
          false,
          `${txType.name}: signature should not be valid`,
        )
        const errors = tx.getValidationErrors()
        assert.isTrue(
          errors.length > 0 &&
            errors.some((e) => e.includes('Invalid Signature')),
          `${txType.name}: should return an error string about not verifying signatures`,
        )
        assert.isFalse(
          tx.isValid(),
          `${txType.name}: should not validate correctly`,
        )
      }
    }
  })

  it('sign()', () => {
    for (const txType of txTypes) {
      for (const [i, tx] of txType.txs.entries()) {
        const { privateKey } = txType.fixtures[i]
        if (privateKey !== undefined) {
          assert.isDefined(
            tx.sign(hexToBytes(`0x${privateKey}`)),
            `${txType.name}: should sign tx`,
          )
        }

        assert.throws(
          () => tx.sign(utf8ToBytes('invalid')),
          undefined,
          undefined,
          `${txType.name}: should fail with invalid PK`,
        )
      }
    }
  })

  it('isSigned() -> returns correct values', () => {
    for (const txType of txTypes) {
      const txs = [
        ...txType.txs,
        // add unsigned variants
        ...txType.txs.map((tx) =>
          txType.create.txData(
            {
              ...tx,
              v: undefined,
              r: undefined,
              s: undefined,
            },
            { common, blockNumber, timestamp },
          ),
        ),
      ]
      for (const tx of txs) {
        assert.strictEqual(
          tx.isSigned(),
          tx.v !== undefined && tx.r !== undefined && tx.s !== undefined,
          'isSigned() returns correctly',
        )
      }
    }
  })

  it('getSenderAddress()', () => {
    for (const txType of txTypes) {
      for (const [i, tx] of txType.txs.entries()) {
        const { privateKey, sendersAddress } = txType.fixtures[i]
        if (privateKey !== undefined) {
          const signedTx = tx.sign(hexToBytes(`0x${privateKey}`))
          assert.strictEqual(
            signedTx.getSenderAddress().toString(),
            `0x${sendersAddress}`,
            `${txType.name}: should get sender's address after signing it`,
          )
        }
      }
    }
  })

  it('getSenderPublicKey()', () => {
    for (const txType of txTypes) {
      for (const [i, tx] of txType.txs.entries()) {
        const { privateKey } = txType.fixtures[i]
        if (privateKey !== undefined) {
          const signedTx = tx.sign(hexToBytes(`0x${privateKey}`))
          const txPubKey = signedTx.getSenderPublicKey()
          const pubKeyFromPriv = privateToPublic(hexToBytes(`0x${privateKey}`))
          assert.isTrue(
            equalsBytes(txPubKey, pubKeyFromPriv),
            `${txType.name}: should get sender's public key after signing it`,
          )
        }
      }
    }
  })

  it('getSenderPublicKey() -> should throw if s-value is greater than secp256k1n/2', () => {
    // All transaction signatures whose s-value is greater than secp256k1n/2 are considered invalid.
    for (const txType of txTypes) {
      for (const [i, tx] of txType.txs.entries()) {
        const { privateKey } = txType.fixtures[i]
        if (privateKey !== undefined) {
          let signedTx = tx.sign(hexToBytes(`0x${privateKey}`))
          signedTx = JSON.parse(JSON.stringify(signedTx)) // deep clone
          // @ts-expect-error -- Assign to read-only property
          signedTx.s = SECP256K1_ORDER + BigInt(1)
          assert.throws(
            () => {
              signedTx.getSenderPublicKey()
            },
            undefined,
            undefined,
            'should throw when s-value is greater than secp256k1n/2',
          )
        }
      }
    }
  })

  it('verifySignature()', () => {
    for (const txType of txTypes) {
      for (const [i, tx] of txType.txs.entries()) {
        const { privateKey } = txType.fixtures[i]
        if (privateKey !== undefined) {
          const signedTx = tx.sign(hexToBytes(`0x${privateKey}`))
          assert.isTrue(
            signedTx.verifySignature(),
            `${txType.name}: should verify signing it`,
          )
        }
      }
    }
  })

  it('initialization with defaults', () => {
    const bufferZero = hexToBytes('0x')
    const tx = createLegacyTx(
      {
        nonce: undefined,
        gasLimit: undefined,
        gasPrice: undefined,
        to: undefined,
        value: undefined,
        data: undefined,
        v: undefined,
        r: undefined,
        s: undefined,
      },
      { common, blockNumber, timestamp },
    )
    assert.strictEqual(tx.v, undefined)
    assert.strictEqual(tx.r, undefined)
    assert.strictEqual(tx.s, undefined)
    assert.deepEqual(tx.to, undefined)
    assert.strictEqual(tx.value, bytesToBigInt(bufferZero))
    assert.deepEqual(tx.data, bufferZero)
    assert.strictEqual(tx.gasPrice, bytesToBigInt(bufferZero))
    assert.strictEqual(tx.gasLimit, bytesToBigInt(bufferZero))
    assert.strictEqual(tx.nonce, bytesToBigInt(bufferZero))
  })
})
