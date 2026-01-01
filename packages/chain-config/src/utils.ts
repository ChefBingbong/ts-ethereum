import type { PrefixedHexString } from '@ts-ethereum/utils'
import {
  addHexPrefix,
  EthereumJSErrorWithoutCode,
  isHexString,
  stripHexPrefix,
} from '@ts-ethereum/utils'
import type { GethGenesis } from './chains/gethGenesis'
import { Holesky, Hoodi, Mainnet, Sepolia } from './chains/presets/chains'
import { Hardfork } from './hardforks'
import type { HardforksDict } from './types.ts'

type ConfigHardfork =
  | { name: string; block: null; timestamp: number }
  | { name: string; block: bigint; timestamp?: number }

function formatNonce(nonce: string): PrefixedHexString {
  if (!nonce || nonce === '0x0') {
    return '0x0000000000000000'
  }
  if (isHexString(nonce)) {
    return `0x${stripHexPrefix(nonce).padStart(16, '0')}`
  }
  return `0x${nonce.padStart(16, '0')}`
}

function parseGethParams(gethGenesis: GethGenesis) {
  const {
    name,
    config,
    difficulty,
    mixHash,
    gasLimit,
    coinbase,
    baseFeePerGas,
    excessBlobGas,
    requestsHash,
    extraData: unparsedExtraData,
    nonce: unparsedNonce,
    timestamp: unparsedTimestamp,
  } = gethGenesis
  const genesisTimestamp = Number(unparsedTimestamp)
  const { chainId, depositContractAddress } = config

  const extraData = addHexPrefix(unparsedExtraData ?? '')

  const timestamp = unparsedTimestamp as PrefixedHexString

  const nonce =
    unparsedNonce.length !== 18
      ? formatNonce(unparsedNonce)
      : addHexPrefix(unparsedNonce)

  if (config.eip155Block !== config.eip158Block) {
    throw EthereumJSErrorWithoutCode(
      'EIP155 block number must equal EIP 158 block number since both are part of SpuriousDragon hardfork and the client only supports activating the full hardfork',
    )
  }

  let customHardforks: HardforksDict | undefined
  if (config.blobSchedule !== undefined) {
    customHardforks = {}
    const blobGasPerBlob = 131072
    for (const [hfKey, hfSchedule] of Object.entries(config.blobSchedule)) {
      const hfConfig = undefined
      if (hfConfig === undefined) {
        throw EthereumJSErrorWithoutCode(
          `unknown hardfork=${hfKey} specified in blobSchedule`,
        )
      }
      const {
        target,
        max,
        baseFeeUpdateFraction: blobGasPriceUpdateFraction,
      } = hfSchedule
      if (
        target === undefined ||
        max === undefined ||
        blobGasPriceUpdateFraction === undefined
      ) {
        throw EthereumJSErrorWithoutCode(
          `undefined target, max or baseFeeUpdateFraction specified in blobSchedule for hardfork=${hfKey}`,
        )
      }

      const customHfConfig = JSON.parse(JSON.stringify(hfConfig))
      customHfConfig.params = {
        ...customHardforks.params,
        ...{
          targetBlobGasPerBlock: blobGasPerBlob * target,
          maxBlobGasPerBlock: blobGasPerBlob * max,
          blobGasPriceUpdateFraction,
        },
      }

      customHardforks[hfKey] = customHfConfig
    }
  }

  const params = {
    name,
    chainId,
    depositContractAddress,
    genesis: {
      timestamp,
      gasLimit,
      difficulty,
      nonce,
      extraData,
      mixHash,
      coinbase,
      baseFeePerGas,
      excessBlobGas,
      requestsHash,
    },
    hardfork: undefined as string | undefined,
    hardforks: [] as ConfigHardfork[],
    customHardforks,
    bootstrapNodes: [],
    consensus:
      config.clique !== undefined
        ? {
            type: 'poa',
            algorithm: 'clique',
            clique: {
              period: config.clique.period ?? config.clique.blockperiodseconds,
              epoch: config.clique.epoch ?? config.clique.epochlength,
            },
          }
        : {
            type: 'pow',
            algorithm: 'ethash',
            ethash: {},
          },
  }

  const forkMap: {
    [key: string]: { name: string; postMerge?: boolean; isTimestamp?: boolean }
  } = {
    [Hardfork.Homestead]: { name: 'homesteadBlock' },
    [Hardfork.Dao]: { name: 'daoForkBlock' },
    [Hardfork.TangerineWhistle]: { name: 'eip150Block' },
    [Hardfork.SpuriousDragon]: { name: 'eip155Block' },
    [Hardfork.Byzantium]: { name: 'byzantiumBlock' },
    [Hardfork.Constantinople]: { name: 'constantinopleBlock' },
    [Hardfork.Petersburg]: { name: 'petersburgBlock' },
    [Hardfork.Istanbul]: { name: 'istanbulBlock' },
    [Hardfork.MuirGlacier]: { name: 'muirGlacierBlock' },
    [Hardfork.Berlin]: { name: 'berlinBlock' },
    [Hardfork.London]: { name: 'londonBlock' },
    [Hardfork.ArrowGlacier]: { name: 'arrowGlacierBlock' },
    [Hardfork.GrayGlacier]: { name: 'grayGlacierBlock' },
    [Hardfork.Paris]: { name: 'mergeForkBlock', postMerge: true },
    [Hardfork.MergeNetsplitBlock]: {
      name: 'mergeNetsplitBlock',
      postMerge: true,
    },
    [Hardfork.Shanghai]: {
      name: 'shanghaiTime',
      postMerge: true,
      isTimestamp: true,
    },
    [Hardfork.Cancun]: {
      name: 'cancunTime',
      postMerge: true,
      isTimestamp: true,
    },
    [Hardfork.Prague]: {
      name: 'pragueTime',
      postMerge: true,
      isTimestamp: true,
    },
    [Hardfork.Osaka]: { name: 'osakaTime', postMerge: true, isTimestamp: true },
    [Hardfork.Bpo1]: { name: 'bpo1Time', postMerge: true, isTimestamp: true },
    [Hardfork.Bpo2]: { name: 'bpo2Time', postMerge: true, isTimestamp: true },
    [Hardfork.Bpo3]: { name: 'bpo3Time', postMerge: true, isTimestamp: true },
    [Hardfork.Bpo4]: { name: 'bpo4Time', postMerge: true, isTimestamp: true },
    [Hardfork.Bpo5]: { name: 'bpo5Time', postMerge: true, isTimestamp: true },
  }

  const forkMapRev = Object.keys(forkMap).reduce(
    (acc, elem) => {
      acc[forkMap[elem].name] = elem
      return acc
    },
    {} as { [key: string]: string },
  )

  params.hardforks = Object.entries(forkMapRev)
    .map(([nameBlock, hardfork]) => {
      const configValue = config[nameBlock as keyof typeof config]
      const isTimestamp = forkMap[hardfork].isTimestamp === true

      const block =
        isTimestamp || typeof configValue !== 'number' ? null : configValue

      const timestamp =
        isTimestamp && typeof configValue === 'number' ? configValue : undefined

      return { name: hardfork, block, timestamp }
    })
    .filter(
      ({ block, timestamp }) => block !== null || timestamp !== undefined,
    ) as ConfigHardfork[]

  const mergeIndex = params.hardforks.findIndex(
    (hf) => hf.name === Hardfork.Paris,
  )
  let mergeNetsplitBlockIndex = params.hardforks.findIndex(
    (hf) => hf.name === Hardfork.MergeNetsplitBlock,
  )
  const firstPostMergeHFIndex = params.hardforks.findIndex(
    (hf) => hf.timestamp !== undefined && hf.timestamp !== null,
  )

  if (mergeIndex !== -1 && mergeNetsplitBlockIndex === -1) {
    params.hardforks.splice(mergeIndex + 1, 0, {
      name: Hardfork.MergeNetsplitBlock,
      block: params.hardforks[mergeIndex].block!,
    })
    mergeNetsplitBlockIndex = mergeIndex + 1
  }
  if (firstPostMergeHFIndex !== -1) {
    if (mergeNetsplitBlockIndex === -1) {
      params.hardforks.splice(firstPostMergeHFIndex, 0, {
        name: Hardfork.MergeNetsplitBlock,
        block: 0n,
      })
      mergeNetsplitBlockIndex = firstPostMergeHFIndex
    }
    if (mergeIndex === -1) {
      params.hardforks.splice(mergeNetsplitBlockIndex, 0, {
        name: Hardfork.Paris,
        block: params.hardforks[mergeNetsplitBlockIndex].block!,
      })
    }
  } else if (config.terminalTotalDifficultyPassed === true) {
    if (mergeIndex === -1) {
      params.hardforks.push({
        name: Hardfork.Paris,
        block: 0n,
      })
    }
    if (mergeNetsplitBlockIndex === -1) {
      params.hardforks.push({
        name: Hardfork.MergeNetsplitBlock,
        block: 0n,
      })
      mergeNetsplitBlockIndex = firstPostMergeHFIndex
    }
  }

  params.hardforks.sort(
    (a: ConfigHardfork, b: ConfigHardfork) =>
      Number(a.block ?? Number.POSITIVE_INFINITY) -
      Number(b.block ?? Number.POSITIVE_INFINITY),
  )

  params.hardforks.sort((a: ConfigHardfork, b: ConfigHardfork) => {
    return (a.timestamp ?? 0) - (b.timestamp ?? 0)
  })

  for (const hf of params.hardforks) {
    if (hf.timestamp === genesisTimestamp) {
      hf.timestamp = 0
    }
  }

  const latestHardfork =
    params.hardforks.length > 0 ? params.hardforks.slice(-1)[0] : undefined
  params.hardfork = latestHardfork?.name
  params.hardforks.unshift({ name: Hardfork.Chainstart, block: 0n })

  return params
}

export function parseGethGenesis(gethGenesis: GethGenesis, name?: string) {
  try {
    const required = ['config', 'difficulty', 'gasLimit', 'nonce', 'alloc']
    if (required.some((field) => !(field in gethGenesis))) {
      const missingField = required.filter((field) => !(field in gethGenesis))
      throw EthereumJSErrorWithoutCode(
        `Invalid format, expected geth genesis field "${missingField}" missing`,
      )
    }

    const finalGethGenesis = { ...gethGenesis }

    if (name !== undefined) {
      finalGethGenesis.name = name
    }
    return parseGethParams(finalGethGenesis)
  } catch (e: any) {
    throw EthereumJSErrorWithoutCode(
      `Error parsing parameters file: ${e.message}`,
    )
  }
}

export const getPresetChainConfig = (chain: string | number) => {
  switch (chain) {
    case 'holesky':
    case 17000:
      return Holesky
    case 'hoodi':
    case 560048:
      return Hoodi
    case 'sepolia':
    case 11155111:
      return Sepolia
    case 'mainnet':
    case 1:
    default:
      return Mainnet
  }
}
