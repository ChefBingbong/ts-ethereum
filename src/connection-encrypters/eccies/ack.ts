import { getRandomBytesSync } from "ethereum-cryptography/random";
import { id2pk, pk2id, unstrictDecode } from "../../devp2p/util.ts";
import { assertEq } from "../../kademlia/message.ts";
import { concatBytes } from "../../rlp";
import * as RLP from "../../rlp/index.ts";
import { bytesToInt, intToBytes } from "../../utils/index.ts";
import { decryptMessage, eccieEncryptMessage, ecdhX } from "./crypto.ts";

export const createAckEIP8 = (
	ephemeralPublicKey: Uint8Array,
	remoteInitMsg: Uint8Array,
	nonce: Uint8Array,
): Uint8Array | undefined => {
	const data = [pk2id(ephemeralPublicKey), nonce, Uint8Array.from([0x04])];

	const dataRLP = RLP.encode(data);
	const pad = getRandomBytesSync(100 + Math.floor(Math.random() * 151)); // Random padding between 100, 250
	const ackMsg = concatBytes(dataRLP, pad);
	const overheadLength = 113;
	const sharedMacData = intToBytes(ackMsg.length + overheadLength);
	const encryptedMsg = eccieEncryptMessage(ackMsg, sharedMacData);
	if (!encryptedMsg) return;
	const initMsg = concatBytes(sharedMacData, encryptedMsg);

	if (!remoteInitMsg) return;
	setupFrame(remoteInitMsg, true);
	return initMsg;
};

export const createAckOld = (
	ephemeralPublicKey: Uint8Array,
	remoteInitMsg: Uint8Array,
	nonce: Uint8Array,
): Uint8Array | undefined => {
	const data = concatBytes(
		pk2id(ephemeralPublicKey),
		nonce,
		new Uint8Array([0x00]),
	);
	const initMsg = eccieEncryptMessage(data, remoteInitMsg);

	if (!remoteInitMsg) return;
	setupFrame(remoteInitMsg, true);
	return initMsg;
};

export const parseAckPlain = (
	data: Uint8Array,
	privateKey: Uint8Array,
	ephemeralPrivateKey: Uint8Array,
	gotEIP8Ack: boolean,
	sharedMacData: Uint8Array | null = null,
) => {
	const decrypted = decryptMessage(data, privateKey, sharedMacData);

	let remoteEphemeralPublicKey = null;
	let remoteNonce = null;

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

	// parse packet

	const ephemeralSharedSecret = ecdhX(
		remoteEphemeralPublicKey,
		ephemeralPrivateKey,
	);
	setupFrame(concatBytes(sharedMacData ?? new Uint8Array([]), data), false);
	return { remoteEphemeralPublicKey, remoteNonce, ephemeralSharedSecret };
};

export const parseAckEIP8 = (
	data: Uint8Array,
	privateKey: Uint8Array,
	gotEIP8Ack: boolean,
	ephemeralPrivateKey: Uint8Array,
): void => {
	const size = bytesToInt(data.subarray(0, 2)) + 2;
	assertEq(
		data.length,
		size,
		"message length different from specified size (EIP8)",
		console.log,
	);
	parseAckPlain(
		data.subarray(2),
		privateKey,
		ephemeralPrivateKey,
		gotEIP8Ack,
		data.subarray(0, 2),
	);
};
