import {
  createCustomCommon,
  Hardfork,
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

const common = createCustomCommon({}, Mainnet, {
  hardfork: Hardfork.Chainstart,
})

const pKey = hexToBytes(
  '0x4646464646464646464646464646464646464646464646464646464646464646',
)

const unsignedLegacyTx = createLegacyTx({})
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

describe('[TransactionFactory]: Basic functions', () => {
  it('fromSerializedData() -> success cases', () => {
    for (const txType of txTypes) {
      const serialized = txType.unsigned.serialize()
      const factoryTx = createTxFromRLP(serialized, { common })
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
      const tx = createTxFromBlockBodyData(rawTx, { common })
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
      const tx = createTx({ type: txType.type }, { common })
      assert.strictEqual(
        tx.constructor.name,
        txType.class.name,
        `should return the right type (${txType.name})`,
      )
      const tx2 = createTx({})
      assert.strictEqual(
        tx2.constructor.name,
        txType.class.name,
        `should return the right type (${txType.name})`,
      )
    }
  })
})
