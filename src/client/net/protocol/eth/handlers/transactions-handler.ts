import * as snappy from "snappyjs";
import { formatLogData } from "../../../../../devp2p/util";
import * as RLP from "../../../../../rlp";
import type { TypedTransaction } from "../../../../../tx";
import { bytesToHex } from "../../../../../utils";
import type { TxPool } from "../../../../service/txpool.ts";
import type { Peer } from "../../../peer/peer.ts";
import type { PeerPool } from "../../../peerpool.ts";
import { EthMessageCode } from "../definitions.ts";
import type { EthProtocol, Sender } from "../protocol.ts";
import { Handler } from "./base-handler.ts";

export interface TransactionsContext {
	txPool: TxPool;
	peer: Peer;
	peerPool: PeerPool;
}

export class TransactionsHandler extends Handler {
	constructor(protocol: EthProtocol) {
		super(protocol);
	}

	send(payload: TypedTransaction[], sender: Sender): void {
		if (this.protocol.version < 62) {
			throw new Error(
				`Code ${EthMessageCode.TRANSACTIONS} not allowed with version ${this.protocol.version}`,
			);
		}

		const serializedTxs = payload.map((tx: TypedTransaction) => tx.serialize());
		
		if (this.protocol.DEBUG) {
			const logData = formatLogData(
				bytesToHex(RLP.encode(serializedTxs)),
				false,
			);
			const messageName = this.protocol._getMessageName(EthMessageCode.TRANSACTIONS);
			console.log(`Send ${messageName} message: ${logData}`);
		}

		let encoded = RLP.encode(serializedTxs);
		if ((this.protocol as any).ethSpec.options.useSnappyCompression) {
			encoded = snappy.compress(encoded);
		}

		sender.sendMessage(EthMessageCode.TRANSACTIONS, encoded);
	}

	async handle(payload: TypedTransaction[], context?: TransactionsContext): Promise<void> {
		if (this.protocol.version < 62) {
			return;
		}

		if (this.protocol.DEBUG) {
			const messageName = this.protocol._getMessageName(EthMessageCode.TRANSACTIONS);
			console.log(`Received ${messageName} message`);
		}

		if (context?.txPool && context?.peer && context?.peerPool) {
			await context.txPool.handleAnnouncedTxs(payload, context.peer, context.peerPool);
		}

		this.protocol.emit("message", EthMessageCode.TRANSACTIONS, payload);
	}
}

