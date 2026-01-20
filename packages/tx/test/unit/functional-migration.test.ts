import {
  createHardforkManagerFromConfig,
  Hardfork,
  Mainnet,
} from '@ts-ethereum/chain-config'
import {
  createAddressFromString,
  equalsBytes,
  hexToBytes,
} from '@ts-ethereum/utils'
import { assert, describe, it } from 'vitest'

import { Capability, createLegacyTx, TransactionType } from '../../src/index'
import { LegacyTxData } from '../../src/tx-functional.ts/tx-legacy'
import { newTx } from '../../src/tx-functional.ts/tx-manager'

describe('[Functional Migration: Legacy Tx]', () => {
  const common = createHardforkManagerFromConfig(Mainnet)
  const blockNumber = 0n
  const timestamp = 0n
  const privateKey = hexToBytes(
    '0x4646464646464646464646464646464646464646464646464646464646464646',
  )

  describe('Basic Properties', () => {
    it('should have matching properties for unsigned tx', () => {
      const txData = {
        nonce: 1n,
        gasPrice: 1000000000n,
        gasLimit: 21000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n, // 1 ETH
        data: new Uint8Array([0x12, 0x34]),
      }

      // Old API
      const oldTx = createLegacyTx(txData, { common, blockNumber, timestamp })

      // New API
      const newTxData = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
      })
      const newTxManager = newTx(newTxData, { common, blockNumber, timestamp })

      // Compare properties
      assert.strictEqual(newTxManager.nonce, oldTx.nonce, 'nonce should match')
      assert.strictEqual(
        newTxManager.gasLimit,
        oldTx.gasLimit,
        'gasLimit should match',
      )
      assert.strictEqual(newTxManager.value, oldTx.value, 'value should match')
      assert.isTrue(
        equalsBytes(newTxManager.data, oldTx.data),
        'data should match',
      )
      assert.strictEqual(
        newTxManager.to?.toString(),
        oldTx.to?.toString(),
        'to should match',
      )
      assert.strictEqual(
        newTxManager.type,
        TransactionType.Legacy,
        'type should be Legacy',
      )
    })

    it('should correctly identify as unsigned', () => {
      const oldTx = createLegacyTx({}, { common, blockNumber, timestamp })
      const newTxData = new LegacyTxData({
        nonce: 0n,
        gasPrice: 0n,
        gasLimit: 0n,
        value: 0n,
        data: new Uint8Array(0),
      })
      const newTxManager = newTx(newTxData, { common, blockNumber, timestamp })

      assert.strictEqual(
        newTxManager.isSigned(),
        oldTx.isSigned(),
        'isSigned should match',
      )
      assert.isFalse(newTxManager.isSigned(), 'should be unsigned')
    })
  })

  describe('Serialization', () => {
    it('should produce identical serialized output for unsigned tx', () => {
      const txData = {
        nonce: 5n,
        gasPrice: 2000000000n,
        gasLimit: 100000n,
        to: createAddressFromString(
          '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        ),
        value: 500000000000000000n,
        data: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
      }

      const oldTx = createLegacyTx(txData, { common, blockNumber, timestamp })
      const newTxData = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
      })
      const newTxManager = newTx(newTxData, { common, blockNumber, timestamp })

      assert.isTrue(
        equalsBytes(newTxManager.serialize(), oldTx.serialize()),
        'serialized bytes should match',
      )
    })

    it('should produce identical raw() arrays', () => {
      const txData = {
        nonce: 10n,
        gasPrice: 5000000000n,
        gasLimit: 50000n,
        value: 100n,
        data: new Uint8Array(0),
      }

      const oldTx = createLegacyTx(txData, { common, blockNumber, timestamp })
      const newTxData = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        value: txData.value,
        data: txData.data,
      })
      const newTxManager = newTx(newTxData, { common, blockNumber, timestamp })

      const oldRaw = oldTx.raw()
      const newRaw = newTxManager.raw() as Uint8Array[]

      assert.strictEqual(
        newRaw.length,
        oldRaw.length,
        'raw array length should match',
      )

      for (let i = 0; i < oldRaw.length; i++) {
        assert.isTrue(
          equalsBytes(newRaw[i]!, oldRaw[i]!),
          `raw[${i}] should match`,
        )
      }
    })
  })

  describe('Hashing', () => {
    it('should produce identical getMessageToSign() for pre-EIP155', () => {
      // Use pre-spuriousDragon hardfork for pre-EIP155
      const preDragonCommon = createHardforkManagerFromConfig(Mainnet)
      const txData = {
        nonce: 1n,
        gasPrice: 1000000000n,
        gasLimit: 21000n,
        value: 1000000000000000000n,
        data: new Uint8Array(0),
      }

      const oldTx = createLegacyTx(txData, {
        common: preDragonCommon,
        hardfork: Hardfork.Chainstart,
      })
      const newTxData = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        value: txData.value,
        data: txData.data,
      })
      const newTxManager = newTx(newTxData, {
        common: preDragonCommon,
        hardfork: Hardfork.Chainstart,
      })

      const oldMsg = oldTx.getMessageToSign()
      const newMsg = newTxManager.getMessageToSign() as Uint8Array[]

      // Pre-EIP155: 6 fields [nonce, gasPrice, gasLimit, to, value, data]
      assert.strictEqual(oldMsg.length, 6, 'old msg should have 6 fields')
      assert.strictEqual(newMsg.length, 6, 'new msg should have 6 fields')

      for (let i = 0; i < oldMsg.length; i++) {
        assert.isTrue(
          equalsBytes(newMsg[i]!, oldMsg[i]!),
          `getMessageToSign[${i}] should match`,
        )
      }
    })

    it('should produce identical getMessageToSign() for EIP-155', () => {
      // Use post-spuriousDragon hardfork for EIP-155
      const txData = {
        nonce: 1n,
        gasPrice: 1000000000n,
        gasLimit: 21000n,
        value: 1000000000000000000n,
        data: new Uint8Array(0),
      }

      const oldTx = createLegacyTx(txData, {
        common,
        hardfork: Hardfork.SpuriousDragon,
      })
      const newTxData = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        value: txData.value,
        data: txData.data,
      })
      const newTxManager = newTx(newTxData, {
        common,
        hardfork: Hardfork.SpuriousDragon,
      })

      const oldMsg = oldTx.getMessageToSign()
      const newMsg = newTxManager.getMessageToSign() as Uint8Array[]

      // EIP-155: 9 fields [nonce, gasPrice, gasLimit, to, value, data, chainId, 0, 0]
      assert.strictEqual(oldMsg.length, 9, 'old msg should have 9 fields')
      assert.strictEqual(newMsg.length, 9, 'new msg should have 9 fields')

      for (let i = 0; i < oldMsg.length; i++) {
        assert.isTrue(
          equalsBytes(newMsg[i]!, oldMsg[i]!),
          `getMessageToSign[${i}] should match`,
        )
      }
    })

    it('should produce identical getHashedMessageToSign()', () => {
      const txData = {
        nonce: 1n,
        gasPrice: 1000000000n,
        gasLimit: 21000n,
        value: 1000000000000000000n,
        data: new Uint8Array(0),
      }

      const oldTx = createLegacyTx(txData, { common, blockNumber, timestamp })
      const newTxData = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        value: txData.value,
        data: txData.data,
      })
      const newTxManager = newTx(newTxData, { common, blockNumber, timestamp })

      assert.isTrue(
        equalsBytes(
          newTxManager.getHashedMessageToSign(),
          oldTx.getHashedMessageToSign(),
        ),
        'getHashedMessageToSign should match',
      )
    })
  })

  describe('Signing', () => {
    it('should produce identical signed tx when signing with same key', () => {
      const txData = {
        nonce: 1n,
        gasPrice: 1000000000n,
        gasLimit: 21000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n,
        data: new Uint8Array(0),
      }

      const oldTx = createLegacyTx(txData, { common, blockNumber, timestamp })
      const signedOldTx = oldTx.sign(privateKey, false) // deterministic signature

      const newTxData = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
      })
      const newTxManager = newTx(newTxData, { common, blockNumber, timestamp })
      const signedNewTx = newTxManager.sign(privateKey, false)

      // Compare v, r, s values
      assert.strictEqual(signedNewTx.v, signedOldTx.v, 'v values should match')
      assert.strictEqual(signedNewTx.r, signedOldTx.r, 'r values should match')
      assert.strictEqual(signedNewTx.s, signedOldTx.s, 's values should match')
    })

    it('should produce identical hash() for signed tx', () => {
      const txData = {
        nonce: 1n,
        gasPrice: 1000000000n,
        gasLimit: 21000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n,
        data: new Uint8Array(0),
      }

      const oldTx = createLegacyTx(txData, { common, blockNumber, timestamp })
      const signedOldTx = oldTx.sign(privateKey, false)

      const newTxData = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
      })
      const newTxManager = newTx(newTxData, { common, blockNumber, timestamp })
      const signedNewTx = newTxManager.sign(privateKey, false)

      assert.isTrue(
        equalsBytes(signedNewTx.hash(), signedOldTx.hash()),
        'hash() should match',
      )
    })

    it('should recover identical sender address', () => {
      const txData = {
        nonce: 1n,
        gasPrice: 1000000000n,
        gasLimit: 21000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n,
        data: new Uint8Array(0),
      }

      const oldTx = createLegacyTx(txData, { common, blockNumber, timestamp })
      const signedOldTx = oldTx.sign(privateKey, false)

      const newTxData = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
      })
      const newTxManager = newTx(newTxData, { common, blockNumber, timestamp })
      const signedNewTx = newTxManager.sign(privateKey, false)

      assert.strictEqual(
        signedNewTx.getSenderAddress().toString(),
        signedOldTx.getSenderAddress().toString(),
        'getSenderAddress() should match',
      )
    })

    it('should recover identical sender public key', () => {
      const txData = {
        nonce: 1n,
        gasPrice: 1000000000n,
        gasLimit: 21000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n,
        data: new Uint8Array(0),
      }

      const oldTx = createLegacyTx(txData, { common, blockNumber, timestamp })
      const signedOldTx = oldTx.sign(privateKey, false)

      const newTxData = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
      })
      const newTxManager = newTx(newTxData, { common, blockNumber, timestamp })
      const signedNewTx = newTxManager.sign(privateKey, false)

      assert.isTrue(
        equalsBytes(
          signedNewTx.getSenderPublicKey(),
          signedOldTx.getSenderPublicKey(),
        ),
        'getSenderPublicKey() should match',
      )
    })
  })

  describe('Gas Calculations', () => {
    it('should produce identical getIntrinsicGas()', () => {
      const txData = {
        nonce: 1n,
        gasPrice: 1000000000n,
        gasLimit: 100000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n,
        data: new Uint8Array([0x12, 0x34, 0x00, 0x00, 0x56]),
      }

      const oldTx = createLegacyTx(txData, { common, blockNumber, timestamp })
      const newTxData = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
      })
      const newTxManager = newTx(newTxData, { common, blockNumber, timestamp })

      assert.strictEqual(
        newTxManager.getIntrinsicGas(),
        oldTx.getIntrinsicGas(),
        'getIntrinsicGas() should match',
      )
    })

    it('should produce identical getDataGas()', () => {
      const txData = {
        nonce: 1n,
        gasPrice: 1000000000n,
        gasLimit: 100000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n,
        data: new Uint8Array([0x12, 0x34, 0x00, 0x00, 0x56]),
      }

      const oldTx = createLegacyTx(txData, { common, blockNumber, timestamp })
      const newTxData = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
      })
      const newTxManager = newTx(newTxData, { common, blockNumber, timestamp })

      assert.strictEqual(
        newTxManager.getDataGas(),
        oldTx.getDataGas(),
        'getDataGas() should match',
      )
    })

    it('should produce identical getUpfrontCost()', () => {
      const txData = {
        nonce: 1n,
        gasPrice: 1000000000n,
        gasLimit: 100000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n,
        data: new Uint8Array(0),
      }

      const oldTx = createLegacyTx(txData, { common, blockNumber, timestamp })
      const newTxData = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
      })
      const newTxManager = newTx(newTxData, { common, blockNumber, timestamp })

      assert.strictEqual(
        newTxManager.getUpfrontCost(),
        oldTx.getUpfrontCost(),
        'getUpfrontCost() should match',
      )
    })
  })

  describe('Validation', () => {
    it('should produce identical isValid() for valid tx', () => {
      const txData = {
        nonce: 1n,
        gasPrice: 1000000000n,
        gasLimit: 100000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n,
        data: new Uint8Array(0),
      }

      const oldTx = createLegacyTx(txData, { common, blockNumber, timestamp })
      const signedOldTx = oldTx.sign(privateKey, false)

      const newTxData = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
      })
      const newTxManager = newTx(newTxData, { common, blockNumber, timestamp })
      const signedNewTx = newTxManager.sign(privateKey, false)

      assert.strictEqual(
        signedNewTx.isValid(),
        signedOldTx.isValid(),
        'isValid() should match',
      )
    })

    it('should produce identical verifySignature() for signed tx', () => {
      const txData = {
        nonce: 1n,
        gasPrice: 1000000000n,
        gasLimit: 100000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n,
        data: new Uint8Array(0),
      }

      const oldTx = createLegacyTx(txData, { common, blockNumber, timestamp })
      const signedOldTx = oldTx.sign(privateKey, false)

      const newTxData = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
      })
      const newTxManager = newTx(newTxData, { common, blockNumber, timestamp })
      const signedNewTx = newTxManager.sign(privateKey, false)

      assert.strictEqual(
        signedNewTx.verifySignature(),
        signedOldTx.verifySignature(),
        'verifySignature() should match',
      )
      assert.isTrue(signedNewTx.verifySignature(), 'signature should be valid')
    })

    it('should produce identical toCreationAddress()', () => {
      // Tx with no 'to' address (contract creation)
      const txData = {
        nonce: 1n,
        gasPrice: 1000000000n,
        gasLimit: 100000n,
        value: 0n,
        data: new Uint8Array([0x60, 0x80, 0x60, 0x40]), // contract bytecode
      }

      const oldTx = createLegacyTx(txData, { common, blockNumber, timestamp })
      const newTxData = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        value: txData.value,
        data: txData.data,
      })
      const newTxManager = newTx(newTxData, { common, blockNumber, timestamp })

      assert.strictEqual(
        newTxManager.toCreationAddress(),
        oldTx.toCreationAddress(),
        'toCreationAddress() should match',
      )
      assert.isTrue(
        newTxManager.toCreationAddress(),
        'should be creation address',
      )

      // Tx with 'to' address (regular transfer)
      const txData2 = {
        nonce: 1n,
        gasPrice: 1000000000n,
        gasLimit: 21000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n,
        data: new Uint8Array(0),
      }

      const oldTx2 = createLegacyTx(txData2, { common, blockNumber, timestamp })
      const newTxData2 = new LegacyTxData({
        nonce: txData2.nonce,
        gasPrice: txData2.gasPrice,
        gasLimit: txData2.gasLimit,
        to: txData2.to,
        value: txData2.value,
        data: txData2.data,
      })
      const newTxManager2 = newTx(newTxData2, {
        common,
        blockNumber,
        timestamp,
      })

      assert.strictEqual(
        newTxManager2.toCreationAddress(),
        oldTx2.toCreationAddress(),
        'toCreationAddress() should match for regular tx',
      )
      assert.isFalse(
        newTxManager2.toCreationAddress(),
        'should not be creation address',
      )
    })
  })

  describe('JSON Conversion', () => {
    it('should produce equivalent toJSON() output', () => {
      const txData = {
        nonce: 1n,
        gasPrice: 1000000000n,
        gasLimit: 21000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n,
        data: new Uint8Array([0x12, 0x34]),
      }

      const oldTx = createLegacyTx(txData, { common, blockNumber, timestamp })
      const newTxData = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
      })
      const newTxManager = newTx(newTxData, { common, blockNumber, timestamp })

      const oldJson = oldTx.toJSON()
      const newJson = newTxManager.toJSON()

      // Compare key fields
      assert.strictEqual(newJson.nonce, oldJson.nonce, 'nonce should match')
      assert.strictEqual(
        newJson.gasLimit,
        oldJson.gasLimit,
        'gasLimit should match',
      )
      assert.strictEqual(
        newJson.gasPrice,
        oldJson.gasPrice,
        'gasPrice should match',
      )
      assert.strictEqual(newJson.value, oldJson.value, 'value should match')
      assert.strictEqual(newJson.data, oldJson.data, 'data should match')
      assert.strictEqual(newJson.to, oldJson.to, 'to should match')
    })
  })

  describe('Capabilities', () => {
    it('should support EIP155ReplayProtection for post-spuriousDragon', () => {
      const txData = {
        nonce: 1n,
        gasPrice: 1000000000n,
        gasLimit: 21000n,
        value: 0n,
        data: new Uint8Array(0),
      }

      const newTxData = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        value: txData.value,
        data: txData.data,
      })
      const newTxManager = newTx(newTxData, {
        common,
        hardfork: Hardfork.SpuriousDragon,
      })

      assert.isTrue(
        newTxManager.supports(Capability.EIP155ReplayProtection),
        'should support EIP155 for post-spuriousDragon',
      )
    })

    it('should not support EIP155ReplayProtection for pre-spuriousDragon', () => {
      const txData = {
        nonce: 1n,
        gasPrice: 1000000000n,
        gasLimit: 21000n,
        value: 0n,
        data: new Uint8Array(0),
      }

      const newTxData = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        value: txData.value,
        data: txData.data,
      })
      const newTxManager = newTx(newTxData, {
        common,
        hardfork: Hardfork.Chainstart,
      })

      assert.isFalse(
        newTxManager.supports(Capability.EIP155ReplayProtection),
        'should not support EIP155 for pre-spuriousDragon',
      )
    })
  })
})
