import type { ChainConfig } from '@ts-ethereum/chain-config'

export const testnetMergeChainConfig: ChainConfig = {
  name: 'testnetMerge',
  chainId: 55555n,
  defaultHardfork: 'istanbul',
  consensus: {
    type: 'poa',
    algorithm: 'clique',
    clique: {
      period: 15,
      epoch: 30000,
    },
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
      name: 'istanbul',
      block: 8n,
    },
    {
      name: 'muirGlacier',
      block: 10n,
    },
    {
      name: 'berlin',
      block: 12n,
    },
    {
      name: 'london',
      block: 14n,
    },
    {
      name: 'paris',
      block: 15n,
    },
    {
      name: 'shanghai',
      block: null,
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
