import { keccak224, keccak256 } from "ethereum-cryptography/keccak";
import { getRandomBytesSync } from "ethereum-cryptography/random.js";
import { ecdsaRecover } from "ethereum-cryptography/secp256k1-compat";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import { id2pk, pk2id, unstrictDecode, xor } from "../../devp2p/util.ts";
import { assertEq } from "../../kademlia/message.ts";
import * as RLP from "../../rlp/index.ts";
import {
	bigIntToBytes,
	bytesToInt,
	concatBytes,
	intToBytes,
	setLengthLeft,
} from "../../utils/index.ts";
import { decryptMessage, eccieEncryptMessage, ecdhX } from "./crypto.ts";

const OVERHEAD_LENGTH = 113;

export const createAuthEIP8 = (
	remotePubKey: Uint8Array,
	privateKey: Uint8Array,
	nonce: Uint8Array,
	ephemeralPrivateKey: Uint8Array,
	publicKey: Uint8Array,
) => {
	console.log("createAuthEIP8", { remotePubKey, privateKey, nonce });
	if (!remotePubKey) return;
	const x = ecdhX(remotePubKey, privateKey);
	const sig = secp256k1.sign(xor(x, nonce), ephemeralPrivateKey);
	const data = [
		concatBytes(
			setLengthLeft(bigIntToBytes(sig.r), 32),
			setLengthLeft(bigIntToBytes(sig.s), 32),
			Uint8Array.from([sig.recovery]),
		),
		pk2id(publicKey),
		nonce,
		Uint8Array.from([0x04]),
	];

	const pad = getRandomBytesSync(100 + Math.floor(Math.random() * 151));
	const authMsg = concatBytes(RLP.encode(data), pad);

	const sharedMacData = intToBytes(authMsg.length + OVERHEAD_LENGTH);
	const encryptedMsg = eccieEncryptMessage(authMsg, remotePubKey);
	return concatBytes(sharedMacData, encryptedMsg);
};

export const createAuthNonEIP8 = (
	remotePubKey: Uint8Array,
	privateKey: Uint8Array,
	nonce: Uint8Array,
	ephemeralPrivateKey: Uint8Array,
	ephemeralPublicKey: Uint8Array,
	publicKey: Uint8Array,
): Uint8Array | undefined => {
	const ecciesEcdh = xor(ecdhX(remotePubKey, privateKey), nonce);
	const sig = secp256k1.sign(ecciesEcdh, ephemeralPrivateKey);

	return eccieEncryptMessage(
		concatBytes(
			bigIntToBytes(sig.r),
			bigIntToBytes(sig.s),
			Uint8Array.from([sig.recovery]),
			keccak224(pk2id(ephemeralPublicKey)),
			pk2id(publicKey),
			nonce,
			Uint8Array.from([0x00]),
		),
		remotePubKey,
	);
};

export const parseAuthPlain = (
	data: Uint8Array,
	remoteInitMsg: Uint8Array,
	privateKey: Uint8Array,
	ephemeralPrivateKey: Uint8Array,
	gotEIP8Auth: boolean,
	sharedMacData: Uint8Array | null = null,
) => {
	const prefix = sharedMacData ?? new Uint8Array();
	remoteInitMsg = concatBytes(prefix, data);
	const decrypted = decryptMessage(data, sharedMacData);

	let signature = null;
	let recoveryId = null;
	let heId = null;
	let remotePublicKey = null;
	let nonce = null;

	if (!gotEIP8Auth) {
		signature = decrypted.subarray(0, 64);
		recoveryId = decrypted[64];
		heId = decrypted.subarray(65, 97); // 32 bytes
		remotePublicKey = id2pk(decrypted.subarray(97, 161));
		nonce = decrypted.subarray(161, 193);
	} else {
		const decoded = unstrictDecode(decrypted) as Uint8Array[];
		signature = decoded[0].subarray(0, 64);
		recoveryId = decoded[0][64];
		remotePublicKey = id2pk(decoded[1]);
		nonce = decoded[2];
	}

	const x = ecdhX(remotePublicKey, privateKey);

	if (nonce === null) {
		return;
	}
	const remoteEphemeralPublicKey = ecdsaRecover(
		signature,
		recoveryId,
		xor(x, nonce),
		false,
	);

	const ephemeralSharedSecret = ecdhX(
		remoteEphemeralPublicKey,
		ephemeralPrivateKey,
	);
	if (heId !== null && remoteEphemeralPublicKey !== null) {
		assertEq(
			keccak256(pk2id(remoteEphemeralPublicKey)),
			heId,
			"the hash of the ephemeral key should match",
			console.log,
		);
	}
	return { ephemeralSharedSecret, remotePublicKey, remoteEphemeralPublicKey };
};

export const parseAuthEIP8 = (
	data: Uint8Array,
	remoteInitMsg: Uint8Array,
	privateKey: Uint8Array,
	ephemeralPrivateKey: Uint8Array,
	gotEIP8Auth: boolean,
): void => {
	const size = bytesToInt(data.subarray(0, 2)) + 2;
	assertEq(
		data.length,
		size,
		"message length different from specified size (EIP8)",
		console.log,
	);
	parseAuthPlain(
		data.subarray(2),
		remoteInitMsg,
		privateKey,
		ephemeralPrivateKey,
		gotEIP8Auth,
		data.subarray(0, 2),
	);
};
