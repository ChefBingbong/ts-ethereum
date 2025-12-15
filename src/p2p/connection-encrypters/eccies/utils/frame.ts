import type * as crypto from "crypto";
import type { Socket } from "node:net";
import * as RLP from "../../../../rlp/index";
import { bytesToInt, concatBytes, intToBytes } from "../../../../utils";
import type { MAC } from "../../../transport/rlpx/mac";

type Decipher = crypto.DecipherGCM;

export function createBlockHeader(
	egressAes: Decipher,
	egressMac: MAC,
	bodySize: number,
): Uint8Array {
	// Pad size to 3 bytes
	const bufSize = new Uint8Array(3);
	const sizeBytes = intToBytes(bodySize);
	bufSize.set(sizeBytes, 3 - sizeBytes.length);

	const headerData = RLP.encode([0, 0]); // capability-id, context-id (unused)
	let header = concatBytes(bufSize, headerData);

	// Pad to 16 bytes
	if (header.length < 16) {
		const padding = new Uint8Array(16 - header.length);
		header = concatBytes(header, padding);
	}

	// Encrypt header
	const encryptedHeader = Uint8Array.from(egressAes.update(header));

	// Add MAC
	egressMac.updateHeader(encryptedHeader);
	const tag = Uint8Array.from(egressMac.digest());

	return concatBytes(encryptedHeader, tag); // 32 bytes total
}

export function createBody(
	egressAes: Decipher,
	egressMac: MAC,
	data: Uint8Array,
): Uint8Array {
	// Pad to 16-byte boundary
	const paddedLength = Math.ceil(data.length / 16) * 16;
	let paddedData = data;
	if (data.length < paddedLength) {
		const padding = new Uint8Array(paddedLength - data.length);
		paddedData = concatBytes(data, padding);
	}

	// Encrypt body
	const encryptedBody = Uint8Array.from(egressAes.update(paddedData));

	// Add MAC
	egressMac.updateBody(encryptedBody);
	const tag = Uint8Array.from(egressMac.digest());

	return concatBytes(encryptedBody, tag);
}

export function sendFrameMessage(
	socket: Socket,
	egressAes: Decipher,
	egressMac: MAC,
	code: number,
	data: Uint8Array,
): boolean {
	if (socket.destroyed) return false;

	const msg = concatBytes(RLP.encode(code), data);

	const header = createBlockHeader(egressAes, egressMac, msg.length);
	const body = createBody(egressAes, egressMac, msg);
	
	console.log("[sendFrameMessage] code:", code, "payload:", data.length, "total frame:", header.length + body.length);
	console.log("[sendFrameMessage] header first 16 bytes:", Array.from(header.subarray(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' '));
	
	socket.write(header);
	socket.write(body);

	return true;
}

export function parseHeader(
	ingressAes: Decipher,
	ingressMac: MAC,
	data: Uint8Array,
): number {
	const header = data.subarray(0, 16);
	const mac = data.subarray(16, 32);

	// Verify MAC
	ingressMac.updateHeader(header);
	const computedMac = Uint8Array.from(ingressMac.digest());
	if (!computedMac.every((byte, i) => byte === mac[i])) {
		throw new Error("Invalid MAC in header");
	}

	// Decrypt header
	const decryptedHeader = Uint8Array.from(ingressAes.update(header));
	const bodySize = bytesToInt(decryptedHeader.subarray(0, 3));

	return bodySize;
}

export function parseBody(
	ingressAes: Decipher,
	ingressMac: MAC,
	data: Uint8Array,
	bodySize: number,
): Uint8Array {
	const body = data.subarray(0, -16);
	const mac = data.subarray(-16);

	// Verify MAC
	ingressMac.updateBody(body);
	const computedMac = Uint8Array.from(ingressMac.digest());
	if (!computedMac.every((byte, i) => byte === mac[i])) {
		throw new Error("Invalid MAC in body");
	}

	// Decrypt body
	const decryptedBody = Uint8Array.from(ingressAes.update(body));

	return decryptedBody.subarray(0, bodySize);
}

