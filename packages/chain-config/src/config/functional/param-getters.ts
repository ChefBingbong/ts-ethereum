import { HARDFORK_EIPS, type Hardfork } from '../../hardforks/hardforks'
import {
  type AllParamNames,
  EIP_PARAMS,
  EIP1_PARAMS,
  type EIPWithParams,
  type HardforkParamsMap,
  type ParamsAtHardfork,
  type ParamType,
  type ParamValue,
} from '../../hardforks/params'
import type { FrozenChainConfig } from './types'

/**
 * Get all params active at a specific hardfork.
 *
 * @typeParam H - The hardfork name for strongly typed return value
 * @param config - The frozen chain configuration
 * @param hardfork - The hardfork name
 * @returns All accumulated params up to and including the hardfork
 *
 * @example
 * ```ts
 * const params = getParamsAtHardfork(config, 'london')
 * // params is typed as ParamsAtHardfork<'london'>
 * // Includes: EIP1_PARAMS & EIP606_PARAMS & ... & EIP1559_PARAMS & EIP3198_PARAMS & EIP3529_PARAMS
 *
 * params.baseFeeMaxChangeDenominator // bigint (from EIP-1559)
 * params.elasticityMultiplier // bigint (from EIP-1559)
 * params.minGasLimit // bigint (from EIP-1)
 * ```
 */
export function getParamsAtHardfork<H extends keyof HardforkParamsMap>(
  config: FrozenChainConfig,
  hardfork: H,
): ParamsAtHardfork<H>

/**
 * Get all params active at a specific hardfork (dynamic hardfork string).
 * Falls back to generic Record type when hardfork is not a literal type.
 */
export function getParamsAtHardfork(
  config: FrozenChainConfig,
  hardfork: string,
): Record<string, ParamValue>

export function getParamsAtHardfork(
  config: FrozenChainConfig,
  hardfork: string,
): Record<string, ParamValue> {
  const targetIndex = config._hardforkIndex.get(hardfork)
  if (targetIndex === undefined) return {}

  let result: Record<string, ParamValue> = {}
  for (let i = 0; i <= targetIndex; i++) {
    const hf = config.spec.hardforks[i]
    const hfName = hf.name as Hardfork
    const eips = HARDFORK_EIPS[hfName]

    if (!eips) continue

    let hfParams: Record<string, ParamValue> = {}
    for (const eip of eips) {
      const params = EIP_PARAMS[eip as EIPWithParams]
      hfParams = { ...hfParams, ...params }
    }
    result = { ...result, ...hfParams }
  }

  return result
}

/**
 * Get a specific param value at a hardfork.
 *
 * @typeParam P - The param name for strongly typed return value
 * @param config - The frozen chain configuration
 * @param param - The param name to retrieve
 * @param hardfork - The hardfork name
 * @returns The param value with its correct type, or undefined if not found
 *
 * @example
 * ```ts
 * const baseFee = getParamAtHardfork(config, 'initialBaseFee', 'london')
 * // baseFee is typed as bigint | undefined (from EIP-1559)
 *
 * const gasLimit = getParamAtHardfork(config, 'minGasLimit', 'chainstart')
 * // gasLimit is typed as bigint | undefined (from EIP-1)
 * ```
 */
export function getParamAtHardfork<P extends AllParamNames>(
  config: FrozenChainConfig,
  param: P,
  hardfork: string,
): ParamType<P> | undefined {
  let result =
    param in EIP1_PARAMS
      ? (EIP1_PARAMS[param as keyof typeof EIP1_PARAMS] as ParamType<P>)
      : undefined

  const targetIndex = config._hardforkIndex.get(hardfork)
  if (targetIndex === undefined) return result

  for (let i = 0; i <= targetIndex; i++) {
    const hf = config.spec.hardforks[i]
    const hfName = hf.name as Hardfork
    const eips = HARDFORK_EIPS[hfName]

    if (!eips) continue

    for (const eip of eips) {
      const params = EIP_PARAMS[eip as EIPWithParams]
      if (params && param in params) {
        result = (params as Record<string, ParamValue>)[param] as ParamType<P>
      }
    }
  }

  return result
}
