import * as snappy from "snappyjs";
import { formatLogData } from "../../../../../devp2p/util";
import * as RLP from "../../../../../rlp";
import { bytesToHex } from "../../../../../utils";
import type { TxPool } from "../../../../service/txpool.ts";
import type { Peer } from "../../../peer/peer.ts";
import type { PeerPool } from "../../../peerpool.ts";
import { EthMessageCode } from "../definitions.ts";
import type { EthProtocol, Sender } from "../protocol.ts";

export interface NewPooledTransactionHashesContext {
	txPool: TxPool;
	peer: Peer;
	peerPool: PeerPool;
}

import { Handler } from "./base-handler.ts";

export class NewPooledTransactionHashesHandler extends Handler {
	constructor(protocol: EthProtocol) {
		super(protocol);
	}

	send(payload: any, sender: Sender): void {
		if (this.protocol.version < 65) {
			throw new Error(
				`Code ${EthMessageCode.NEW_POOLED_TRANSACTION_HASHES} not allowed with version ${this.protocol.version}`,
			);
		}

		if (this.protocol.DEBUG) {
			const logData = formatLogData(
				bytesToHex(RLP.encode(payload)),
				false,
			);
			const messageName = this.protocol._getMessageName(EthMessageCode.NEW_POOLED_TRANSACTION_HASHES);
			console.log(`Send ${messageName} message: ${logData}`);
		}

		let encoded = RLP.encode(payload);
		if ((this.protocol as any).ethSpec.options.useSnappyCompression) {
			encoded = snappy.compress(encoded);
		}

		sender.sendMessage(EthMessageCode.NEW_POOLED_TRANSACTION_HASHES, encoded);
	}

	async handle(payload: any, context?: NewPooledTransactionHashesContext): Promise<void> {
		if (this.protocol.version < 65) {
			return;
		}

		if (this.protocol.DEBUG) {
			const messageName = this.protocol._getMessageName(EthMessageCode.NEW_POOLED_TRANSACTION_HASHES);
			console.log(`Received ${messageName} message`);
		}

		if (context?.txPool && context?.peer && context?.peerPool) {
			let hashes = [];
			if (context.peer.eth!["versions"]?.includes(68)) {
				hashes = payload[2] as Uint8Array[];
			} else {
				hashes = payload;
			}
			await context.txPool.handleAnnouncedTxHashes(hashes, context.peer, context.peerPool);
		}

		this.protocol.emit("message", EthMessageCode.NEW_POOLED_TRANSACTION_HASHES, payload);
	}
}

