import * as snappy from "snappyjs";
import { formatLogData } from "../../../../../devp2p/util";
import * as RLP from "../../../../../rlp";
import { bytesToHex } from "../../../../../utils";
import type { FullSynchronizer } from "../../../../sync";
import type { EthProtocol, Sender } from "../protocol.ts";
import { EthMessageCode } from "../definitions.ts";
import { Handler } from "./base-handler.ts";

export interface NewBlockHashesContext {
	synchronizer?: FullSynchronizer;
}

export class NewBlockHashesHandler extends Handler {
	constructor(protocol: EthProtocol) {
		super(protocol);
	}

	send(payload: any, sender: Sender): void {
		if (this.protocol.version < 62) {
			throw new Error(
				`Code ${EthMessageCode.NEW_BLOCK_HASHES} not allowed with version ${this.protocol.version}`,
			);
		}

		if (this.protocol.DEBUG) {
			const logData = formatLogData(
				bytesToHex(RLP.encode(payload)),
				false,
			);
			const messageName = this.protocol._getMessageName(EthMessageCode.NEW_BLOCK_HASHES);
			console.log(`Send ${messageName} message: ${logData}`);
		}

		let encoded = RLP.encode(payload);
		if ((this.protocol as any).ethSpec.options.useSnappyCompression) {
			encoded = snappy.compress(encoded);
		}

		sender.sendMessage(EthMessageCode.NEW_BLOCK_HASHES, encoded);
	}

	handle(payload: any, context?: NewBlockHashesContext): void {
		if (this.protocol.version < 62) {
			return;
		}

		if (this.protocol.DEBUG) {
			const messageName = this.protocol._getMessageName(EthMessageCode.NEW_BLOCK_HASHES);
			console.log(`Received ${messageName} message`);
		}

		if (context?.synchronizer) {
			context.synchronizer.handleNewBlockHashes(payload);
		}

		this.protocol.emit("message", EthMessageCode.NEW_BLOCK_HASHES, payload);
	}
}

