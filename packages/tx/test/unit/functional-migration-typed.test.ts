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

import {
  Capability,
  createAccessList2930Tx,
  createFeeMarket1559Tx,
  TransactionType,
} from '../../src/index'
import { makeSigner } from '../../src/tx-functional.ts/signer/signer-factory'
import { sender, signTx } from '../../src/tx-functional.ts/signing'
import { AccessListTxData } from '../../src/tx-functional.ts/tx-access-list'
import { DynamicFeeTxData } from '../../src/tx-functional.ts/tx-dynamic-fee'
import { newTx } from '../../src/tx-functional.ts/tx-manager'

describe('[Functional Migration: EIP-2930 AccessList Tx]', () => {
  const common = createHardforkManagerFromConfig(Mainnet)
  const privateKey = hexToBytes(
    '0x4646464646464646464646464646464646464646464646464646464646464646',
  )

  describe('Basic Properties', () => {
    it('should have matching properties for unsigned tx', () => {
      const txData = {
        chainId: 1n,
        nonce: 1n,
        gasPrice: 1000000000n,
        gasLimit: 21000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n,
        data: new Uint8Array([0x12, 0x34]),
        accessList: [],
      }

      // Old API
      const oldTx = createAccessList2930Tx(txData, {
        common,
        hardfork: Hardfork.Berlin,
      })

      // New API
      const newTxData = new AccessListTxData({
        chainId: txData.chainId,
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
        accessList: txData.accessList,
      })
      const newTxManager = newTx(newTxData, {
        common,
        hardfork: Hardfork.Berlin,
      })

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
        TransactionType.AccessListEIP2930,
        'type should be AccessListEIP2930',
      )
    })

    it('should correctly identify as unsigned', () => {
      const newTxData = new AccessListTxData({
        chainId: 1n,
        nonce: 0n,
        gasPrice: 0n,
        gasLimit: 0n,
        value: 0n,
        data: new Uint8Array(0),
        accessList: [],
      })
      const newTxManager = newTx(newTxData, {
        common,
        hardfork: Hardfork.Berlin,
      })

      assert.isFalse(newTxManager.isSigned(), 'should be unsigned')
    })
  })

  describe('Serialization', () => {
    it('should produce identical serialized output for unsigned tx', () => {
      const txData = {
        chainId: 1n,
        nonce: 5n,
        gasPrice: 2000000000n,
        gasLimit: 100000n,
        to: createAddressFromString(
          '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        ),
        value: 500000000000000000n,
        data: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
        accessList: [],
      }

      const oldTx = createAccessList2930Tx(txData, {
        common,
        hardfork: Hardfork.Berlin,
      })
      const newTxData = new AccessListTxData({
        chainId: txData.chainId,
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
        accessList: txData.accessList,
      })
      const newTxManager = newTx(newTxData, {
        common,
        hardfork: Hardfork.Berlin,
      })

      assert.isTrue(
        equalsBytes(newTxManager.serialize(), oldTx.serialize()),
        'serialized bytes should match',
      )
    })
  })

  describe('Go-Style Signing with Signer', () => {
    it('should sign using signTx(tx, signer, privateKey) pattern', () => {
      const txData = {
        chainId: 1n,
        nonce: 1n,
        gasPrice: 1000000000n,
        gasLimit: 21000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n,
        data: new Uint8Array(0),
        accessList: [],
      }

      // Old API
      const oldTx = createAccessList2930Tx(txData, {
        common,
        hardfork: Hardfork.Berlin,
      })
      const signedOldTx = oldTx.sign(privateKey, false)

      // New Go-style API
      const newTxData = new AccessListTxData({
        chainId: txData.chainId,
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
        accessList: txData.accessList,
      })
      const tx = newTx(newTxData, { common, hardfork: Hardfork.Berlin })
      const signer = makeSigner(common, undefined, undefined, Hardfork.Berlin)
      const signedNewTx = signTx(tx, signer, privateKey)

      // Compare v, r, s values
      assert.strictEqual(signedNewTx.v, signedOldTx.v, 'v values should match')
      assert.strictEqual(signedNewTx.r, signedOldTx.r, 'r values should match')
      assert.strictEqual(signedNewTx.s, signedOldTx.s, 's values should match')
    })

    it('should recover sender using sender(signer, tx) pattern', () => {
      const txData = {
        chainId: 1n,
        nonce: 1n,
        gasPrice: 1000000000n,
        gasLimit: 21000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n,
        data: new Uint8Array(0),
        accessList: [],
      }

      // Old API
      const oldTx = createAccessList2930Tx(txData, {
        common,
        hardfork: Hardfork.Berlin,
      })
      const signedOldTx = oldTx.sign(privateKey, false)

      // New Go-style API
      const newTxData = new AccessListTxData({
        chainId: txData.chainId,
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
        accessList: txData.accessList,
      })
      const tx = newTx(newTxData, { common, hardfork: Hardfork.Berlin })
      const signer = makeSigner(common, undefined, undefined, Hardfork.Berlin)
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
        chainId: 1n,
        nonce: 1n,
        gasPrice: 1000000000n,
        gasLimit: 21000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n,
        data: new Uint8Array(0),
        accessList: [],
      }

      const oldTx = createAccessList2930Tx(txData, {
        common,
        hardfork: Hardfork.Berlin,
      })
      const signedOldTx = oldTx.sign(privateKey, false)

      const newTxData = new AccessListTxData({
        chainId: txData.chainId,
        nonce: txData.nonce,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
        accessList: txData.accessList,
      })
      const tx = newTx(newTxData, { common, hardfork: Hardfork.Berlin })
      const signer = makeSigner(common, undefined, undefined, Hardfork.Berlin)
      const signedNewTx = signTx(tx, signer, privateKey)

      assert.isTrue(
        equalsBytes(signedNewTx.hash(), signedOldTx.hash()),
        'hash() should match',
      )
    })
  })

  describe('Type Checks', () => {
    it('should be identified as typed transaction', () => {
      const newTxData = new AccessListTxData({
        chainId: 1n,
        nonce: 0n,
        gasPrice: 0n,
        gasLimit: 21000n,
        value: 0n,
        data: new Uint8Array(0),
        accessList: [],
      })
      const newTxManager = newTx(newTxData, {
        common,
        hardfork: Hardfork.Berlin,
      })

      assert.isTrue(
        newTxManager.isTypedTransaction(),
        'should be typed transaction',
      )
      assert.isTrue(
        newTxManager.supports(Capability.EIP2718TypedTransaction),
        'should support EIP-2718',
      )
      assert.isTrue(
        newTxManager.supports(Capability.EIP2930AccessLists),
        'should support EIP-2930',
      )
      assert.isFalse(
        newTxManager.supports(Capability.EIP1559FeeMarket),
        'should not support EIP-1559',
      )
    })

    it('should always be protected (typed txs are inherently protected)', () => {
      const newTxData = new AccessListTxData({
        chainId: 1n,
        nonce: 0n,
        gasPrice: 0n,
        gasLimit: 21000n,
        value: 0n,
        data: new Uint8Array(0),
        accessList: [],
      })
      const newTxManager = newTx(newTxData, {
        common,
        hardfork: Hardfork.Berlin,
      })

      assert.isTrue(
        newTxManager.protected(),
        'typed tx should always be protected',
      )
    })
  })
})

describe('[Functional Migration: EIP-1559 FeeMarket Tx]', () => {
  const common = createHardforkManagerFromConfig(Mainnet)
  const privateKey = hexToBytes(
    '0x4646464646464646464646464646464646464646464646464646464646464646',
  )

  describe('Basic Properties', () => {
    it('should have matching properties for unsigned tx', () => {
      const txData = {
        chainId: 1n,
        nonce: 1n,
        maxPriorityFeePerGas: 1000000000n,
        maxFeePerGas: 2000000000n,
        gasLimit: 21000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n,
        data: new Uint8Array([0x12, 0x34]),
        accessList: [],
      }

      // Old API
      const oldTx = createFeeMarket1559Tx(txData, {
        common,
        hardfork: Hardfork.London,
      })

      // New API
      const newTxData = new DynamicFeeTxData({
        chainId: txData.chainId,
        nonce: txData.nonce,
        maxPriorityFeePerGas: txData.maxPriorityFeePerGas,
        maxFeePerGas: txData.maxFeePerGas,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
        accessList: txData.accessList,
      })
      const newTxManager = newTx(newTxData, {
        common,
        hardfork: Hardfork.London,
      })

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
        TransactionType.FeeMarketEIP1559,
        'type should be FeeMarketEIP1559',
      )
    })

    it('should correctly identify as unsigned', () => {
      const newTxData = new DynamicFeeTxData({
        chainId: 1n,
        nonce: 0n,
        maxPriorityFeePerGas: 0n,
        maxFeePerGas: 0n,
        gasLimit: 0n,
        value: 0n,
        data: new Uint8Array(0),
        accessList: [],
      })
      const newTxManager = newTx(newTxData, {
        common,
        hardfork: Hardfork.London,
      })

      assert.isFalse(newTxManager.isSigned(), 'should be unsigned')
    })
  })

  describe('Serialization', () => {
    it('should produce identical serialized output for unsigned tx', () => {
      const txData = {
        chainId: 1n,
        nonce: 5n,
        maxPriorityFeePerGas: 1000000000n,
        maxFeePerGas: 3000000000n,
        gasLimit: 100000n,
        to: createAddressFromString(
          '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        ),
        value: 500000000000000000n,
        data: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
        accessList: [],
      }

      const oldTx = createFeeMarket1559Tx(txData, {
        common,
        hardfork: Hardfork.London,
      })
      const newTxData = new DynamicFeeTxData({
        chainId: txData.chainId,
        nonce: txData.nonce,
        maxPriorityFeePerGas: txData.maxPriorityFeePerGas,
        maxFeePerGas: txData.maxFeePerGas,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
        accessList: txData.accessList,
      })
      const newTxManager = newTx(newTxData, {
        common,
        hardfork: Hardfork.London,
      })

      assert.isTrue(
        equalsBytes(newTxManager.serialize(), oldTx.serialize()),
        'serialized bytes should match',
      )
    })
  })

  describe('Go-Style Signing with Signer', () => {
    it('should sign using signTx(tx, signer, privateKey) pattern', () => {
      const txData = {
        chainId: 1n,
        nonce: 1n,
        maxPriorityFeePerGas: 1000000000n,
        maxFeePerGas: 2000000000n,
        gasLimit: 21000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n,
        data: new Uint8Array(0),
        accessList: [],
      }

      // Old API
      const oldTx = createFeeMarket1559Tx(txData, {
        common,
        hardfork: Hardfork.London,
      })
      const signedOldTx = oldTx.sign(privateKey, false)

      // New Go-style API
      const newTxData = new DynamicFeeTxData({
        chainId: txData.chainId,
        nonce: txData.nonce,
        maxPriorityFeePerGas: txData.maxPriorityFeePerGas,
        maxFeePerGas: txData.maxFeePerGas,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
        accessList: txData.accessList,
      })
      const tx = newTx(newTxData, { common, hardfork: Hardfork.London })
      const signer = makeSigner(common, undefined, undefined, Hardfork.London)
      const signedNewTx = signTx(tx, signer, privateKey)

      // Compare v, r, s values
      assert.strictEqual(signedNewTx.v, signedOldTx.v, 'v values should match')
      assert.strictEqual(signedNewTx.r, signedOldTx.r, 'r values should match')
      assert.strictEqual(signedNewTx.s, signedOldTx.s, 's values should match')
    })

    it('should recover sender using sender(signer, tx) pattern', () => {
      const txData = {
        chainId: 1n,
        nonce: 1n,
        maxPriorityFeePerGas: 1000000000n,
        maxFeePerGas: 2000000000n,
        gasLimit: 21000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n,
        data: new Uint8Array(0),
        accessList: [],
      }

      // Old API
      const oldTx = createFeeMarket1559Tx(txData, {
        common,
        hardfork: Hardfork.London,
      })
      const signedOldTx = oldTx.sign(privateKey, false)

      // New Go-style API
      const newTxData = new DynamicFeeTxData({
        chainId: txData.chainId,
        nonce: txData.nonce,
        maxPriorityFeePerGas: txData.maxPriorityFeePerGas,
        maxFeePerGas: txData.maxFeePerGas,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
        accessList: txData.accessList,
      })
      const tx = newTx(newTxData, { common, hardfork: Hardfork.London })
      const signer = makeSigner(common, undefined, undefined, Hardfork.London)
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
        chainId: 1n,
        nonce: 1n,
        maxPriorityFeePerGas: 1000000000n,
        maxFeePerGas: 2000000000n,
        gasLimit: 21000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n,
        data: new Uint8Array(0),
        accessList: [],
      }

      const oldTx = createFeeMarket1559Tx(txData, {
        common,
        hardfork: Hardfork.London,
      })
      const signedOldTx = oldTx.sign(privateKey, false)

      const newTxData = new DynamicFeeTxData({
        chainId: txData.chainId,
        nonce: txData.nonce,
        maxPriorityFeePerGas: txData.maxPriorityFeePerGas,
        maxFeePerGas: txData.maxFeePerGas,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
        accessList: txData.accessList,
      })
      const tx = newTx(newTxData, { common, hardfork: Hardfork.London })
      const signer = makeSigner(common, undefined, undefined, Hardfork.London)
      const signedNewTx = signTx(tx, signer, privateKey)

      assert.isTrue(
        equalsBytes(signedNewTx.hash(), signedOldTx.hash()),
        'hash() should match',
      )
    })
  })

  describe('EIP-1559 Specific', () => {
    it('should calculate effectiveGasPrice correctly', () => {
      const txData = {
        chainId: 1n,
        nonce: 1n,
        maxPriorityFeePerGas: 1000000000n, // 1 gwei
        maxFeePerGas: 3000000000n, // 3 gwei
        gasLimit: 21000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n,
        data: new Uint8Array(0),
        accessList: [],
      }

      const newTxData = new DynamicFeeTxData({
        chainId: txData.chainId,
        nonce: txData.nonce,
        maxPriorityFeePerGas: txData.maxPriorityFeePerGas,
        maxFeePerGas: txData.maxFeePerGas,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
        accessList: txData.accessList,
      })

      // With baseFee of 1.5 gwei, effectiveGasPrice should be baseFee + min(tip, maxFeePerGas - baseFee)
      // = 1.5 gwei + min(1 gwei, 3 gwei - 1.5 gwei) = 1.5 gwei + 1 gwei = 2.5 gwei
      const baseFee = 1500000000n
      const effectivePrice = newTxData.effectiveGasPrice(baseFee)
      assert.strictEqual(
        effectivePrice,
        2500000000n,
        'effectiveGasPrice should be calculated correctly',
      )

      // Without baseFee, should return maxFeePerGas
      const effectivePriceNoBase = newTxData.effectiveGasPrice()
      assert.strictEqual(
        effectivePriceNoBase,
        txData.maxFeePerGas,
        'effectiveGasPrice without baseFee should be maxFeePerGas',
      )
    })

    it('gasPrice() should return maxFeePerGas', () => {
      const newTxData = new DynamicFeeTxData({
        chainId: 1n,
        nonce: 1n,
        maxPriorityFeePerGas: 1000000000n,
        maxFeePerGas: 3000000000n,
        gasLimit: 21000n,
        value: 0n,
        data: new Uint8Array(0),
        accessList: [],
      })

      assert.strictEqual(
        newTxData.gasPrice(),
        newTxData.maxFeePerGas,
        'gasPrice() should return maxFeePerGas',
      )
    })

    it('gasTipCap() should return maxPriorityFeePerGas', () => {
      const newTxData = new DynamicFeeTxData({
        chainId: 1n,
        nonce: 1n,
        maxPriorityFeePerGas: 1000000000n,
        maxFeePerGas: 3000000000n,
        gasLimit: 21000n,
        value: 0n,
        data: new Uint8Array(0),
        accessList: [],
      })

      assert.strictEqual(
        newTxData.gasTipCap(),
        newTxData.maxPriorityFeePerGas,
        'gasTipCap() should return maxPriorityFeePerGas',
      )
    })

    it('gasFeeCap() should return maxFeePerGas', () => {
      const newTxData = new DynamicFeeTxData({
        chainId: 1n,
        nonce: 1n,
        maxPriorityFeePerGas: 1000000000n,
        maxFeePerGas: 3000000000n,
        gasLimit: 21000n,
        value: 0n,
        data: new Uint8Array(0),
        accessList: [],
      })

      assert.strictEqual(
        newTxData.gasFeeCap(),
        newTxData.maxFeePerGas,
        'gasFeeCap() should return maxFeePerGas',
      )
    })
  })

  describe('Type Checks', () => {
    it('should be identified as typed transaction with EIP-1559 support', () => {
      const newTxData = new DynamicFeeTxData({
        chainId: 1n,
        nonce: 0n,
        maxPriorityFeePerGas: 0n,
        maxFeePerGas: 0n,
        gasLimit: 21000n,
        value: 0n,
        data: new Uint8Array(0),
        accessList: [],
      })
      const newTxManager = newTx(newTxData, {
        common,
        hardfork: Hardfork.London,
      })

      assert.isTrue(
        newTxManager.isTypedTransaction(),
        'should be typed transaction',
      )
      assert.isTrue(
        newTxManager.supports(Capability.EIP2718TypedTransaction),
        'should support EIP-2718',
      )
      assert.isTrue(
        newTxManager.supports(Capability.EIP2930AccessLists),
        'should support EIP-2930',
      )
      assert.isTrue(
        newTxManager.supports(Capability.EIP1559FeeMarket),
        'should support EIP-1559',
      )
    })

    it('should always be protected (typed txs are inherently protected)', () => {
      const newTxData = new DynamicFeeTxData({
        chainId: 1n,
        nonce: 0n,
        maxPriorityFeePerGas: 0n,
        maxFeePerGas: 0n,
        gasLimit: 21000n,
        value: 0n,
        data: new Uint8Array(0),
        accessList: [],
      })
      const newTxManager = newTx(newTxData, {
        common,
        hardfork: Hardfork.London,
      })

      assert.isTrue(
        newTxManager.protected(),
        'typed tx should always be protected',
      )
    })
  })

  describe('Gas Calculations', () => {
    it('should produce identical getIntrinsicGas()', () => {
      const txData = {
        chainId: 1n,
        nonce: 1n,
        maxPriorityFeePerGas: 1000000000n,
        maxFeePerGas: 2000000000n,
        gasLimit: 100000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n,
        data: new Uint8Array([0x12, 0x34, 0x00, 0x00, 0x56]),
        accessList: [],
      }

      const oldTx = createFeeMarket1559Tx(txData, {
        common,
        hardfork: Hardfork.London,
      })
      const newTxData = new DynamicFeeTxData({
        chainId: txData.chainId,
        nonce: txData.nonce,
        maxPriorityFeePerGas: txData.maxPriorityFeePerGas,
        maxFeePerGas: txData.maxFeePerGas,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
        accessList: txData.accessList,
      })
      const newTxManager = newTx(newTxData, {
        common,
        hardfork: Hardfork.London,
      })

      assert.strictEqual(
        newTxManager.getIntrinsicGas(),
        oldTx.getIntrinsicGas(),
        'getIntrinsicGas() should match',
      )
    })

    it('should produce identical getDataGas()', () => {
      const txData = {
        chainId: 1n,
        nonce: 1n,
        maxPriorityFeePerGas: 1000000000n,
        maxFeePerGas: 2000000000n,
        gasLimit: 100000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n,
        data: new Uint8Array([0x12, 0x34, 0x00, 0x00, 0x56]),
        accessList: [],
      }

      const oldTx = createFeeMarket1559Tx(txData, {
        common,
        hardfork: Hardfork.London,
      })
      const newTxData = new DynamicFeeTxData({
        chainId: txData.chainId,
        nonce: txData.nonce,
        maxPriorityFeePerGas: txData.maxPriorityFeePerGas,
        maxFeePerGas: txData.maxFeePerGas,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
        accessList: txData.accessList,
      })
      const newTxManager = newTx(newTxData, {
        common,
        hardfork: Hardfork.London,
      })

      assert.strictEqual(
        newTxManager.getDataGas(),
        oldTx.getDataGas(),
        'getDataGas() should match',
      )
    })
  })

  describe('Validation', () => {
    it('should produce identical isValid() for valid tx', () => {
      const txData = {
        chainId: 1n,
        nonce: 1n,
        maxPriorityFeePerGas: 1000000000n,
        maxFeePerGas: 2000000000n,
        gasLimit: 100000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n,
        data: new Uint8Array(0),
        accessList: [],
      }

      const oldTx = createFeeMarket1559Tx(txData, {
        common,
        hardfork: Hardfork.London,
      })
      const signedOldTx = oldTx.sign(privateKey, false)

      const newTxData = new DynamicFeeTxData({
        chainId: txData.chainId,
        nonce: txData.nonce,
        maxPriorityFeePerGas: txData.maxPriorityFeePerGas,
        maxFeePerGas: txData.maxFeePerGas,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
        accessList: txData.accessList,
      })

      const tx = newTx(newTxData, { common, hardfork: Hardfork.London })
      const signer = makeSigner(common, undefined, undefined, Hardfork.London)
      const signedNewTx = signTx(tx, signer, privateKey)

      assert.strictEqual(
        signedNewTx.isValid(),
        signedOldTx.isValid(),
        'isValid() should match',
      )
    })

    it('should produce identical verifySignature() for signed tx', () => {
      const txData = {
        chainId: 1n,
        nonce: 1n,
        maxPriorityFeePerGas: 1000000000n,
        maxFeePerGas: 2000000000n,
        gasLimit: 100000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n,
        data: new Uint8Array(0),
        accessList: [],
      }

      const oldTx = createFeeMarket1559Tx(txData, {
        common,
        hardfork: Hardfork.London,
      })
      const signedOldTx = oldTx.sign(privateKey, false)

      const newTxData = new DynamicFeeTxData({
        chainId: txData.chainId,
        nonce: txData.nonce,
        maxPriorityFeePerGas: txData.maxPriorityFeePerGas,
        maxFeePerGas: txData.maxFeePerGas,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
        accessList: txData.accessList,
      })
      const tx = newTx(newTxData, { common, hardfork: Hardfork.London })
      const signer = makeSigner(common, undefined, undefined, Hardfork.London)
      const signedNewTx = signTx(tx, signer, privateKey)

      assert.strictEqual(
        signedNewTx.verifySignature(),
        signedOldTx.verifySignature(),
        'verifySignature() should match',
      )
      assert.isTrue(signedNewTx.verifySignature(), 'signature should be valid')
    })
  })

  describe('JSON Conversion', () => {
    it('should produce equivalent toJSON() output', () => {
      const txData = {
        chainId: 1n,
        nonce: 1n,
        maxPriorityFeePerGas: 1000000000n,
        maxFeePerGas: 2000000000n,
        gasLimit: 21000n,
        to: createAddressFromString(
          '0x1234567890123456789012345678901234567890',
        ),
        value: 1000000000000000000n,
        data: new Uint8Array([0x12, 0x34]),
        accessList: [],
      }

      const oldTx = createFeeMarket1559Tx(txData, {
        common,
        hardfork: Hardfork.London,
      })
      const newTxData = new DynamicFeeTxData({
        chainId: txData.chainId,
        nonce: txData.nonce,
        maxPriorityFeePerGas: txData.maxPriorityFeePerGas,
        maxFeePerGas: txData.maxFeePerGas,
        gasLimit: txData.gasLimit,
        to: txData.to,
        value: txData.value,
        data: txData.data,
        accessList: txData.accessList,
      })
      const newTxManager = newTx(newTxData, {
        common,
        hardfork: Hardfork.London,
      })

      const oldJson = oldTx.toJSON()
      const newJson = newTxManager.toJSON()

      assert.strictEqual(newJson.nonce, oldJson.nonce, 'nonce should match')
      assert.strictEqual(
        newJson.gasLimit,
        oldJson.gasLimit,
        'gasLimit should match',
      )
      assert.strictEqual(
        newJson.maxPriorityFeePerGas,
        oldJson.maxPriorityFeePerGas,
        'maxPriorityFeePerGas should match',
      )
      assert.strictEqual(
        newJson.maxFeePerGas,
        oldJson.maxFeePerGas,
        'maxFeePerGas should match',
      )
      assert.strictEqual(newJson.value, oldJson.value, 'value should match')
      assert.strictEqual(newJson.data, oldJson.data, 'data should match')
      assert.strictEqual(newJson.to, oldJson.to, 'to should match')
    })
  })
})
