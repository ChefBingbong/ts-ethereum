import * as snappy from "snappyjs";
import { formatLogData } from "../../../../../devp2p/util";
import * as RLP from "../../../../../rlp";
import type { TypedTransaction } from "../../../../../tx";
import { bytesToHex } from "../../../../../utils";
import type { TxPool } from "../../../../service/txpool.ts";
import type { Peer } from "../../../peer/peer.ts";
import { EthMessageCode } from "../definitions.ts";
import type { EthProtocol, Sender } from "../protocol.ts";
import { Handler } from "./base-handler.ts";

export interface GetPooledTransactionsContext {
	txPool: TxPool;
	peer: Peer;
}

export class GetPooledTransactionsHandler extends Handler {
	constructor(protocol: EthProtocol) {
		super(protocol);
	}

	async initiator(payload: any, sender: Sender, timeoutMs = 8000): Promise<TypedTransaction[]> {
		return new Promise((resolve, reject) => {
			if (this.protocol.version < 65) {
				reject(new Error(
					`Code ${EthMessageCode.GET_POOLED_TRANSACTIONS} not allowed with version ${this.protocol.version}`,
				));
				return;
			}

			const messageDef = this.protocol.spec.messages[EthMessageCode.GET_POOLED_TRANSACTIONS];
			if (!messageDef) {
				reject(new Error("GET_POOLED_TRANSACTIONS message definition not found"));
				return;
			}

			const reqId = payload.reqId ?? ++this.protocol.nextReqId;
			const requestPayload = { ...payload, reqId };

			const encodedPayload = messageDef.encode(requestPayload, { value: this.protocol.nextReqId });
			
			if (this.protocol.DEBUG) {
				const logData = formatLogData(
					bytesToHex(RLP.encode(encodedPayload)),
					false,
				);
				const messageName = this.protocol._getMessageName(EthMessageCode.GET_POOLED_TRANSACTIONS);
				console.log(`Send ${messageName} message: ${logData}`);
			}

			let encoded = RLP.encode(encodedPayload);
			if ((this.protocol as any).ethSpec.options.useSnappyCompression) {
				encoded = snappy.compress(encoded);
			}

			sender.sendMessage(EthMessageCode.GET_POOLED_TRANSACTIONS, encoded);

			const onResponse = (responsePayload: any) => {
				if (responsePayload && Array.isArray(responsePayload) && responsePayload.length >= 2) {
					const responseReqId = responsePayload[0];
					if (responseReqId === reqId) {
						cleanup();
						const txs = responsePayload[1] || [];
						resolve(txs);
					}
				}
			};

			const cleanup = () => {
				clearTimeout(timer);
				(this.protocol as any).off(`message:${EthMessageCode.POOLED_TRANSACTIONS}`, onResponse);
			};

			const timer = setTimeout(() => {
				cleanup();
				reject(new Error(`GetPooledTransactions timeout after ${timeoutMs}ms`));
			}, timeoutMs);

			(this.protocol as any).on(`message:${EthMessageCode.POOLED_TRANSACTIONS}`, onResponse);
		});
	}

	async responder(payload: any, context?: GetPooledTransactionsContext): Promise<void> {
		if (this.protocol.version < 65) {
			return;
		}

		if (!context?.txPool || !context?.peer) {
			this.protocol.emit("message", EthMessageCode.GET_POOLED_TRANSACTIONS, payload);
			return;
		}

		const { reqId, hashes } = payload;
		const txs = context.txPool.getByHash(hashes);
		context.peer.eth?.send(EthMessageCode.POOLED_TRANSACTIONS, { reqId, txs });
	}
}
