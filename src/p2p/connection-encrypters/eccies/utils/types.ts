import type * as crypto from "crypto";
import type { Socket } from "node:net";
import type { MAC } from "../../../transport/rlpx/mac";

type Decipher = crypto.DecipherGCM;

export type HandlerContext = {
	socket: Socket;
	privateKey: Uint8Array;
	publicKey: Uint8Array;
	remotePublicKey: Uint8Array | null;
	nonce: Uint8Array;
	ephemeralPrivateKey: Uint8Array;
	ephemeralPublicKey: Uint8Array;
	requireEip8: boolean;
};

export type AuthResult = {
	remoteInitMsg: Uint8Array;
	remotePublicKey: Uint8Array;
	remoteNonce: Uint8Array;
	ephemeralSharedSecret: Uint8Array;
	remoteEphemeralPublicKey: Uint8Array;
};

export type AckResult = {
	remoteEphemeralPublicKey: Uint8Array;
	remoteNonce: Uint8Array;
	ephemeralSharedSecret: Uint8Array;
};

export type HeaderResult = {
	bodySize: number;
	paddedBodySize: number;
};

export type BodyResult = {
	payload: Uint8Array;
};

export type HelloContext = {
	socket: Socket;
	ingressAes: Decipher | null;
	egressAes: Decipher | null;
	ingressMac: MAC | null;
	egressMac: MAC | null;
	clientId: Uint8Array;
	capabilities: Array<{ name: string; version: number }>;
	port: number;
	id: Uint8Array;
};

export type HelloMessage = {
	protocolVersion: number;
	clientId: string;
	capabilities: Array<{ name: string; version: number }>;
	port: number;
	id: Uint8Array;
};

export type HelloResult = {
	localHello: HelloMessage;
	remoteHello: HelloMessage;
};
