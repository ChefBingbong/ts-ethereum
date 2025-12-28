import type { ChainConfig } from '@ts-ethereum/chain-config'

export const customChainConfig: ChainConfig = {
  name: 'testnet',
  chainId: 12345n,
  defaultHardfork: 'byzantium',
  consensus: {
    type: 'pow',
    algorithm: 'ethash',
  },
  genesis: {
    gasLimit: 1000000,
    difficulty: 1,
    nonce: '0xbb00000000000000',
    extraData:
      '0xcc000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  },
  hardforks: [
    {
      name: 'chainstart',
      block: 0n,
    },
    {
      name: 'homestead',
      block: 1n,
    },
    {
      name: 'tangerineWhistle',
      block: 2n,
    },
    {
      name: 'spuriousDragon',
      block: 3n,
    },
    {
      name: 'byzantium',
      block: 4n,
    },
    {
      name: 'constantinople',
      block: 5n,
    },
    {
      name: 'petersburg',
      block: 6n,
    },
    {
      name: 'istanbul',
      block: 7n,
    },
    {
      name: 'muirGlacier',
      block: 8n,
    },
    {
      name: 'berlin',
      block: 9n,
    },
    {
      name: 'london',
      block: 10n,
    },
    {
      name: 'paris',
      block: 11n,
    },
  ],
  bootstrapNodes: [
    {
      ip: '10.0.0.1',
      port: 30303,
      id: '11000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      location: '',
      comment: '',
    },
    {
      ip: '10.0.0.2',
      port: 30303,
      id: '22000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      location: '',
      comment: '',
    },
  ],
}
