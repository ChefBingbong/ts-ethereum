import type { ParamsDict } from '@ts-ethereum/chain-config'

// Frontier/Chainstart EVM parameters only
export const paramsEVM: ParamsDict = {
  /**
   * Frontier/Chainstart
   */
  1: {
    // gasConfig
    maxRefundQuotient: 2, // Maximum refund quotient; max tx refund is min(tx.gasUsed/maxRefundQuotient, tx.gasRefund)
    // gasPrices
    expGas: 10, // Base fee of the EXP opcode
    expByteGas: 10, // Times ceil(log256(exponent)) for the EXP instruction
    keccak256Gas: 30, // Base fee of the SHA3 opcode
    keccak256WordGas: 6, // Once per word of the SHA3 operation's data
    sloadGas: 50, // Base fee of the SLOAD opcode
    sstoreSetGas: 20000, // Once per SSTORE operation if the zeroness changes from zero
    sstoreResetGas: 5000, // Once per SSTORE operation if the zeroness does not change from zero
    sstoreRefundGas: 15000, // Once per SSTORE operation if the zeroness changes to zero
    jumpdestGas: 1, // Base fee of the JUMPDEST opcode
    logGas: 375, // Base fee of the LOG opcode
    logDataGas: 8, // Per byte in a LOG* operation's data
    logTopicGas: 375, // Multiplied by the * of the LOG*, per LOG transaction
    createGas: 32000, // Base fee of the CREATE opcode
    callGas: 40, // Base fee of the CALL opcode
    callStipendGas: 2300, // Free gas given at beginning of call
    callValueTransferGas: 9000, // Paid for CALL when the value transfer is non-zero
    callNewAccountGas: 25000, // Paid for CALL when the destination address didn't exist prior
    selfdestructRefundGas: 24000, // Refunded following a selfdestruct operation
    memoryGas: 3, // Times the address of the (highest referenced byte in memory + 1)
    quadCoefficientDivGas: 512, // Divisor for the quadratic particle of the memory cost equation
    createDataGas: 200,
    copyGas: 3, // Multiplied by the number of 32-byte words that are copied (round up)
    ecRecoverGas: 3000,
    sha256Gas: 60,
    sha256WordGas: 12,
    ripemd160Gas: 600,
    ripemd160WordGas: 120,
    identityGas: 15,
    identityWordGas: 3,
    stopGas: 0, // Base fee of the STOP opcode
    addGas: 3, // Base fee of the ADD opcode
    mulGas: 5, // Base fee of the MUL opcode
    subGas: 3, // Base fee of the SUB opcode
    divGas: 5, // Base fee of the DIV opcode
    sdivGas: 5, // Base fee of the SDIV opcode
    modGas: 5, // Base fee of the MOD opcode
    smodGas: 5, // Base fee of the SMOD opcode
    addmodGas: 8, // Base fee of the ADDMOD opcode
    mulmodGas: 8, // Base fee of the MULMOD opcode
    signextendGas: 5, // Base fee of the SIGNEXTEND opcode
    ltGas: 3, // Base fee of the LT opcode
    gtGas: 3, // Base fee of the GT opcode
    sltGas: 3, // Base fee of the SLT opcode
    sgtGas: 3, // Base fee of the SGT opcode
    eqGas: 3, // Base fee of the EQ opcode
    iszeroGas: 3, // Base fee of the ISZERO opcode
    andGas: 3, // Base fee of the AND opcode
    orGas: 3, // Base fee of the OR opcode
    xorGas: 3, // Base fee of the XOR opcode
    notGas: 3, // Base fee of the NOT opcode
    byteGas: 3, // Base fee of the BYTE opcode
    addressGas: 2, // Base fee of the ADDRESS opcode
    balanceGas: 20, // Base fee of the BALANCE opcode
    originGas: 2, // Base fee of the ORIGIN opcode
    callerGas: 2, // Base fee of the CALLER opcode
    callvalueGas: 2, // Base fee of the CALLVALUE opcode
    calldataloadGas: 3, // Base fee of the CALLDATALOAD opcode
    calldatasizeGas: 2, // Base fee of the CALLDATASIZE opcode
    calldatacopyGas: 3, // Base fee of the CALLDATACOPY opcode
    codesizeGas: 2, // Base fee of the CODESIZE opcode
    codecopyGas: 3, // Base fee of the CODECOPY opcode
    gaspriceGas: 2, // Base fee of the GASPRICE opcode
    extcodesizeGas: 20, // Base fee of the EXTCODESIZE opcode
    extcodecopyGas: 20, // Base fee of the EXTCODECOPY opcode
    blockhashGas: 20, // Base fee of the BLOCKHASH opcode
    coinbaseGas: 2, // Base fee of the COINBASE opcode
    timestampGas: 2, // Base fee of the TIMESTAMP opcode
    numberGas: 2, // Base fee of the NUMBER opcode
    difficultyGas: 2, // Base fee of the DIFFICULTY opcode
    gaslimitGas: 2, // Base fee of the GASLIMIT opcode
    popGas: 2, // Base fee of the POP opcode
    mloadGas: 3, // Base fee of the MLOAD opcode
    mstoreGas: 3, // Base fee of the MSTORE opcode
    mstore8Gas: 3, // Base fee of the MSTORE8 opcode
    sstoreGas: 0, // Base fee of the SSTORE opcode
    jumpGas: 8, // Base fee of the JUMP opcode
    jumpiGas: 10, // Base fee of the JUMPI opcode
    pcGas: 2, // Base fee of the PC opcode
    msizeGas: 2, // Base fee of the MSIZE opcode
    gasGas: 2, // Base fee of the GAS opcode
    pushGas: 3, // Base fee of the PUSH opcode
    dupGas: 3, // Base fee of the DUP opcode
    swapGas: 3, // Base fee of the SWAP opcode
    callcodeGas: 40, // Base fee of the CALLCODE opcode
    returnGas: 0, // Base fee of the RETURN opcode
    invalidGas: 0, // Base fee of the INVALID opcode
    selfdestructGas: 0, // Base fee of the SELFDESTRUCT opcode
    // evm
    stackLimit: 1024, // Maximum size of VM stack allowed
  },
}
