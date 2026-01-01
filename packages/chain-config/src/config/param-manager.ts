import {
  getActiveEIPsAtHardfork,
  getHardforkSequence,
  HARDFORK_EIPS,
  type Hardfork,
} from '../hardforks/hardforks'
import {
  type AllParamNames,
  EIP_PARAMS,
  EIP1_PARAMS,
  type EIPParamsFor,
  type EIPWithParams,
  type ParamValue,
} from '../hardforks/params'
import type { ParamsConfig } from '../types'
import type {
  HardforkSchemaEntry,
  ParamsManagerOptions,
  ParamsOverrides,
  TypedHardforkSchema,
} from './types'

export class ParamsManager<H extends Hardfork = Hardfork> {
  private _hardfork: H
  private _activeEips: Set<number>
  private _overrides: ParamsOverrides

  constructor(hardfork: H, options?: ParamsManagerOptions) {
    this._hardfork = hardfork
    this._activeEips = getActiveEIPsAtHardfork(hardfork)
    this._overrides = options?.overrides ?? {}
  }

  static createFromSchema<
    const Entries extends readonly HardforkSchemaEntry<string>[],
    HF extends Entries[number]['name'],
  >(
    hardfork: HF,
    _schema: TypedHardforkSchema<Entries>,
    overrides?: ParamsConfig,
  ): ParamsManager<Hardfork> {
    return new ParamsManager(hardfork as Hardfork, {
      overrides: overrides as ParamsOverrides,
    })
  }

  get currentHardfork(): H {
    return this._hardfork
  }

  get activeEips(): Set<number> {
    return new Set(this._activeEips)
  }

  isEIPActive(eip: number): boolean {
    return this._activeEips.has(eip)
  }

  getParam(name: AllParamNames): ParamValue | undefined {
    const override = this._overrides[name]
    if (override !== undefined) {
      return override
    }

    let result: ParamValue | undefined =
      name in EIP1_PARAMS
        ? EIP1_PARAMS[name as keyof typeof EIP1_PARAMS]
        : undefined

    const sequence = getHardforkSequence(this._hardfork)

    for (const hf of sequence) {
      const eips = HARDFORK_EIPS[hf]
      for (const eip of eips) {
        const params = EIP_PARAMS[eip as EIPWithParams]
        if (params && name in params) {
          result = (params as Record<string, ParamValue>)[name]
        }
      }
    }

    return result
  }

  getParamByEIP<E extends EIPWithParams, P extends keyof EIPParamsFor<E>>(
    eip: E,
    param: P,
  ): EIPParamsFor<E>[P] {
    if (!this.isEIPActive(eip)) {
      throw new Error(`EIP ${eip} is not active at hardfork ${this._hardfork}`)
    }

    const params = EIP_PARAMS[eip]
    return params[param]
  }

  getEIPParams<E extends EIPWithParams>(eip: E): EIPParamsFor<E> {
    if (!this.isEIPActive(eip)) {
      throw new Error(`EIP ${eip} is not active at hardfork ${this._hardfork}`)
    }

    return EIP_PARAMS[eip]
  }

  updateParams(overrides: ParamsOverrides | ParamsConfig): this {
    this._overrides = { ...this._overrides, ...(overrides as ParamsOverrides) }
    return this
  }

  withHardfork<NewH extends Hardfork>(hardfork: NewH): ParamsManager<NewH> {
    return new ParamsManager(hardfork, {
      overrides: { ...this._overrides },
    })
  }

  copy(): ParamsManager<H> {
    return new ParamsManager(this._hardfork, {
      overrides: { ...this._overrides },
    })
  }

  getHardforkForEIP(eip: number): Hardfork | undefined {
    for (const [hf, eips] of Object.entries(HARDFORK_EIPS)) {
      if ((eips as readonly number[]).includes(eip)) {
        return hf as Hardfork
      }
    }
    return undefined
  }
}

export const HardforkParamManager = ParamsManager
