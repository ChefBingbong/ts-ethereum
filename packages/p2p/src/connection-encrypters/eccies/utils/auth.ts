import { keccak256 } from "ethereum-cryptography/keccak";
import { getRandomBytesSync } from "ethereum-cryptography/random.js";
import { ecdsaRecover } from "ethereum-cryptography/secp256k1-compat";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import * as RLP from "../../../../rlp/index.ts";
import {
	bigIntToBytes,
	bytesToInt,
	concatBytes,
	intToBytes,
	setLengthLeft,
} from "../../../../utils/index.ts";
import {
	assertEq,
	id2pk,
	pk2id,
	unstrictDecode,
	xor,
} from "../../../../utils/utils.ts";
import { decryptMessage, eccieEncryptMessage, ecdhX } from "./crypto.ts";
import type { AuthResult } from "./types.ts";

const OVERHEAD_LENGTH = 113;

export function createAuthEIP8(
	remotePubKey: Uint8Array | null,
	privateKey: Uint8Array,
	nonce: Uint8Array,
	ephemeralPrivateKey: Uint8Array,
	publicKey: Uint8Array,
): Uint8Array | undefined {
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
	const encryptedMsg = eccieEncryptMessage(
		authMsg,
		remotePubKey,
		sharedMacData,
	);
	if (!encryptedMsg) return;
	return concatBytes(sharedMacData, encryptedMsg);
}

export function createAuthNonEIP8(
	remotePubKey: Uint8Array,
	privateKey: Uint8Array,
	nonce: Uint8Array,
	ephemeralPrivateKey: Uint8Array,
	ephemeralPublicKey: Uint8Array,
	publicKey: Uint8Array,
): Uint8Array | undefined {
	if (!remotePubKey) return;
	const x = ecdhX(remotePubKey, privateKey);
	const sig = secp256k1.sign(xor(x, nonce), ephemeralPrivateKey);

	const data = concatBytes(
		setLengthLeft(bigIntToBytes(sig.r), 32),
		setLengthLeft(bigIntToBytes(sig.s), 32),
		Uint8Array.from([sig.recovery]),
		keccak256(pk2id(ephemeralPublicKey)),
		pk2id(publicKey),
		nonce,
		Uint8Array.from([0x00]),
	);

	return eccieEncryptMessage(data, remotePubKey);
}

export function parseAuthPlain(
	data: Uint8Array,
	privateKey: Uint8Array,
	ephemeralPrivateKey: Uint8Array,
	gotEIP8Auth: boolean,
	sharedMacData: Uint8Array | null = null,
): AuthResult | null {
	try {
		const prefix = sharedMacData ?? new Uint8Array();
		const remoteInitMsg = concatBytes(prefix, data);
		const decrypted = decryptMessage(data, privateKey, sharedMacData);

		let signature: Uint8Array;
		let recoveryId: number;
		let heId: Uint8Array | null = null;
		let remotePublicKey: Uint8Array;
		let remoteNonce: Uint8Array;

		if (!gotEIP8Auth) {
			assertEq(decrypted.length, 194, "invalid packet length", console.log);
			signature = decrypted.subarray(0, 64);
			recoveryId = decrypted[64];
			heId = decrypted.subarray(65, 97);
			remotePublicKey = id2pk(decrypted.subarray(97, 161));
			remoteNonce = decrypted.subarray(161, 193);
		} else {
			const decoded = unstrictDecode(decrypted) as Uint8Array[];
			signature = decoded[0].subarray(0, 64);
			recoveryId = decoded[0][64];
			remotePublicKey = id2pk(decoded[1]);
			remoteNonce = decoded[2];
		}

		const x = ecdhX(remotePublicKey, privateKey);
		const remoteEphemeralPublicKey = ecdsaRecover(
			signature,
			recoveryId,
			xor(x, remoteNonce),
			false,
		);
		if (remoteEphemeralPublicKey === null) return null;

		const ephemeralSharedSecret = ecdhX(
			remoteEphemeralPublicKey,
			ephemeralPrivateKey,
		);

		if (heId !== null) {
			assertEq(
				keccak256(pk2id(remoteEphemeralPublicKey)),
				heId,
				"hash mismatch",
				console.log,
			);
		}

		return {
			remoteInitMsg,
			remotePublicKey,
			remoteNonce,
			ephemeralSharedSecret,
			remoteEphemeralPublicKey,
		};
	} catch (error) {
		console.error("parseAuthPlain error:", error);
		return null;
	}
}

export function parseAuthEIP8(
	data: Uint8Array,
	privateKey: Uint8Array,
	ephemeralPrivateKey: Uint8Array,
	gotEIP8Auth: boolean,
): AuthResult | null {
	const size = bytesToInt(data.subarray(0, 2)) + 2;
	assertEq(
		data.length,
		size,
		`message length mismatch: expected ${size}, got ${data.length}`,
		console.log,
	);
	return parseAuthPlain(
		data.subarray(2),
		privateKey,
		ephemeralPrivateKey,
		gotEIP8Auth,
		data.subarray(0, 2),
	);
}
