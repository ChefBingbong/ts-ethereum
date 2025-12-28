import {
  bytesToHex,
  concatBytes,
  EthereumJSErrorWithoutCode,
  hexToBytes,
  intToBytes,
  type PrefixedHexString,
  TypeOutput,
  toType,
} from '@ts-ethereum/utils'
import { EventEmitter } from 'eventemitter3'
import { crc32 } from '../crc'
import {
  ConsensusAlgorithm,
  ConsensusType,
  type EIP,
  HARDFORK_ORDER,
  Hardfork,
} from '../fork-params/enums'
import type {
  ChainConfig,
  ChainParams,
  CommonEvent,
  CustomCrypto,
  GenesisBlockConfig,
  HardforkByOpts,
  ParamsConfig,
  ParamsDict,
} from '../types'
import {
  type CleanSchemaChainRules,
  type ExtractHardforkNames,
  HardforkParamManager,
  type HardforkSchemaEntry,
  type TypedHardforkSchema,
} from './param-manager'
import type {
  EIPParamKeys,
  EIPParamType,
  EIPWithHardfork,
  EIPWithParams,
  MinHardforkFor,
} from './types'

export interface TypedGlobalConfigOpts<
  Entries extends readonly HardforkSchemaEntry<string>[],
> {
  schema: TypedHardforkSchema<Entries>
  hardfork?: ExtractHardforkNames<Entries>
  customCrypto?: CustomCrypto
  overrides?: ParamsConfig
}

export class GlobalConfig<
  H extends string = Hardfork,
  SchemaH extends string = Hardfork,
> {
  public readonly customCrypto: CustomCrypto
  public readonly events: EventEmitter<CommonEvent>
  public readonly _chainId: bigint

  protected _currentHardfork: H
  public _hardforkParams: HardforkParamManager<H, SchemaH>
  protected _schemaHardforks: readonly HardforkSchemaEntry<string>[]

  private _eipsCache?: number[]
  private _hardforkMap?: Map<string, HardforkSchemaEntry<string>>

  public chain?: ChainConfig

  static fromSchema<
    const Entries extends readonly HardforkSchemaEntry<string>[],
  >(
    opts: TypedGlobalConfigOpts<Entries>,
  ): GlobalConfig<
    ExtractHardforkNames<Entries>,
    ExtractHardforkNames<Entries>
  > {
    type HF = ExtractHardforkNames<Entries>

    const firstHardfork = opts.schema.hardforks[0]?.name as HF
    const initialHardfork = (opts.hardfork ?? firstHardfork) as HF

    const manager = HardforkParamManager.createFromSchema(
      initialHardfork,
      opts.schema,
      opts.overrides,
    )
    console.log('manager', opts.schema.chainId)

    const config = new GlobalConfig<HF, HF>()
    config.chain = opts.schema.chain
    config._currentHardfork = initialHardfork
    config._hardforkParams = manager
    config._schemaHardforks = opts.schema.hardforks
    ;(config as { _chainId: bigint })._chainId = opts.schema.chainId
    ;(config as { customCrypto: CustomCrypto }).customCrypto =
      opts.customCrypto ?? {}

    return config
  }

  protected constructor() {
    this.events = new EventEmitter<CommonEvent>()
    this.customCrypto = {}
    this._chainId = 0n
    this.chain = undefined
    this._currentHardfork = Hardfork.Chainstart as H
    this._hardforkParams = new HardforkParamManager(
      Hardfork.Chainstart,
    ) as unknown as HardforkParamManager<H, SchemaH>
    this._schemaHardforks = []
  }

  setHardfork<NewH extends SchemaH>(hardfork: NewH): NewH {
    if (!this.isValidHardfork(hardfork)) {
      throw EthereumJSErrorWithoutCode(
        `Hardfork with name ${hardfork} not supported`,
      )
    }
    this._currentHardfork = hardfork as unknown as H
    this._hardforkParams = this._hardforkParams.withHardfork(
      hardfork,
    ) as unknown as HardforkParamManager<H, SchemaH>

    this._eipsCache = undefined
    this._hardforkMap = undefined

    this.events.emit('hardforkChanged', hardfork)
    return hardfork
  }

  chainName(): string {
    return this.chain?.name ?? ''
  }

  bootstrapNodes(): string[] {
    return (this.chain?.bootstrapNodes ?? []).map((n: any) =>
      typeof n === 'string' ? n : n.ip,
    ) as string[]
  }

  genesis(): GenesisBlockConfig | undefined {
    return this.chain?.genesis
  }

  rules(
    blockNumber: bigint,
    timestamp: bigint,
  ): CleanSchemaChainRules<SchemaH> {
    return this._hardforkParams.rules(blockNumber, timestamp)
  }

  isActivatedEIP(eip: number | EIP): boolean {
    return this._hardforkParams.isEIPActive(eip as EIP)
  }

  isHardforkAfter(hardfork: SchemaH): boolean {
    const hardforks = this._schemaHardforks
    const currentIdx = hardforks.findIndex(
      (hf) => hf.name === this._currentHardfork,
    )
    const targetIdx = hardforks.findIndex((hf) => hf.name === hardfork)
    return currentIdx >= targetIdx && targetIdx !== -1
  }

  getParamByEIP<
    E extends EIPWithHardfork & EIPWithParams,
    K extends EIPParamKeys<E>,
  >(
    eip: H extends MinHardforkFor[E] ? E : never,
    param: K,
  ): EIPParamType<E, K> {
    return this._hardforkParams.getParamByEIP(eip, param)
  }

  getParam<T extends keyof ChainParams>(name: T) {
    return this._hardforkParams.getParam(name)
  }

  param<T extends keyof Omit<ChainParams, 'target' | 'max'>>(
    name: T,
  ): T extends EIPParamKeys<1>
    ? EIPParamType<1, T>
    : Omit<ChainParams, 'target' | 'max'>[T] | undefined {
    // @ts-expect-error - this is a workaround to fix the type error
    return this._hardforkParams.getParam(name)
  }

  consensusAlgorithm(): ConsensusAlgorithm {
    return ConsensusAlgorithm.Ethash
  }

  consensusType(): ConsensusType {
    return ConsensusType.ProofOfWork
  }

  consensusConfig(): Record<string, unknown> {
    // TODO: Could store this in the schema if needed for Clique chains
    return {}
  }

  chainId(): bigint {
    return this._chainId
  }

  /**
   * Returns the block number at which a specific EIP was activated.
   * Returns null if the EIP is not part of a block-based hardfork.
   */
  eipBlock(eip: number): bigint | null {
    // Find which hardfork introduced this EIP, then return that hardfork's block
    const hardforkName = this._hardforkParams.getHardforkForEIP(eip)
    if (!hardforkName) return null

    const hf = this.lookupHardfork(hardforkName)
    if (!hf || hf.block === null) return null
    return BigInt(hf.block)
  }

  /**
   * Returns blob gas schedule parameters for the current hardfork
   */
  getBlobGasSchedule(): {
    targetBlobGasPerBlock: bigint
    maxBlobGasPerBlock: bigint
    blobGasPerBlob: bigint
  } {
    const targetGas = this.param('targetBlobGasPerBlock')
    const maxGas = this.param('maxBlobGasPerBlock')
    const gasPerBlob = this.param('blobGasPerBlob')

    return {
      targetBlobGasPerBlock: BigInt(targetGas ?? 0),
      maxBlobGasPerBlock: BigInt(maxGas ?? 0),
      blobGasPerBlob: BigInt(gasPerBlob ?? 0),
    }
  }

  updateParams(overrides: ParamsConfig): this {
    this._hardforkParams.updateParams(overrides)
    return this
  }

  updateBatchParams(overrides: ParamsDict) {
    for (const [, params] of Object.entries(overrides)) {
      // this._hardforkParams.updateParams(params)
    }
  }

  hardforkBlock(hardfork?: SchemaH) {
    hardfork = hardfork ?? (this._currentHardfork as unknown as SchemaH)
    return this.lookupHardfork(hardfork)?.block ?? null
  }

  getHardforkTimestamp(hardfork?: SchemaH): number | string | undefined {
    hardfork = hardfork ?? (this._currentHardfork as unknown as SchemaH)
    return this.lookupHardfork(hardfork)?.timestamp
  }

  getHardforkByBlockNumber(blockNumber: bigint): string | undefined {
    return this._schemaHardforks.find(
      (hf) => hf.block !== null && BigInt(hf.block) === blockNumber,
    )?.name
  }

  getHardforkByTimestamp(timestamp: bigint): string | undefined {
    return this._schemaHardforks.find(
      (hf) => hf.timestamp !== undefined && BigInt(hf.timestamp) === timestamp,
    )?.name
  }

  getHardforkBy(opts: HardforkByOpts): SchemaH {
    const blockNumber =
      opts.blockNumber !== undefined
        ? toType(opts.blockNumber, TypeOutput.BigInt)
        : undefined
    const timestamp =
      opts.timestamp !== undefined
        ? toType(opts.timestamp, TypeOutput.BigInt)
        : undefined

    const hfs = this._schemaHardforks.filter(
      (hf) => hf.block !== null || hf.timestamp !== undefined,
    )

    let hfIndex = hfs.findIndex(
      (hf) =>
        (blockNumber !== undefined &&
          hf.block !== null &&
          BigInt(hf.block) > blockNumber) ||
        (timestamp !== undefined &&
          hf.timestamp !== undefined &&
          BigInt(hf.timestamp) > timestamp),
    )

    if (hfIndex === -1) {
      hfIndex = hfs.length
    } else if (hfIndex === 0) {
      throw EthereumJSErrorWithoutCode(
        'Must have at least one hardfork at block 0',
      )
    }

    if (timestamp === undefined) {
      const stepBack = hfs
        .slice(0, hfIndex)
        .reverse()
        .findIndex((hf) => hf.block !== null)
      hfIndex = hfIndex - stepBack
    }

    hfIndex = hfIndex - 1

    for (; hfIndex < hfs.length - 1; hfIndex++) {
      if (
        hfs[hfIndex].block !== hfs[hfIndex + 1].block ||
        hfs[hfIndex].timestamp !== hfs[hfIndex + 1].timestamp
      ) {
        break
      }
    }

    return hfs[hfIndex].name as SchemaH
  }

  setHardforkBy(opts: HardforkByOpts): SchemaH {
    const hardfork = this.getHardforkBy(opts)
    this.setHardfork(hardfork)
    return hardfork
  }

  hardforkIsActiveOnBlock(
    hardfork: SchemaH | null,
    blockNumber: bigint,
  ): boolean {
    const hf = hardfork ?? (this._currentHardfork as unknown as SchemaH)
    const hfBlock = this.lookupHardfork(hf)?.block
    if (
      typeof hfBlock === 'number' &&
      hfBlock !== 0 &&
      blockNumber >= BigInt(hfBlock)
    ) {
      return true
    }
    return false
  }

  activeOnBlock(blockNumber: bigint): boolean {
    return this.hardforkIsActiveOnBlock(null, blockNumber)
  }

  hardfork(): H {
    return this._currentHardfork
  }

  gteHardfork(hardfork: SchemaH | string): boolean {
    const hardforks = this._schemaHardforks
    const currentIdx = hardforks.findIndex(
      (hf) => hf.name === this._currentHardfork,
    )
    const targetIdx = hardforks.findIndex((hf) => hf.name === hardfork)
    if (targetIdx === -1) {
      // If hardfork not found in schema, check HARDFORK_ORDER
      const orderCurrentIdx = HARDFORK_ORDER.findIndex(
        (hf) => hf === this._currentHardfork,
      )
      const orderTargetIdx = HARDFORK_ORDER.findIndex((hf) => hf === hardfork)
      if (orderTargetIdx === -1) return false
      return orderCurrentIdx >= orderTargetIdx
    }
    return currentIdx >= targetIdx
  }

  copy(): GlobalConfig<H, SchemaH> {
    const copy = new GlobalConfig<H, SchemaH>()
    copy._currentHardfork = this._currentHardfork
    copy._hardforkParams = this._hardforkParams.copy()
    copy._schemaHardforks = [...this._schemaHardforks]
    copy.chain = this.chain
    ;(copy as { _chainId: bigint })._chainId = this._chainId
    ;(copy as { customCrypto: CustomCrypto }).customCrypto = this.customCrypto
    return copy
  }

  protected _calcForkHash(
    hardfork: SchemaH,
    genesisHash: Uint8Array,
  ): PrefixedHexString {
    let hfBytes = new Uint8Array(0)
    let prevBlockOrTime = 0n

    for (const hf of this._schemaHardforks) {
      const { block, timestamp, name } = hf
      // Timestamp to be used for timestamp based hfs even if we may bundle
      // block number with them retrospectively
      const blockOrTime: bigint | null =
        timestamp !== undefined ? BigInt(timestamp) : block

      // Skip for chainstart (0), not applied HFs (null) and
      // when already applied on same blockOrTime HFs
      // and on the merge since forkhash doesn't change on merge hf
      if (
        blockOrTime !== null &&
        blockOrTime !== 0n &&
        blockOrTime !== prevBlockOrTime &&
        name !== Hardfork.Paris
      ) {
        const hfBlockBytes = hexToBytes(
          `0x${blockOrTime.toString(16).padStart(16, '0')}`,
        )
        hfBytes = concatBytes(hfBytes, hfBlockBytes)
        prevBlockOrTime = blockOrTime
      }

      if (hf.name === hardfork) break
    }

    const inputBytes = concatBytes(genesisHash, hfBytes)

    // CRC32 delivers result as signed (negative) 32-bit integer,
    // convert to hex string
    const forkhash = bytesToHex(intToBytes(crc32(inputBytes) >>> 0))
    return forkhash
  }

  forkHash(hardfork?: SchemaH, genesisHash?: Uint8Array): PrefixedHexString {
    hardfork = hardfork ?? (this._currentHardfork as unknown as SchemaH)
    const data = this.lookupHardfork(hardfork)

    if (
      data === undefined ||
      (data.block === null && data.timestamp === undefined)
    ) {
      const msg = 'No fork hash calculation possible for future hardfork'
      throw EthereumJSErrorWithoutCode(msg)
    }

    if (data.forkHash !== null && data.forkHash !== undefined) {
      return data.forkHash as PrefixedHexString
    }

    if (!genesisHash) {
      throw EthereumJSErrorWithoutCode(
        'genesisHash required for forkHash calculation',
      )
    }

    return this._calcForkHash(hardfork, genesisHash)
  }

  setForkHashes(genesisHash: Uint8Array): void {
    // Create mutable copies of hardfork entries to set fork hashes
    const mutableHardforks = this._schemaHardforks.map((hf) => ({ ...hf }))

    for (const hf of mutableHardforks) {
      const blockOrTime = hf.timestamp ?? hf.block
      if (
        (hf.forkHash === null || hf.forkHash === undefined) &&
        blockOrTime !== null &&
        blockOrTime !== undefined
      ) {
        ;(hf as { forkHash: string }).forkHash = this._calcForkHash(
          hf.name as SchemaH,
          genesisHash,
        )
      }
    }
    // Update the schema hardforks with the new fork hashes
    ;(
      this as unknown as { _schemaHardforks: typeof mutableHardforks }
    )._schemaHardforks = mutableHardforks
  }

  private lookupHardfork(
    hardfork: string,
  ): HardforkSchemaEntry<string> | undefined {
    if (this._hardforkMap) return this._hardforkMap.get(hardfork)
    this._hardforkMap = new Map(
      this._schemaHardforks.map((hf) => [hf.name, hf]),
    )
    return this._hardforkMap.get(hardfork)
  }

  private isValidHardfork(hardfork: string): boolean {
    return this._schemaHardforks.some((hf) => hf.name === hardfork)
  }

  get eips(): number[] {
    return (
      this._eipsCache ??
      (this._eipsCache = [...this._hardforkParams.activeEips])
    )
  }

  get hardforks(): readonly HardforkSchemaEntry<string>[] {
    return this._schemaHardforks
  }

  get activeHardfork(): H {
    return this._currentHardfork
  }

  get paramManager(): HardforkParamManager<H, SchemaH> {
    return this._hardforkParams
  }
}
