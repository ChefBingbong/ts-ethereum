import {
  createBlob4844TxFromSerializedNetworkWrapper,
  createTxFromRLP,
  NetworkWrapperType,
} from '@ts-ethereum/tx'
import type { PrefixedHexString } from '@ts-ethereum/utils'
import {
  BIGINT_0,
  BIGINT_1,
  bytesToHex,
  hexToBytes,
  safeError,
  safeResult,
} from '@ts-ethereum/utils'
import type { ExecutionNode } from '../../../node/index'
import { createRpcMethod } from '../../validation'
import { sendRawTransactionSchema } from './schema'

export const sendRawTransaction = (node: ExecutionNode) => {
  return createRpcMethod(
    sendRawTransactionSchema,
    async (params: [PrefixedHexString], _c) => {
      const [serializedTx] = params

      const syncTargetHeight = node.synchronizer.syncTargetHeight
      if (!node.synchronizer.synchronized) {
        return safeError(
          new Error(
            'node is not aware of the current chain height yet (give sync some more time)',
          ),
        )
      }
      const common = node.config.chainCommon.copy()

      const chainHeight = node.chain.headers.height
      let txTargetHeight = syncTargetHeight ?? BIGINT_0
      if (txTargetHeight <= chainHeight) {
        txTargetHeight = chainHeight + BIGINT_1
      }

      common.setHardforkBy({
        blockNumber: txTargetHeight,
        timestamp: Math.floor(Date.now() / 1000),
      })

      let tx
      try {
        const txBuf = hexToBytes(serializedTx)
        if (txBuf[0] === 0x03) {
          // Blob Transactions sent over RPC are expected to be in Network Wrapper format
          tx = createBlob4844TxFromSerializedNetworkWrapper(txBuf, { common })
          if (
            common.isActivatedEIP(7594) &&
            tx.networkWrapperVersion !== NetworkWrapperType.EIP7594
          ) {
            return safeError(
              new Error(
                `tx with networkWrapperVersion=${tx.networkWrapperVersion} sent for EIP-7594 activated hardfork=${common.hardfork()}`,
              ),
            )
          }

          const blobGasLimit = tx.common.param('maxBlobGasPerBlock')
          const blobGasPerBlob = tx.common.param('blobGasPerBlob')

          if (BigInt((tx.blobs ?? []).length) * blobGasPerBlob > blobGasLimit) {
            return safeError(
              new Error(
                `tx blobs=${(tx.blobs ?? []).length} exceeds block limit=${
                  blobGasLimit / blobGasPerBlob
                }`,
              ),
            )
          }
        } else {
          tx = createTxFromRLP(txBuf, { common })
        }
      } catch (e: any) {
        return safeError(
          new Error(`serialized tx data could not be parsed (${e.message})`),
        )
      }

      if (!tx.isSigned()) {
        return safeError(new Error('tx needs to be signed'))
      }

      // Add the tx to own tx pool
      const txPool = node.txPool

      try {
        await txPool.add(tx, true)
      } catch (error: any) {
        return safeError(new Error(error.message))
      }

      const peerCount = node.network.core.getPeerCount()
      if (
        peerCount === 0 &&
        !node.config.options.mine &&
        node.config.options.isSingleNode === false
      ) {
        return safeError(new Error('no peer connection available'))
      }
      txPool.broadcastTransactions([tx])

      return safeResult(bytesToHex(tx.hash()))
    },
  )
}
