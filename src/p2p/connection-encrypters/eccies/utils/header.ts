import type crypto from "node:crypto";
import { zfill } from "../../../../devp2p";
import * as RLP from "../../../../rlp";
import { bytesToInt, concatBytes, intToBytes } from "../../../../utils";
import { MAC } from "../../../transport/rlpx";

type Decipher = crypto.DecipherGCM;

export const HEADER_SIZE = 32;

export function createHeader(size: number, egressAes: Decipher, egressMac: MAC): Uint8Array {
	const bufSize = zfill(intToBytes(size), 3);
	const headerData = RLP.encode([0, 0]);
	const headerConcat = concatBytes(bufSize, headerData);
	let header: Uint8Array = new Uint8Array(zfill(headerConcat, 16, false));
	header = Uint8Array.from(egressAes.update(header));
	egressMac.updateHeader(header);
	const tag = Uint8Array.from(egressMac.digest());
	return concatBytes(header, tag);
}

export function parseHeader(data: Uint8Array, ingressAes: Decipher, ingressMac: MAC) {
	if (data.length < HEADER_SIZE) throw new Error(`Header too short: ${data.length}`);

	let header = data.subarray(0, 16);
	const mac = data.subarray(16, 32);

	ingressMac.updateHeader(header);
	const expectedMac = Uint8Array.from(ingressMac.digest());
	if (!compareMac(expectedMac, mac)) throw new Error("Invalid MAC in header");

	header = Uint8Array.from(ingressAes.update(header));
	const bodySize = bytesToInt(header.subarray(0, 3));
	const paddedBodySize = Math.ceil(bodySize / 16) * 16;

	return { bodySize, paddedBodySize };
}
function compareMac(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i];
	return result === 0;
}

