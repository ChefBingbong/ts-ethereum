import type crypto from "node:crypto";
import { zfill } from "../../../../devp2p";
import { concatBytes } from "../../../../utils";
import type { MAC } from "../../../transport/rlpx/mac";

type Decipher = crypto.DecipherGCM;

export const BODY_MAC_SIZE = 16;

export function createBody(
	data: Uint8Array,
	egressAes: Decipher,
	egressMac: MAC,
): Uint8Array {
	const paddedSize = Math.ceil(data.length / 16) * 16;
	const paddedData = zfill(data, paddedSize, false) as Uint8Array;
	const encryptedData = Uint8Array.from(egressAes.update(paddedData));
	egressMac.updateBody(encryptedData);
	const tag = Uint8Array.from(egressMac.digest());
	return concatBytes(encryptedData, tag);
}

export function parseBody(
	data: Uint8Array,
	bodySize: number,
	ingressAes: Decipher | null | undefined,
	ingressMac: MAC | null | undefined,
): { bodyPayload: Uint8Array; size: number } | null {
	if (!ingressAes || !ingressMac) {
		throw new Error("ECIES handshake not complete - AES/MAC not available");
	}

	const body = data.subarray(0, -BODY_MAC_SIZE);
	const mac = data.subarray(-BODY_MAC_SIZE);

	ingressMac.updateBody(body);
	const expectedMac = Uint8Array.from(ingressMac.digest());
	if (!compareMac(expectedMac, mac)) throw new Error("Invalid MAC in body");

	const size = bodySize;
	const bodyPayload = Uint8Array.from(ingressAes.update(body)).subarray(0, size);

	return {
		bodyPayload,
		size,
	};
}

function compareMac(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i];
	return result === 0;
}
