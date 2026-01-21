/**
 * Dynamic gas handlers for EVM opcodes
 * Each handler calculates the dynamic portion of gas for opcodes with variable costs
 */
import type { HardforkManager } from '@ts-ethereum/chain-config'
import { Hardfork } from '@ts-ethereum/chain-config'
import type { Address } from '@ts-ethereum/utils'
import {
  BIGINT_0,
  BIGINT_1,
  BIGINT_3,
  BIGINT_31,
  BIGINT_32,
  BIGINT_64,
  bigIntToBytes,
  equalsBytes,
  setLengthLeft,
} from '@ts-ethereum/utils'
import { EOFErrorMessage } from '../../eof/errors'
import { EVMError } from '../../errors'
import type { RunState } from '../../interpreter'
import { DELEGATION_7702_FLAG } from '../../types'
import { accessAddressEIP2929, accessStorageEIP2929 } from '../eips/eip-2929'
import type { AsyncDynamicGasHandler } from '../types'
import {
  createAddressFromStackBigInt,
  divCeil,
  maxCallGas,
  setLengthLeftStorage,
  subMemUsage,
  trap,
  updateSstoreGas,
} from '../util'

// Re-export types for backward compatibility
export type { AsyncDynamicGasHandler, SyncDynamicGasHandler } from '../types'

const EXTCALL_TARGET_MAX = BigInt(2) ** BigInt(8 * 20) - BigInt(1)

async function eip7702GasCost(
  runState: RunState,
  common: HardforkManager,
  hardfork: string,
  address: Address,
  charge2929Gas: boolean,
) {
  const code = await runState.stateManager.getCode(address)
  if (equalsBytes(code.slice(0, 3), DELEGATION_7702_FLAG)) {
    return accessAddressEIP2929(
      runState,
      code.slice(3, 24),
      common,
      hardfork,
      charge2929Gas,
    )
  }
  return BIGINT_0
}

// ============================================================================
// Named Dynamic Gas Handlers - can be imported directly by jump tables
// ============================================================================

/** EXP - 0x0a */
export const dynamicGasExp: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  const [_base, exponent] = runState.stack.peek(2)
  if (exponent === BIGINT_0) {
    return gas
  }
  let byteLength = exponent.toString(2).length / 8
  if (byteLength > Math.trunc(byteLength)) {
    byteLength = Math.trunc(byteLength) + 1
  }
  if (byteLength < 1 || byteLength > 32) {
    trap(EVMError.errorMessages.OUT_OF_RANGE)
  }
  const hardfork = runState.interpreter.fork
  const expPricePerByte = common.getParamAtHardfork('expByteGas', hardfork)!
  gas += BigInt(byteLength) * expPricePerByte
  return gas
}

/** KECCAK256 - 0x20 */
export const dynamicGasKeccak256: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  const [offset, length] = runState.stack.peek(2)
  const hardfork = runState.interpreter.fork
  gas += subMemUsage(runState, offset, length, common, hardfork)
  gas +=
    common.getParamAtHardfork('keccak256WordGas', hardfork)! *
    divCeil(length, BIGINT_32)
  return gas
}

/** BALANCE - 0x31 */
export const dynamicGasBalance: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  const hardfork = runState.interpreter.fork
  const address = createAddressFromStackBigInt(runState.stack.peek()[0])
  let charge2929Gas = true
  if (common.isEIPActiveAtHardfork(6800, hardfork)) {
    const coldAccessGas =
      runState.env.accessWitness!.readAccountBasicData(address)
    gas += coldAccessGas
    charge2929Gas = coldAccessGas === BIGINT_0
  }

  if (common.isEIPActiveAtHardfork(2929, hardfork)) {
    gas += accessAddressEIP2929(
      runState,
      address.bytes,
      common,
      hardfork,
      charge2929Gas,
    )
  }

  return gas
}

/** CALLDATACOPY - 0x37 */
export const dynamicGasCalldatacopy: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  const [memOffset, _dataOffset, dataLength] = runState.stack.peek(3)
  const hardfork = runState.interpreter.fork
  gas += subMemUsage(runState, memOffset, dataLength, common, hardfork)
  if (dataLength !== BIGINT_0) {
    gas +=
      common.getParamAtHardfork('copyGas', hardfork)! *
      divCeil(dataLength, BIGINT_32)
  }
  return gas
}

/** CODECOPY - 0x39 */
export const dynamicGasCodecopy: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  const [memOffset, _codeOffset, dataLength] = runState.stack.peek(3)
  const hardfork = runState.interpreter.fork
  gas += subMemUsage(runState, memOffset, dataLength, common, hardfork)
  if (dataLength !== BIGINT_0) {
    gas +=
      common.getParamAtHardfork('copyGas', hardfork)! *
      divCeil(dataLength, BIGINT_32)

    if (
      common.isEIPActiveAtHardfork(6800, hardfork) &&
      runState.env.chargeCodeAccesses === true
    ) {
      const contract = runState.interpreter.getAddress()
      let codeEnd = _codeOffset + dataLength
      const codeSize = runState.interpreter.getCodeSize()
      if (codeEnd > codeSize) {
        codeEnd = codeSize
      }

      gas += runState.env.accessWitness!.readAccountCodeChunks(
        contract,
        Number(_codeOffset),
        Number(codeEnd),
      )
    }
  }
  return gas
}

/** EXTCODESIZE - 0x3b */
export const dynamicGasExtcodesize: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  const hardfork = runState.interpreter.fork
  const address = createAddressFromStackBigInt(runState.stack.peek()[0])

  let charge2929Gas = true
  if (
    common.isEIPActiveAtHardfork(6800, hardfork) &&
    runState.interpreter._evm.getPrecompile(address) === undefined &&
    !address.equals(
      createAddressFromStackBigInt(
        common.getParamAtHardfork(
          'systemAddress',
          common.getHardforkForEIP(7002) ?? hardfork,
        )!,
      ),
    )
  ) {
    let coldAccessGas = BIGINT_0
    coldAccessGas += runState.env.accessWitness!.readAccountBasicData(address)
    gas += coldAccessGas
    charge2929Gas = coldAccessGas === BIGINT_0
  }

  if (common.isEIPActiveAtHardfork(2929, hardfork)) {
    gas += accessAddressEIP2929(
      runState,
      address.bytes,
      common,
      hardfork,
      charge2929Gas,
    )
  }

  return gas
}

/** EXTCODECOPY - 0x3c */
export const dynamicGasExtcodecopy: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  const [addressBigInt, memOffset, _codeOffset, dataLength] =
    runState.stack.peek(4)
  const address = createAddressFromStackBigInt(addressBigInt)

  const hardfork = runState.interpreter.fork
  gas += subMemUsage(runState, memOffset, dataLength, common, hardfork)

  let charge2929Gas = true
  if (
    common.isEIPActiveAtHardfork(6800, hardfork) &&
    runState.interpreter._evm.getPrecompile(address) === undefined &&
    !address.equals(
      createAddressFromStackBigInt(
        common.getParamAtHardfork(
          'systemAddress',
          common.getHardforkForEIP(7002) ?? hardfork,
        )!,
      ),
    )
  ) {
    let coldAccessGas = BIGINT_0
    coldAccessGas += runState.env.accessWitness!.readAccountBasicData(address)
    gas += coldAccessGas
    charge2929Gas = coldAccessGas === BIGINT_0
  }

  if (common.isEIPActiveAtHardfork(2929, hardfork)) {
    gas += accessAddressEIP2929(
      runState,
      address.bytes,
      common,
      hardfork,
      charge2929Gas,
    )
  }

  if (dataLength !== BIGINT_0) {
    gas +=
      common.getParamAtHardfork('copyGas', hardfork)! *
      divCeil(dataLength, BIGINT_32)

    if (common.isEIPActiveAtHardfork(6800, hardfork)) {
      let codeEnd = _codeOffset + dataLength
      const codeSize = BigInt(
        (await runState.stateManager.getCode(address)).length,
      )
      if (codeEnd > codeSize) {
        codeEnd = codeSize
      }

      gas += runState.env.accessWitness!.readAccountCodeChunks(
        address,
        Number(_codeOffset),
        Number(codeEnd),
      )
    }
  }
  return gas
}

/** RETURNDATACOPY - 0x3e */
export const dynamicGasReturndatacopy: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  const hardfork = runState.interpreter.fork
  const [memOffset, returnDataOffset, dataLength] = runState.stack.peek(3)

  if (
    returnDataOffset + dataLength >
    runState.interpreter.getReturnDataSize()
  ) {
    if (runState.env.eof === undefined) {
      trap(EVMError.errorMessages.OUT_OF_GAS)
    }
  }

  gas += subMemUsage(runState, memOffset, dataLength, common, hardfork)

  if (dataLength !== BIGINT_0) {
    gas +=
      common.getParamAtHardfork('copyGas', hardfork)! *
      divCeil(dataLength, BIGINT_32)
  }
  return gas
}

/** EXTCODEHASH - 0x3f */
export const dynamicGasExtcodehash: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  const hardfork = runState.interpreter.fork
  const address = createAddressFromStackBigInt(runState.stack.peek()[0])
  let charge2929Gas = true

  if (
    common.isEIPActiveAtHardfork(6800, hardfork) &&
    runState.interpreter._evm.getPrecompile(address) === undefined &&
    !address.equals(
      createAddressFromStackBigInt(
        common.getParamAtHardfork(
          'systemAddress',
          common.getHardforkForEIP(7002) ?? hardfork,
        )!,
      ),
    )
  ) {
    let coldAccessGas = BIGINT_0
    coldAccessGas += runState.env.accessWitness!.readAccountCodeHash(address)
    gas += coldAccessGas
    charge2929Gas = coldAccessGas === BIGINT_0
  }

  if (common.isEIPActiveAtHardfork(2929, hardfork)) {
    gas += accessAddressEIP2929(
      runState,
      address.bytes,
      common,
      hardfork,
      charge2929Gas,
    )
  }

  return gas
}

/** MLOAD - 0x51 */
export const dynamicGasMload: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  const hardfork = runState.interpreter.fork
  const pos = runState.stack.peek()[0]
  gas += subMemUsage(runState, pos, BIGINT_32, common, hardfork)
  return gas
}

/** MSTORE - 0x52 */
export const dynamicGasMstore: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  const hardfork = runState.interpreter.fork
  const offset = runState.stack.peek()[0]
  gas += subMemUsage(runState, offset, BIGINT_32, common, hardfork)
  return gas
}

/** MSTORE8 - 0x53 */
export const dynamicGasMstore8: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  const hardfork = runState.interpreter.fork
  const offset = runState.stack.peek()[0]
  gas += subMemUsage(runState, offset, BIGINT_1, common, hardfork)
  return gas
}

/** SLOAD - 0x54 */
export const dynamicGasSload: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  const hardfork = runState.interpreter.fork
  const key = runState.stack.peek()[0]
  const keyBuf = setLengthLeft(bigIntToBytes(key), 32)

  let charge2929Gas = true
  if (common.isEIPActiveAtHardfork(6800, hardfork)) {
    const address = runState.interpreter.getAddress()
    const coldAccessGas = runState.env.accessWitness!.readAccountStorage(
      address,
      key,
    )
    gas += coldAccessGas
    charge2929Gas = coldAccessGas === BIGINT_0
  }

  if (common.isEIPActiveAtHardfork(2929, hardfork)) {
    gas += accessStorageEIP2929(
      runState,
      keyBuf,
      false,
      common,
      hardfork,
      charge2929Gas,
    )
  }

  return gas
}

/** SSTORE - 0x55 - Base handler (pre-Constantinople) */
export const dynamicGasSstore: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  if (runState.interpreter.isStatic()) {
    trap(EVMError.errorMessages.STATIC_STATE_CHANGE)
  }
  const [key, val] = runState.stack.peek(2)

  const keyBytes = setLengthLeft(bigIntToBytes(key), 32)
  let value
  if (val === BIGINT_0) {
    value = Uint8Array.from([])
  } else {
    value = bigIntToBytes(val)
  }

  const currentStorage = setLengthLeftStorage(
    await runState.interpreter.storageLoad(keyBytes),
  )
  const hardfork = runState.interpreter.fork

  // Base SSTORE gas calculation (pre-Constantinople)
  // EIP-1283 and EIP-2200 enablers will replace this handler
  gas += updateSstoreGas(
    runState,
    currentStorage,
    setLengthLeftStorage(value),
    common,
    hardfork,
  )

  let charge2929Gas = true
  if (common.isEIPActiveAtHardfork(6800, hardfork)) {
    const contract = runState.interpreter.getAddress()
    const coldAccessGas = runState.env.accessWitness!.writeAccountStorage(
      contract,
      key,
    )
    gas += coldAccessGas
    charge2929Gas = coldAccessGas === BIGINT_0
  }

  if (common.isEIPActiveAtHardfork(2929, hardfork)) {
    gas += accessStorageEIP2929(
      runState,
      keyBytes,
      true,
      common,
      hardfork,
      charge2929Gas,
    )
  }

  return gas
}

/** MCOPY - 0x5e */
export const dynamicGasMcopy: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  const hardfork = runState.interpreter.fork
  const [dst, src, length] = runState.stack.peek(3)
  const wordsCopied = (length + BIGINT_31) / BIGINT_32
  gas += BIGINT_3 * wordsCopied
  gas += subMemUsage(runState, src, length, common, hardfork)
  gas += subMemUsage(runState, dst, length, common, hardfork)
  return gas
}

/** LOG0-LOG4 - 0xa0-0xa4 */
export const dynamicGasLog: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  const hardfork = runState.interpreter.fork
  if (runState.interpreter.isStatic()) {
    trap(EVMError.errorMessages.STATIC_STATE_CHANGE)
  }

  const [memOffset, memLength] = runState.stack.peek(2)
  const topicsCount = runState.opCode - 0xa0

  if (topicsCount < 0 || topicsCount > 4) {
    trap(EVMError.errorMessages.OUT_OF_RANGE)
  }

  gas += subMemUsage(runState, memOffset, memLength, common, hardfork)
  gas +=
    common.getParamAtHardfork('logTopicGas', hardfork)! * BigInt(topicsCount) +
    memLength * common.getParamAtHardfork('logDataGas', hardfork)!
  return gas
}

/** DATACOPY - 0xd3 (EOF) */
export const dynamicGasDatacopy: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
) => {
  if (runState.env.eof === undefined) {
    trap(EVMError.errorMessages.INVALID_OPCODE)
  }
  const [memOffset, _dataOffset, dataLength] = runState.stack.peek(3)
  const hardfork = runState.interpreter.fork
  gas += subMemUsage(runState, memOffset, dataLength, common, hardfork)
  if (dataLength !== BIGINT_0) {
    gas +=
      common.getParamAtHardfork('copyGas', hardfork)! *
      divCeil(dataLength, BIGINT_32)
  }
  return gas
}

/** EOFCREATE - 0xec (EOF) */
export const dynamicGasEofcreate: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  if (runState.env.eof === undefined) {
    trap(EVMError.errorMessages.INVALID_OPCODE)
  }

  const containerIndex = runState.env.code[runState.programCounter + 1]
  const [_value, _salt, inputOffset, inputSize] = runState.stack.peek(4)

  const hardfork = runState.interpreter.fork
  gas += subMemUsage(runState, inputOffset, inputSize, common, hardfork)

  const container =
    runState.env.eof!.container.body.containerSections[containerIndex]

  gas +=
    common.getParamAtHardfork('keccak256WordGas', hardfork)! *
    divCeil(BigInt(container.length), BIGINT_32)

  const gasLeft = runState.interpreter.getGasLeft() - gas
  runState.messageGasLimit = maxCallGas(gasLeft, gasLeft, runState, common)

  return gas
}

/** RETURNCONTRACT - 0xee (EOF) */
export const dynamicGasReturncontract: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  const [auxDataOffset, auxDataSize] = runState.stack.peek(2)
  const hardfork = runState.interpreter.fork
  gas += subMemUsage(runState, auxDataOffset, auxDataSize, common, hardfork)
  return gas
}

/** CREATE - 0xf0 */
export const dynamicGasCreate: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  if (runState.interpreter.isStatic()) {
    trap(EVMError.errorMessages.STATIC_STATE_CHANGE)
  }
  const [_value, offset, length] = runState.stack.peek(3)

  const hardfork = runState.interpreter.fork
  if (common.isEIPActiveAtHardfork(2929, hardfork)) {
    gas += accessAddressEIP2929(
      runState,
      runState.interpreter.getAddress().bytes,
      common,
      hardfork,
      false,
    )
  }

  if (common.isEIPActiveAtHardfork(3860, hardfork)) {
    const eip3860Hardfork = common.getHardforkForEIP(3860) ?? hardfork
    gas +=
      ((length + BIGINT_31) / BIGINT_32) *
      common.getParamAtHardfork('initCodeWordGas', eip3860Hardfork)!
  }

  gas += subMemUsage(runState, offset, length, common, hardfork)

  let gasLimit = BigInt(runState.interpreter.getGasLeft()) - gas
  gasLimit = maxCallGas(gasLimit, gasLimit, runState, common)

  runState.messageGasLimit = gasLimit
  return gas
}

/** CALL - 0xf1 */
export const dynamicGasCall: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  const hardfork = runState.interpreter.fork
  const [
    currentGasLimit,
    toAddr,
    value,
    inOffset,
    inLength,
    outOffset,
    outLength,
  ] = runState.stack.peek(7)
  const toAddress = createAddressFromStackBigInt(toAddr)

  if (runState.interpreter.isStatic() && value !== BIGINT_0) {
    trap(EVMError.errorMessages.OUT_OF_GAS)
  }
  gas += subMemUsage(runState, inOffset, inLength, common, hardfork)
  gas += subMemUsage(runState, outOffset, outLength, common, hardfork)

  let charge2929Gas = true
  if (
    common.isEIPActiveAtHardfork(6800, hardfork) &&
    runState.interpreter._evm.getPrecompile(toAddress) === undefined
  ) {
    const coldAccessGas =
      runState.env.accessWitness!.readAccountBasicData(toAddress)
    if (value !== BIGINT_0) {
      const contractAddress = runState.interpreter.getAddress()
      gas += runState.env.accessWitness!.writeAccountBasicData(contractAddress)
      gas += runState.env.accessWitness!.writeAccountBasicData(toAddress)
    }
    gas += coldAccessGas
    charge2929Gas = coldAccessGas === BIGINT_0
  }

  if (common.isEIPActiveAtHardfork(2929, hardfork)) {
    gas += accessAddressEIP2929(
      runState,
      toAddress.bytes,
      common,
      hardfork,
      charge2929Gas,
    )
  }

  if (common.isEIPActiveAtHardfork(7702, hardfork)) {
    gas += await eip7702GasCost(
      runState,
      common,
      hardfork,
      toAddress,
      charge2929Gas,
    )
  }

  if (value !== BIGINT_0 && !common.isEIPActiveAtHardfork(6800, hardfork)) {
    gas += common.getParamAtHardfork('callValueTransferGas', hardfork)!
  }

  if (common.hardforkGte(hardfork, Hardfork.SpuriousDragon)) {
    const account = await runState.stateManager.getAccount(toAddress)
    let deadAccount = false
    if (account === undefined || account.isEmpty()) {
      deadAccount = true
    }

    if (deadAccount && !(value === BIGINT_0)) {
      gas += common.getParamAtHardfork('callNewAccountGas', hardfork)!
    }
  } else if (
    (await runState.stateManager.getAccount(toAddress)) === undefined
  ) {
    gas += common.getParamAtHardfork('callNewAccountGas', hardfork)!
  }

  const gasLimit = maxCallGas(
    currentGasLimit,
    runState.interpreter.getGasLeft() - gas,
    runState,
    common,
  )
  if (gasLimit > runState.interpreter.getGasLeft() - gas) {
    trap(EVMError.errorMessages.OUT_OF_GAS)
  }

  if (gas > runState.interpreter.getGasLeft()) {
    trap(EVMError.errorMessages.OUT_OF_GAS)
  }

  runState.messageGasLimit = gasLimit
  return gas
}

/** CALLCODE - 0xf2 */
export const dynamicGasCallcode: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  const [
    currentGasLimit,
    toAddr,
    value,
    inOffset,
    inLength,
    outOffset,
    outLength,
  ] = runState.stack.peek(7)
  const toAddress = createAddressFromStackBigInt(toAddr)

  const hardfork = runState.interpreter.fork
  gas += subMemUsage(runState, inOffset, inLength, common, hardfork)
  gas += subMemUsage(runState, outOffset, outLength, common, hardfork)

  let charge2929Gas = true
  if (
    common.isEIPActiveAtHardfork(6800, hardfork) &&
    runState.interpreter._evm.getPrecompile(toAddress) === undefined
  ) {
    const coldAccessGas =
      runState.env.accessWitness!.readAccountBasicData(toAddress)
    gas += coldAccessGas
    charge2929Gas = coldAccessGas === BIGINT_0
  }

  if (common.isEIPActiveAtHardfork(2929, hardfork)) {
    gas += accessAddressEIP2929(
      runState,
      createAddressFromStackBigInt(toAddr).bytes,
      common,
      hardfork,
      charge2929Gas,
    )
  }

  if (common.isEIPActiveAtHardfork(7702, hardfork)) {
    gas += await eip7702GasCost(
      runState,
      common,
      hardfork,
      toAddress,
      charge2929Gas,
    )
  }

  if (value !== BIGINT_0) {
    gas += common.getParamAtHardfork('callValueTransferGas', hardfork)!
  }

  const gasLimit = maxCallGas(
    currentGasLimit,
    runState.interpreter.getGasLeft() - gas,
    runState,
    common,
  )
  if (gasLimit > runState.interpreter.getGasLeft() - gas) {
    trap(EVMError.errorMessages.OUT_OF_GAS)
  }

  runState.messageGasLimit = gasLimit
  return gas
}

/** RETURN - 0xf3 */
export const dynamicGasReturn: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  const [offset, length] = runState.stack.peek(2)
  const hardfork = runState.interpreter.fork
  gas += subMemUsage(runState, offset, length, common, hardfork)
  return gas
}

/** DELEGATECALL - 0xf4 */
export const dynamicGasDelegatecall: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  const [currentGasLimit, toAddr, inOffset, inLength, outOffset, outLength] =
    runState.stack.peek(6)
  const toAddress = createAddressFromStackBigInt(toAddr)

  const hardfork = runState.interpreter.fork
  gas += subMemUsage(runState, inOffset, inLength, common, hardfork)
  gas += subMemUsage(runState, outOffset, outLength, common, hardfork)

  let charge2929Gas = true
  if (
    common.isEIPActiveAtHardfork(6800, hardfork) &&
    runState.interpreter._evm.getPrecompile(toAddress) === undefined
  ) {
    const coldAccessGas =
      runState.env.accessWitness!.readAccountBasicData(toAddress)
    gas += coldAccessGas
    charge2929Gas = coldAccessGas === BIGINT_0
  }

  if (common.isEIPActiveAtHardfork(2929, hardfork)) {
    gas += accessAddressEIP2929(
      runState,
      createAddressFromStackBigInt(toAddr).bytes,
      common,
      hardfork,
      charge2929Gas,
    )
  }

  if (common.isEIPActiveAtHardfork(7702, hardfork)) {
    gas += await eip7702GasCost(
      runState,
      common,
      hardfork,
      toAddress,
      charge2929Gas,
    )
  }

  const gasLimit = maxCallGas(
    currentGasLimit,
    runState.interpreter.getGasLeft() - gas,
    runState,
    common,
  )
  if (gasLimit > runState.interpreter.getGasLeft() - gas) {
    trap(EVMError.errorMessages.OUT_OF_GAS)
  }

  runState.messageGasLimit = gasLimit
  return gas
}

/** CREATE2 - 0xf5 */
export const dynamicGasCreate2: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  if (runState.interpreter.isStatic()) {
    trap(EVMError.errorMessages.STATIC_STATE_CHANGE)
  }

  const [_value, offset, length, _salt] = runState.stack.peek(4)

  const hardfork = runState.interpreter.fork
  gas += subMemUsage(runState, offset, length, common, hardfork)

  if (common.isEIPActiveAtHardfork(2929, hardfork)) {
    gas += accessAddressEIP2929(
      runState,
      runState.interpreter.getAddress().bytes,
      common,
      hardfork,
      false,
    )
  }

  if (common.isEIPActiveAtHardfork(3860, hardfork)) {
    gas +=
      ((length + BIGINT_31) / BIGINT_32) *
      common.getParamAtHardfork('initCodeWordGas', hardfork)!
  }

  gas +=
    common.getParamAtHardfork('keccak256WordGas', hardfork)! *
    divCeil(length, BIGINT_32)
  let gasLimit = runState.interpreter.getGasLeft() - gas
  gasLimit = maxCallGas(gasLimit, gasLimit, runState, common)
  runState.messageGasLimit = gasLimit
  return gas
}

/** EXTCALL - 0xf8 (EOF) */
export const dynamicGasExtcall: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  if (runState.env.eof === undefined) {
    trap(EVMError.errorMessages.INVALID_OPCODE)
  }

  const [toAddr, inOffset, inLength, value] = runState.stack.peek(4)

  if (runState.interpreter.isStatic() && value !== BIGINT_0) {
    trap(EVMError.errorMessages.STATIC_STATE_CHANGE)
  }
  const hardfork = runState.interpreter.fork
  if (value > BIGINT_0) {
    gas += common.getParamAtHardfork('callValueTransferGas', hardfork)!
  }

  if (toAddr > EXTCALL_TARGET_MAX) {
    trap(EOFErrorMessage.INVALID_EXTCALL_TARGET)
  }

  gas += subMemUsage(runState, inOffset, inLength, common, hardfork)

  const toAddress = createAddressFromStackBigInt(toAddr)
  gas += accessAddressEIP2929(runState, toAddress.bytes, common, hardfork)

  if (value > BIGINT_0) {
    const account = await runState.stateManager.getAccount(toAddress)
    const deadAccount = account === undefined || account.isEmpty()

    if (deadAccount) {
      gas += common.getParamAtHardfork('callNewAccountGas', hardfork)!
    }
  }

  const eip7069Hardfork = common.getHardforkForEIP(7069) ?? hardfork
  const minRetainedGas = common.getParamAtHardfork(
    'minRetainedGas',
    eip7069Hardfork,
  )!
  const minCalleeGas = common.getParamAtHardfork(
    'minCalleeGas',
    eip7069Hardfork,
  )!

  const currentGasAvailable = runState.interpreter.getGasLeft() - gas
  const reducedGas = currentGasAvailable / BIGINT_64
  let gasLimit: bigint
  if (reducedGas < minRetainedGas) {
    gasLimit = currentGasAvailable - minRetainedGas
  } else {
    gasLimit = currentGasAvailable - reducedGas
  }

  if (
    runState.env.depth >=
      Number(common.getParamAtHardfork('stackLimit', hardfork)!) ||
    runState.env.contract.balance < value ||
    gasLimit < minCalleeGas
  ) {
    gasLimit = -BIGINT_1
  }

  runState.messageGasLimit = gasLimit

  return gas
}

/** EXTDELEGATECALL - 0xf9 (EOF) */
export const dynamicGasExtdelegatecall: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  if (runState.env.eof === undefined) {
    trap(EVMError.errorMessages.INVALID_OPCODE)
  }

  const [toAddr, inOffset, inLength] = runState.stack.peek(3)

  if (toAddr > EXTCALL_TARGET_MAX) {
    trap(EOFErrorMessage.INVALID_EXTCALL_TARGET)
  }

  const hardfork = runState.interpreter.fork
  gas += subMemUsage(runState, inOffset, inLength, common, hardfork)

  const toAddress = createAddressFromStackBigInt(toAddr)
  gas += accessAddressEIP2929(runState, toAddress.bytes, common, hardfork)

  const eip7069Hardfork = common.getHardforkForEIP(7069) ?? hardfork
  const minRetainedGas = common.getParamAtHardfork(
    'minRetainedGas',
    eip7069Hardfork,
  )!
  const minCalleeGas = common.getParamAtHardfork(
    'minCalleeGas',
    eip7069Hardfork,
  )!

  const currentGasAvailable = runState.interpreter.getGasLeft() - gas
  const reducedGas = currentGasAvailable / BIGINT_64
  let gasLimit: bigint
  if (reducedGas < minRetainedGas) {
    gasLimit = currentGasAvailable - minRetainedGas
  } else {
    gasLimit = currentGasAvailable - reducedGas
  }

  if (
    runState.env.depth >=
      Number(common.getParamAtHardfork('stackLimit', hardfork)!) ||
    gasLimit < minCalleeGas
  ) {
    gasLimit = -BIGINT_1
  }

  runState.messageGasLimit = gasLimit

  return gas
}

/** STATICCALL - 0xfa */
export const dynamicGasStaticcall: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  const [currentGasLimit, toAddr, inOffset, inLength, outOffset, outLength] =
    runState.stack.peek(6)

  const hardfork = runState.interpreter.fork
  gas += subMemUsage(runState, inOffset, inLength, common, hardfork)
  gas += subMemUsage(runState, outOffset, outLength, common, hardfork)

  let charge2929Gas = true
  const toAddress = createAddressFromStackBigInt(toAddr)
  if (
    common.isEIPActiveAtHardfork(6800, hardfork) &&
    runState.interpreter._evm.getPrecompile(toAddress) === undefined
  ) {
    const coldAccessGas =
      runState.env.accessWitness!.readAccountBasicData(toAddress)
    gas += coldAccessGas
    charge2929Gas = coldAccessGas === BIGINT_0
  }

  if (common.isEIPActiveAtHardfork(2929, hardfork)) {
    gas += accessAddressEIP2929(
      runState,
      createAddressFromStackBigInt(toAddr).bytes,
      common,
      hardfork,
      charge2929Gas,
    )
  }

  if (common.isEIPActiveAtHardfork(7702, hardfork)) {
    gas += await eip7702GasCost(
      runState,
      common,
      hardfork,
      createAddressFromStackBigInt(toAddr),
      charge2929Gas,
    )
  }

  const gasLimit = maxCallGas(
    currentGasLimit,
    runState.interpreter.getGasLeft() - gas,
    runState,
    common,
  )

  runState.messageGasLimit = gasLimit
  return gas
}

/** EXTSTATICCALL - 0xfb (EOF) */
export const dynamicGasExtstaticcall: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  if (runState.env.eof === undefined) {
    trap(EVMError.errorMessages.INVALID_OPCODE)
  }

  const [toAddr, inOffset, inLength] = runState.stack.peek(3)

  if (toAddr > EXTCALL_TARGET_MAX) {
    trap(EOFErrorMessage.INVALID_EXTCALL_TARGET)
  }

  const hardfork = runState.interpreter.fork
  gas += subMemUsage(runState, inOffset, inLength, common, hardfork)

  const toAddress = createAddressFromStackBigInt(toAddr)
  gas += accessAddressEIP2929(runState, toAddress.bytes, common, hardfork)

  const eip7069Hardfork = common.getHardforkForEIP(7069) ?? hardfork
  const minRetainedGas = common.getParamAtHardfork(
    'minRetainedGas',
    eip7069Hardfork,
  )!
  const minCalleeGas = common.getParamAtHardfork(
    'minCalleeGas',
    eip7069Hardfork,
  )!

  const currentGasAvailable = runState.interpreter.getGasLeft() - gas
  const reducedGas = currentGasAvailable / BIGINT_64
  let gasLimit: bigint
  if (reducedGas < minRetainedGas) {
    gasLimit = currentGasAvailable - minRetainedGas
  } else {
    gasLimit = currentGasAvailable - reducedGas
  }

  if (
    runState.env.depth >=
      Number(common.getParamAtHardfork('stackLimit', hardfork)!) ||
    gasLimit < minCalleeGas
  ) {
    gasLimit = -BIGINT_1
  }

  runState.messageGasLimit = gasLimit

  return gas
}

/** REVERT - 0xfd */
export const dynamicGasRevert: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  const [offset, length] = runState.stack.peek(2)
  const hardfork = runState.interpreter.fork
  gas += subMemUsage(runState, offset, length, common, hardfork)
  return gas
}

/** SELFDESTRUCT - 0xff */
export const dynamicGasSelfdestruct: AsyncDynamicGasHandler = async (
  runState,
  gas,
  common,
): Promise<bigint> => {
  if (runState.interpreter.isStatic()) {
    trap(EVMError.errorMessages.STATIC_STATE_CHANGE)
  }
  const selfdestructToaddressBigInt = runState.stack.peek()[0]

  const selfdestructToAddress = createAddressFromStackBigInt(
    selfdestructToaddressBigInt,
  )
  const contractAddress = runState.interpreter.getAddress()

  let deductGas = false
  const balance = await runState.interpreter.getExternalBalance(contractAddress)

  const hardfork = runState.interpreter.fork
  if (common.hardforkGte(hardfork, Hardfork.SpuriousDragon)) {
    if (balance > BIGINT_0) {
      const account = await runState.stateManager.getAccount(
        selfdestructToAddress,
      )
      if (account === undefined || account.isEmpty()) {
        deductGas = true
      }
    }
  } else if (common.hardforkGte(hardfork, Hardfork.TangerineWhistle)) {
    const exists =
      (await runState.stateManager.getAccount(selfdestructToAddress)) !==
      undefined
    if (!exists) {
      deductGas = true
    }
  }
  if (deductGas) {
    gas += common.getParamAtHardfork('callNewAccountGas', hardfork)!
  }

  let selfDestructToCharge2929Gas = true
  if (
    common.isEIPActiveAtHardfork(6800, hardfork) &&
    runState.env.chargeCodeAccesses === true
  ) {
    gas += runState.env.accessWitness!.readAccountBasicData(contractAddress)
    if (balance > BIGINT_0) {
      gas += runState.env.accessWitness!.writeAccountBasicData(contractAddress)
    }

    let selfDestructToColdAccessGas =
      runState.env.accessWitness!.readAccountBasicData(selfdestructToAddress)
    if (balance > BIGINT_0) {
      selfDestructToColdAccessGas +=
        runState.env.accessWitness!.writeAccountBasicData(selfdestructToAddress)
    }

    gas += selfDestructToColdAccessGas
    selfDestructToCharge2929Gas = selfDestructToColdAccessGas === BIGINT_0
  }

  if (common.isEIPActiveAtHardfork(2929, hardfork)) {
    gas += accessAddressEIP2929(
      runState,
      selfdestructToAddress.bytes,
      common,
      hardfork,
      selfDestructToCharge2929Gas,
      true,
    )
  }

  return gas
}
