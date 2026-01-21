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
import { makeSigner } from '../../src/tx-functional.ts/signer/signer-factory'
import { sender, signTx } from '../../src/tx-functional.ts/signing'
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

  describe('Go-Style Signing with Signer', () => {
    it('should sign using signTx(tx, signer, privateKey) pattern', () => {
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

      // Old API
      const oldTx = createLegacyTx(txData, { common, blockNumber, timestamp })
      const signedOldTx = oldTx.sign(privateKey, false)

      // New Go-style API
      const newTxData = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
      })
      const tx = newTx(newTxData, { common, blockNumber, timestamp })
      const signer = makeSigner(common)
      const signedNewTx = signTx(tx, signer, privateKey)

      // Compare v, r, s values
      assert.strictEqual(signedNewTx.v, signedOldTx.v, 'v values should match')
      assert.strictEqual(signedNewTx.r, signedOldTx.r, 'r values should match')
      assert.strictEqual(signedNewTx.s, signedOldTx.s, 's values should match')
    })

    it('should sign using tx.withSignature(signer, sig) pattern', () => {
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

      // Create tx and signer
      const newTxData = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
      })
      const tx = newTx(newTxData, { common, blockNumber, timestamp })
      const signer = makeSigner(common)

      // Sign manually using withSignature
      const { secp256k1 } = require('ethereum-cryptography/secp256k1')
      const h = signer.hash(tx)
      const signature = secp256k1.sign(h, privateKey)
      const sig = new Uint8Array(65)
      sig.set(signature.toCompactRawBytes(), 0)
      sig[64] = signature.recovery

      const signedTx = tx.withSignature(signer, sig)

      // Should produce same result as signTx
      const signedViaSignTx = signTx(tx, signer, privateKey)

      assert.strictEqual(signedTx.v, signedViaSignTx.v, 'v should match')
      assert.strictEqual(signedTx.r, signedViaSignTx.r, 'r should match')
      assert.strictEqual(signedTx.s, signedViaSignTx.s, 's should match')
    })

    it('should recover sender using sender(signer, tx) pattern', () => {
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

      // Old API
      const oldTx = createLegacyTx(txData, { common, blockNumber, timestamp })
      const signedOldTx = oldTx.sign(privateKey, false)

      // New Go-style API
      const newTxData = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
      })
      const tx = newTx(newTxData, { common, blockNumber, timestamp })
      const signer = makeSigner(common, blockNumber, timestamp)
      const signedNewTx = signTx(tx, signer, privateKey)

      // Recover sender using Go-style sender(signer, tx)
      const recoveredSender = sender(signer, signedNewTx)

      assert.strictEqual(
        recoveredSender.toString(),
        signedOldTx.getSenderAddress().toString(),
        'sender should match',
      )
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
      const tx = newTx(newTxData, { common, blockNumber, timestamp })
      const signer = makeSigner(common, blockNumber, timestamp)
      const signedNewTx = signTx(tx, signer, privateKey)

      assert.isTrue(
        equalsBytes(signedNewTx.hash(), signedOldTx.hash()),
        'hash() should match',
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

      const hardfork = common.getHardforkByBlock(blockNumber, timestamp)
      const oldTx = createLegacyTx(txData, {
        common,
        blockNumber,
        timestamp,
        hardfork,
      })
      const signedOldTx = oldTx.sign(privateKey, false)

      const newTxData = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
      })

      const tx = newTx(newTxData, { common, blockNumber, timestamp, hardfork })
      const signer = makeSigner(common, blockNumber, timestamp, hardfork)
      const signedNewTx = signTx(tx, signer, privateKey)

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
      const tx = newTx(newTxData, { common, blockNumber, timestamp })
      const signer = makeSigner(common, blockNumber, timestamp)
      const signedNewTx = signTx(tx, signer, privateKey)

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
        data: new Uint8Array([0x60, 0x80, 0x60, 0x40]),
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

  describe('Go-Style Type Checks', () => {
    it('unsigned legacy tx should not be protected', () => {
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
      const newTxManager = newTx(newTxData, { common, blockNumber, timestamp })

      assert.isFalse(
        newTxManager.protected(),
        'unsigned tx should not be protected',
      )
      assert.isFalse(
        newTxManager.isTypedTransaction(),
        'legacy tx is not typed',
      )
    })

    it('signed legacy tx with EIP-155 (v >= 37) should be protected', () => {
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

      const newTxData = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
      })
      const tx = newTx(newTxData, { common, blockNumber, timestamp })
      const signer = makeSigner(common, blockNumber, timestamp)
      const signedTx = signTx(tx, signer, privateKey)

      assert.isTrue(
        signedTx.protected(),
        'EIP-155 signed tx should be protected',
      )
      assert.isTrue(
        signedTx.v !== undefined && signedTx.v >= 37n,
        'v should be >= 37 for EIP-155',
      )
    })

    it('supports() should work for unsigned tx based on hardfork', () => {
      const txData = {
        nonce: 1n,
        gasPrice: 1000000000n,
        gasLimit: 21000n,
        value: 0n,
        data: new Uint8Array(0),
      }

      // Post-spuriousDragon: supports EIP-155 for signing
      const newTxData1 = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        value: txData.value,
        data: txData.data,
      })
      const postSpuriousTx = newTx(newTxData1, {
        common,
        hardfork: Hardfork.SpuriousDragon,
      })

      assert.isTrue(
        postSpuriousTx.supports(Capability.EIP155ReplayProtection),
        'post-spuriousDragon unsigned tx should support EIP155 for signing',
      )

      // Pre-spuriousDragon: does not support EIP-155
      const newTxData2 = new LegacyTxData({
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        value: txData.value,
        data: txData.data,
      })
      const preSpuriousTx = newTx(newTxData2, {
        common,
        hardfork: Hardfork.Chainstart,
      })

      assert.isFalse(
        preSpuriousTx.supports(Capability.EIP155ReplayProtection),
        'pre-spuriousDragon unsigned tx should not support EIP155',
      )
    })
  })
})
