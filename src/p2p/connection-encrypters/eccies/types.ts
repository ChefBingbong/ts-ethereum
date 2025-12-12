import type { Socket } from "node:net";
import type { SecureConnection } from "../../connection/types";

export interface ConnectionEncrypter {
	protocol: string;
	secureInBound(raw: Socket): Promise<SecureConnection>;
	secureOutBound(raw: Socket, peerId?: Uint8Array): Promise<SecureConnection>;
}
