import { z } from "zod";
import {
	INTERNAL_ERROR,
	INVALID_PARAMS,
	METHOD_NOT_FOUND,
} from "./error-code.ts";
import { getRpcErrorResponse, getRpcResponse } from "./helpers.ts";
import {
	RPCError,
	RpcHandler,
	RpcHandlerOptions,
	RpcMethodFn,
	RpcRequest,
} from "./types.ts";

export const rpcValidator =
	(schema: z.ZodType<RpcRequest>) => async (c, next) => {
		const requestId = c.get("requestId");
		const body = await c.req.json();
		const parsed = schema.safeParse(body);

		if (!parsed.success) {
			return c.json(
				{
					jsonrpc: "2.0",
					id: requestId,
					error: {
						code: INVALID_PARAMS,
						message: parsed.error.issues[0].message,
					},
				},
				400,
			);
		}
		const bodyParsed = parsed.data;
		const jsonrpc = bodyParsed.jsonrpc;
		const id = bodyParsed.id ?? requestId;
		const rpcMethod = bodyParsed.method;
		const rpcParams = bodyParsed.params;

		c.set("jsonrpc", jsonrpc);
		c.set("rpcId", id);
		c.set("rpcMethod", rpcMethod);
		c.set("rpcParams", rpcParams);

		c.set("ok", getRpcResponse);
		c.set("fail", getRpcErrorResponse);

		return next();
	};

export const createRpcHandler =
	(
		methods: Record<string, RpcMethodFn>,
		{ debug = false }: RpcHandlerOptions = {},
	) =>
	async (c) => {
		const rpcMethod = c.get("rpcMethod");
		const rpcParams = c.get("rpcParams");

		const ok = c.get("ok");
		const fail = c.get("fail");

		const handler = methods[rpcMethod];

		// Check if method exists
		if (!handler || typeof handler !== "function") {
			return fail(
				c,
				{
					code: METHOD_NOT_FOUND,
					message: `Method ${rpcMethod} not found`,
				},
				404,
			);
		}

		try {
			const [error, result] = await handler(c, rpcParams);

			if (error) {
				return fail(
					c,
					{
						code: INTERNAL_ERROR,
						message: error?.message ?? "Internal error",
						trace: debug ? error?.stack : undefined,
					},
					400,
				);
			}
			return ok(c, result);
		} catch (thrownError: any) {
			// Handle errors thrown by createRpcMethod (e.g., schema validation errors)
			return fail(
				c,
				{
					code: thrownError?.code ?? INTERNAL_ERROR,
					message: thrownError?.message ?? "Internal error",
					trace: debug ? thrownError?.stack : undefined,
				},
				400,
			);
		}
	};

export const createRpcMethod =
	<T>(schema: z.ZodType<T>, impl: RpcHandler<T>): RpcMethodFn =>
	async (c, params) => {
		const parsed = schema.safeParse(params ?? []);

		if (!parsed.success) {
			const error: RPCError = {
				code: INVALID_PARAMS,
				message: parsed.error.issues[0].message,
			};
			throw error;
		}

		return impl(parsed.data, c);
	};
