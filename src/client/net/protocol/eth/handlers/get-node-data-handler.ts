import * as snappy from "snappyjs";
import { formatLogData } from "../../../../../devp2p/util";
import * as RLP from "../../../../../rlp";
import { bigIntToUnpaddedBytes, bytesToBigInt, bytesToHex } from "../../../../../utils";
import { EthMessageCode } from "../definitions.ts";
import type { EthProtocol, Sender } from "../protocol.ts";
import { Handler } from "./base-handler.ts";

export class GetNodeDataHandler extends Handler {
	constructor(protocol: EthProtocol) {
		super(protocol);
	}

	async initiator(payload: any, sender: Sender, timeoutMs = 8000): Promise<any[]> {
		return new Promise((resolve, reject) => {
			if (this.protocol.version < 63 || this.protocol.version > 66) {
				reject(new Error(
					`Code ${EthMessageCode.GET_NODE_DATA} not allowed with version ${this.protocol.version}`,
				));
				return;
			}

			const messageDef = this.protocol.spec.messages[EthMessageCode.GET_NODE_DATA];
			if (!messageDef) {
				reject(new Error("GET_NODE_DATA message definition not found"));
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
				const messageName = this.protocol._getMessageName(EthMessageCode.GET_NODE_DATA);
				console.log(`Send ${messageName} message: ${logData}`);
			}

			let encoded = RLP.encode(encodedPayload);
			if ((this.protocol as any).ethSpec.options.useSnappyCompression) {
				encoded = snappy.compress(encoded);
			}

			sender.sendMessage(EthMessageCode.GET_NODE_DATA, encoded);

			const onResponse = (responsePayload: any) => {
				if (responsePayload && Array.isArray(responsePayload) && responsePayload.length >= 2) {
					const responseReqId = responsePayload[0];
					if (responseReqId === reqId) {
						cleanup();
						const data = responsePayload[1] || [];
						resolve(data);
					}
				}
			};

			const cleanup = () => {
				clearTimeout(timer);
				(this.protocol as any).off(`message:${EthMessageCode.NODE_DATA}`, onResponse);
			};

			const timer = setTimeout(() => {
				cleanup();
				reject(new Error(`GetNodeData timeout after ${timeoutMs}ms`));
			}, timeoutMs);

			(this.protocol as any).on(`message:${EthMessageCode.NODE_DATA}`, onResponse);
		});
	}

	async responder(payload: any): Promise<void> {
		if (this.protocol.version < 63 || this.protocol.version > 66) {
			return;
		}

		if (this.protocol.DEBUG) {
			const messageName = this.protocol._getMessageName(EthMessageCode.NODE_DATA);
			console.log(`Received ${messageName} message`);
		}

		this.protocol.emit("message", EthMessageCode.NODE_DATA, payload);
	}
}

