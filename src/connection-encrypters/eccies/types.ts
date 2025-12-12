import * as net from "net";
import { EncrypterResult } from "../../connection/types";

export interface ConnectionEncrypter {
	protocol: string;
	encryptInBound(raw: net.Socket): Promise<EncrypterResult>;
	encryptOutBound(
		raw: net.Socket,
		peerId?: Uint8Array,
	): Promise<EncrypterResult>;
}
