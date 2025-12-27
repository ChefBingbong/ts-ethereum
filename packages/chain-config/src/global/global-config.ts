import {
  BIGINT_0,
  type BigIntLike,
  bytesToHex,
  concatBytes,
  EthereumJSErrorWithoutCode,
  hexToBytes,
  intToBytes,
  PrefixedHexString,
  toType,
  TypeOutput,
} from '@ts-ethereum/utils'
import { EventEmitter } from 'eventemitter3'
import { crc32 } from '../crc'
import { type EIP, Hardfork, HARDFORK_ORDER } from '../fork-params/enums'
import type {
  BootstrapNodeConfig,
  ChainConfig,
  ChainParams,
  CommonEvent,
  CommonOpts,
  CustomCrypto,
  GenesisBlockConfig,
  HardforkByOpts,
  HardforkTransitionConfig,
  ParamsConfig,
} from '../types'
import { getRawParam } from './getters'
import { HardforkParamManager } from './param-manager'

export class GlobalConfig {
  public readonly customCrypto: CustomCrypto
  public readonly events: EventEmitter<CommonEvent>

  protected currentHardfork: Hardfork
  protected chainParams: ChainConfig
  protected hardforkParams: HardforkParamManager<Hardfork>

  private eipsCache?: number[]
  private currentHardforkMap?: Map<string | Hardfork, HardforkTransitionConfig>

  constructor(commonOptions: CommonOpts) {
    this.events = new EventEmitter<CommonEvent>()

    this.chainParams = Object.freeze(commonOptions.chain)
    this.customCrypto = commonOptions.customCrypto ?? {}

    const initialHardfork =
      (commonOptions.hardfork as Hardfork) ?? Hardfork.Chainstart
    this.currentHardfork = initialHardfork

    this.hardforkParams = new HardforkParamManager(initialHardfork)
  }

  setHardfork(hardfork: Hardfork) {
    if (!this.isValidHardfork(hardfork)) {
      throw EthereumJSErrorWithoutCode(
        `Hardfork with name ${hardfork} not supported`,
      )
    }
    this.currentHardfork = hardfork
    this.hardforkParams = this.hardforkParams.withHardfork(hardfork)

    this.eipsCache = undefined
    this.currentHardforkMap = undefined

    this.events.emit('hardforkChanged', hardfork)
    return this.hardforkParams.currentHardfork
  }

  public isActivatedEIP(eip: number | EIP) {
    return this.hardforkParams.isEIPActive(eip as EIP)
  }

  public isHardforkAfter(hardfork: Hardfork) {
    const hardforks = this.hardforks
    const currentIdx = hardforks.findIndex(
      (hf) => hf.name === this.currentHardfork,
    )
    const targetIdx = hardforks.findIndex((hf) => hf.name === hardfork)
    return currentIdx >= targetIdx && targetIdx !== -1
  }

  public getParamByEIP(
    param: string,
    eip: number,
  ): string | number | bigint | null | undefined {
    if (!this.hardforkParams.isEIPActive(eip as EIP)) {
      return undefined
    }
    return getRawParam(eip as EIP, param)
  }

  public getParam(
    name: keyof ChainParams,
  ): ChainParams[keyof ChainParams] | undefined {
    return this.hardforkParams.getParam(name)
  }

  public updateParams(overrides: ParamsConfig): this {
    this.hardforkParams.updateParams(overrides)
    return this
  }

  public getHardforkBlock(hardfork?: Hardfork) {
    hardfork = hardfork ?? this.currentHardfork
    return this.lookupHardfork(hardfork)?.block
  }

  public getHardforkTimestamp(hardfork = this.currentHardfork) {
    return this.lookupHardfork(hardfork)?.timestamp
  }

  public getHardforkByBlockNumber(blockNumber: bigint) {
    return this.hardforks.find(
      (hf) => hf.block !== null && BigInt(hf.block) === blockNumber,
    )?.name
  }

  public getHardforkByTimestamp(timestamp: bigint) {
    return this.hardforks.find(
      (hf) => hf.timestamp !== undefined && BigInt(hf.timestamp) === timestamp,
    )?.name
  }

  public copy(): GlobalConfig {
    const copy = new GlobalConfig({
      chain: this.chainParams,
      hardfork: this.currentHardfork,
      customCrypto: this.customCrypto,
    })

    const overrides = this.hardforkParams.getOverrides()
    if (Object.keys(overrides).length > 0) {
      copy.hardforkParams.updateParams(overrides)
    }
    return copy
  }

  private lookupHardfork(hardfork: Hardfork) {
    if (this.currentHardforkMap) return this.currentHardforkMap.get(hardfork)
    this.currentHardforkMap = new Map(this.hardforks.map((hf) => [hf.name, hf]))
    return this.currentHardforkMap.get(hardfork)
  }

  private isValidHardfork(hardfork: Hardfork) {
    if (hardfork === this.currentHardfork) return hardfork
    const index = HARDFORK_ORDER.findIndex((hf) => hf === hardfork)
    return (
      index !== -1 &&
      index > HARDFORK_ORDER.findIndex((hf) => hf === this.currentHardfork)
    )
  }

  get eips() {
    return (
      this.eipsCache ?? (this.eipsCache = [...this.hardforkParams.activeEips])
    )
  }

  get hardforks() {
    return this.chainParams.hardforks
  }

  get params() {
    return this.chainParams
  }

  get activeHardfork() {
    return this.currentHardfork
  }

  // =========================================================================
  // Backwards Compatible Method Aliases (from Common class)
  // =========================================================================

  /** @deprecated Use getParam() instead */
  param(name: string): bigint {
    const value = this.getParam(name as keyof ChainParams)
    if (value === undefined) {
      throw EthereumJSErrorWithoutCode(`Missing parameter value for ${name}`)
    }
    return BigInt(value as number | bigint)
  }

  /** @deprecated Use getParamByEIP() instead */
  paramByEIP(name: string, eip: number): bigint | undefined {
    const value = this.getParamByEIP(name, eip)
    if (value === undefined) return undefined
    return BigInt(value as number | bigint)
  }

  /** @deprecated Use activeHardfork getter instead */
  hardfork(): Hardfork {
    return this.currentHardfork
  }

  /** @deprecated Use isHardforkAfter() instead */
  gteHardfork(hardfork: Hardfork): boolean {
    return this.isHardforkAfter(hardfork)
  }

  /** @deprecated Use isHardforkAfter() instead */
  hardforkGteHardfork(
    hardfork1: Hardfork | null,
    hardfork2: Hardfork,
  ): boolean {
    const hf1 = hardfork1 ?? this.currentHardfork
    const hardforksList = this.hardforks
    const posHf1 = hardforksList.findIndex((hf) => hf.name === hf1)
    const posHf2 = hardforksList.findIndex((hf) => hf.name === hardfork2)
    return posHf1 >= posHf2 && posHf2 !== -1
  }

  /** @deprecated Use getHardforkBlock() instead */
  hardforkBlock(hardfork?: Hardfork): bigint | null {
    const block = this.getHardforkBlock(hardfork)
    if (block === undefined || block === null) return null
    return BigInt(block)
  }

  /** @deprecated Use getHardforkTimestamp() instead */
  hardforkTimestamp(hardfork?: Hardfork): bigint | null {
    const timestamp = this.getHardforkTimestamp(hardfork)
    if (timestamp === undefined || timestamp === null) return null
    return BigInt(timestamp)
  }

  /** @deprecated Use params.chainId instead */
  chainId(): bigint {
    return BigInt(this.chainParams.chainId)
  }

  /** @deprecated Use params.name instead */
  chainName(): string {
    return this.chainParams.name
  }

  /** @deprecated Use params.genesis instead */
  genesis(): GenesisBlockConfig {
    return this.chainParams.genesis
  }

  /** @deprecated Use params.bootstrapNodes instead */
  bootstrapNodes(): BootstrapNodeConfig[] {
    return this.chainParams.bootstrapNodes
  }

  /** @deprecated Use params.dnsNetworks instead */
  dnsNetworks(): string[] {
    return this.chainParams.dnsNetworks ?? []
  }

  /** @deprecated Use params.consensus.type instead */
  consensusType(): string {
    return this.chainParams.consensus.type
  }

  /** @deprecated Use params.consensus.algorithm instead */
  consensusAlgorithm(): string {
    return this.chainParams.consensus.algorithm
  }

  /** @deprecated Use params.consensus[algorithm] instead */
  consensusConfig(): Record<string, unknown> {
    const algorithm = this.chainParams.consensus
      .algorithm as keyof typeof this.chainParams.consensus
    return (
      (this.chainParams.consensus[algorithm] as Record<string, unknown>) ?? {}
    )
  }

  hardforkIsActiveOnBlock(
    hardfork: Hardfork | null,
    blockNumber: BigIntLike,
  ): boolean {
    const bn = toType(blockNumber, TypeOutput.BigInt)
    const hf = hardfork ?? this.currentHardfork
    const hfBlock = this.hardforkBlock(hf)
    if (typeof hfBlock === 'bigint' && hfBlock !== BIGINT_0 && bn >= hfBlock) {
      return true
    }
    return false
  }

  activeOnBlock(blockNumber: BigIntLike): boolean {
    return this.hardforkIsActiveOnBlock(null, blockNumber)
  }

  getHardforkBy(opts: HardforkByOpts): string {
    const blockNumber = toType(opts.blockNumber, TypeOutput.BigInt)
    const timestamp = toType(opts.timestamp, TypeOutput.BigInt)

    const hfs = this.hardforks.filter(
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
      throw Error('Must have at least one hardfork at block 0')
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

    return hfs[hfIndex].name
  }

  setHardforkBy(opts: HardforkByOpts): string {
    const hardfork = this.getHardforkBy(opts)
    this.setHardfork(hardfork as Hardfork)
    return hardfork
  }

  nextHardforkBlockOrTimestamp(hardfork?: Hardfork): bigint | null {
    const targetHardfork = hardfork ?? this.currentHardfork
    const hfs = this.hardforks

    // Find the index of the target hardfork
    let targetHfIndex = hfs.findIndex((hf) => hf.name === targetHardfork)

    // Special handling for The Merge (Paris) hardfork
    if (targetHardfork === Hardfork.Paris) {
      // The Merge is determined by total difficulty, not block number
      // So we look at the previous hardfork's parameters instead
      targetHfIndex -= 1
    }

    // If we couldn't find a valid hardfork index, return null
    if (targetHfIndex < 0) {
      return null
    }

    // Get the current hardfork's block/timestamp
    const currentHf = hfs[targetHfIndex]
    const currentBlockOrTimestamp = currentHf.timestamp ?? currentHf.block
    if (
      currentBlockOrTimestamp === null ||
      currentBlockOrTimestamp === undefined
    ) {
      return null
    }

    // Find the next hardfork that has a different block/timestamp
    const nextHf = hfs.slice(targetHfIndex + 1).find((hf) => {
      const nextBlockOrTimestamp = hf.timestamp ?? hf.block
      return (
        nextBlockOrTimestamp !== null &&
        nextBlockOrTimestamp !== undefined &&
        nextBlockOrTimestamp !== currentBlockOrTimestamp
      )
    })
    // If no next hf found with valid block or timestamp return null
    if (nextHf === undefined) {
      return null
    }

    // Get the block/timestamp for the next hardfork
    const nextBlockOrTimestamp = nextHf.timestamp ?? nextHf.block
    if (nextBlockOrTimestamp === null || nextBlockOrTimestamp === undefined) {
      return null
    }

    return BigInt(nextBlockOrTimestamp)
  }

  protected _calcForkHash(
    hardfork: Hardfork,
    genesisHash: Uint8Array,
  ): PrefixedHexString {
    let hfBytes = new Uint8Array(0)
    let prevBlockOrTime = 0
    for (const hf of this.hardforks) {
      const { block, timestamp, name } = hf
      // Timestamp to be used for timestamp based hfs even if we may bundle
      // block number with them retrospectively
      let blockOrTime = timestamp ?? block
      blockOrTime = blockOrTime !== null ? Number(blockOrTime) : null

      // Skip for chainstart (0), not applied HFs (null) and
      // when already applied on same blockOrTime HFs
      // and on the merge since forkhash doesn't change on merge hf
      if (
        typeof blockOrTime === 'number' &&
        blockOrTime !== 0 &&
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

  forkHash(hardfork?: Hardfork, genesisHash?: Uint8Array): PrefixedHexString {
    hardfork = hardfork ?? this.currentHardfork
    const data = this.lookupHardfork(hardfork)
    if (
      data === null ||
      (data?.block === null && data?.timestamp === undefined)
    ) {
      const msg = 'No fork hash calculation possible for future hardfork'
      throw EthereumJSErrorWithoutCode(msg)
    }
    if (data?.forkHash !== null && data?.forkHash !== undefined) {
      return data.forkHash
    }
    if (!genesisHash)
      throw EthereumJSErrorWithoutCode(
        'genesisHash required for forkHash calculation',
      )
    return this._calcForkHash(hardfork, genesisHash)
  }

  setForkHashes(genesisHash: Uint8Array) {
    for (const hf of this.hardforks) {
      const blockOrTime = hf.timestamp ?? hf.block
      if (
        (hf.forkHash === null || hf.forkHash === undefined) &&
        blockOrTime !== null &&
        blockOrTime !== undefined
      ) {
        hf.forkHash = this.forkHash(hf.name as Hardfork, genesisHash)
      }
    }
  }
}
