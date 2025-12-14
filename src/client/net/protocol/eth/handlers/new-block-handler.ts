import * as snappy from "snappyjs";
import { formatLogData } from "../../../../../devp2p/util";
import * as RLP from "../../../../../rlp";
import { bytesToHex } from "../../../../../utils";
import type { FullSynchronizer } from "../../../../sync";
import type { Peer } from "../../../peer/peer.ts";
import type { EthProtocol, Sender } from "../protocol.ts";
import { EthMessageCode } from "../definitions.ts";
import { Handler } from "./base-handler.ts";

export interface NewBlockContext {
	synchronizer?: FullSynchronizer;
	peer: Peer;
}

export class NewBlockHandler extends Handler {
	constructor(protocol: EthProtocol) {
		super(protocol);
	}

	send(payload: any, sender: Sender): void {
		if (this.protocol.version < 62) {
			throw new Error(
				`Code ${EthMessageCode.NEW_BLOCK} not allowed with version ${this.protocol.version}`,
			);
		}

		if (this.protocol.DEBUG) {
			const logData = formatLogData(
				bytesToHex(RLP.encode(payload)),
				false,
			);
			const messageName = this.protocol._getMessageName(EthMessageCode.NEW_BLOCK);
			console.log(`Send ${messageName} message: ${logData}`);
		}

		let encoded = RLP.encode(payload);
		if ((this.protocol as any).ethSpec.options.useSnappyCompression) {
			encoded = snappy.compress(encoded);
		}

		sender.sendMessage(EthMessageCode.NEW_BLOCK, encoded);
	}

	async handle(payload: any, context?: NewBlockContext): Promise<void> {
		if (this.protocol.version < 62) {
			return;
		}

		if (this.protocol.DEBUG) {
			const messageName = this.protocol._getMessageName(EthMessageCode.NEW_BLOCK);
			console.log(`Received ${messageName} message`);
		}

		if (context?.synchronizer && context?.peer) {
			this.protocol.config.logger?.info(
				`📦 Handling NewBlock message: height=${payload[0].header.number}, peer=${context.peer?.id?.slice(0, 8) || 'null'}`,
			);
			await context.synchronizer.handleNewBlock(payload[0], context.peer);
		}

		this.protocol.emit("message", EthMessageCode.NEW_BLOCK, payload);
	}
}

