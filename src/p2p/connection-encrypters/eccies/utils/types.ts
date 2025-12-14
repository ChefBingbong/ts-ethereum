import type { Socket } from "node:net";

import type { HandshakeState } from "../eccies-encrypter";

export type HandlerContext = {
	handshakeState?: {
		current: HandshakeState;
		setState: (state: HandshakeState) => void;
	};
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
