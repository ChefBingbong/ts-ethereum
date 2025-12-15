import * as snappy from "snappyjs";
import type { Block, BlockBodyBytes } from "../../../../../block";
import { formatLogData } from "../../../../../devp2p/util";
import * as RLP from "../../../../../rlp";
import { bytesToHex } from "../../../../../utils";
import type { Chain } from "../../../../blockchain";
import type { Peer } from "../../../peer/peer.ts";
import { EthMessageCode } from "../definitions.ts";
import type { EthProtocol, Sender } from "../protocol.ts";
import { Handler } from "./base-handler.ts";

export interface GetBlockBodiesContext {
	chain: Chain;
	peer: Peer;
}

export class GetBlockBodiesHandler extends Handler {
	constructor(protocol: EthProtocol) {
		super(protocol);
	}

	async initiator(payload: any, sender: Sender, timeoutMs = 8000): Promise<BlockBodyBytes[]> {
		return new Promise((resolve, reject) => {
			if (this.protocol.version < 62) {
				reject(new Error(
					`Code ${EthMessageCode.GET_BLOCK_BODIES} not allowed with version ${this.protocol.version}`,
				));
				return;
			}

			const messageDef = this.protocol.spec.messages[EthMessageCode.GET_BLOCK_BODIES];
			if (!messageDef) {
				reject(new Error("GET_BLOCK_BODIES message definition not found"));
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
				const messageName = this.protocol._getMessageName(EthMessageCode.GET_BLOCK_BODIES);
				console.log(`Send ${messageName} message: ${logData}`);
			}

			let encoded = RLP.encode(encodedPayload);
			if ((this.protocol as any).ethSpec.options.useSnappyCompression) {
				encoded = snappy.compress(encoded);
			}

			sender.sendMessage(EthMessageCode.GET_BLOCK_BODIES, encoded);

			const onResponse = (responsePayload: any) => {
				if (responsePayload && Array.isArray(responsePayload) && responsePayload.length >= 2) {
					const responseReqId = responsePayload[0];
					if (responseReqId === reqId) {
						cleanup();
						const bodies = responsePayload[1] || [];
						resolve(bodies);
					}
				}
			};

			const cleanup = () => {
				clearTimeout(timer);
				(this.protocol as any).off(`message:${EthMessageCode.BLOCK_BODIES}`, onResponse);
			};

			const timer = setTimeout(() => {
				cleanup();
				reject(new Error(`GetBlockBodies timeout after ${timeoutMs}ms`));
			}, timeoutMs);

			(this.protocol as any).on(`message:${EthMessageCode.BLOCK_BODIES}`, onResponse);
		});
	}

	async responder(payload: any, context?: GetBlockBodiesContext): Promise<void> {
		if (this.protocol.version < 62) {
			return;
		}

		if (!context?.chain || !context?.peer) {
			this.protocol.emit("message", EthMessageCode.GET_BLOCK_BODIES, payload);
			return;
		}

		const { reqId, hashes } = payload;
		const blocks: Block[] = await Promise.all(
			hashes.map((hash: Uint8Array) => context.chain.getBlock(hash)),
		);
		const bodies = blocks.map((block) => block.raw().slice(1));
		context.peer.eth!.send(EthMessageCode.BLOCK_BODIES, { reqId, bodies });
	}
}
