import { Context, Next } from "hono";
import { requestId } from "hono/request-id";
import type { ExecutionNode } from "../../node/index.ts";
import { INTERNAL_ERROR } from "../error-code.ts";
import { getRpcErrorResponse } from "../helpers.ts";
import { createRpcHandlers } from "../modules/index.ts";
import { RateLimiter } from "../rate-limit/index.ts";
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
	private rateLimiter?: RateLimiter;

	constructor(
		optsArg: Partial<RpcServerOptsExtended>,
		modules: RpcServerModulesExtended,
	) {
		const opts = { ...rpcServerOpts, ...optsArg };
		super(opts, modules);
		this.modules = modules;

		// Initialize rate limiter if enabled
		const rateLimitOptions = modules.node.config.options.rateLimit;
		if (rateLimitOptions?.enabled !== false) {
			this.rateLimiter = new RateLimiter(rateLimitOptions);
		}

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
		// Rate limiting middleware - must be before RPC handler
		if (this.rateLimiter) {
			this.app.use("*", this.rateLimit.bind(this));
		}
		// rpcHandlers is a Hono handler function, cast to any to avoid type mismatch
		this.app.post("/", rpcValidator(rpcRequestSchema), rpcHandlers as any);
	}

	async listen(): Promise<void> {
		await super.listen();
		this.isRpcReady = true;
	}

	async close(): Promise<void> {
		this.isRpcReady = false;
		this.rateLimiter?.close();
		await super.close();
	}

	private async rateLimit(c: Context<RpcApiEnv>, next: Next) {
		if (!this.rateLimiter) return next();

		const ip =
			c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
			c.req.header("x-real-ip") ||
			"unknown";
		const rpcMethod = c.get?.("rpcMethod") as string | undefined;

		const result = this.rateLimiter.allows(ip, rpcMethod);
		this.rateLimiter.record(ip, rpcMethod);

		if (!result.allowed) {
			// Update metrics
			if (this.modules.node.config.metrics) {
				this.modules.node.config.metrics.rpc.rateLimitHits.inc({
					method: rpcMethod ?? "unknown",
				});
				this.modules.node.config.metrics.rpc.rateLimitBlocked.inc({
					method: rpcMethod ?? "unknown",
				});
			}

			this.logger.warn(
				`Rate limit exceeded for IP ${ip}${rpcMethod ? ` method ${rpcMethod}` : ""}`,
			);

			return getRpcErrorResponse(
				c,
				{
					code: -32005, // Rate limit error code
					message: `Rate limit exceeded. Retry after ${result.retryAfter} seconds`,
					data: {
						retryAfter: result.retryAfter,
						remaining: result.remaining,
					},
				},
				429,
			);
		}

		return next();
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
