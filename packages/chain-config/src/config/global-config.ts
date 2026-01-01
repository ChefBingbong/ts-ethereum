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
import { ConsensusAlgorithm, ConsensusType } from '../chains'
import { crc32 } from '../crc'
import type { EIP } from '../hardforks/eips'
import {
  HARDFORK_ORDER,
  Hardfork,
  type Hardfork as HardforkType,
} from '../hardforks/hardforks'
import type { AllParamNames } from '../hardforks/params'
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
import { ParamsManager } from './param-manager'
import type {
  EIPParamKeys,
  EIPParamType,
  EIPWithHardfork,
  EIPWithParams,
  ExtractHardforkNames,
  GlobalConfigInit,
  HardforkParamManager,
  HardforkSchemaEntry,
  MinHardforkFor,
  TypedGlobalConfigOpts,
} from './types'

export class GlobalConfig<
  H extends string = Hardfork,
  SchemaH extends string = Hardfork,
  Params = ChainParams,
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

    const manager = ParamsManager.createFromSchema(
      initialHardfork,
      opts.schema,
      opts.overrides,
    )

    return new GlobalConfig<HF, HF>({
      chainId: opts.schema.chainId,
      customCrypto: opts.customCrypto,
      hardfork: initialHardfork,
      hardforkParams: manager as unknown as HardforkParamManager<HF, HF>,
      schemaHardforks: opts.schema.hardforks,
      chain: opts.schema.chain,
    })
  }

  protected constructor(opts: GlobalConfigInit<H, SchemaH>) {
    this.events = new EventEmitter<CommonEvent>()
    this.customCrypto = opts.customCrypto ?? {}
    this._chainId = opts.chainId
    this.chain = opts.chain
    this._currentHardfork = opts.hardfork
    this._hardforkParams = opts.hardforkParams
    this._schemaHardforks = opts.schemaHardforks
  }

  setHardfork<NewH extends SchemaH>(hardfork: NewH): NewH {
    if (!this.isValidHardfork(hardfork)) {
      throw EthereumJSErrorWithoutCode(
        `Hardfork with name ${hardfork} not supported`,
      )
    }
    this._currentHardfork = hardfork as unknown as H
    this._hardforkParams = this._hardforkParams.withHardfork(
      hardfork as unknown as HardforkType,
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
    return this._hardforkParams.getParam(name as AllParamNames)
  }

  param<T extends keyof Params & keyof ChainParams>(name: T): Params[T] {
    return this._hardforkParams.getParam(name as AllParamNames) as Params[T]
  }

  consensusAlgorithm(): ConsensusAlgorithm {
    return ConsensusAlgorithm.Ethash
  }

  consensusType(): ConsensusType {
    return ConsensusType.ProofOfWork
  }

  consensusConfig(): Record<string, unknown> {
    return {}
  }

  chainId(): bigint {
    return this._chainId
  }

  eipBlock(eip: number): bigint | null {
    const hardforkName = this._hardforkParams.getHardforkForEIP(eip)
    if (!hardforkName) return null

    const hf = this.lookupHardfork(hardforkName)
    if (!hf || hf.block === null) return null
    return BigInt(hf.block)
  }

  getBlobGasSchedule(): {
    targetBlobGasPerBlock: bigint
    maxBlobGasPerBlock: bigint
    blobGasPerBlob: bigint
  } {
    const targetGas = this.getParam('targetBlobGasPerBlock')
    const maxGas = this.getParam('maxBlobGasPerBlock')
    const gasPerBlob = this.getParam('blobGasPerBlob')

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
      this._hardforkParams.updateParams(params)
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
      const orderCurrentIdx = HARDFORK_ORDER.findIndex(
        (hf) => hf === this._currentHardfork,
      )
      const orderTargetIdx = HARDFORK_ORDER.findIndex((hf) => hf === hardfork)
      if (orderTargetIdx === -1) return false
      return orderCurrentIdx >= orderTargetIdx
    }
    return currentIdx >= targetIdx
  }

  copy(): GlobalConfig<H, SchemaH, Params> {
    return new GlobalConfig<H, SchemaH, Params>({
      chainId: this._chainId,
      customCrypto: this.customCrypto,
      hardfork: this._currentHardfork,
      hardforkParams: this._hardforkParams.copy(),
      schemaHardforks: [...this._schemaHardforks],
      chain: this.chain,
    })
  }

  protected _calcForkHash(
    hardfork: SchemaH,
    genesisHash: Uint8Array,
  ): PrefixedHexString {
    let hfBytes = new Uint8Array(0)
    let prevBlockOrTime = 0n

    for (const hf of this._schemaHardforks) {
      const { block, timestamp, name } = hf
      const blockOrTime: bigint | null =
        timestamp !== undefined ? BigInt(timestamp) : block

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
