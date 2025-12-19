import debug from "debug";
import {
    BufferAccumulator,
    createAuthEIP8,
    createAuthNonEIP8,
    parseAckEIP8,
    parseAckPlain,
    type AckResult,
    type HandlerContext,
} from "../utils";

const log = debug("p2p:ecies:initiator");

export type SendAuthGetAckResult = {
	authMsg: Uint8Array;
	ackMsg: Uint8Array;
	ackResult: AckResult;
	gotEIP8Ack: boolean;
};

function createAuthMessage(ctx: HandlerContext): Uint8Array {
	let authMsg: Uint8Array | undefined;
	if (ctx.requireEip8) {
		authMsg = createAuthEIP8(ctx.remotePublicKey, ctx.privateKey, ctx.nonce, ctx.ephemeralPrivateKey, ctx.publicKey);
	} else {
		authMsg = createAuthNonEIP8(ctx.remotePublicKey!, ctx.privateKey, ctx.nonce, ctx.ephemeralPrivateKey, ctx.ephemeralPublicKey, ctx.publicKey);
	}
	if (!authMsg) throw new Error("Failed to create AUTH message");
	return authMsg;
}

export function sendAuthGetAck(ctx: HandlerContext, timeoutMs = 10000): Promise<SendAuthGetAckResult> {
	return new Promise((resolve, reject) => {
		let authMsg: Uint8Array;
		try {
			authMsg = createAuthMessage(ctx);
		} catch (err) {
			reject(err);
			return;
		}

		const accumulator = new BufferAccumulator(210, (ackPacket, isEIP8) => {
			cleanup();
			try {
				let ackResult: AckResult | null;
				if (isEIP8) {
					ackResult = parseAckEIP8(ackPacket, ctx.privateKey, ctx.ephemeralPrivateKey, true);
				} else {
					ackResult = parseAckPlain(ackPacket, ctx.privateKey, ctx.ephemeralPrivateKey, false);
				}
				if (!ackResult) {
					reject(new Error("Failed to parse ACK"));
					return;
				}
				log("AUTH→ACK complete");
				resolve({ authMsg, ackMsg: ackPacket, ackResult, gotEIP8Ack: isEIP8 });
			} catch (err) {
				reject(err);
			}
		});

		const onData = (data: Uint8Array) => accumulator.onData(data);
		const onError = (err: Error) => { cleanup(); reject(err); };
		const cleanup = () => {
			clearTimeout(timer);
			ctx.socket.off("data", onData);
			ctx.socket.off("error", onError);
		};
		const onTimeout = () => {
			cleanup();
			try { ctx.socket.destroy(); } catch {}
			reject(new Error(`AUTH→ACK timeout after ${timeoutMs}ms`));
		};

		const timer = setTimeout(onTimeout, timeoutMs);
		ctx.socket.on("data", onData);
		ctx.socket.once("error", onError);
		log("Sending AUTH, waiting for ACK...");
		ctx.socket.write(authMsg);
	});
}

