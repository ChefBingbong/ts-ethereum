import {
  createHardforkManagerFromConfig,
  Hardfork,
  Mainnet,
} from '@ts-ethereum/chain-config'
import { Address, createZeroAddress, hexToBytes } from '@ts-ethereum/utils'
import { assert, describe, it } from 'vitest'

import { createEVM } from '../../../src'
import { getActivePrecompiles } from '../../../src/precompiles'

describe('Precompiles: hardfork availability', () => {
  it('Test BN254PAIRING availability', async () => {
    const ECPAIR_AddressStr = '0000000000000000000000000000000000000008'
    const ECPAIR_Address = new Address(hexToBytes(`0x${ECPAIR_AddressStr}`))

    // ECPAIR was introduced in Byzantium; check if available from Byzantium.
    const commonByzantium = createHardforkManagerFromConfig(Mainnet)

    let BN254PAIRING = getActivePrecompiles(
      commonByzantium,
      Hardfork.Byzantium,
    ).get(ECPAIR_AddressStr)

    if (!BN254PAIRING) {
      assert.fail(
        'BN254PAIRING is not available in petersburg while it should be available',
      )
    } else {
      assert.isTrue(true, 'BN254PAIRING available in petersburg')
    }

    let evm = await createEVM({
      common: commonByzantium,
      hardfork: Hardfork.Byzantium,
    })
    let result = await evm.runCall({
      caller: createZeroAddress(),
      gasLimit: BigInt(0xffffffffff),
      to: ECPAIR_Address,
      value: BigInt(0),
    })

    assert.strictEqual(result.execResult.executionGasUsed, BigInt(100000)) // check that we are using gas (if address would contain no code we use 0 gas)

    // Check if ECPAIR is available in future hard forks.
    const commonPetersburg = createHardforkManagerFromConfig(Mainnet)
    BN254PAIRING = getActivePrecompiles(
      commonPetersburg,
      Hardfork.Petersburg,
    ).get(ECPAIR_AddressStr)!
    if (BN254PAIRING === undefined) {
      assert.fail(
        'BN254PAIRING is not available in petersburg while it should be available',
      )
    } else {
      assert.isTrue(true, 'BN254PAIRING available in petersburg')
    }

    evm = await createEVM({
      common: commonPetersburg,
      hardfork: Hardfork.Petersburg,
    })
    result = await evm.runCall({
      caller: createZeroAddress(),
      gasLimit: BigInt(0xffffffffff),
      to: ECPAIR_Address,
      value: BigInt(0),
    })

    assert.strictEqual(result.execResult.executionGasUsed, BigInt(100000))

    // Check if ECPAIR is not available in Homestead.
    const commonHomestead = createHardforkManagerFromConfig(Mainnet)
    BN254PAIRING = getActivePrecompiles(
      commonHomestead,
      Hardfork.Homestead,
    ).get(ECPAIR_AddressStr)!

    if (BN254PAIRING !== undefined) {
      assert.fail(
        'BN254PAIRING is available in homestead while it should not be available',
      )
    } else {
      assert.isTrue(true, 'BN254PAIRING not available in homestead')
    }

    evm = await createEVM({
      common: commonHomestead,
      hardfork: Hardfork.Homestead,
    })

    result = await evm.runCall({
      caller: createZeroAddress(),
      gasLimit: BigInt(0xffffffffff),
      to: ECPAIR_Address,
      value: BigInt(0),
    })

    assert.strictEqual(result.execResult.executionGasUsed, BigInt(0)) // check that we use no gas, because we are calling into an address without code.
  })
})
