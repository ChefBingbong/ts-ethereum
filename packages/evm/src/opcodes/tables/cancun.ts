/**
 * Cancun Jump Table
 * Adds TLOAD, TSTORE (EIP-1153), MCOPY (EIP-5656), BLOBHASH (EIP-4844), BLOBBASEFEE (EIP-7516)
 */
import { Op } from '../constants'
import { opBlobbasefee, opBlobhash } from '../instructions/block'
import { dynamicGasMcopy } from '../instructions/gas'
import { opMcopy } from '../instructions/memory'
import { opTload, opTstore } from '../instructions/storage'
import type { JumpTable } from '../types'
import { makeOperation } from '../types'
import { createShanghaiJumpTable } from './shanghai'

/**
 * Create the Cancun jump table
 * Builds on Shanghai, adding:
 * - TLOAD (0x5c) - EIP-1153 Transient storage
 * - TSTORE (0x5d) - EIP-1153 Transient storage
 * - MCOPY (0x5e) - EIP-5656 Memory copying
 * - BLOBHASH (0x49) - EIP-4844 Blob transactions
 * - BLOBBASEFEE (0x4a) - EIP-7516 Blob base fee
 */
export function createCancunJumpTable(): JumpTable {
  const table = createShanghaiJumpTable()

  // TLOAD - EIP-1153 Transient storage
  table[Op.TLOAD] = makeOperation({
    execute: opTload,
    minStack: 1,
    maxStack: 1024,
  })

  // TSTORE - EIP-1153 Transient storage
  table[Op.TSTORE] = makeOperation({
    execute: opTstore,
    minStack: 2,
    maxStack: 1022,
  })

  // MCOPY - EIP-5656 Memory copying
  table[Op.MCOPY] = makeOperation({
    execute: opMcopy,
    minStack: 3,
    maxStack: 1021,
    dynamicGas: dynamicGasMcopy,
  })

  // BLOBHASH - EIP-4844 Blob transactions
  table[Op.BLOBHASH] = makeOperation({
    execute: opBlobhash,
    minStack: 1,
    maxStack: 1024,
  })

  // BLOBBASEFEE - EIP-7516 Blob base fee
  table[Op.BLOBBASEFEE] = makeOperation({
    execute: opBlobbasefee,
    minStack: 0,
    maxStack: 1025,
  })

  return table
}
