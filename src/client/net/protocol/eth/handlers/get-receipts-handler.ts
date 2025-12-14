import * as snappy from "snappyjs";
import { formatLogData } from "../../../../../devp2p/util";
import * as RLP from "../../../../../rlp";
import { bytesToHex, concatBytes } from "../../../../../utils";
import type { TxReceipt } from "../../../../../vm";
import { encodeReceipt } from "../../../../../vm";
import type { VMExecution } from "../../../../execution";
import type { Peer } from "../../../peer/peer.ts";
import { EthMessageCode } from "../definitions.ts";
import type { EthProtocol, Sender } from "../protocol.ts";
import { Handler } from "./base-handler.ts";

export interface GetReceiptsContext {
	execution: VMExecution;
	peer: Peer;
}

export class GetReceiptsHandler extends Handler {
	constructor(protocol: EthProtocol) {
		super(protocol);
	}

	async initiator(payload: any, sender: Sender, timeoutMs = 8000): Promise<TxReceipt[]> {
		return new Promise((resolve, reject) => {
			if (this.protocol.version < 63) {
				reject(new Error(
					`Code ${EthMessageCode.GET_RECEIPTS} not allowed with version ${this.protocol.version}`,
				));
				return;
			}

			const messageDef = this.protocol.spec.messages[EthMessageCode.GET_RECEIPTS];
			if (!messageDef) {
				reject(new Error("GET_RECEIPTS message definition not found"));
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
				const messageName = this.protocol._getMessageName(EthMessageCode.GET_RECEIPTS);
				console.log(`Send ${messageName} message: ${logData}`);
			}

			let encoded = RLP.encode(encodedPayload);
			if ((this.protocol as any).ethSpec.options.useSnappyCompression) {
				encoded = snappy.compress(encoded);
			}

			sender.sendMessage(EthMessageCode.GET_RECEIPTS, encoded);

			const onResponse = (responsePayload: any) => {
				if (responsePayload && Array.isArray(responsePayload) && responsePayload.length >= 2) {
					const responseReqId = responsePayload[0];
					if (responseReqId === reqId) {
						cleanup();
						const receipts = responsePayload[1] || [];
						resolve(receipts);
					}
				}
			};

			const cleanup = () => {
				clearTimeout(timer);
				(this.protocol as any).off(`message:${EthMessageCode.RECEIPTS}`, onResponse);
			};

			const timer = setTimeout(() => {
				cleanup();
				reject(new Error(`GetReceipts timeout after ${timeoutMs}ms`));
			}, timeoutMs);

			(this.protocol as any).on(`message:${EthMessageCode.RECEIPTS}`, onResponse);
		});
	}

	async responder(payload: any, context?: GetReceiptsContext): Promise<void> {
		if (this.protocol.version < 63) {
			return;
		}

		if (!context?.execution || !context?.peer) {
			this.protocol.emit("message", EthMessageCode.GET_RECEIPTS, payload);
			return;
		}

		const [reqId, hashes] = payload;
		const { receiptsManager } = context.execution;
		if (!receiptsManager) return;
		
		const receipts = [];
		let receiptsSize = 0;
		for (const hash of hashes) {
			const blockReceipts = await receiptsManager.getReceipts(
				hash,
				true,
				true,
			);
			if (blockReceipts === undefined) continue;
			receipts.push(...blockReceipts);
			const receiptsBytes = concatBytes(
				...receipts.map((r) => encodeReceipt(r, r.txType)),
			);
			receiptsSize += receiptsBytes.byteLength;
			if (receiptsSize >= 2097152) {
				break;
			}
		}
		context.peer.eth?.send(EthMessageCode.RECEIPTS, { reqId, receipts });
	}
}
