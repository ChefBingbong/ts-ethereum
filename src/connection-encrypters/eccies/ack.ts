import { getRandomBytesSync } from "ethereum-cryptography/random";
import { assertEq } from "../../devp2p/index.ts";
import { id2pk, pk2id, unstrictDecode } from "../../devp2p/util.ts";
import { concatBytes } from "../../rlp";
import * as RLP from "../../rlp/index.ts";
import { bytesToInt, intToBytes } from "../../utils/index.ts";
import { decryptMessage, eccieEncryptMessage, ecdhX } from "./crypto.ts";

export type AckResult = {
	remoteEphemeralPublicKey: Uint8Array;
	remoteNonce: Uint8Array;
	ephemeralSharedSecret: Uint8Array;
};

export const createAckEIP8 = (
	ephemeralPublicKey: Uint8Array,
	remotePublicKey: Uint8Array,
	nonce: Uint8Array,
): Uint8Array | undefined => {
	if (!remotePublicKey) return;
	
	const data = [pk2id(ephemeralPublicKey), nonce, Uint8Array.from([0x04])];

	const dataRLP = RLP.encode(data);
	const pad = getRandomBytesSync(100 + Math.floor(Math.random() * 151)); // Random padding between 100, 250
	const ackMsg = concatBytes(dataRLP, pad);
	const overheadLength = 113;
	const sharedMacData = intToBytes(ackMsg.length + overheadLength);
	const encryptedMsg = eccieEncryptMessage(ackMsg, remotePublicKey, sharedMacData);
	if (!encryptedMsg) return;
	return concatBytes(sharedMacData, encryptedMsg);
};

export const createAckOld = (
	ephemeralPublicKey: Uint8Array,
	remotePublicKey: Uint8Array,
	nonce: Uint8Array,
): Uint8Array | undefined => {
	if (!remotePublicKey) return;
	
	const data = concatBytes(
		pk2id(ephemeralPublicKey),
		nonce,
		new Uint8Array([0x00]),
	);
	return eccieEncryptMessage(data, remotePublicKey);
};

export const parseAckPlain = (
	data: Uint8Array,
	privateKey: Uint8Array,
	ephemeralPrivateKey: Uint8Array,
	gotEIP8Ack: boolean,
	sharedMacData: Uint8Array | null = null,
): AckResult => {
	const decrypted = decryptMessage(data, privateKey, sharedMacData);

	let remoteEphemeralPublicKey: Uint8Array;
	let remoteNonce: Uint8Array;

	if (!gotEIP8Ack) {
		assertEq(decrypted.length, 97, "invalid packet length", console.log);
		assertEq(decrypted[96], 0, "invalid postfix", console.log);

		remoteEphemeralPublicKey = id2pk(decrypted.subarray(0, 64));
		remoteNonce = decrypted.subarray(64, 96);
	} else {
		const decoded = unstrictDecode(decrypted) as Uint8Array[];

		remoteEphemeralPublicKey = id2pk(decoded[0]);
		remoteNonce = decoded[1];
	}

	const ephemeralSharedSecret = ecdhX(
		remoteEphemeralPublicKey,
		ephemeralPrivateKey,
	);
	
	return { remoteEphemeralPublicKey, remoteNonce, ephemeralSharedSecret };
};

export const parseAckEIP8 = (
	data: Uint8Array,
	privateKey: Uint8Array,
	ephemeralPrivateKey: Uint8Array,
	gotEIP8Ack: boolean,
): AckResult => {
	const size = bytesToInt(data.subarray(0, 2)) + 2;
	assertEq(
		data.length,
		size,
		`message length different from specified size (EIP8): expected ${size}, got ${data.length}`,
		console.log,
	);
	return parseAckPlain(
		data.subarray(2),
		privateKey,
		ephemeralPrivateKey,
		gotEIP8Ack,
		data.subarray(0, 2),
	);
};
