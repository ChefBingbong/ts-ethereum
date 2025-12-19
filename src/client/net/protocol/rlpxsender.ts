import type { ETH as Devp2pETH } from "../../../devp2p";
import { Sender } from "./sender.ts";

/**
 * DevP2P/RLPx protocol sender
 * @emits message
 * @emits status
 * @memberof module:net/protocol
 */
export class RlpxSender extends Sender {
	private sender: Devp2pETH;

	/**
	 * Creates a new DevP2P/Rlpx protocol sender
	 * @param rlpxProtocol protocol object from @ethereumjs/devp2p
	 */
	constructor(rlpxProtocol: Devp2pETH) {
		super();

		this.sender = rlpxProtocol;
		this.sender.events.on("status", (status: any) => {
			this.status = status;
		});
		this.sender.events.on("message", (code: number, payload: any) => {
			this.emit("message", { code, payload });
		});
	}

	/**
	 * Send a status to peer
	 * @param status
	 */
	sendStatus(status: any) {
		try {
			this.sender.sendStatus(status);
		} catch (err: any) {
			this.emit("error", err);
		}
	}

	/**
	 * Send a message to peer
	 * @param code message code
	 * @param data message payload
	 */
	sendMessage(code: number, data: any) {
		try {
			//@ts-expect-error "type number is not assignable to type never"
			this.sender.sendMessage(code, data);
		} catch (err: any) {
			this.emit("error", err);
		}
	}
}
