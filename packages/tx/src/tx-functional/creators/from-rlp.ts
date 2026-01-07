import { RLP } from '@ts-ethereum/rlp'
import { EthereumJSErrorWithoutCode } from '@ts-ethereum/utils'
import type { CreateTxOptions, FrozenTransaction } from '../types'
import { fromTxData } from './from-tx-data'
import { TransactionType } from '../../types'

/**
 * Creates a FrozenTransaction from RLP-encoded transaction data.
 */
export function fromRLP(
  data: Uint8Array,
  opts: CreateTxOptions,
): FrozenTransaction {
  // Check if it's a typed transaction (EIP-2718)
  if (data[0] <= 0x7f) {
    // Typed transaction: [type, rlp(payload)]
    const txType = data[0]
    const payload = RLP.decode(data.slice(1)) as any[]

    // Create txData based on type
    const txData: any = {
      type: txType,
    }

    // Decode based on transaction type
    switch (txType) {
      case TransactionType.AccessListEIP2930:
        // [chainId, nonce, gasPrice, gasLimit, to, value, data, accessList, v, r, s]
        txData.chainId = payload[0]
        txData.nonce = payload[1]
        txData.gasPrice = payload[2]
        txData.gasLimit = payload[3]
        txData.to = payload[4]
        txData.value = payload[5]
        txData.data = payload[6]
        txData.accessList = payload[7]
        txData.v = payload[8]
        txData.r = payload[9]
        txData.s = payload[10]
        break

      case TransactionType.FeeMarketEIP1559:
        // [chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList, v, r, s]
        txData.chainId = payload[0]
        txData.nonce = payload[1]
        txData.maxPriorityFeePerGas = payload[2]
        txData.maxFeePerGas = payload[3]
        txData.gasLimit = payload[4]
        txData.to = payload[5]
        txData.value = payload[6]
        txData.data = payload[7]
        txData.accessList = payload[8]
        txData.v = payload[9]
        txData.r = payload[10]
        txData.s = payload[11]
        break

      case TransactionType.BlobEIP4844:
        // [chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList, maxFeePerBlobGas, blobVersionedHashes, v, r, s]
        txData.chainId = payload[0]
        txData.nonce = payload[1]
        txData.maxPriorityFeePerGas = payload[2]
        txData.maxFeePerGas = payload[3]
        txData.gasLimit = payload[4]
        txData.to = payload[5]
        txData.value = payload[6]
        txData.data = payload[7]
        txData.accessList = payload[8]
        txData.maxFeePerBlobGas = payload[9]
        txData.blobVersionedHashes = payload[10]
        txData.v = payload[11]
        txData.r = payload[12]
        txData.s = payload[13]
        break

      case TransactionType.EOACodeEIP7702:
        // [chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList, authorizationList, v, r, s]
        txData.chainId = payload[0]
        txData.nonce = payload[1]
        txData.maxPriorityFeePerGas = payload[2]
        txData.maxFeePerGas = payload[3]
        txData.gasLimit = payload[4]
        txData.to = payload[5]
        txData.value = payload[6]
        txData.data = payload[7]
        txData.accessList = payload[8]
        txData.authorizationList = payload[9]
        txData.v = payload[10]
        txData.r = payload[11]
        txData.s = payload[12]
        break

      default:
        throw EthereumJSErrorWithoutCode(
          `TypedTransaction with ID ${txType} unknown`,
        )
    }

    return fromTxData(txData, opts)
  } else {
    // Legacy transaction: rlp([nonce, gasPrice, gasLimit, to, value, data, v, r, s])
    const values = RLP.decode(data)

    if (!Array.isArray(values)) {
      throw EthereumJSErrorWithoutCode(
        'Invalid serialized tx input. Must be array',
      )
    }

    const [
      nonce,
      gasPrice,
      gasLimit,
      to,
      value,
      data_,
      v,
      r,
      s,
    ] = values as any[]

    return fromTxData(
      {
        nonce,
        gasPrice,
        gasLimit,
        to,
        value,
        data: data_,
        v,
        r,
        s,
      },
      opts,
    )
  }
}

