import * as snappy from "snappyjs";
import type { BlockHeader } from "../../../../../block";
import { formatLogData } from "../../../../../devp2p/util";
import * as RLP from "../../../../../rlp";
import { bytesToHex } from "../../../../../utils";
import type { Chain } from "../../../../blockchain";
import type { Peer } from "../../../peer/peer.ts";
import { EthMessageCode } from "../definitions.ts";
import type { EthProtocol, Sender } from "../protocol.ts";
import { Handler } from "./base-handler.ts";

export interface GetBlockHeadersContext {
	chain: Chain;
	peer: Peer;
}

export class GetBlockHeadersHandler extends Handler {
	constructor(protocol: EthProtocol) {
		super(protocol);
	}

	async initiator(payload: any, sender: Sender, timeoutMs = 8000): Promise<BlockHeader[]> {
		return new Promise((resolve, reject) => {
			if (this.protocol.version < 62) {
				reject(new Error(
					`Code ${EthMessageCode.GET_BLOCK_HEADERS} not allowed with version ${this.protocol.version}`,
				));
				return;
			}

			const messageDef = this.protocol.spec.messages[EthMessageCode.GET_BLOCK_HEADERS];
			if (!messageDef) {
				reject(new Error("GET_BLOCK_HEADERS message definition not found"));
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
				const messageName = this.protocol._getMessageName(EthMessageCode.GET_BLOCK_HEADERS);
				console.log(`Send ${messageName} message: ${logData}`);
			}

			let encoded = RLP.encode(encodedPayload);
			if ((this.protocol as any).ethSpec.options.useSnappyCompression) {
				encoded = snappy.compress(encoded);
			}

			sender.sendMessage(EthMessageCode.GET_BLOCK_HEADERS, encoded);

			const onResponse = (responsePayload: any) => {
				if (responsePayload && Array.isArray(responsePayload) && responsePayload.length >= 2) {
					const responseReqId = responsePayload[0];
					if (responseReqId === reqId) {
						cleanup();
						const headers = responsePayload[1] || [];
						resolve(headers);
					}
				}
			};

			const cleanup = () => {
				clearTimeout(timer);
				(this.protocol as any).off(`message:${EthMessageCode.BLOCK_HEADERS}`, onResponse);
			};

			const timer = setTimeout(() => {
				cleanup();
				reject(new Error(`GetBlockHeaders timeout after ${timeoutMs}ms`));
			}, timeoutMs);

			(this.protocol as any).on(`message:${EthMessageCode.BLOCK_HEADERS}`, onResponse);
		});
	}

	async responder(payload: any, context?: GetBlockHeadersContext): Promise<void> {
		if (this.protocol.version < 62) {
			return;
		}

		if (!context?.chain || !context?.peer) {
			this.protocol.emit("message", EthMessageCode.GET_BLOCK_HEADERS, payload);
			return;
		}

		const { reqId, block, max, skip, reverse } = payload;
		
		if (typeof block === "bigint") {
			if (
				(reverse === true && block > context.chain.headers.height) ||
				(reverse !== true &&
					block + BigInt(max * skip) > context.chain.headers.height)
			) {
				context.peer.eth!.send(EthMessageCode.BLOCK_HEADERS, { reqId, headers: [] });
				return;
			}
		}
		
		const headers = await context.chain.getHeaders(block, max, skip, reverse);
		context.peer.eth!.send(EthMessageCode.BLOCK_HEADERS, { reqId, headers });
	}
}
