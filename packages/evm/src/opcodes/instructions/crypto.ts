/**
 * Crypto opcode handlers
 * KECCAK256
 */
import { keccak_256 } from '@noble/hashes/sha3.js'
import { BIGINT_0, bytesToHex } from '@ts-ethereum/utils'
import type { RunState } from '../../interpreter'
import { Op } from '../constants'
import type { ExecuteFunc } from '../types'

/**
 * KECCAK256 - Compute Keccak-256 hash
 * Stack: [offset, length] -> [hash]
 */
export const opKeccak256: ExecuteFunc = (runState: RunState) => {
  const [offset, length] = runState.stack.popN(2)
  let data = new Uint8Array(0)
  if (length !== BIGINT_0) {
    data = runState.memory.read(Number(offset), Number(length))
  }
  const customCrypto = runState.interpreter._evm['_customCrypto']
  const r = BigInt(bytesToHex((customCrypto?.keccak256 ?? keccak_256)(data)))
  runState.stack.push(r)
}

/**
 * Map of crypto opcodes to their handlers
 */
export const cryptoHandlers: Map<number, ExecuteFunc> = new Map([
  [Op.KECCAK256, opKeccak256],
])
