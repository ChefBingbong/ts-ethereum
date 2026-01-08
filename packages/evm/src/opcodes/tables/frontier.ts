/**
 * Frontier Jump Table - Base opcode definitions for the original EVM
 * This is the foundation that other hardforks build upon
 */
import { Op } from '../constants'
import {
  opAdd,
  opAddmod,
  opDiv,
  opExp,
  opMod,
  opMul,
  opMulmod,
  opSdiv,
  opSignextend,
  opSmod,
  opSub,
} from '../instructions/arithmetic'
import { opAnd, opByte, opNot, opOr, opXor } from '../instructions/bitwise'
import {
  opBlockhash,
  opCoinbase,
  opDifficulty,
  opGaslimit,
  opNumber,
  opTimestamp,
} from '../instructions/block'
import {
  opEq,
  opGt,
  opIszero,
  opLt,
  opSgt,
  opSlt,
} from '../instructions/comparison'
import {
  opGas,
  opInvalid,
  opJump,
  opJumpdest,
  opJumpi,
  opPc,
  opReturn,
  opStop,
} from '../instructions/control'
import { opKeccak256 } from '../instructions/crypto'
import {
  opAddress,
  opBalance,
  opCalldatacopy,
  opCalldataload,
  opCalldatasize,
  opCaller,
  opCallvalue,
  opCodecopy,
  opCodesize,
  opExtcodecopy,
  opExtcodesize,
  opGasprice,
  opOrigin,
} from '../instructions/environment'
import {
  dynamicGasBalance,
  dynamicGasCall,
  dynamicGasCallcode,
  dynamicGasCalldatacopy,
  dynamicGasCodecopy,
  dynamicGasCreate,
  dynamicGasExp,
  dynamicGasExtcodecopy,
  dynamicGasExtcodesize,
  dynamicGasKeccak256,
  dynamicGasLog,
  dynamicGasMload,
  dynamicGasMstore,
  dynamicGasMstore8,
  dynamicGasReturn,
  dynamicGasSelfdestruct,
  dynamicGasSload,
  dynamicGasSstore,
} from '../instructions/gas'
import { opLog } from '../instructions/log'
import { opMload, opMsize, opMstore, opMstore8 } from '../instructions/memory'
import { opDup, opPop, opPush, opSwap } from '../instructions/stack'
import { opSload, opSstore } from '../instructions/storage'
import {
  opCall,
  opCallcode,
  opCreate,
  opSelfdestruct,
} from '../instructions/system'
import type { JumpTable } from '../types'
import { makeOperation, makeUndefinedOperation } from '../types'

/**
 * Create the Frontier jump table
 * Contains all opcodes available in the original Ethereum release
 */
export function createFrontierJumpTable(): JumpTable {
  const table: JumpTable = {}

  // Initialize all slots as undefined
  for (let i = 0; i <= 0xff; i++) {
    table[i] = makeUndefinedOperation()
  }

  // 0x00 range - Stop and Arithmetic
  table[Op.STOP] = makeOperation({
    execute: opStop,
    minStack: 0,
    maxStack: 1024,
  })

  table[Op.ADD] = makeOperation({
    execute: opAdd,
    minStack: 2,
    maxStack: 1023,
  })

  table[Op.MUL] = makeOperation({
    execute: opMul,
    minStack: 2,
    maxStack: 1023,
  })

  table[Op.SUB] = makeOperation({
    execute: opSub,
    minStack: 2,
    maxStack: 1023,
  })

  table[Op.DIV] = makeOperation({
    execute: opDiv,
    minStack: 2,
    maxStack: 1023,
  })

  table[Op.SDIV] = makeOperation({
    execute: opSdiv,
    minStack: 2,
    maxStack: 1023,
  })

  table[Op.MOD] = makeOperation({
    execute: opMod,
    minStack: 2,
    maxStack: 1023,
  })

  table[Op.SMOD] = makeOperation({
    execute: opSmod,
    minStack: 2,
    maxStack: 1023,
  })

  table[Op.ADDMOD] = makeOperation({
    execute: opAddmod,
    minStack: 3,
    maxStack: 1022,
  })

  table[Op.MULMOD] = makeOperation({
    execute: opMulmod,
    minStack: 3,
    maxStack: 1022,
  })

  table[Op.EXP] = makeOperation({
    execute: opExp,
    minStack: 2,
    maxStack: 1023,
    dynamicGas: dynamicGasExp,
  })

  table[Op.SIGNEXTEND] = makeOperation({
    execute: opSignextend,
    minStack: 2,
    maxStack: 1023,
  })

  // 0x10 range - Comparison & Bitwise Logic
  table[Op.LT] = makeOperation({
    execute: opLt,
    minStack: 2,
    maxStack: 1023,
  })

  table[Op.GT] = makeOperation({
    execute: opGt,
    minStack: 2,
    maxStack: 1023,
  })

  table[Op.SLT] = makeOperation({
    execute: opSlt,
    minStack: 2,
    maxStack: 1023,
  })

  table[Op.SGT] = makeOperation({
    execute: opSgt,
    minStack: 2,
    maxStack: 1023,
  })

  table[Op.EQ] = makeOperation({
    execute: opEq,
    minStack: 2,
    maxStack: 1023,
  })

  table[Op.ISZERO] = makeOperation({
    execute: opIszero,
    minStack: 1,
    maxStack: 1024,
  })

  table[Op.AND] = makeOperation({
    execute: opAnd,
    minStack: 2,
    maxStack: 1023,
  })

  table[Op.OR] = makeOperation({
    execute: opOr,
    minStack: 2,
    maxStack: 1023,
  })

  table[Op.XOR] = makeOperation({
    execute: opXor,
    minStack: 2,
    maxStack: 1023,
  })

  table[Op.NOT] = makeOperation({
    execute: opNot,
    minStack: 1,
    maxStack: 1024,
  })

  table[Op.BYTE] = makeOperation({
    execute: opByte,
    minStack: 2,
    maxStack: 1023,
  })

  // 0x20 range - Crypto
  table[Op.KECCAK256] = makeOperation({
    execute: opKeccak256,
    minStack: 2,
    maxStack: 1023,
    dynamicGas: dynamicGasKeccak256,
  })

  // 0x30 range - Environmental Information
  table[Op.ADDRESS] = makeOperation({
    execute: opAddress,
    minStack: 0,
    maxStack: 1025,
  })

  table[Op.BALANCE] = makeOperation({
    execute: opBalance,
    minStack: 1,
    maxStack: 1024,
    isAsync: true,
    dynamicGas: dynamicGasBalance,
  })

  table[Op.ORIGIN] = makeOperation({
    execute: opOrigin,
    minStack: 0,
    maxStack: 1025,
  })

  table[Op.CALLER] = makeOperation({
    execute: opCaller,
    minStack: 0,
    maxStack: 1025,
  })

  table[Op.CALLVALUE] = makeOperation({
    execute: opCallvalue,
    minStack: 0,
    maxStack: 1025,
  })

  table[Op.CALLDATALOAD] = makeOperation({
    execute: opCalldataload,
    minStack: 1,
    maxStack: 1024,
  })

  table[Op.CALLDATASIZE] = makeOperation({
    execute: opCalldatasize,
    minStack: 0,
    maxStack: 1025,
  })

  table[Op.CALLDATACOPY] = makeOperation({
    execute: opCalldatacopy,
    minStack: 3,
    maxStack: 1021,
    dynamicGas: dynamicGasCalldatacopy,
  })

  table[Op.CODESIZE] = makeOperation({
    execute: opCodesize,
    minStack: 0,
    maxStack: 1025,
  })

  table[Op.CODECOPY] = makeOperation({
    execute: opCodecopy,
    minStack: 3,
    maxStack: 1021,
    dynamicGas: dynamicGasCodecopy,
  })

  table[Op.GASPRICE] = makeOperation({
    execute: opGasprice,
    minStack: 0,
    maxStack: 1025,
  })

  table[Op.EXTCODESIZE] = makeOperation({
    execute: opExtcodesize,
    minStack: 1,
    maxStack: 1024,
    isAsync: true,
    dynamicGas: dynamicGasExtcodesize,
  })

  table[Op.EXTCODECOPY] = makeOperation({
    execute: opExtcodecopy,
    minStack: 4,
    maxStack: 1020,
    isAsync: true,
    dynamicGas: dynamicGasExtcodecopy,
  })

  // 0x40 range - Block Information
  table[Op.BLOCKHASH] = makeOperation({
    execute: opBlockhash,
    minStack: 1,
    maxStack: 1024,
    isAsync: true,
  })

  table[Op.COINBASE] = makeOperation({
    execute: opCoinbase,
    minStack: 0,
    maxStack: 1025,
  })

  table[Op.TIMESTAMP] = makeOperation({
    execute: opTimestamp,
    minStack: 0,
    maxStack: 1025,
  })

  table[Op.NUMBER] = makeOperation({
    execute: opNumber,
    minStack: 0,
    maxStack: 1025,
  })

  table[Op.DIFFICULTY] = makeOperation({
    execute: opDifficulty,
    minStack: 0,
    maxStack: 1025,
  })

  table[Op.GASLIMIT] = makeOperation({
    execute: opGaslimit,
    minStack: 0,
    maxStack: 1025,
  })

  // 0x50 range - Stack, Memory, Storage and Flow
  table[Op.POP] = makeOperation({
    execute: opPop,
    minStack: 1,
    maxStack: 1023,
  })

  table[Op.MLOAD] = makeOperation({
    execute: opMload,
    minStack: 1,
    maxStack: 1024,
    dynamicGas: dynamicGasMload,
  })

  table[Op.MSTORE] = makeOperation({
    execute: opMstore,
    minStack: 2,
    maxStack: 1022,
    dynamicGas: dynamicGasMstore,
  })

  table[Op.MSTORE8] = makeOperation({
    execute: opMstore8,
    minStack: 2,
    maxStack: 1022,
    dynamicGas: dynamicGasMstore8,
  })

  table[Op.SLOAD] = makeOperation({
    execute: opSload,
    minStack: 1,
    maxStack: 1024,
    isAsync: true,
    dynamicGas: dynamicGasSload,
  })

  table[Op.SSTORE] = makeOperation({
    execute: opSstore,
    minStack: 2,
    maxStack: 1022,
    isAsync: true,
    dynamicGas: dynamicGasSstore,
  })

  table[Op.JUMP] = makeOperation({
    execute: opJump,
    minStack: 1,
    maxStack: 1023,
  })

  table[Op.JUMPI] = makeOperation({
    execute: opJumpi,
    minStack: 2,
    maxStack: 1022,
  })

  table[Op.PC] = makeOperation({
    execute: opPc,
    minStack: 0,
    maxStack: 1025,
  })

  table[Op.MSIZE] = makeOperation({
    execute: opMsize,
    minStack: 0,
    maxStack: 1025,
  })

  table[Op.GAS] = makeOperation({
    execute: opGas,
    minStack: 0,
    maxStack: 1025,
  })

  table[Op.JUMPDEST] = makeOperation({
    execute: opJumpdest,
    minStack: 0,
    maxStack: 1024,
  })

  // 0x60 - 0x7f range - PUSH1 to PUSH32
  for (let i = Op.PUSH1; i <= Op.PUSH32; i++) {
    table[i] = makeOperation({
      execute: opPush,
      minStack: 0,
      maxStack: 1025,
    })
  }

  // 0x80 - 0x8f range - DUP1 to DUP16
  for (let i = Op.DUP1; i <= Op.DUP16; i++) {
    const stackPos = i - Op.DUP1 + 1
    table[i] = makeOperation({
      execute: opDup,
      minStack: stackPos,
      maxStack: 1025 - stackPos,
    })
  }

  // 0x90 - 0x9f range - SWAP1 to SWAP16
  for (let i = Op.SWAP1; i <= Op.SWAP16; i++) {
    const stackPos = i - Op.SWAP1 + 2
    table[i] = makeOperation({
      execute: opSwap,
      minStack: stackPos,
      maxStack: 1024,
    })
  }

  // 0xa0 - 0xa4 range - LOG0 to LOG4
  for (let i = Op.LOG0; i <= Op.LOG4; i++) {
    const topicsCount = i - Op.LOG0
    table[i] = makeOperation({
      execute: opLog,
      minStack: 2 + topicsCount,
      maxStack: 1022 - topicsCount,
      dynamicGas: dynamicGasLog,
    })
  }

  // 0xf0 range - System Operations
  table[Op.CREATE] = makeOperation({
    execute: opCreate,
    minStack: 3,
    maxStack: 1022,
    isAsync: true,
    dynamicGas: dynamicGasCreate,
  })

  table[Op.CALL] = makeOperation({
    execute: opCall,
    minStack: 7,
    maxStack: 1018,
    isAsync: true,
    dynamicGas: dynamicGasCall,
  })

  table[Op.CALLCODE] = makeOperation({
    execute: opCallcode,
    minStack: 7,
    maxStack: 1018,
    isAsync: true,
    dynamicGas: dynamicGasCallcode,
  })

  table[Op.RETURN] = makeOperation({
    execute: opReturn,
    minStack: 2,
    maxStack: 1022,
    dynamicGas: dynamicGasReturn,
  })

  // 0xfe - Invalid
  table[Op.INVALID] = makeOperation({
    execute: opInvalid,
    minStack: 0,
    maxStack: 1024,
  })

  // 0xff - Selfdestruct
  table[Op.SELFDESTRUCT] = makeOperation({
    execute: opSelfdestruct,
    minStack: 1,
    maxStack: 1023,
    isAsync: true,
    dynamicGas: dynamicGasSelfdestruct,
  })

  return table
}
