import { unprefixedHexToBytes } from '@ts-ethereum/utils'
import { EventEmitter } from 'eventemitter3'
import {
  type ChainConfig,
  type CommonEvent,
  type CommonOpts,
  type CustomCrypto,
  type EthashConfig,
  Hardfork,
  type ParamsConfig,
} from './types'

export class Common {
  protected _chainParams: ChainConfig
  protected _hardfork: string | Hardfork = Hardfork.Chainstart
  protected _paramsCache: ParamsConfig = {}

  public events: EventEmitter<CommonEvent>

  /**
   * Custom crypto functions. Can be used to replace the built-in
   * keccak256, ecrecover, ecsign, etc.
   */
  public customCrypto: CustomCrypto = {}

  constructor(opts: CommonOpts) {
    this.events = new EventEmitter<CommonEvent>()
    this._chainParams = JSON.parse(JSON.stringify(opts.chain)) // copy
    this._paramsCache = opts.params // copy
    this._hardfork = Hardfork.Chainstart
  }

  /**
   * Returns a parameter for the current chain setup
   */
  param(name: string): bigint {
    if (!(name in this._paramsCache)) {
      throw Error(`Missing parameter value for ${name}`)
    }
    const value = this._paramsCache[name]
    return BigInt(value ?? 0)
  }

  /**
   * Update the params cache with new values.
   * Merges provided params directly into the params cache object.
   * @param params - ParamsDict keyed by hardfork number (e.g., { 1: { key: value } })
   */
  updateParams(params: { [key: string]: ParamsConfig }): void {
    // For Chainstart/Frontier, we use hardfork "1"
    const hardforkParams = params['1'] ?? params[1]
    if (hardforkParams) {
      // Merge new params into the cache
      Object.assign(this._paramsCache, hardforkParams)
    }
  }

  genesis() {
    return this._chainParams.genesis
  }

  bootstrapNodes() {
    return this._chainParams.bootstrapNodes.map((node) => ({
      ...node,
      id: unprefixedHexToBytes(node.id),
    }))
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

  consensusType() {
    return this._chainParams.consensus.type
  }

  consensusAlgorithm() {
    return this._chainParams.consensus.algorithm
  }

  consensusConfig(): {
    [key: string]: EthashConfig | undefined 
  } {
    return this._chainParams.consensus?.ethash ?? {}
  }

  copy(): Common {
    const copy = Object.assign(Object.create(Object.getPrototypeOf(this)), this)
    copy.events = new EventEmitter()
    return copy
  }
}
