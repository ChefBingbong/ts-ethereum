import {
  createHardforkManagerFromConfig,
  Hardfork,
  Mainnet,
} from '@ts-ethereum/chain-config'
import {
  Address,
  createAddressFromBigInt,
  hexToBytes,
} from '@ts-ethereum/utils'
import { assert, describe, it } from 'vitest'

import { createEVM } from '../../src'

describe('async events', () => {
  it('should work', async () => {
    const caller = new Address(
      hexToBytes('0x00000000000000000000000000000000000000ee'),
    )
    const common = createHardforkManagerFromConfig(Mainnet)
    const evm = await createEVM({
      common,
      hardfork: Hardfork.Constantinople,
    })
    const to = createAddressFromBigInt(BigInt(123456))
    await evm.stateManager.putCode(to, hexToBytes('0x6001'))
    let didTimeOut = false
    evm.events.on('step', async (event, next) => {
      assert.isTrue(event.codeAddress !== undefined)
      const startTime = Date.now()
      setTimeout(() => {
        assert.isTrue(
          Date.now() > startTime + 999,
          'evm paused on step function for one second',
        )
        didTimeOut = true
        next?.()
      }, 1000)
    })
    const runCallArgs = {
      caller, // call address
      gasLimit: BigInt(0xffffffffff),
      data: hexToBytes('0x600000'),
      to,
    }
    await evm.runCall(runCallArgs)
    assert.isTrue(didTimeOut)
  })
})
