import bodyParser from "body-parser";
import type { IncomingMessage } from "connect";
import Connect from "connect";
import cors from "cors";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { createServer } from "http";
import type { Server } from "jayson/promise/index.js";
import jayson from "jayson/promise/index.js";
import { inspect } from "util";
import {
	bytesToUnprefixedHex,
	EthereumJSErrorWithoutCode,
	hexToBytes,
	randomBytes,
} from "../../utils/index.ts";
import type { EthereumClient } from "../client.ts";
import type { Config } from "../config.ts";
import type { TAlgorithm } from "../ext/jwt-simple.ts";
import { jwt } from "../ext/jwt-simple.ts";
import type { Logger } from "../logging.ts";
import { RPCManager, saveReceiptsMethods } from "../rpc/index.ts";
import * as modules from "../rpc/modules/index.ts";

const { json: JSONParser } = bodyParser;
const { decode } = jwt;

const algorithm: TAlgorithm = "HS256";

// ============================================================================
// Types
// ============================================================================

export type RPCArgs = {
	rpc: boolean;
	rpcAddr: string;
	rpcPort: number;
	ws: boolean;
	wsPort: number;
	wsAddr: string;
	rpcEngine: boolean;
	rpcEngineAddr: string;
	rpcEnginePort: number;
	wsEngineAddr: string;
	wsEnginePort: number;
	rpcDebug: string;
	rpcDebugVerbose: string;
	helpRPC: boolean;
	jwtSecret?: string;
	rpcEngineAuth: boolean;
	rpcCors: string;
};

type CreateRPCServerOpts = {
	methodConfig: MethodConfig;
	rpcDebug: string;
	rpcDebugVerbose: string;
	logger?: Logger;
};

type CreateRPCServerReturn = {
	server: jayson.Server;
	methods: { [key: string]: Function };
	namespaces: string;
};

type CreateRPCServerListenerOpts = {
	RPCCors?: string;
	server: any;
	withEngineMiddleware?: WithEngineMiddleware;
};

type CreateWSServerOpts = CreateRPCServerListenerOpts & {
	httpServer?: jayson.HttpServer;
};

type WithEngineMiddleware = {
	jwtSecret: Uint8Array;
	unlessFn?: (req: IncomingMessage) => boolean;
};

export type MethodConfig = (typeof MethodConfig)[keyof typeof MethodConfig];

export const MethodConfig = {
	WithEngine: "withengine",
	WithoutEngine: "withoutengine",
	EngineOnly: "engineonly",
} as const;

// ============================================================================
// Constants
// ============================================================================

/** Allowed drift for jwt token issuance is 60 seconds */
const ALLOWED_DRIFT = 60_000;

// ============================================================================
// Internal Utilities
// ============================================================================

/**
 * Check if the `method` matches the comma-separated filter string
 */
function checkFilter(method: string, filterStringCSV: string) {
	if (!filterStringCSV || filterStringCSV === "") {
		return false;
	}
	if (filterStringCSV === "all") {
		return true;
	}
	const filters = filterStringCSV.split(",");
	for (const filter of filters) {
		if (method.includes(filter) === true) {
			return true;
		}
	}
	return false;
}

/**
 * Check JWT auth header
 */
function checkHeaderAuth(req: any, jwtSecret: Uint8Array): void {
	const header = (req.headers["Authorization"] ??
		req.headers["authorization"]) as string;
	if (!header) throw Error(`Missing auth header`);
	const token = header.trim().split(" ")[1];
	if (!token) throw Error(`Missing jwt token`);
	const claims = decode(
		token.trim(),
		jwtSecret as never as string,
		false,
		algorithm,
	);
	const drift = Math.abs(new Date().getTime() - claims.iat * 1000) ?? 0;
	if (drift > ALLOWED_DRIFT) {
		throw Error(`Stale jwt token drift=${drift}, allowed=${ALLOWED_DRIFT}`);
	}
}

/**
 * Returns a jwt secret from a provided file path, otherwise saves a randomly generated one to datadir
 */
function parseJwtSecret(config: Config, jwtFilePath?: string): Uint8Array {
	let jwtSecret: Uint8Array;
	const defaultJwtPath = `${config.datadir}/jwtsecret`;
	const usedJwtPath = jwtFilePath ?? defaultJwtPath;

	// If jwtFilePath is provided, it should exist
	if (jwtFilePath !== undefined && !existsSync(jwtFilePath)) {
		throw EthereumJSErrorWithoutCode(
			`No file exists at provided jwt secret path=${jwtFilePath}`,
		);
	}

	if (jwtFilePath !== undefined || existsSync(defaultJwtPath)) {
		const jwtSecretContents = readFileSync(
			jwtFilePath ?? defaultJwtPath,
			"utf-8",
		).trim();
		const hexPattern = new RegExp(/^(0x|0X)?(?<jwtSecret>[a-fA-F0-9]+)$/, "g");
		const jwtSecretHex = hexPattern.exec(jwtSecretContents)?.groups?.jwtSecret;
		if (jwtSecretHex === undefined || jwtSecretHex.length !== 64) {
			throw Error("Need a valid 256 bit hex encoded secret");
		}
		jwtSecret = hexToBytes(`0x${jwtSecretHex}`);
	} else {
		const folderExists = existsSync(config.datadir);
		if (!folderExists) {
			mkdirSync(config.datadir, { recursive: true });
		}

		jwtSecret = randomBytes(32);
		writeFileSync(defaultJwtPath, bytesToUnprefixedHex(jwtSecret), {});
		config.logger?.info(
			`New Engine API JWT token created path=${defaultJwtPath}`,
		);
	}
	config.logger?.info(
		`Using Engine API with JWT token authentication path=${usedJwtPath}`,
	);
	return jwtSecret;
}

// ============================================================================
// Exported Utilities
// ============================================================================

/**
 * Pretty print params for logging
 */
export function inspectParams(params: any, shorten?: number) {
	let inspected = inspect(params, {
		colors: true,
		maxStringLength: 100,
	});
	if (typeof shorten === "number") {
		inspected = inspected.replace(/\n/g, "").replace(/ {2}/g, " ");
		if (inspected.length > shorten) {
			inspected = inspected.slice(0, shorten) + "...";
		}
	}
	return inspected;
}

// ============================================================================
// RPC Server Creation
// ============================================================================

/**
 * Create a JSON-RPC server with the specified methods
 */
export function createRPCServer(
	manager: RPCManager,
	opts: CreateRPCServerOpts,
): CreateRPCServerReturn {
	const { methodConfig, rpcDebug, rpcDebugVerbose, logger } = opts;
	const onRequest = (request: any) => {
		if (checkFilter(request.method, rpcDebugVerbose)) {
			logger?.info(
				`${request.method} called with params:\n${inspectParams(request.params)}`,
			);
		} else if (checkFilter(request.method, rpcDebug)) {
			logger?.info(
				`${request.method} called with params: ${inspectParams(request.params, 125)}`,
			);
		}
	};

	const handleResponse = (request: any, response: any, batchAddOn = "") => {
		if (checkFilter(request.method, rpcDebugVerbose)) {
			logger?.info(
				`${request.method}${batchAddOn} responded with:\n${inspectParams(response)}`,
			);
		} else if (checkFilter(request.method, rpcDebug)) {
			logger?.info(
				`${request.method}${batchAddOn} responded with:\n${inspectParams(response, 125)}`,
			);
		}
	};

	const onBatchResponse = (request: any, response: any) => {
		// Batch request
		if (request.length !== undefined) {
			if (response.length === undefined || response.length !== request.length) {
				logger?.debug("Invalid batch request received.");
				return;
			}
			for (let i = 0; i < request.length; i++) {
				handleResponse(request[i], response[i], " (batch request)");
			}
		} else {
			handleResponse(request, response);
		}
	};

	let methods: { [key: string]: Function };
	const ethMethods = manager.getMethods(
		false,
		rpcDebug !== "false" && rpcDebug !== "",
	);

	switch (methodConfig) {
		case MethodConfig.WithEngine:
			methods = {
				...ethMethods,
				...manager.getMethods(true, rpcDebug !== "false" && rpcDebug !== ""),
			};
			break;
		case MethodConfig.WithoutEngine:
			methods = { ...ethMethods };
			break;
		case MethodConfig.EngineOnly: {
			/**
			 * Filter eth methods which should be strictly exposed if only the engine is started:
			 * https://github.com/ethereum/execution-apis/blob/6d2c035e4caafef7224cbb5fac7993b820bb61ce/src/engine/common.md#underlying-protocol
			 */
			const ethMethodsToBeIncluded = [
				"eth_blockNumber",
				"eth_call",
				"eth_chainId",
				"eth_getCode",
				"eth_getBlockByHash",
				"eth_getBlockByNumber",
				"eth_getLogs",
				"eth_sendRawTransaction",
				"eth_syncing",
			];
			const ethEngineSubsetMethods: { [key: string]: Function } = {};
			for (const method of ethMethodsToBeIncluded) {
				if (ethMethods[method] !== undefined)
					ethEngineSubsetMethods[method] = ethMethods[method];
			}
			methods = { ...ethEngineSubsetMethods, ...manager.getMethods(true) };
			break;
		}
	}

	const server = new jayson.Server(methods);
	server.on("request", onRequest);
	server.on("response", onBatchResponse);
	const namespaces = [
		...new Set(Object.keys(methods).map((m) => m.split("_")[0])),
	].join(",");

	return { server, methods, namespaces };
}

/**
 * Create an HTTP server listener for JSON-RPC
 */
export function createRPCServerListener(
	opts: CreateRPCServerListenerOpts,
): jayson.HttpServer {
	const { server, withEngineMiddleware, RPCCors } = opts;

	const app = Connect();
	if (typeof RPCCors === "string") app.use(cors({ origin: RPCCors }));
	// GOSSIP_MAX_SIZE_BELLATRIX is proposed to be 10MiB
	app.use(JSONParser({ limit: "11mb" }));

	if (withEngineMiddleware) {
		const { jwtSecret, unlessFn } = withEngineMiddleware;
		app.use((req: any, res: any, next: any) => {
			try {
				if (unlessFn && unlessFn(req)) return next();
				checkHeaderAuth(req, jwtSecret);
				return next();
			} catch (error) {
				if (error instanceof Error) {
					res.writeHead(401);
					res.end(`Unauthorized: ${error}`);
					return;
				}
				next(error);
			}
		});
	}
	app.use(server.middleware());
	const httpServer = createServer(app);
	httpServer.keepAliveTimeout = 20_000;
	return httpServer;
}

/**
 * Create a WebSocket server listener for JSON-RPC
 */
export function createWsRPCServerListener(
	opts: CreateWSServerOpts,
): jayson.HttpServer | undefined {
	const { server, withEngineMiddleware, RPCCors } = opts;

	// Get the server to hookup upgrade request on
	let httpServer = opts.httpServer;
	if (!httpServer) {
		const app = Connect();
		// In case browser pre-flights the upgrade request with an options request
		// more likely in case of wss connection
		if (typeof RPCCors === "string") app.use(cors({ origin: RPCCors }));
		httpServer = createServer(app);
	}
	const wss = server.websocket({ noServer: true });

	httpServer.on("upgrade", (req, socket, head) => {
		if (withEngineMiddleware) {
			const { jwtSecret } = withEngineMiddleware;
			try {
				checkHeaderAuth(req, jwtSecret);
			} catch {
				socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
				socket.destroy();
			}
		}
		wss.handleUpgrade(req, socket, head, (ws: any) => {
			wss.emit("connection", ws, req);
		});
	});
	// Only return something if a new server was created
	return !opts.httpServer ? httpServer : undefined;
}

// ============================================================================
// Main RPC Server Startup
// ============================================================================

/**
 * Starts and returns enabled RPC servers (HTTP, WebSocket, Engine API)
 */
export function startRPCServers(
	client: EthereumClient,
	args: RPCArgs,
): Server[] {
	const { config } = client;
	const servers: Server[] = [];
	const {
		rpc,
		rpcAddr,
		rpcPort,
		ws,
		wsPort,
		wsAddr,
		rpcEngine,
		rpcEngineAddr,
		rpcEnginePort,
		wsEngineAddr,
		wsEnginePort,
		jwtSecret: jwtSecretPath,
		rpcEngineAuth,
		rpcCors,
		rpcDebug,
		rpcDebugVerbose,
	} = args;
	const manager = new RPCManager(client, config);
	const { logger } = config;
	const jwtSecret =
		rpcEngine && rpcEngineAuth
			? parseJwtSecret(config, jwtSecretPath)
			: new Uint8Array(0);
	let withEngineMethods = false;

	if ((rpc || rpcEngine) && !config.saveReceipts) {
		logger?.warn(
			`Starting client without --saveReceipts might lead to interop issues with a CL especially if the CL intends to propose blocks, omitting methods=${saveReceiptsMethods}`,
		);
	}

	if (rpc || ws) {
		let rpcHttpServer: jayson.HttpServer | undefined;
		withEngineMethods =
			rpcEngine && rpcEnginePort === rpcPort && rpcEngineAddr === rpcAddr;

		const { server, namespaces, methods } = createRPCServer(manager, {
			methodConfig: withEngineMethods
				? MethodConfig.WithEngine
				: MethodConfig.WithoutEngine,
			rpcDebugVerbose,
			rpcDebug,
			logger,
		});
		servers.push(server);

		if (rpc) {
			rpcHttpServer = createRPCServerListener({
				RPCCors: rpcCors,
				server,
				withEngineMiddleware:
					withEngineMethods && rpcEngineAuth
						? {
								jwtSecret,
								unlessFn: (req: any) =>
									Array.isArray(req.body)
										? req.body.some((r: any) =>
												r.method.includes("engine_"),
											) === false
										: req.body.method.includes("engine_") === false,
							}
						: undefined,
			});
			rpcHttpServer.listen(rpcPort, rpcAddr);
			logger?.info(
				`Started JSON RPC Server address=http://${rpcAddr}:${rpcPort} namespaces=${namespaces}${
					withEngineMethods ? " rpcEngineAuth=" + rpcEngineAuth.toString() : ""
				}`,
			);
			logger?.debug(
				`Methods available at address=http://${rpcAddr}:${rpcPort} namespaces=${namespaces} methods=${Object.keys(
					methods,
				).join(",")}`,
			);
		}
		if (ws) {
			const opts: any = {
				rpcCors,
				server,
				withEngineMiddleware:
					withEngineMethods && rpcEngineAuth ? { jwtSecret } : undefined,
			};
			if (rpcAddr === wsAddr && rpcPort === wsPort) {
				// We want to load the websocket upgrade request to the same server
				opts.httpServer = rpcHttpServer;
			}

			const rpcWsServer = createWsRPCServerListener(opts);
			if (rpcWsServer) rpcWsServer.listen(wsPort);
			logger?.info(
				`Started JSON RPC Server address=ws://${wsAddr}:${wsPort} namespaces=${namespaces}${
					withEngineMethods ? ` rpcEngineAuth=${rpcEngineAuth}` : ""
				}`,
			);
			logger?.debug(
				`Methods available at address=ws://${wsAddr}:${wsPort} namespaces=${namespaces} methods=${Object.keys(
					methods,
				).join(",")}`,
			);
		}
	}

	if (
		rpcEngine &&
		!(rpc && rpcPort === rpcEnginePort && rpcAddr === rpcEngineAddr)
	) {
		const { server, namespaces, methods } = createRPCServer(manager, {
			methodConfig: MethodConfig.EngineOnly,
			rpcDebug,
			rpcDebugVerbose,
			logger,
		});
		servers.push(server);
		const rpcHttpServer = createRPCServerListener({
			RPCCors: rpcCors,
			server,
			withEngineMiddleware: rpcEngineAuth
				? {
						jwtSecret,
					}
				: undefined,
		});
		rpcHttpServer.listen(rpcEnginePort, rpcEngineAddr);
		logger?.info(
			`Started JSON RPC server address=http://${rpcEngineAddr}:${rpcEnginePort} namespaces=${namespaces} rpcEngineAuth=${rpcEngineAuth}`,
		);
		logger?.debug(
			`Methods available at address=http://${rpcEngineAddr}:${rpcEnginePort} namespaces=${namespaces} methods=${Object.keys(
				methods,
			).join(",")}`,
		);

		if (ws) {
			const opts: any = {
				rpcCors,
				server,
				withEngineMiddleware: rpcEngineAuth ? { jwtSecret } : undefined,
			};

			if (rpcEngineAddr === wsEngineAddr && rpcEnginePort === wsEnginePort) {
				// We want to load the websocket upgrade request to the same server
				opts.httpServer = rpcHttpServer;
			}

			const rpcWsServer = createWsRPCServerListener(opts);
			if (rpcWsServer) rpcWsServer.listen(wsEnginePort, wsEngineAddr);
			logger?.info(
				`Started JSON RPC Server address=ws://${wsEngineAddr}:${wsEnginePort} namespaces=${namespaces} rpcEngineAuth=${rpcEngineAuth}`,
			);
			logger?.debug(
				`Methods available at address=ws://${wsEngineAddr}:${wsEnginePort} namespaces=${namespaces} methods=${Object.keys(
					methods,
				).join(",")}`,
			);
		}
	}

	return servers;
}

/**
 * Output RPC help and exit
 */
export function helpRPC() {
	/* eslint-disable no-console */
	console.log("-".repeat(27));
	console.log("JSON-RPC: Supported Methods");
	console.log("-".repeat(27));
	console.log();
	for (const modName of modules.list) {
		console.log(`${modName}:`);
		const methods = RPCManager.getMethodNames((modules as any)[modName]);
		for (const methodName of methods) {
			console.log(`-> ${modName.toLowerCase()}_${methodName}`);
		}
		console.log();
	}
	console.log();
	/* eslint-enable no-console */
	process.exit();
}
