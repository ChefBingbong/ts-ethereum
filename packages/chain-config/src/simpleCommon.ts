import { EthereumJSErrorWithoutCode } from '@ts-ethereum/utils'
import { EventEmitter } from 'eventemitter3'
import { type EIP, HARDFORK_ORDER, Hardfork } from './enums'
import { EIPParams, HardforkParams } from './mappings'
import { HardforkParamsBuilder } from './paramsBuilder'
import type {
  ChainConfig,
  ChainParams,
  CommonEvent,
  CommonOpts,
  CustomCrypto,
  HardforkTransitionConfig,
} from './types'

export class SimpleCommon {
  public readonly customCrypto: CustomCrypto
  public readonly events: EventEmitter<CommonEvent>

  protected _hardfork: Hardfork
  protected _chainParams: ChainConfig
  protected _paramsBuilder: HardforkParamsBuilder<Hardfork>

  private _eipsCache?: number[]
  private _hardforkMap?: Map<string | Hardfork, HardforkTransitionConfig>

  constructor(opts: CommonOpts) {
    this.events = new EventEmitter<CommonEvent>()

    this._chainParams = JSON.parse(JSON.stringify(opts.chain)) // copy
    this.customCrypto = opts.customCrypto ?? {}

    const initialHardfork = (opts.hardfork as Hardfork) ?? Hardfork.Chainstart
    this._hardfork = initialHardfork
    this._paramsBuilder = HardforkParamsBuilder.create(
      initialHardfork,
      EIPParams,
      HardforkParams,
    )
  }

  setHardfork(hardfork: Hardfork) {
    if (!this._isValidHardfork(hardfork) || this._hardfork === hardfork) {
      throw EthereumJSErrorWithoutCode(
        `Hardfork with name ${hardfork} not supported`,
      )
    }
    this._hardfork = hardfork
    this._paramsBuilder = this._paramsBuilder.withHardfork(hardfork)

    this._eipsCache = undefined
    this._hardforkMap = undefined
    this.events.emit('hardforkChanged', hardfork)
    return hardfork
  }

  private _isValidHardfork(hardfork: Hardfork): boolean {
    return HARDFORK_ORDER.includes(hardfork)
  }

  overrideParams(overrides: Partial<ChainParams>): this {
    this._paramsBuilder.overrideParams(overrides)
    this._eipsCache = undefined
    return this
  }

  param(name: string) {
    return this._paramsBuilder.getParam(name as keyof ChainParams)
  }

  paramByHardfork(name: string, hardfork: Hardfork) {
    const builder = this._paramsBuilder.withHardfork(hardfork)
    return builder.getParam(name as keyof ChainParams)
  }

  paramByEIP(name: string, eip: number) {
    return this._paramsBuilder.getEipParams(eip as EIP)?.[
      name as keyof ChainParams
    ]
  }

  isActivatedEIP(eip: number) {
    return this._paramsBuilder.activeEips.has(eip as EIP)
  }

  gteHardfork(hardfork: Hardfork) {
    const hardforks = this.hardforks()
    const currentIdx = hardforks.findIndex((hf) => hf.name === this._hardfork)
    const targetIdx = hardforks.findIndex((hf) => hf.name === hardfork)
    return currentIdx >= targetIdx && targetIdx !== -1
  }

  hardforkBlock(hardfork?: Hardfork) {
    hardfork = hardfork ?? this._hardfork
    return this._getHardfork(hardfork)?.block
  }

  hardforkTimestamp(hardfork = this._hardfork) {
    return this._getHardfork(hardfork)?.timestamp
  }

  getHardforkByBlockNumber(blockNumber: bigint) {
    return this.hardforks().find(
      (hf) => hf.block !== null && BigInt(hf.block) === blockNumber,
    )?.name
  }

  getHardforkByTimestamp(timestamp: bigint) {
    return this.hardforks().find(
      (hf) => hf.timestamp !== undefined && BigInt(hf.timestamp) === timestamp,
    )?.name
  }

  protected _getHardfork(hardfork: Hardfork) {
    if (this._hardforkMap) return this._hardforkMap.get(hardfork)
    this._hardforkMap = new Map(this.hardforks().map((hf) => [hf.name, hf]))
    return this._hardforkMap.get(hardfork)
  }

  genesis() {
    return this._chainParams.genesis
  }

  hardforks() {
    return this._chainParams.hardforks
  }

  bootstrapNodes() {
    return this._chainParams.bootstrapNodes
  }

  dnsNetworks() {
    return this._chainParams.dnsNetworks ?? []
  }

  hardfork() {
    return this._hardfork
  }

  chainId() {
    return BigInt(this._chainParams.chainId)
  }

  chainName() {
    return this._chainParams.name
  }

  eips() {
    if (this._eipsCache) return this._eipsCache
    return (this._eipsCache = this._paramsBuilder.activeEips.values().toArray())
  }

  consensusType() {
    return this._chainParams.consensus.type
  }
}
