import { keccak256 } from 'ethereum-cryptography/keccak.js'
import type { PrefixedHexString } from '@ts-ethereum/utils'
import { bytesToHex, hexToBytes } from '@ts-ethereum/utils'
import { safeResult } from '@ts-ethereum/utils'
import type { ExecutionNode } from '../../../node/index'
import { createRpcMethod } from '../../validation'
import { sha3Schema } from './schema'

export const sha3 = (_node: ExecutionNode) =>
  createRpcMethod(sha3Schema, async (params: [PrefixedHexString], _c) => {
    const hexEncodedDigest = bytesToHex(keccak256(hexToBytes(params[0])))
    return safeResult(hexEncodedDigest)
  })
