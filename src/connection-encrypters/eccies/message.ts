import { zfill } from "../../devp2p/util.ts";
import { assertEq } from "../../kademlia/message.ts";
import * as RLP from "../../rlp/index.ts";
import { bytesToInt, concatBytes, intToBytes } from "../../utils/index.ts";

export const createBlockHeader = (
	size: number,
	egressAes: any,
	egressMac: any,
): Uint8Array | undefined => {
	const bufSize = zfill(intToBytes(size), 3);
	const headerData = RLP.encode([0, 0]); // [capability-id, context-id] (currently unused in spec)
	let header = concatBytes(bufSize, headerData);
	header = zfill(header, 16, false) as Uint8Array<ArrayBuffer>;
	if (!egressAes) return;
	header = Uint8Array.from(egressAes.update(header));

	if (!egressMac) return;
	egressMac.updateHeader(header);
	const tag = Uint8Array.from(egressMac.digest());

	return concatBytes(header, tag);
};

export const parseHeader = (
	data: Uint8Array,
	bodySize: number,
	ingressAes: any,
	ingressMac: any,
): number | undefined => {
	// parse header
	let header = data.subarray(0, 16);
	const mac = data.subarray(16, 32);

	if (!ingressMac) return;
	ingressMac.updateHeader(header);
	const _mac = Uint8Array.from(ingressMac.digest());
	assertEq(_mac, mac, "Invalid MAC", console.log);

	if (!ingressAes) return;
	header = Uint8Array.from(ingressAes.update(header));
	bodySize = bytesToInt(header.subarray(0, 3));
	return bodySize;
};

export const createBody = (
	data: Uint8Array,
	egressAes: any,
	egressMac: any,
): Uint8Array | undefined => {
	data = zfill(data, Math.ceil(data.length / 16) * 16, false);
	if (!egressAes) return;
	const encryptedData = Uint8Array.from(egressAes.update(data));

	if (!egressMac) return;
	egressMac.updateBody(encryptedData);
	const tag = Uint8Array.from(egressMac.digest());
	return concatBytes(encryptedData, tag);
};

export const parseBody = (
	data: Uint8Array,
	bodySize: number,
	ingressAes: any,
	ingressMac: any,
): Uint8Array | undefined => {
	const body = data.subarray(0, -16);
	const mac = data.subarray(-16);

	if (!ingressMac) return;
	ingressMac.updateBody(body);
	const _mac = Uint8Array.from(ingressMac.digest());
	assertEq(_mac, mac, "Invalid MAC", console.log);

	const size = bodySize;

	if (!ingressAes) return;
	return Uint8Array.from(ingressAes.update(body)).subarray(0, size);
};
