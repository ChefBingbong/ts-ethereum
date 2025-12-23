import type { Multiaddr } from "@multiformats/multiaddr";
import { CODE_UNIX, multiaddr } from "@multiformats/multiaddr";
import { Unix } from "@multiformats/multiaddr-matcher";
import debug from "debug";
import { publicKeyConvert } from "ethereum-cryptography/secp256k1-compat.js";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import type {
	IpcSocketConnectOpts,
	ListenOptions,
	TcpSocketConnectOpts,
} from "net";
import os from "os";
import path from "path";
import type { EthStatusMsg } from "../client/net/protocol";
import { isLinkLocalIp } from "../p2p/transport/tcp/utils";
import * as RLP from "../rlp";
import {
	bytesToHex,
	bytesToUnprefixedHex,
	concatBytes,
	equalsBytes,
} from "../utils";
import { getNetConfig } from "./getNetConfig";

const FAMILIES = { 4: 'IPv4', 6: 'IPv6' }

function isWildcard(ip: string): boolean {
  return ['0.0.0.0', '::'].includes(ip)
}

function getNetworkAddrs(family: 4 | 6): string[] {
  const addresses: string[] = []
  const networks = os.networkInterfaces()

  for (const [, netAddrs] of Object.entries(networks)) {
    if (netAddrs != null) {
      for (const netAddr of netAddrs) {
        if (isLinkLocalIp(netAddr.address)) {
          continue
        }

        if (netAddr.family === FAMILIES[family]) {
          addresses.push(netAddr.address)
        }
      }
    }
  }

  return addresses
}

export function netConfigToMultiaddr(
  config: any,
  port?: number | string,
  host?: string,
): Multiaddr {
  const parts: Array<string | number> = [config.type, host ?? config.host]

  if (config.protocol != null) {
    const p = port ?? config.port

    if (p != null) {
      parts.push(config.protocol, p)
    }
  }

  if (config.type === 'ip6' && config.zone != null) {
    parts.unshift('ip6zone', config.zone)
  }

  if (config.cidr != null) {
    parts.push('ipcidr', config.cidr)
  }

  return multiaddr(`/${parts.join('/')}`)
}

/**
 * Get all thin waist addresses on the current host that match the family of the
 * passed multiaddr and optionally override the port.
 *
 * Wildcard IP4/6 addresses will be expanded into all available interfaces.
 */
export function getThinWaistAddresses(
  ma?: Multiaddr,
  port?: number | string,
): Multiaddr[] {
  if (ma == null) {
    return []
  }

  const config = getNetConfig(ma)

  if (
    (config.type === 'ip4' || config.type === 'ip6') &&
    isWildcard(config.host)
  ) {
    return getNetworkAddrs(config.type === 'ip4' ? 4 : 6).map((host) =>
      netConfigToMultiaddr(config, port, host),
    )
  }

  return [netConfigToMultiaddr(config, port)]
}

// Do not use :# here, no logging without sub namespace occurring and current code structure
// otherwise creates loggers like `devp2p:#:eth`
export const devp2pDebug = debug("devp2p");

export function genPrivateKey(): Uint8Array {
	const privateKey = secp256k1.utils.randomPrivateKey();
	return secp256k1.utils.isValidPrivateKey(privateKey) === true
		? privateKey
		: genPrivateKey();
}

export function pk2id(pk: Uint8Array): Uint8Array {
	if (pk.length === 33) {
		pk = publicKeyConvert(pk, false);
	}
	return pk.subarray(1);
}

export function id2pk(id: Uint8Array): Uint8Array {
	return concatBytes(Uint8Array.from([0x04]), id);
}

export function zfill(
	bytes: Uint8Array,
	size: number,
	leftpad: boolean = true,
): Uint8Array {
	if (bytes.length >= size) return bytes;
	if (leftpad === undefined) leftpad = true;
	const pad = new Uint8Array(size - bytes.length).fill(0x00);
	return leftpad ? concatBytes(pad, bytes) : concatBytes(bytes, pad);
}

export function xor(a: Uint8Array, b: any): Uint8Array {
	const length = Math.min(a.length, b.length);
	const bytes = new Uint8Array(length);
	for (let i = 0; i < length; ++i) bytes[i] = a[i] ^ b[i];
	return bytes;
}

type assertInput = Uint8Array | Uint8Array[] | EthStatusMsg | number | null;

export function assertEq(
	expected: assertInput,
	actual: assertInput,
	msg: string,
	debug: Function,
	messageName?: string,
): void {
	let fullMsg;

	if (expected instanceof Uint8Array && actual instanceof Uint8Array) {
		if (equalsBytes(expected, actual)) return;
		fullMsg = `${msg}: ${bytesToHex(expected)} / ${bytesToHex(actual)}`;
		const debugMsg = `[ERROR] ${fullMsg}`;
		if (messageName !== undefined) {
			debug(messageName, debugMsg);
		} else {
			debug(debugMsg);
		}
		throw new Error(fullMsg);
	}

	if (expected === actual) return;
	fullMsg = `${msg}: ${expected} / ${actual}`;
	if (messageName !== undefined) {
		debug(messageName, fullMsg);
	} else {
		debug(fullMsg);
	}
	throw new Error(fullMsg);
}

export function formatLogId(id: string, verbose: boolean): string {
	const numChars = 7;
	if (verbose) {
		return id;
	} else {
		return `${id.substring(0, numChars)}`;
	}
}

export function formatLogData(data: string, verbose: boolean): string {
	const maxChars = 60;
	if (verbose || data.length <= maxChars) {
		return data;
	} else {
		return `${data.substring(0, maxChars)}...`;
	}
}

export class Deferred<T> {
	promise: Promise<T>;
	resolve: (...args: any[]) => any = () => {};
	reject: (...args: any[]) => any = () => {};
	constructor() {
		this.promise = new Promise((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}
}

export function createDeferred<T>(): Deferred<T> {
	return new Deferred();
}

export function unstrictDecode(value: Uint8Array) {
	// rlp library throws on remainder.length !== 0
	// this utility function bypasses that
	return RLP.decode(value, true).data;
}

/*************************** ************************************************************/
// Methods borrowed from `node-ip` by Fedor Indutny (https://github.com/indutny/node-ip)
// and modified to use Uint8Arrays instead of Buffers
export const ipToString = (
	bytes: Uint8Array,
	offset?: number,
	length?: number,
): string => {
	offset = offset !== undefined ? ~~offset : 0;
	length = length ?? bytes.length - offset;

	const tempArray: Array<number | string> = [];
	let result: string = "";
	if (length === 4) {
		// IPv4
		for (let i = 0; i < length; i++) {
			tempArray.push(bytes[offset + i]);
		}
		result = tempArray.join(".");
	} else if (length === 16) {
		// IPv6
		for (let i = 0; i < length; i += 2) {
			tempArray.push(
				new DataView(bytes.buffer).getUint16(offset + i).toString(16),
			);
		}
		result = tempArray.join(":");
		result = result.replace(/(^|:)0(:0)*:0(:|$)/, "$1::$3");
		result = result.replace(/:{3,4}/, "::");
	}

	return result;
};

const ipv4Regex = /^(\d{1,3}\.){3,3}\d{1,3}$/;
const ipv6Regex =
	/^(::)?(((\d{1,3}\.){3}(\d{1,3}){1})?([0-9a-f]){0,4}:{0,2}){1,8}(::)?$/i;

export const isV4Format = function (ip: string): boolean {
	return ipv4Regex.test(ip);
};

export const isV6Format = function (ip: string): boolean {
	return ipv6Regex.test(ip);
};

export const ipToBytes = (
	ip: string,
	bytes?: Uint8Array,
	offset: number = 0,
): Uint8Array => {
	offset = ~~offset;

	let result: Uint8Array;

	if (isV4Format(ip)) {
		result = bytes ?? new Uint8Array(offset + 4);
		ip.split(/\./g).map((byte) => {
			result[offset++] = parseInt(byte, 10) & 0xff;
		});
	} else if (isV6Format(ip)) {
		const sections = ip.split(":", 8);

		let i;
		for (i = 0; i < sections.length; i++) {
			const isv4 = isV4Format(sections[i]);
			let v4Bytes: Uint8Array = new Uint8Array([]);

			if (isv4) {
				v4Bytes = ipToBytes(sections[i]);
				sections[i] = bytesToUnprefixedHex(v4Bytes.subarray(0, 2));
			}

			if (v4Bytes.length > 0 && ++i < 8) {
				sections.splice(i, 0, bytesToUnprefixedHex(v4Bytes.subarray(2, 4)));
			}
		}

		if (sections[0] === "") {
			while (sections.length < 8) sections.unshift("0");
		} else if (sections[sections.length - 1] === "") {
			while (sections.length < 8) sections.push("0");
		} else if (sections.length < 8) {
			for (i = 0; i < sections.length && sections[i] !== ""; i++);
			const argv: any = [i, 1];
			for (i = 9 - sections.length; i > 0; i--) {
				argv.push("0");
			}
			// eslint-disable-next-line prefer-spread
			sections.splice.apply(sections, argv);
		}

		result = bytes ?? new Uint8Array(offset + 16);
		for (i = 0; i < sections.length; i++) {
			const word = parseInt(sections[i], 16);
			result[offset++] = (word >> 8) & 0xff;
			result[offset++] = word & 0xff;
		}
	} else {
		throw Error(`Invalid ip format: ${ip}`);
	}

	if (result === undefined) {
		throw Error(`Invalid ip address: ${ip}`);
	}

	return result;
};

/************  End of methods borrowed from `node-ip` ***************************/

export type NetConfig =
	| ListenOptions
	| (IpcSocketConnectOpts & TcpSocketConnectOpts);

export function multiaddrToNetConfig(
	addr: Multiaddr,
	options: NetConfig = {},
): NetConfig {
	if (Unix.exactMatch(addr)) {
		const listenPath = addr
			.getComponents()
			.find((c) => c.code === CODE_UNIX)?.value;

		if (listenPath == null) {
			throw new Error(`Multiaddr ${addr} was not a Unix address`);
		}

		if (os.platform() === "win32") {
			return { path: path.join("\\\\.\\pipe\\", listenPath) };
		} else {
			return { path: listenPath };
		}
	}

	const config = getNetConfig(addr);
	const host = config.host;
	const port = config.port;

	// tcp listening
	return {
		host,
		port,
		ipv6Only: config.type !== "ip4",
		...options,
	};
}

export function multiaddrFromIp(ip: string, port: number | string) {
	if (!ip || !port) {
		throw new Error(`Invalid ip or port: ${ip}:${port}`);
	}
	try {
		return multiaddr(`/ip4/${ip}/tcp/${port}`);
	} catch {
		throw new Error(`Could not create tcp multiaddr from ${ip}:${port}`);
	}
}

export function getHostPortFromMultiaddr(addr: Multiaddr): {
	host: string;
	port: number;
} {
	const s = addr.toString(); // /ip4/127.0.0.1/tcp/4000/p2p/...
	const parts = s.split("/");
	const hostIdx = parts.indexOf("ip4") + 1;
	const tcpIdx = parts.indexOf("tcp") + 1;
	const host = parts[hostIdx] ?? "127.0.0.1";
	const port = parseInt(parts[tcpIdx] ?? "0", 10);
	return { host, port };
}

export function stringifyWithBigInt(value: unknown, space?: number) {
	const seen = new WeakSet<object>();

	const replacer = (_key: string, val: unknown) => {
		if (typeof val === "bigint") return val.toString();
		if (typeof val === "object" && val !== null) {
			if (seen.has(val as object)) return undefined; // drop circular refs
			seen.add(val as object);
		}
		return val as unknown;
	};

	return JSON.stringify(value, replacer, space);
}

export function parseWithBigInt(jsonString: string): unknown {
	return JSON.parse(jsonString, (_key, value) => {
		if (typeof value === "string" && /^\d+$/.test(value)) {
			try {
				const num = BigInt(value);
				if (num > Number.MAX_SAFE_INTEGER || num < Number.MIN_SAFE_INTEGER) {
					return num;
				}
			} catch {}
		}
		return value;
	});
}
