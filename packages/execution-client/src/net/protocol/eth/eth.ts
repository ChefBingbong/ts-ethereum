import type { Input } from '@ts-ethereum/rlp'
import { RLP } from '@ts-ethereum/rlp'
import {
  assertEq,
  BIGINT_0,
  bigIntToBytes,
  bytesToBigInt,
  bytesToHex,
  bytesToInt,
  bytesToUnprefixedHex,
  formatLogData,
  formatLogId,
  hexToBytes,
  intToBytes,
  isHexString,
} from '@ts-ethereum/utils'
import * as snappy from 'snappyjs'
import { ProtocolType } from '../../dpt-1/types'
import type { ProtocolConnection } from '../protocol'
import { Protocol } from '../protocol'

export interface EthStatusMsg extends Array<Uint8Array | Uint8Array[]> {}

export type EthStatusOpts = {
  td: Uint8Array
  bestHash: Uint8Array
  latestBlock?: Uint8Array
  genesisHash: Uint8Array
}

export type EthStatusEncoded = {
  chainId: Uint8Array
  td: Uint8Array
  bestHash: Uint8Array
  genesisHash: Uint8Array
  forkId?: Uint8Array | Uint8Array[]
}

export type EthStatusDecoded = {
  chainId: bigint
  td: bigint
  bestHash: string
  genesisHash: string
  forkId?: string
}

export const EthMessageCodes = {
  // eth62
  STATUS: 0x00,
  NEW_BLOCK_HASHES: 0x01,
  TX: 0x02,
  GET_BLOCK_HEADERS: 0x03,
  BLOCK_HEADERS: 0x04,
  GET_BLOCK_BODIES: 0x05,
  BLOCK_BODIES: 0x06,
  NEW_BLOCK: 0x07,

  // eth63
  GET_NODE_DATA: 0x0d,
  NODE_DATA: 0x0e,
  GET_RECEIPTS: 0x0f,
  RECEIPTS: 0x10,

  // eth65
  NEW_POOLED_TRANSACTION_HASHES: 0x08,
  GET_POOLED_TRANSACTIONS: 0x09,
  POOLED_TRANSACTIONS: 0x0a,
} as const

export type EthMessageCodes =
  (typeof EthMessageCodes)[keyof typeof EthMessageCodes]

// Create a reverse mapping: from numeric value back to the key name
export const EthMessageCodeNames: { [key in EthMessageCodes]: string } =
  Object.entries(EthMessageCodes).reduce(
    (acc, [key, value]) => {
      acc[value] = key
      return acc
    },
    {} as { [key in EthMessageCodes]: string },
  )

export class ETH extends Protocol {
  protected _status: EthStatusMsg | null = null
  public _peerStatus: EthStatusMsg | null = null
  private DEBUG = false

  // Eth64
  protected _hardfork = 'chainstart'
  protected _latestBlock = BIGINT_0
  protected _forkHash = ''
  protected _nextForkBlock = BIGINT_0

  constructor(
    version: number,
    connection: ProtocolConnection,
    protocolOffset?: number,
  ) {
    super(
      connection,
      ProtocolType.ETH,
      version,
      EthMessageCodes,
      protocolOffset,
    )

    // Set forkHash and nextForkBlock
    if (this._version >= 64) {
      const c = this._connection.common
      this._hardfork = c.hardfork() ?? this._hardfork
      // Set latestBlock minimally to start block of fork to have some more
      // accurate basis if no latestBlock is provided along status send
      this._latestBlock = BIGINT_0
      // Next fork block number or 0 if none available
      this._nextForkBlock = BIGINT_0
    }

    // Skip DEBUG calls unless 'ethjs' included in environmental DEBUG variables
    this.DEBUG = process?.env?.DEBUG?.includes('ethjs') ?? false
  }

  static eth62 = { name: 'eth', version: 62, length: 8, constructor: ETH }
  static eth63 = { name: 'eth', version: 63, length: 17, constructor: ETH }
  static eth64 = { name: 'eth', version: 64, length: 17, constructor: ETH }
  static eth65 = { name: 'eth', version: 65, length: 17, constructor: ETH }
  static eth66 = { name: 'eth', version: 66, length: 17, constructor: ETH }
  static eth67 = { name: 'eth', version: 67, length: 17, constructor: ETH }
  static eth68 = { name: 'eth', version: 68, length: 17, constructor: ETH }

  /**
   * Register message handlers for ETH protocol
   * By default, messages are emitted as events for backward compatibility
   * Handlers can be registered externally via registerHandler()
   */
  protected registerHandlers(): void {
    // STATUS is handled specially in _handleMessage
    // Other messages are emitted as events by default
    // External code (like EthHandler) can register handlers via registerHandler()
  }

  /**
   * Handle incoming ETH protocol messages
   * Decodes RLP and routes to handlers or emits events
   */
  _handleMessage(code: number, data: Uint8Array): void {
    const ethCode = code as EthMessageCodes
    const payload = RLP.decode(data)

    if (ethCode !== EthMessageCodes.STATUS && this.DEBUG) {
      const debugMsg = this.DEBUG
        ? `Received ${this.getMsgPrefix(ethCode)} message from ${
            this._connection._socket.remoteAddress
          }:${this._connection._socket.remotePort}`
        : undefined
      const logData = formatLogData(bytesToHex(data), this._verbose)
      this.debug(this.getMsgPrefix(ethCode), `${debugMsg}: ${logData}`)
    }

    // STATUS is handled specially
    if (ethCode === EthMessageCodes.STATUS) {
      this._handleStatusMessage(payload)
      return
    }

    // Validate message code against protocol version
    if (!this._validateMessageCode(ethCode)) {
      return
    }

    // Check if handler is registered, otherwise emit event for backward compatibility
    if (this._registry.has(ethCode)) {
      // Route to registered handler
      super._handleMessage(ethCode, payload as Uint8Array)
    } else {
      // Emit as event for backward compatibility
      this.events.emit('message', ethCode, payload)
    }
  }

  /**
   * Handle STATUS message specially
   */
  private _handleStatusMessage(payload: unknown): void {
    assertEq(
      this._peerStatus as any,
      null,
      'Uncontrolled status message',
      this.debug.bind(this),
      'STATUS',
    )
    this._peerStatus = payload as EthStatusMsg
    const peerStatusMsg = `${
      this._peerStatus !== undefined
        ? this._getStatusString(this._peerStatus)
        : ''
    }`
    if (this.DEBUG) {
      const debugMsg = this.DEBUG
        ? `Received ${this.getMsgPrefix(EthMessageCodes.STATUS)} message from ${
            this._connection._socket.remoteAddress
          }:${this._connection._socket.remotePort}`
        : undefined
      this.debug(
        this.getMsgPrefix(EthMessageCodes.STATUS),
        `${debugMsg}: ${peerStatusMsg}`,
      )
    }
    this._handleStatus()
  }

  /**
   * Validate message code against protocol version
   */
  private _validateMessageCode(code: EthMessageCodes): boolean {
    switch (code) {
      case EthMessageCodes.NEW_BLOCK_HASHES:
      case EthMessageCodes.TX:
      case EthMessageCodes.GET_BLOCK_HEADERS:
      case EthMessageCodes.BLOCK_HEADERS:
      case EthMessageCodes.GET_BLOCK_BODIES:
      case EthMessageCodes.BLOCK_BODIES:
      case EthMessageCodes.NEW_BLOCK:
        return this._version >= ETH.eth62.version

      case EthMessageCodes.GET_RECEIPTS:
      case EthMessageCodes.RECEIPTS:
        return this._version >= ETH.eth63.version

      case EthMessageCodes.NEW_POOLED_TRANSACTION_HASHES:
      case EthMessageCodes.GET_POOLED_TRANSACTIONS:
      case EthMessageCodes.POOLED_TRANSACTIONS:
        return this._version >= ETH.eth65.version

      case EthMessageCodes.GET_NODE_DATA:
      case EthMessageCodes.NODE_DATA:
        return (
          this._version >= ETH.eth63.version &&
          this._version <= ETH.eth66.version
        )

      default:
        return false
    }
  }

  /**
   * Eth 64 Fork ID validation (EIP-2124)
   * Simplified for Chainstart-only: just verify the fork hash matches
   * @param forkId Remote fork ID
   */
  _validateForkId(forkId: Uint8Array[]) {
    const peerForkHash = bytesToHex(forkId[0])

    // Chainstart-only: just verify the fork hash matches ours
    if (this._forkHash !== peerForkHash) {
      const msg = 'Fork hash mismatch - incompatible chain'
      if (this.DEBUG) {
        this.debug('STATUS', msg)
      }
      throw new Error(msg)
    }
  }

  _handleStatus(): void {
    if (this._status === null || this._peerStatus === null) return
    clearTimeout(this._statusTimeoutId!)

    assertEq(
      this._status[0],
      this._peerStatus[0],
      'Protocol version mismatch',
      this.debug.bind(this),
      'STATUS',
    )
    assertEq(
      this._status[1],
      this._peerStatus[1],
      'NetworkId mismatch',
      this.debug.bind(this),
      'STATUS',
    )
    assertEq(
      this._status[4],
      this._peerStatus[4],
      'Genesis block mismatch',
      this.debug.bind(this),
      'STATUS',
    )

    const status: EthStatusEncoded = {
      chainId: this._peerStatus[1] as Uint8Array,
      td: this._peerStatus[2] as Uint8Array,
      bestHash: this._peerStatus[3] as Uint8Array,
      genesisHash: this._peerStatus[4] as Uint8Array,
      forkId: undefined,
    }

    if (this._version >= 64) {
      assertEq(
        this._peerStatus[5].length,
        2,
        'Incorrect forkId msg format',
        this.debug.bind(this),
        'STATUS',
      )
      // this._validateForkId(this._peerStatus[5] as Uint8Array[]);
      status.forkId = this._peerStatus[5]
    }

    this.events.emit('status', status)
    if (this._firstPeer === '') {
      this._addFirstPeerDebugger()
    }
  }

  getVersion() {
    return this._version
  }

  _forkHashFromForkId(forkId: Uint8Array): string {
    return bytesToUnprefixedHex(forkId)
  }

  _nextForkFromForkId(forkId: Uint8Array): number {
    return bytesToInt(forkId)
  }

  _getStatusString(status: EthStatusMsg) {
    let sStr = `[V:${bytesToInt(status[0] as Uint8Array)}, NID:${bytesToInt(
      status[1] as Uint8Array,
    )}, TD:${status[2].length === 0 ? 0 : bytesToBigInt(status[2] as Uint8Array).toString()}`
    sStr += `, BestH:${formatLogId(
      bytesToHex(status[3] as Uint8Array),
      this._verbose,
    )}, GenH:${formatLogId(bytesToHex(status[4] as Uint8Array), this._verbose)}`
    if (this._version >= 64) {
      sStr += `, ForkHash: ${
        status[5] !== undefined ? bytesToHex(status[5][0] as Uint8Array) : '-'
      }`
      sStr += `, ForkNext: ${
        (status[5][1] as Uint8Array).length > 0
          ? bytesToHex(status[5][1] as Uint8Array)
          : '-'
      }`
    }
    sStr += `]`
    return sStr
  }

  sendStatus(status: EthStatusOpts) {
    if (this._status !== null) return
    this._status = [
      intToBytes(this._version),
      bigIntToBytes(BigInt(this._connection.common.chainId())),
      status.td,
      status.bestHash,
      status.genesisHash,
    ]
    if (this._version >= 64) {
      if (status.latestBlock) {
        const latestBlock = bytesToBigInt(status.latestBlock)
        if (latestBlock < this._latestBlock) {
          throw new Error(
            'latest block provided is not matching the HF setting of the Common instance (Rlpx)',
          )
        }
        this._latestBlock = latestBlock
      }
      const forkHashB = hexToBytes(
        isHexString(this._forkHash) ? this._forkHash : `0x${this._forkHash}`,
      )

      const nextForkB =
        this._nextForkBlock === BIGINT_0
          ? new Uint8Array()
          : bigIntToBytes(this._nextForkBlock)

      this._status.push([forkHashB, nextForkB])
    }

    if (this.DEBUG) {
      this.debug(
        'STATUS',

        `Send STATUS message to ${this._connection._socket.remoteAddress}:${
          this._connection._socket.remotePort
        } (eth${this._version}): ${this._getStatusString(this._status)}`,
      )
    }

    let payload = RLP.encode(this._status)

    // Use snappy compression if peer supports DevP2P >=v5
    if (
      this._connection._hello !== null &&
      this._connection._hello.protocolVersion >= 5
    ) {
      payload = snappy.compress(payload)
    }

    // Use base class sendMessage directly to bypass STATUS check
    // (sendStatus is the proper way to send STATUS, but internally we use base class)
    super.sendMessage(EthMessageCodes.STATUS, payload)
    this._handleStatus()
  }

  sendMessage(code: EthMessageCodes, payload: Input): void {
    if (code === EthMessageCodes.STATUS) {
      throw new Error('Please send status message through .sendStatus')
    }

    // Validate message code against protocol version
    if (!this._validateMessageCode(code)) {
      throw new Error(`Code ${code} not allowed with version ${this._version}`)
    }

    if (this.DEBUG) {
      const logData = formatLogData(
        bytesToHex(RLP.encode(payload)),
        this._verbose,
      )
      const messageName = this.getMsgPrefix(code)
      const debugMsg = `Send ${messageName} message to ${this._connection._socket.remoteAddress}:${this._connection._socket.remotePort}: ${logData}`

      this.debug(messageName, debugMsg)
    }

    let encodedPayload = RLP.encode(payload)

    // Use snappy compression if peer supports DevP2P >=v5
    if (
      this._connection._hello !== null &&
      this._connection._hello.protocolVersion >= 5
    ) {
      encodedPayload = snappy.compress(encodedPayload)
    }

    // Use base class sendMessage which calls connection.sendSubprotocolMessage
    super.sendMessage(code, encodedPayload)
  }

  getMsgPrefix(msgCode: EthMessageCodes): string {
    return EthMessageCodeNames[msgCode]
  }

  decodeStatus(status: EthStatusEncoded): EthStatusDecoded {
    return {
      chainId: bytesToBigInt(status.chainId),
      td: bytesToBigInt(status.td as Uint8Array),
      bestHash: bytesToHex(status.bestHash as Uint8Array),
      genesisHash: bytesToHex(status.genesisHash as Uint8Array),
      forkId: status.forkId
        ? bytesToHex(status.forkId[0] as Uint8Array)
        : undefined,
    }
  }

  /**
   * Get the peer's status message (received from remote peer)
   * Returns null if status hasn't been received yet
   */
  getPeerStatus(): EthStatusDecoded | null {
    if (this._peerStatus === null) {
      return null
    }

    const status: EthStatusEncoded = {
      chainId: this._peerStatus[1] as Uint8Array,
      td: this._peerStatus[2] as Uint8Array,
      bestHash: this._peerStatus[3] as Uint8Array,
      genesisHash: this._peerStatus[4] as Uint8Array,
      forkId: this._version >= 64 && this._peerStatus[5]
        ? (this._peerStatus[5] as Uint8Array[])
        : undefined,
    }

    return this.decodeStatus(status)
  }

  /**
   * Check if peer status has been received
   */
  hasPeerStatus(): boolean {
    return this._peerStatus !== null
  }
}
