import { Context, Next } from "hono";
import { requestId } from "hono/request-id";
import type { ExecutionNode } from "../../node/index.ts";
import { INTERNAL_ERROR } from "../error-code.ts";
import { getRpcErrorResponse } from "../helpers.ts";
import { createRpcHandlers } from "../modules/index.ts";
import { RpcApiEnv, rpcRequestSchema } from "../types.ts";
import { rpcValidator } from "../validation.ts";
import {
	RpcServerBase,
	type RpcServerModules,
	type RpcServerOpts,
} from "./base.ts";

export type RpcServerOptsExtended = RpcServerOpts & {
	enabled: boolean;
	debug?: boolean;
};

export const rpcServerOpts: RpcServerOptsExtended = {
	enabled: true,
	address: "127.0.0.1",
	port: 8545,
	cors: undefined,
	bodyLimit: 10 * 1024 * 1024, // 10MB
	stacktraces: false,
	debug: false,
};

export type RpcServerModulesExtended = RpcServerModules & {
	node: ExecutionNode;
};

export class RpcServer extends RpcServerBase {
	readonly modules: RpcServerModulesExtended;
	private isRpcReady = false;

	constructor(
		optsArg: Partial<RpcServerOptsExtended>,
		modules: RpcServerModulesExtended,
	) {
		const opts = { ...rpcServerOpts, ...optsArg };
		super(opts, modules);
		this.modules = modules;
		this.registerRoutes();
	}

	private registerRoutes(): void {
		const { rpcHandlers } = createRpcHandlers(
			this.modules.node,
			this.opts.debug ?? false,
		);

		this.app.use("*", requestId({ generator: () => Date.now().toString() }));
		// Ready check middleware - must be before RPC handler
		this.app.use("*", this.onReady.bind(this));
		// rpcHandlers is a Hono handler function, cast to any to avoid type mismatch
		this.app.post("/", rpcValidator(rpcRequestSchema), rpcHandlers as any);
	}

	async listen(): Promise<void> {
		await super.listen();
		this.isRpcReady = true;
	}

	async close(): Promise<void> {
		this.isRpcReady = false;
		await super.close();
	}

	private async onReady(c: Context<RpcApiEnv>, next: Next) {
		if (this.isRpcReady) return next();
		return getRpcErrorResponse(
			c,
			{
				code: INTERNAL_ERROR,
				message: "RPC server is not ready yet",
			},
			503,
		);
	}

	protected shouldIgnoreError(err: Error): boolean {
		return false;
	}
}
