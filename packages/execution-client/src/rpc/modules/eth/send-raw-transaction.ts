import type { TypedTransaction } from '@ts-ethereum/tx'
import { createTxFromRLP } from '@ts-ethereum/tx'
import type { PrefixedHexString } from '@ts-ethereum/utils'
import {
	BIGINT_0,
	BIGINT_1,
	bytesToHex,
	hexToBytes,
} from '@ts-ethereum/utils'
import { safeError, safeResult } from '@ts-ethereum/utils'
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
      const chainHeight = node.chain.headers.height
      let txTargetHeight = syncTargetHeight ?? BIGINT_0
      if (txTargetHeight <= chainHeight) {
        txTargetHeight = chainHeight + BIGINT_1
      }
      const common = node.config.chainCommon.copy()

      let tx: TypedTransaction
      try {
        const txBuf = hexToBytes(serializedTx)
        tx = createTxFromRLP(txBuf, { common })
      } catch (e: any) {
        return safeError(
          new Error(`serialized tx data could not be parsed (${e.message})`),
        )
      }

      if (!tx.isSigned()) {
        return safeError(new Error('tx needs to be signed'))
      }

      const { txPool } = node

      try {
        await txPool.add(tx, true)
      } catch (error: any) {
        return safeError(new Error(error.message ?? error.toString()))
      }

      const network = node.network
      console.log('network', network.core.getConnectedPeers())
      if (
        network.core.getPeerCount() === 0 &&
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
