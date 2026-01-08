import type { BlockHeader } from '@ts-ethereum/block'
import { BIGINT_0, BIGINT_1, short } from '@ts-ethereum/utils'
import { EventEmitter } from 'eventemitter3'
import type { Config } from '../../config/config'
import type { EthHandler } from '../../protocol/eth'
import type { SnapHandler } from '../../protocol/snap'

export interface PeerOptions {
  /* Config */
  config: Config

  /* Peer id */
  id?: string

  /* Peer address */
  address: string

  /* Transport name */
  transport: string

  /* Pass true if peer initiated connection (default: false) */
  inbound?: boolean

  /* Supported protocols */

  /* Server */
}

/**
 * Network peer
 * @memberof module:net/peer
 */
export abstract class Peer extends EventEmitter {
  public config: Config
  public id: string
  public address: string
  public inbound: boolean
  protected transport: string
  protected boundProtocols: Array<{
    name: string
    handleMessageQueue(): void
  }> = []
  private _idle: boolean

  public eth?: EthHandler
  public snap?: SnapHandler

  /*
    If the peer is in the PeerPool.
    If true, messages are handled immediately.
    If false, adds incoming messages to handleMessageQueue,
    which are handled after the peer is added to the pool.
  */
  public pooled = false

  /**
   * Create new peer
   */
  constructor(options: PeerOptions) {
    super()

    this.config = options.config

    this.id = options.id ?? ''
    this.address = options.address
    this.transport = options.transport
    this.inbound = options.inbound ?? false

    this._idle = true
  }

  /**
   * Get idle state of peer
   */
  get idle() {
    return this._idle
  }

  /**
   * Set idle state of peer
   */
  set idle(value) {
    this._idle = value
  }

  abstract connect(): Promise<void>

  /**
   * Eventually updates and returns the latest header of peer
   */
  async latest(): Promise<BlockHeader | undefined> {
    if (!this.eth) {
      return
    }
    let block: bigint | Uint8Array
    if (!this.eth!.updatedBestHeader && this.eth!.status?.bestHash) {
      // If there is no updated best header stored yet, start with the status hash
      block = this.eth!.status?.bestHash
    } else {
      // Try forward-calculated number first, but fall back to last known header if it doesn't exist
      block = this.getPotentialBestHeaderNum()
    }

    const result = await this.eth!.getBlockHeaders({
      block,
      max: 1,
    })

    // If forward-calculated block doesn't exist (0 headers), fall back to last known header
    if (
      result !== undefined &&
      result[1].length === 0 &&
      this.eth!.updatedBestHeader
    ) {
      // Try requesting from last known header number + 1 to get the next block
      const lastKnownNum = this.eth!.updatedBestHeader.number
      const nextBlockNum = lastKnownNum + BIGINT_1
      const fallbackResult = await this.eth!.getBlockHeaders({
        block: nextBlockNum,
        max: 1,
      })
      if (fallbackResult !== undefined && fallbackResult[1].length > 0) {
        const latest = fallbackResult[1][0]
        this.eth!.updatedBestHeader = latest
        if (latest !== undefined) {
          const height = latest.number
          if (
            height > BIGINT_0 &&
            (this.config.syncTargetHeight === undefined ||
              this.config.syncTargetHeight === BIGINT_0 ||
              this.config.syncTargetHeight < latest.number)
          ) {
            this.config.syncTargetHeight = height
            this.config.options.logger?.info(
              `New sync target height=${height} hash=${short(latest.hash())}`,
            )
          }
        }
        return this.eth!.updatedBestHeader
      }
      // If next block also doesn't exist, return current updatedBestHeader (peer hasn't progressed)
      return this.eth!.updatedBestHeader
    }

    if (result !== undefined) {
      const latest = result[1][0]
      if (latest !== undefined) {
        this.eth!.updatedBestHeader = latest
        const height = latest.number
        if (
          height > BIGINT_0 &&
          (this.config.syncTargetHeight === undefined ||
            this.config.syncTargetHeight === BIGINT_0 ||
            this.config.syncTargetHeight < latest.number)
        ) {
          this.config.syncTargetHeight = height
          this.config.options.logger?.info(
            `New sync target height=${height} hash=${short(latest.hash())}`,
          )
        }
      }
    }
    return this.eth!.updatedBestHeader
  }

  /**
   * Returns a potential best block header number for the peer
   * (not necessarily verified by block request) derived from
   * either the client-wide sync target height or the last best
   * header timestamp "forward-calculated" by block/slot times (12s).
   */
  getPotentialBestHeaderNum(): bigint {
    let forwardCalculatedNum = BIGINT_0
    const bestSyncTargetNum = this.config.syncTargetHeight ?? BIGINT_0
    if (this.eth?.updatedBestHeader !== undefined) {
      const bestHeaderNum = this.eth!.updatedBestHeader.number
      const nowSec = Math.floor(Date.now() / 1000)
      const diffSec = nowSec - Number(this.eth!.updatedBestHeader.timestamp)
      const SLOT_TIME = 5
      const diffBlocks = BigInt(Math.floor(diffSec / SLOT_TIME))
      forwardCalculatedNum = bestHeaderNum + diffBlocks
    }
    const best =
      forwardCalculatedNum > bestSyncTargetNum
        ? forwardCalculatedNum
        : bestSyncTargetNum
    return best
  }

  /**
   * Handle unhandled messages along handshake
   */
  handleMessageQueue() {
    this.boundProtocols.map((e) => e.handleMessageQueue())
  }

  toString(withFullId = false): string {
    const properties = {
      id: withFullId ? this.id : this.id.substr(0, 8),
      address: this.address,
      transport: this.transport,
      protocols: this.boundProtocols.map((e) => e.name),
      inbound: this.inbound,
    }
    return Object.entries(properties)
      .filter(
        ([, value]) =>
          value !== undefined && value !== null && value.toString() !== '',
      )
      .map((keyValue) => keyValue.join('='))
      .join(' ')
  }
}
