// import {
//     GlobalConfig,
//     createChainSchema,
//     hardfork,
//   } from '@ts-ethereum/chain-config'

//   const myChain = createChainSchema({
//     chainId: 12345n,
//     name: 'my-chain',
//     genesis: {
//       gasLimit: 10485760n,
//       difficulty: 1n,
//       nonce: '0xbb00000000000000',
//       extraData: '0x00',
//     },
//     consensus: { type: 'pow', algorithm: 'ethash' },
//     hardforks: [
//       hardfork('chainstart', { block: 0n, eips: [1] }),
//       hardfork('london', { block: 100n, eips: [1559, 3198, 3529] }),
//     ],
//   } as const)

//   const config = GlobalConfig.fromChainSchema({ schema: myChain })

//   // TypeScript knows exactly what params are available!
//   config.param('baseFeeMaxChangeDenominator') // ✅ OK - EIP-1559 in schema
//   config.param('blobGasPerBlob') // ❌ Error - EIP-4844 not in schema
