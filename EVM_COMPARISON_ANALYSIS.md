# EVM/VM Implementation Comparison Analysis

## Executive Summary

This document provides a detailed comparison between the user's EVM/VM implementation (`@simple-p2p-blockchain`) and the reference implementation (`@ethereumjs-monorepo`). The analysis focuses on identifying differences that could cause contract interaction failures, specifically the issue where `eth_call` returns empty data (`"0x"`).

## Key Findings

### 1. **CRITICAL: Missing `skipBalance` Handling in `_executeCall`**

**Location**: `packages/evm/src/evm.ts` - `_executeCall` method

**Issue**: The `_executeCall` method always attempts balance transfers (lines 373-393), even when `skipBalance: true` is set. While `skipBalance` is handled in `runCall` (lines 765-775) to set the caller's balance, the `_executeCall` method doesn't check if balance transfers should be skipped.

**EthereumJS Behavior**: Same behavior - balance transfers are attempted regardless of `skipBalance`. However, `skipBalance` ensures sufficient balance exists before execution.

**Impact**: If the caller doesn't have sufficient balance, `_reduceSenderBalance` throws an error, which is caught and stored in `errorMessage`. This causes early exit with empty return value (lines 407-421).

**Status**: ✅ **RESOLVED** - Your `call.ts` already sets `skipBalance: true` (line 47), which ensures balance is set before execution.

---

### 2. **Missing EIP-2929 Check in `runCall`**

**Location**: `packages/evm/src/evm.ts` - `runCall` method, lines 811-816

**Your Code**:
```typescript
if (!message.to) {
  message.code = message.data
  this.journal.addWarmedAddress(
    (await this._generateAddress(message)).bytes,
  )
}
```

**EthereumJS Code** (line 1011):
```typescript
if (!message.to && this.common.isActivatedEIP(2929)) {
  message.code = message.data
  this.journal.addWarmedAddress((await this._generateAddress(message)).bytes)
}
```

**Difference**: EthereumJS only adds warmed address if EIP-2929 is activated. Your code always adds it.

**Impact**: **LOW** - This is a gas optimization feature. Shouldn't affect return values, but could cause incorrect gas accounting.

---

### 3. **Missing EIP-7864 and EIP-6800 Handling in `_executeCall`**

**Location**: `packages/evm/src/evm.ts` - `_executeCall` method, beginning

**Your Code**: Starts directly with balance reduction (line 363).

**EthereumJS Code**: Has extensive EIP-7864 handling at the start (lines 365-401) and EIP-6800 handling for account absence proofs (lines 420-437).

**Impact**: **MEDIUM** - These are newer EIPs for binary tree access witnesses. If your chain doesn't activate these EIPs, this shouldn't matter. However, if they are activated, missing this logic could cause incorrect gas accounting or execution failures.

---

### 4. **Missing EIP-7702 Delegation Check in `_loadCode`**

**Location**: `packages/evm/src/evm.ts` - `_loadCode` method, lines 954-967

**Your Code**:
```typescript
protected async _loadCode(message: Message): Promise<void> {
  if (!message.code) {
    const precompile = this.getPrecompile(message.codeAddress)
    if (precompile) {
      message.code = precompile
      message.isCompiled = true
    } else {
      message.code = await this.stateManager.getCode(message.codeAddress)
      message.isCompiled = false
      message.chargeCodeAccesses = true
    }
  }
}
```

**EthereumJS Code** (lines 1152-1177):
```typescript
protected async _loadCode(message: Message): Promise<void> {
  if (!message.code) {
    const precompile = this.getPrecompile(message.codeAddress)
    if (precompile) {
      message.code = precompile
      message.isCompiled = true
    } else {
      message.code = await this.stateManager.getCode(message.codeAddress)
      
      // EIP-7702 delegation check
      if (
        this.common.isActivatedEIP(7702) &&
        equalsBytes(message.code.slice(0, 3), DELEGATION_7702_FLAG)
      ) {
        const address = new Address(message.code.slice(3, 24))
        message.code = await this.stateManager.getCode(address)
        if (message.depth === 0) {
          this.journal.addAlwaysWarmAddress(address.toString())
        }
      }
      
      message.isCompiled = false
      message.chargeCodeAccesses = true
    }
  }
}
```

**Impact**: **LOW** - Only relevant if EIP-7702 is activated. Shouldn't affect basic contract calls.

---

### 5. **Missing `createdAddresses` Initialization in `runInterpreter`**

**Location**: `packages/evm/src/evm.ts` - `runInterpreter` method, lines 688-700

**Your Code**:
```typescript
if (message.selfdestruct) {
  interpreter._result.selfdestruct = message.selfdestruct
}
```

**EthereumJS Code** (lines 897-902):
```typescript
if (message.selfdestruct) {
  interpreter._result.selfdestruct = message.selfdestruct
}
if (message.createdAddresses) {
  interpreter._result.createdAddresses = message.createdAddresses
}
```

**Impact**: **LOW** - Only relevant for EIP-6780. Shouldn't affect basic contract calls.

---

### 6. **Missing `accessWitness` Commit in `runInterpreter`**

**Location**: `packages/evm/src/evm.ts` - `runInterpreter` method, return statement

**Your Code**: Returns result directly (lines 726-738).

**EthereumJS Code**: Commits `accessWitness` before returning (line 925):
```typescript
message.accessWitness?.commit()
return {
  ...
}
```

**Impact**: **LOW** - Only relevant for EIP-7864 binary tree access witnesses.

---

### 7. **Missing `accessWitness` Commit in `runCall`**

**Location**: `packages/evm/src/evm.ts` - `runCall` method, end

**Your Code**: Returns result directly (line 891).

**EthereumJS Code**: Commits `accessWitness` before returning (line 1088):
```typescript
message.accessWitness?.commit()
return result
```

**Impact**: **LOW** - Only relevant for EIP-7864.

---

### 8. **Interpreter EOF Handling Differences**

**Location**: `packages/evm/src/interpreter.ts` - `run` method

**Your Code**: Simple legacy bytecode handling (lines 199-200):
```typescript
this._runState.code = code
this._runState.programCounter = opts.pc ?? this._runState.programCounter
```

**EthereumJS Code**: Extensive EOF (EIP-3540) handling (lines 219-269) with validation, container setup, etc.

**Impact**: **MEDIUM** - If your contracts use EOF format, this could cause issues. For legacy bytecode, this shouldn't matter.

---

### 9. **Return Value Handling - IDENTICAL**

**Location**: `packages/evm/src/evm.ts` - `runInterpreter` method, return statement

Both implementations handle return values identically:
```typescript
returnValue: result.returnValue ?? new Uint8Array(0),
```

**Status**: ✅ **NO ISSUE** - Return value extraction is identical.

---

### 10. **CRITICAL: Hardcoded `from` Address in `call.ts`**

**Location**: `packages/execution-client/src/rpc/modules/eth/call.ts`, lines 27-38

**Issue**: There's a hardcoded `from` address and debug console.log statements:
```typescript
console.log('block', transaction)
const { to, gas: gasLimit, gasPrice, value } = transaction
const data = transaction.data ?? transaction.input
const from = '0x988456c24e2b22f08a2291c4f9c8542d1c98c87f'  // HARDCODED!
const runCallOpts = {
  caller: from !== undefined ? createAddressFromString('0x988456c24e2b22f08a2291c4f9c8542d1c98c87f') : undefined,
  ...
}
console.log('runCallOpts', runCallOpts)
```

**EthereumJS Code**: Uses `transaction.from` properly:
```typescript
const { from, to, gas: gasLimit, gasPrice, value } = transaction
const runCallOpts = {
  caller: from !== undefined ? createAddressFromString(from) : undefined,
  ...
}
```

**Impact**: **CRITICAL** - This hardcodes the caller address, ignoring the `from` field in the transaction. This could cause:
- Wrong account being used for balance checks
- Wrong `msg.sender` in contract execution
- State access issues

**Recommendation**: **FIX IMMEDIATELY** - Use `transaction.from` instead of hardcoded address.

---

### 11. **Gas Limit Handling Difference**

**Location**: `packages/evm/src/evm.ts` - `_executeCall` method

**Your Code** (line 364):
```typescript
const gasLimit = message.gasLimit
```

**EthereumJS Code** (line 362):
```typescript
let gasLimit = message.gasLimit
```

**Difference**: EthereumJS uses `let` because it modifies `gasLimit` for EIP-7864 access gas. Your code uses `const`.

**Impact**: **LOW** - Only matters if EIP-7864 is activated.

---

### 12. **CREATE Return Fee Calculation Difference**

**Location**: `packages/evm/src/evm.ts` - `_executeCreate` method

**Your Code** (lines 586-590):
```typescript
const returnFee =
  BigInt(result.returnValue.length) *
  BigInt(this.common.param('createDataGas'))
totalGas = totalGas + returnFee
```

**EthereumJS Code** (lines 699-702):
```typescript
let returnFee = BIGINT_0
if (!result.exceptionError && !this.common.isActivatedEIP(6800)) {
  returnFee = BigInt(result.returnValue.length) * BigInt(this.common.param('createDataGas'))
  totalGas = totalGas + returnFee
}
```

**Difference**: EthereumJS skips return fee if EIP-6800 is activated or if there's an exception error.

**Impact**: **LOW** - Only affects CREATE operations, not CALL operations.

---

## Root Cause Analysis

Based on the comparison, the most likely causes of empty return values (`"0x"`) are:

### Primary Suspect: Hardcoded `from` Address
The hardcoded `from` address in `call.ts` (line 38) is the most critical issue. This could cause:
1. Wrong account balance checks
2. Wrong `msg.sender` in contracts
3. State access from wrong account

### Secondary Suspect: Balance Check Failure
Even though `skipBalance: true` is set, if there's an issue with how the balance is set or checked, `_reduceSenderBalance` could still throw an error, causing early exit with empty return value.

### Tertiary Suspect: Code Loading Issues
If `_loadCode` fails to load contract code properly, the execution would exit early with empty return value (lines 398-405).

---

## Recommendations

### Immediate Actions

1. **FIX**: Remove hardcoded `from` address in `call.ts` and use `transaction.from`
2. **FIX**: Remove debug `console.log` statements
3. **TEST**: Verify that `skipBalance: true` is working correctly by checking if balance is actually set before execution

### Medium Priority

4. **ADD**: EIP-2929 check in `runCall` (line 811)
5. **ADD**: EIP-7702 delegation check in `_loadCode` if EIP-7702 is activated
6. **ADD**: `createdAddresses` initialization in `runInterpreter` if EIP-6780 is activated

### Low Priority

7. **ADD**: EIP-7864 and EIP-6800 handling if these EIPs are activated
8. **ADD**: EOF handling in interpreter if EOF contracts are used
9. **ADD**: `accessWitness` commits if EIP-7864 is activated

---

## Testing Recommendations

1. **Test with correct `from` address**: Fix the hardcoded address and test again
2. **Add logging**: Add detailed logging in `_executeCall` to see:
   - If code is loaded successfully
   - If balance checks pass
   - If execution reaches the interpreter
   - What the interpreter returns
3. **Test with minimal contract**: Deploy a simple contract that just returns a value (no state changes)
4. **Verify state root**: Ensure the state root is correctly set before execution

---

## Conclusion

The most critical issue is the **hardcoded `from` address** in `call.ts`. This is likely causing incorrect account access and state issues. Fix this first, then test again. The other differences are mostly related to newer EIPs and shouldn't affect basic contract calls unless those EIPs are activated.

The return value handling logic itself appears identical between both implementations, so the issue is likely in the execution path before the return value is set.

