import { createHardforkManager } from '@ts-ethereum/chain-config'
import { getParamsAtHardfork } from './functional/param-getters'

const chain = createHardforkManager({
  chainId: 1n,
  hardforks: [
    { name: 'chainstart', block: 0n },
    { name: 'homestead', block: 1n },
    { name: 'dao', block: 2n },
    { name: 'tangerineWhistle', block: 3n },
    { name: 'spuriousDragon', block: 5n },
    { name: 'byzantium', block: 6n },
    { name: 'constantinople', block: 7n },
    { name: 'petersburg', block: 8n },
    { name: 'istanbul', block: 9n },
    { name: 'muirGlacier', block: 10n },
    { name: 'berlin', block: 11n },
    { name: 'london', block: 12n },
  ],
  chain: {
    name: 'mainnet',
    chainId: 1n,
    consensus: {
      type: 'pow',
      algorithm: 'ethash',
    },
    genesis: {
      gasLimit: 5000,
      difficulty: 17179869184,
      nonce: '0x0000000000000042',
      extraData:
        '0x11bbe8db4e347b4e8c937c1c8370e4b5ed33adb3db69cbdb7a38e1e50b1b82fa',
    },
    hardforks: [
      { name: 'chainstart', block: 0n },
      { name: 'homestead', block: 1n },
      { name: 'dao', block: 2n },
      { name: 'tangerineWhistle', block: 3n },
      { name: 'spuriousDragon', block: 5n },
      { name: 'byzantium', block: 6n },
      { name: 'constantinople', block: 7n },
      { name: 'petersburg', block: 8n },
      { name: 'istanbul', block: 9n },
      { name: 'muirGlacier', block: 10n },
      { name: 'berlin', block: 11n },
      { name: 'london', block: 12n },
    ],
    bootstrapNodes: [],
  },
})

// Clean API - no config passing
const hf = chain.getHardforkByBlock(12n)
const has1559 = chain.isEIPActiveAtHardfork(1559, hf)
const baseFee = chain.getParamAtHardfork('initialBaseFee', hf)
const params = getParamsAtHardfork(chain.config, 'london')
console.log(params)
