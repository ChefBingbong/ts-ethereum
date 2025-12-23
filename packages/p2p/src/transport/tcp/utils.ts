import { InvalidParametersError } from "@libp2p/interface";
import type { Multiaddr } from "@multiformats/multiaddr";
import { CODE_UNIX, multiaddr } from "@multiformats/multiaddr";
import { Unix } from "@multiformats/multiaddr-matcher";
import type {
	IpcSocketConnectOpts,
	ListenOptions,
	TcpSocketConnectOpts,
} from "net";
import os from "node:os";
import path from "path";

export function isLinkLocalIp(ip: string): boolean {
	if (ip.startsWith("169.254.")) {
		return true;
	}

	if (ip.toLowerCase().startsWith("fe80")) {
		return true;
	}

	return false;
}

export interface IP4NetConfig {
	type: "ip4";
	host: string;
	protocol?: "tcp" | "udp";
	port?: number;
	cidr?: number;
	sni?: string;
}

export interface IP6NetConfig {
	type: "ip6";
	host: string;
	protocol?: "tcp" | "udp";
	port?: number;
	zone?: string;
	cidr?: string;
	sni?: string;
}

export interface DNSNetConfig {
	type: "dns";
	host: string;
	protocol?: "tcp" | "udp";
	port: number;
	cidr?: number;
}

export interface DNS4NetConfig {
	type: "dns4";
	host: string;
	protocol?: "tcp" | "udp";
	port: number;
	cidr?: number;
}

export interface DNS6NetConfig {
	type: "dns6";
	host: string;
	protocol?: "tcp" | "udp";
	port: number;
	cidr?: number;
}

export interface DNSAddrNetConfig {
	type: "dnsaddr";
	host: string;
	protocol?: "tcp" | "udp";
	port: number;
	cidr?: number;
}

export type NetConfigMa =
	| IP4NetConfig
	| IP6NetConfig
	| DNSNetConfig
	| DNS4NetConfig
	| DNS6NetConfig
	| DNSAddrNetConfig;

/**
 * Returns host/port/etc information for multiaddrs, if it is available.
 *
 * It will throw if the passed multiaddr does not start with a network address,
 * e.g. a IPv4, IPv6, DNS, DNS4, DNS6 or DNSADDR address
 */
export function getNetConfig(ma: Multiaddr): NetConfigMa {
	const components = ma.getComponents();
	const config: any = {};
	let index = 0;

	if (components[index]?.name === "ip6zone") {
		config.zone = `${components[index].value}`;
		index++;
	}

	if (components[index].name === "ip4" || components[index].name === "ip6") {
		config.type = components[index].name;
		config.host = components[index].value;
		index++;
	} else if (
		components[index].name === "dns" ||
		components[index].name === "dns4" ||
		components[index].name === "dns6"
	) {
		config.type = components[index].name;
		config.host = components[index].value;
		index++;
	} else if (components[index].name === "dnsaddr") {
		config.type = components[index].name;
		config.host = `_dnsaddr.${components[index].value}`;
		index++;
	}

	if (components[index]?.name === "tcp" || components[index]?.name === "udp") {
		config.protocol = components[index].name === "tcp" ? "tcp" : "udp";
		config.port = parseInt(`${components[index].value}`);
		index++;
	}

	if (components[index]?.name === "ipcidr") {
		if (config.type === "ip4") {
			config.cidr = parseInt(`${components[index].value}`);
		} else if (config.type === "ip6") {
			config.cidr = `${components[index].value}`;
		}
		index++;
	}

	if (config.type == null || config.host == null) {
		throw new InvalidParametersError(
			`Multiaddr ${ma} was not an IPv4, IPv6, DNS, DNS4, DNS6 or DNSADDR address`,
		);
	}

	if (
		components[index]?.name === "tls" &&
		components[index + 1]?.name === "sni"
	) {
		config.sni = components[index + 1].value;
		index += 2;
	}

	return config;
}

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
			throw new InvalidParametersError(
				`Multiaddr ${addr} was not a Unix address`,
			);
		}

		// unix socket listening
		if (os.platform() === "win32") {
			// Use named pipes on Windows systems.
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
		ipv6Only: config.type === "ip6",
		...options,
	};
}

const FAMILIES = { 4: "IPv4", 6: "IPv6" };

function isWildcard(ip: string): boolean {
	return ["0.0.0.0", "::"].includes(ip);
}

function getNetworkAddrs(family: 4 | 6): string[] {
	const addresses: string[] = [];
	const networks = os.networkInterfaces();

	for (const [, netAddrs] of Object.entries(networks)) {
		if (netAddrs != null) {
			for (const netAddr of netAddrs) {
				if (isLinkLocalIp(netAddr.address)) {
					continue;
				}

				if (netAddr.family === FAMILIES[family]) {
					addresses.push(netAddr.address);
				}
			}
		}
	}

	return addresses;
}

export function netConfigToMultiaddr(
	config: NetConfigMa,
	port?: number | string,
	host?: string,
): Multiaddr {
	const parts: Array<string | number> = [config.type, host ?? config.host];

	if (config.protocol != null) {
		const p = port ?? config.port;

		if (p != null) {
			parts.push(config.protocol, p);
		}
	}

	if (config.type === "ip6" && config.zone != null) {
		parts.unshift("ip6zone", config.zone);
	}

	if (config.cidr != null) {
		parts.push("ipcidr", config.cidr);
	}

	return multiaddr(`/${parts.join("/")}`);
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
		return [];
	}

	const config = getNetConfig(ma);

	if (
		(config.type === "ip4" || config.type === "ip6") &&
		isWildcard(config.host)
	) {
		return getNetworkAddrs(config.type === "ip4" ? 4 : 6).map((host) =>
			netConfigToMultiaddr(config, port, host),
		);
	}

	return [netConfigToMultiaddr(config, port)];
}
