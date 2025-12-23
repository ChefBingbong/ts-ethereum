import {
  EthereumJSErrorWithoutCode,
  fetchFromProvider,
  getProvider,
} from '@ts-ethereum/utils'

import {
  createLegacyTx,
  createLegacyTxFromBytesArray,
  createLegacyTxFromRLP,
} from './legacy/constructors'
import { TransactionType } from './types'
import { normalizeTxParams } from './util/general'

  import type { EthersProvider } from '@ts-ethereum/utils'
import type { LegacyTx } from './legacy/tx'
import type { LegacyTxData, TxOptions } from './types'

/**
 * Create a transaction from a `txData` object
 * Only legacy transactions are supported in this simplified version.
 *
 * @param txData - The transaction data
 * @param txOptions - Options to pass on to the constructor of the transaction
 */
export function createTx(
  txData: LegacyTxData,
  txOptions: TxOptions = {},
): LegacyTx {
  return createLegacyTx(txData, txOptions)
}

/**
 * This method tries to decode serialized data.
 * Only legacy transactions are supported.
 *
 * @param data - The data Uint8Array
 * @param txOptions - The transaction options
 */
export function createTxFromRLP(
  data: Uint8Array,
  txOptions: TxOptions = {},
): LegacyTx {
  if (data[0] <= 0x7f) {
    // Typed transactions are not supported
    throw EthereumJSErrorWithoutCode(
      `Typed transactions are not supported. Only legacy transactions (type 0) are allowed.`,
    )
  }
  return createLegacyTxFromRLP(data, txOptions)
}

/**
 * When decoding a BlockBody, in the transactions field, a field is either:
 * A Uint8Array (a TypedTransaction - not supported)
 * A Uint8Array[] (Legacy Transaction)
 * This method returns the right transaction.
 *
 * @param data - A Uint8Array or Uint8Array[]
 * @param txOptions - The transaction options
 */
export function createTxFromBlockBodyData(
  data: Uint8Array | Uint8Array[],
  txOptions: TxOptions = {},
): LegacyTx {
  if (data instanceof Uint8Array) {
    // Check if it might be a typed transaction
    if (data[0] <= 0x7f) {
      throw EthereumJSErrorWithoutCode(
        `Typed transactions are not supported. Only legacy transactions (type 0) are allowed.`,
      )
    }
    return createTxFromRLP(data, txOptions)
  } else if (Array.isArray(data)) {
    // It is a legacy transaction
    return createLegacyTxFromBytesArray(data, txOptions)
  } else {
    throw EthereumJSErrorWithoutCode(
      'Cannot decode transaction: unknown type input',
    )
  }
}

/**
 * Method to decode data retrieved from RPC, such as `eth_getTransactionByHash`
 * Note that this normalizes some of the parameters
 * @param txData The RPC-encoded data
 * @param txOptions The transaction options
 * @returns A promise that resolves with the instantiated transaction
 */
export async function createTxFromRPC(
  txData: LegacyTxData,
  txOptions: TxOptions = {},
): Promise<LegacyTx> {
  const normalizedData = normalizeTxParams(txData)
  // Verify it's a legacy transaction
  if (
    normalizedData.type !== undefined &&
    normalizedData.type !== TransactionType.Legacy
  ) {
    throw EthereumJSErrorWithoutCode(
      `Only legacy transactions (type 0) are supported. Got type: ${normalizedData.type}`,
    )
  }
  return createTx(normalizedData, txOptions)
}

/**
 *  Method to retrieve a transaction from the provider
 * @param provider - a url string for a JSON-RPC provider or an Ethers JSONRPCProvider object
 * @param txHash - Transaction hash
 * @param txOptions - The transaction options
 * @returns the transaction specified by `txHash`
 */
export async function createTxFromJSONRPCProvider(
  provider: string | EthersProvider,
  txHash: string,
  txOptions?: TxOptions,
): Promise<LegacyTx> {
  const prov = getProvider(provider)
  const txData = await fetchFromProvider(prov, {
    method: 'eth_getTransactionByHash',
    params: [txHash],
  })
  if (txData === null) {
    throw EthereumJSErrorWithoutCode('No data returned from provider')
  }
  return createTxFromRPC(txData, txOptions)
}
