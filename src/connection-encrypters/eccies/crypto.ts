import debug from "debug";
import { keccak256 } from "ethereum-cryptography/keccak";
import { getRandomBytesSync } from "ethereum-cryptography/random";
import { secp256k1 } from "ethereum-cryptography/secp256k1";
import { ecdh } from "ethereum-cryptography/secp256k1-compat.js";
import { hexToBytes } from "ethereum-cryptography/utils";
import crypto from "node:crypto";
import { assertEq, genPrivateKey, MAC, xor } from "../../devp2p";
import { concatBytes } from "../../utils";

const SHA256_BLOCK_SIZE = 64;

export function ecdhX(publicKey: Uint8Array, privateKey: Uint8Array) {
	// return (publicKey * privateKey).x
	function hashfn(x: Uint8Array, y: Uint8Array) {
		const pubKey = new Uint8Array(33);
		pubKey[0] = (y[31] & 1) === 0 ? 0x02 : 0x03;
		pubKey.set(x, 1);
		return pubKey.subarray(1);
	}

	console.log("ecdhX", { publicKey, privateKey });
	return ecdh(publicKey, privateKey, { hashfn }, new Uint8Array(32));
}

export function concatKDF(keyMaterial: Uint8Array, keyLength: number) {
	const tmp = new Uint8Array(4);
	const reps = ((keyLength + 7) * 8) / (SHA256_BLOCK_SIZE * 8);

	const bytes = Array.from({ length: reps }, (_, i) => {
		new DataView(tmp.buffer).setUint32(0, i + 1);
		const sha256 = crypto.createHash("sha256").update(tmp);
		return Uint8Array.from(sha256.update(keyMaterial).digest());
	});

	return concatBytes(...bytes).subarray(0, keyLength);
}

export const eccieEncryptMessage = (
	data: Uint8Array,
	remotePubKey: Uint8Array,
	sharedMacData: Uint8Array | null = null,
): Uint8Array | undefined => {
	const privateKey = genPrivateKey();
	const ecdhXPoint = ecdhX(remotePubKey, privateKey);
	const ecciesKey = concatKDF(ecdhXPoint, 32);

	const eccieKeyCompact = ecciesKey.subarray(0, 16);
	const macKey = crypto
		.createHash("sha256")
		.update(ecciesKey.subarray(16, 32))
		.digest();

	const cipherInitVector = getRandomBytesSync(16);
	const cipher = crypto.createCipheriv(
		"aes-128-ctr",
		eccieKeyCompact,
		cipherInitVector,
	);

	const encryptedData = Uint8Array.from(cipher.update(data));
	const dataIV = concatBytes(cipherInitVector, encryptedData);
	const ecciesData = concatBytes(dataIV, sharedMacData ?? Uint8Array.from([]));

	const tag = new Uint8Array(
		crypto.createHmac("sha256", macKey).update(ecciesData).digest(),
	);

	return concatBytes(secp256k1.getPublicKey(privateKey, false), dataIV, tag);
};

export const decryptMessage = (
	data: Uint8Array,
	privateKey: Uint8Array,
	sharedMacData: Uint8Array | null = null,
): Uint8Array => {
	assertEq(
		data.subarray(0, 1),
		hexToBytes("0x04"),
		"wrong ecies header (possible cause: EIP8 upgrade)",
		debug,
	);
	const publicKey = data.subarray(0, 65);
	const dataIV = data.subarray(65, -32);
	const tag = data.subarray(-32);

	const ecciesKey = concatKDF(ecdhX(publicKey, privateKey), 32);
	const eccieKeyCompact = ecciesKey.subarray(0, 16);

	const macKey = new Uint8Array(
		crypto.createHash("sha256").update(ecciesKey.subarray(16, 32)).digest(),
	);
	const _tag = crypto
		.createHmac("sha256", macKey)
		.update(concatBytes(dataIV, sharedMacData ?? Uint8Array.from([])))
		.digest();

	assertEq(_tag, tag, "should have valid tag", debug);

	const initVector = dataIV.subarray(0, 16);
	const encryptedData = dataIV.subarray(16);
	const decipher = crypto.createDecipheriv(
		"aes-128-ctr",
		eccieKeyCompact,
		initVector,
	);
	return new Uint8Array(decipher.update(encryptedData));
};

export const setupFrame = (
	remoteData: Uint8Array,
	nonce: Uint8Array,
	remoteNonce: Uint8Array,
	initMsg: Uint8Array,
	ephemeralSharedSecret: Uint8Array,
	incoming: boolean,
) => {
	const nonceMaterial = incoming
		? concatBytes(nonce, remoteNonce)
		: concatBytes(remoteNonce, nonce);
	const hNonce = keccak256(nonceMaterial);

	if (!ephemeralSharedSecret) return;
	const IV = new Uint8Array(16).fill(0x00);
	const sharedSecret = keccak256(concatBytes(ephemeralSharedSecret, hNonce));

	const aesSecret = keccak256(concatBytes(ephemeralSharedSecret, sharedSecret));
	const ingressAes = crypto.createDecipheriv("aes-256-ctr", aesSecret, IV);
	const egressAes = crypto.createDecipheriv("aes-256-ctr", aesSecret, IV);

	const macSecret = keccak256(concatBytes(ephemeralSharedSecret, aesSecret));
	const ingressMac = new MAC(macSecret);
	ingressMac.update(concatBytes(xor(macSecret, nonce), remoteData));
	const egressMac = new MAC(macSecret);

	if (initMsg === null || initMsg === undefined) return;
	egressMac.update(concatBytes(xor(macSecret, remoteNonce), initMsg));

	return { ingressAes, egressAes, ingressMac, egressMac };
};
