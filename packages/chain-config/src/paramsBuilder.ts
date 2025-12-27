import { type EIP, HARDFORK_ORDER, Hardfork } from './enums'
import { hardforksDict } from './hardforks'
import { EIPParams, HardforkParams } from './mappings'
import type { ChainParams, MergedParamsAtHardfork } from './types'

export class HardforkParamsBuilder<H extends Hardfork = Hardfork> {
  private _currentHardfork: H
  private readonly _eipParams: typeof EIPParams
  private readonly _hardforkParams: typeof HardforkParams
  private _mergedParamsCache: Map<Hardfork, ChainParams>
  private _paramOverrides: Map<Hardfork, Partial<ChainParams>>
  private _activeEipsCache: Map<Hardfork, Set<EIP>>
  // Pre-computed hardfork index map for O(1) lookups
  private static readonly _hardforkIndexMap: Map<Hardfork, number> = (() => {
    const map = new Map<Hardfork, number>()
    for (let idx = 0; idx < HARDFORK_ORDER.length; idx++) {
      map.set(HARDFORK_ORDER[idx], idx)
    }
    return map
  })()

  private constructor(
    initialHardfork: H,
    eipParams: typeof EIPParams,
    hardforkParams: typeof HardforkParams,
  ) {
    this._currentHardfork = initialHardfork
    this._eipParams = eipParams
    this._hardforkParams = hardforkParams
    this._mergedParamsCache = new Map()
    this._paramOverrides = new Map()
    this._activeEipsCache = new Map()
  }

  private _getActiveEIPs(hardfork: Hardfork): Set<EIP> {
    const cached = this._activeEipsCache.get(hardfork)
    if (cached) return cached

    const activeEIPs = new Set<EIP>()
    const targetIndex =
      HardforkParamsBuilder._hardforkIndexMap.get(hardfork) ?? -1

    for (let i = 0; i <= targetIndex; i++) {
      const hfConfig = (hardforksDict as Record<string, { eips?: number[] }>)[
        HARDFORK_ORDER[i]
      ]
      for (const eip of hfConfig?.eips ?? []) activeEIPs.add(eip as EIP)
    }

    this._activeEipsCache.set(hardfork, activeEIPs)
    return activeEIPs
  }

  static create(
    initialHardfork: Hardfork = Hardfork.Chainstart,
    eipParams: typeof EIPParams = EIPParams,
    hardforkParams: typeof HardforkParams = HardforkParams,
  ): HardforkParamsBuilder<typeof initialHardfork> {
    return new HardforkParamsBuilder(initialHardfork, eipParams, hardforkParams)
  }

  getParams<H extends Hardfork = Hardfork>(): MergedParamsAtHardfork<H> {
    const hasOverrides = this._paramOverrides.has(this._currentHardfork)
    if (!hasOverrides && this._mergedParamsCache.has(this._currentHardfork)) {
      return this._mergedParamsCache.get(
        this._currentHardfork,
      )! as MergedParamsAtHardfork<H>
    }

    const merged = this._computeMergedParams(this._currentHardfork)

    const overrides = this._paramOverrides.get(this._currentHardfork)
    if (overrides) {
      for (const key in overrides) {
        if (Object.hasOwn(overrides, key)) {
          const value = overrides[key as keyof typeof overrides]
          if (value !== undefined && value !== null) {
            ;(merged as any)[key] = value
          }
        }
      }
    }
    if (!hasOverrides) {
      this._mergedParamsCache.set(this._currentHardfork, merged)
    }

    return merged as MergedParamsAtHardfork<H>
  }

  private _computeMergedParams(hardfork: Hardfork): ChainParams {
    const result = {} as ChainParams

    // Merge EIP params for all active EIPs (reuses cached computation)
    for (const eip of this._getActiveEIPs(hardfork)) {
      const eipParams = this._eipParams[eip as keyof typeof EIPParams]
      if (eipParams) {
        for (const key in eipParams) {
          const value = (eipParams as any)[key]
          if (value != null) (result as any)[key] = value
        }
      }
    }

    const hardforkOverrides = this._hardforkParams[hardfork]
    if (hardforkOverrides) {
      for (const key in hardforkOverrides) {
        const value = (hardforkOverrides as any)[key]
        if (value != null) (result as any)[key] = value
      }
    }

    return result
  }

  getParam<K extends keyof MergedParamsAtHardfork<H>>(
    key: K,
  ): MergedParamsAtHardfork<H>[K] {
    const params = this.getParams()
    return params[key]
  }

  overrideParams(overrides: Partial<ChainParams>): this {
    const currentOverrides =
      this._paramOverrides.get(this._currentHardfork) ?? {}
    this._paramOverrides.set(this._currentHardfork, {
      ...currentOverrides,
      ...overrides,
    })
    this._mergedParamsCache.delete(this._currentHardfork)
    return this
  }

  clearOverrides(): this {
    this._paramOverrides.delete(this._currentHardfork)
    this._mergedParamsCache.delete(this._currentHardfork)
    return this
  }

  getOverrides(): Partial<ChainParams> {
    return this._paramOverrides.get(this._currentHardfork) ?? {}
  }

  withHardfork<NewH extends Hardfork>(
    hardfork: NewH,
  ): HardforkParamsBuilder<NewH> {
    const newBuilder = new HardforkParamsBuilder(
      hardfork,
      this._eipParams,
      this._hardforkParams,
    )
    if (this._mergedParamsCache.size > 0) {
      newBuilder._mergedParamsCache = new Map(this._mergedParamsCache)
    }
    if (this._paramOverrides.size > 0) {
      newBuilder._paramOverrides = new Map(this._paramOverrides)
    }
    newBuilder._activeEipsCache = this._activeEipsCache
    return newBuilder
  }

  getEipParams<E extends EIP>(eip: E): Partial<ChainParams> | undefined {
    if (!this.activeEips.has(eip)) {
      return undefined
    }

    if (eip in this._eipParams) {
      return this._eipParams[eip as keyof typeof EIPParams]
    }

    return {}
  }

  get currentHardfork(): H {
    return this._currentHardfork
  }

  get activeEips(): Set<EIP> {
    return this._getActiveEIPs(this._currentHardfork)
  }
}

const builder = HardforkParamsBuilder.create(Hardfork.Cancun)
const params = builder.getParams()

params.blobGasPerBlob // ✅ number (guaranteed)
params.tstoreGas // ✅ number (guaranteed)

const oldBuilder = HardforkParamsBuilder.create(Hardfork.Berlin)
const oldParams = oldBuilder.getParams()

oldParams.blobGasPerBlob
