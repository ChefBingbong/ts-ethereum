import * as snappy from "snappyjs";
import * as RLP from "../../../../../rlp";
import {
	BIGINT_0,
	bigIntToBytes,
	bigIntToUnpaddedBytes,
	hexToBytes,
	intToBytes,
	isHexString,
} from "../../../../../utils";
import type { EthProtocol, EthStatusMsg, Sender } from "../protocol.ts";
import { Handler } from "./base-handler.ts";

export class StatusHandler extends Handler {
	constructor(protocol: EthProtocol) {
		super(protocol);
	}

	async handshakeInitiator(
		payload: any,
		sender: Sender,
		timeoutMs = 8000,
	): Promise<any> {
		return new Promise((resolve, reject) => {
			// Check if STATUS was already sent as initiator (not as responder)
			// If _statusSentAsResponder is true, it means we sent STATUS as a response to inbound handshake
			// In that case, we should skip the initiator handshake
			if ((this.protocol as any)._statusRaw !== null) {
				// STATUS was already sent - check if it was as responder
				if ((this.protocol as any)._statusSentAsResponder) {
					// We already sent STATUS as responder, so handshake is complete
					// Just resolve with the existing peer status if available
					// Note: peerStatus is already decoded, so we return it directly
					if (this.protocol.peerStatus !== null) {
						this.protocol.config.logger?.debug(
							`[StatusHandler] STATUS already sent as responder, handshake complete`,
						);
						// peerStatus is already decoded (EthStatusMsg), so return it directly
						// The decode() method expects raw bytes, but peerStatus is already decoded
						resolve(this.protocol.peerStatus);
						return;
					}
				} else {
					// STATUS was sent as initiator, can't send again
					reject(new Error("STATUS already sent"));
					return;
				}
			}

			const statusOpts = payload;
			const status: EthStatusMsg = [
				intToBytes(this.protocol.version),
				bigIntToBytes(this.protocol.chain.chainId),
				bigIntToUnpaddedBytes(statusOpts.td),
				statusOpts.bestHash,
				statusOpts.genesisHash,
			];

			if (this.protocol.version >= 64) {
				if (statusOpts.latestBlock) {
					const latestBlock = statusOpts.latestBlock;
					if (latestBlock < this.protocol.latestBlock) {
						reject(
							new Error(
								"latest block provided is not matching the HF setting of the Common instance",
							),
						);
						return;
					}
					this.protocol.latestBlock = latestBlock;
				}
				const forkHashB = hexToBytes(
					isHexString(this.protocol.forkHash)
						? this.protocol.forkHash
						: `0x${this.protocol.forkHash}`,
				);
				const nextForkB =
					this.protocol.nextForkBlock === BIGINT_0
						? new Uint8Array()
						: bigIntToBytes(this.protocol.nextForkBlock);
				status.push([forkHashB, nextForkB]);
			}

			(this.protocol as any)._statusRaw = status;
			// Mark that we're sending STATUS as initiator (not responder)
			(this.protocol as any)._statusSentAsResponder = false;

			if (this.protocol.DEBUG) {
				const statusStr = this.protocol._getStatusString(status);
				console.log(
					`Send STATUS message (eth${this.protocol.version}): ${statusStr}`,
				);
			}

			let encoded = RLP.encode(status);
			if ((this.protocol as any).ethSpec.options.useSnappyCompression) {
				encoded = snappy.compress(encoded);
			}

			sender.sendStatus(status);
			this.protocol.config.logger?.debug(
				`[StatusHandler] 📤 STATUS message sent, waiting for peer STATUS response...`,
			);

			const onPeerStatus = (peerStatus: any) => {
				cleanup();
				this.protocol.config.logger?.debug(
					`[StatusHandler] 📥 Received peer STATUS response`,
				);
				this.protocol._handleStatus();
				resolve(this.protocol.spec.messages[0].decode(peerStatus));
			};

			const cleanup = () => {
				clearTimeout(timer);
				// Note: once() listeners automatically remove themselves after firing
				// No need to manually remove - if timeout occurs, the listener will remain
				// but won't cause issues since it only fires once anyway
			};

			const timer = setTimeout(() => {
				cleanup();
				reject(new Error(`STATUS handshake timeout after ${timeoutMs}ms`));
			}, timeoutMs);

			if (sender.status !== undefined && sender.status !== null) {
				onPeerStatus(sender.status);
			} else {
				sender.once("status", onPeerStatus);
			}
		});
	}

	async handshakeResponder(payload: any): Promise<void> {
		if (this.protocol.peerStatus !== null) {
			throw new Error("Uncontrolled status message");
		}
		this.protocol.peerStatus = payload as EthStatusMsg;
		this.protocol.config.logger?.debug(
			`[StatusHandler] 📥 Received STATUS message from peer, handling...`,
		);
		if (this.protocol.DEBUG) {
			const statusStr = this.protocol._getStatusString(
				this.protocol.peerStatus,
			);
			console.log(`Received STATUS message: ${statusStr}`);
		}
		this.protocol._handleStatus();
		this.protocol.config.logger?.debug(
			`[StatusHandler] ✅ STATUS handling complete`,
		);
	}
}
