import debug from "debug";
import * as RLP from "../../../../rlp/index";
import { bytesToInt, bytesToUtf8, intToBytes, utf8ToBytes } from "../../../../utils";
import { parseBody, parseHeader, sendFrameMessage } from "../utils/frame";
import type { HelloContext, HelloMessage, HelloResult } from "../utils/types";

const log = debug("p2p:ecies:hello-initiator");
const PREFIXES = { HELLO: 0x00 };
const BASE_PROTOCOL_VERSION = 5;

function createHelloPayload(ctx: HelloContext): Uint8Array {
	const payload = [
		intToBytes(BASE_PROTOCOL_VERSION),
		ctx.clientId,
		ctx.capabilities.map((c) => [utf8ToBytes(c.name), intToBytes(c.version)]),
		ctx.port === 0 ? new Uint8Array(0) : intToBytes(ctx.port),
		ctx.id,
	];

	return RLP.encode(payload as never as Uint8Array[]);
}

function parseHelloPayload(data: Uint8Array): HelloMessage {
	const decoded = RLP.decode(data) as any[];

	return {
		protocolVersion: bytesToInt(decoded[0]),
		clientId: bytesToUtf8(decoded[1]),
		capabilities: decoded[2].map((item: any) => ({
			name: bytesToUtf8(item[0]),
			version: bytesToInt(item[1]),
		})),
		port: decoded[3].length > 0 ? bytesToInt(decoded[3]) : 0,
		id: decoded[4],
	};
}

export function sendHelloGetHello(
	ctx: HelloContext,
	timeoutMs = 10000,
): Promise<HelloResult> {
	return new Promise((resolve, reject) => {
		if (
			!ctx.egressAes ||
			!ctx.egressMac ||
			!ctx.ingressAes ||
			!ctx.ingressMac
		) {
			reject(new Error("Frame encryption not initialized"));
			return;
		}

		// Send our HELLO
		const helloPayload = createHelloPayload(ctx);
		const sent = sendFrameMessage(
			ctx.socket,
			ctx.egressAes,
			ctx.egressMac,
			PREFIXES.HELLO,
			helloPayload,
		);

		if (!sent) {
			reject(new Error("Failed to send HELLO"));
			return;
		}

		const localHello = parseHelloPayload(helloPayload);
		log("Sent HELLO (initiator): clientId=%s", localHello.clientId);

		// Wait for peer's HELLO
		let socketData = new Uint8Array(0);
		let state: "header" | "body" = "header";
		let nextPacketSize = 32; // Header size
		let bodySize = 0;

		const onData = (data: Uint8Array) => {
			log("📨 [initiator] Received %d bytes, total buffered: %d, state: %s, nextPacketSize: %d", 
				data.length, socketData.length + data.length, state, nextPacketSize);
			log("📨 [initiator] First 32 bytes of new data: %s", 
				Array.from(data.subarray(0, 32)).map(b => b.toString(16).padStart(2, '0')).join(' '));
			
			socketData = new Uint8Array([...socketData, ...data]);

			try {
				while (socketData.length >= nextPacketSize) {
					if (state === "header") {
						const headerData = socketData.subarray(0, 32);
						log("📨 [initiator] Parsing header: %s", 
							Array.from(headerData).map(b => b.toString(16).padStart(2, '0')).join(' '));
						bodySize = parseHeader(
							ctx.ingressAes!,
							ctx.ingressMac!,
							headerData,
						);

						// Calculate padded body size
						const paddedBodySize = Math.ceil(bodySize / 16) * 16;
						nextPacketSize = paddedBodySize + 16; // body + MAC
						state = "body";
						socketData = socketData.subarray(32);
					} else {
						const bodyData = socketData.subarray(0, nextPacketSize);
						const payload = parseBody(
							ctx.ingressAes!,
							ctx.ingressMac!,
							bodyData,
							bodySize,
						);

						// Parse message code
						const code = payload[0] === 0x80 ? 0 : payload[0];

						if (code === PREFIXES.HELLO) {
							cleanup();
							const remoteHello = parseHelloPayload(payload.subarray(1));
							log("Received HELLO (initiator): clientId=%s", remoteHello.clientId);
							resolve({ localHello, remoteHello });
						} else {
							cleanup();
							reject(
								new Error(`Expected HELLO, got message code ${code}`),
							);
						}
						return;
					}
				}
			} catch (err) {
				cleanup();
				reject(err);
			}
		};

		const onError = (err: Error) => {
			cleanup();
			reject(err);
		};

		const onTimeout = () => {
			cleanup();
			reject(new Error(`HELLO timeout after ${timeoutMs}ms (initiator)`));
		};

		const cleanup = () => {
			clearTimeout(timer);
			ctx.socket.off("data", onData);
			ctx.socket.off("error", onError);
			
			// Validate cleanup
			const remainingDataListeners = ctx.socket.listenerCount("data");
			if (remainingDataListeners > 0) {
				log(`⚠️ [Hello-Initiator] Cleanup: ${remainingDataListeners} data listener(s) still attached after cleanup`);
			} else {
				log(`✅ [Hello-Initiator] Cleanup: All data listeners removed`);
			}
		};

		// Check for leftover listeners before attaching new ones
		const existingDataListeners = ctx.socket.listenerCount("data");
		if (existingDataListeners > 0) {
			log(`⚠️ [Hello-Initiator] Found ${existingDataListeners} existing data listener(s) before attaching HELLO handler`);
		}

		const timer = setTimeout(onTimeout, timeoutMs);
		ctx.socket.on("data", onData);
		ctx.socket.on("error", onError);
	});
}

