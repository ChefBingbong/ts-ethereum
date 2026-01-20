import {
  createHardforkManagerFromConfig,
  Mainnet,
} from '@ts-ethereum/chain-config'
import { hexToBytes } from '@ts-ethereum/utils'
import { assert, describe, it } from 'vitest'

import {
  createLegacyTx,
  createTx,
  createTxFromBlockBodyData,
  createTxFromRLP,
  LegacyTx,
  TransactionType,
} from '../../src/index'

const common = createHardforkManagerFromConfig(Mainnet)
const blockNumber = 0n
const timestamp = 0n

const pKey = hexToBytes(
  '0x4646464646464646464646464646464646464646464646464646464646464646',
)

const unsignedLegacyTx = createLegacyTx({}, { common, blockNumber, timestamp })
const signedLegacyTx = unsignedLegacyTx.sign(pKey)

const txTypes = [
  {
    class: LegacyTx,
    name: 'LegacyTx',
    unsigned: unsignedLegacyTx,
    signed: signedLegacyTx,
    type: TransactionType.Legacy,
  },
]

describe.skip('[TransactionFactory]: Basic functions', () => {
  it('fromSerializedData() -> success cases', () => {
    for (const txType of txTypes) {
      const serialized = txType.unsigned.serialize()
      const factoryTx = createTxFromRLP(serialized, {
        common,
        blockNumber,
        timestamp,
      })
      assert.strictEqual(
        factoryTx.constructor.name,
        txType.class.name,
        `should return the right type (${txType.name})`,
      )
    }
  })

  it('fromSerializedData() -> error cases', () => {
    // No error cases for Legacy transactions
  })

  it('fromBlockBodyData() -> success cases', () => {
    for (const txType of txTypes) {
      const rawTx = txType.signed.raw() as Uint8Array[]
      const tx = createTxFromBlockBodyData(rawTx, {
        common,
        blockNumber,
        timestamp,
      })
      assert.strictEqual(
        tx.constructor.name,
        txType.name,
        `should return the right type (${txType.name})`,
      )
      assert.deepEqual(
        tx.raw(),
        rawTx as Uint8Array[],
        `round-trip raw() creation should match (${txType.name})`,
      )
    }
  })

  it('fromTxData() -> success cases', () => {
    for (const txType of txTypes) {
      const tx = createTx(
        { type: txType.type },
        { common, blockNumber, timestamp },
      )
      assert.strictEqual(
        tx.constructor.name,
        txType.class.name,
        `should return the right type (${txType.name})`,
      )
      const tx2 = createTx({}, { common, blockNumber, timestamp })
      assert.strictEqual(
        tx2.constructor.name,
        txType.class.name,
        `should return the right type (${txType.name})`,
      )
    }
  })
})
