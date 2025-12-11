import { Context } from "hono";
import { ContentfulStatusCode } from "hono/utils/http-status";
import z from "zod";
import type { PrefixedHexString } from "../../utils";
import { SafePromise } from "../../utils/safe";

export interface RPCTx {
	from?: PrefixedHexString;
	to?: PrefixedHexString;
	gas?: PrefixedHexString;
	gasPrice?: PrefixedHexString;
	value?: PrefixedHexString;
	data?: PrefixedHexString;
	input?: PrefixedHexString; // This is the "official" name of the property the client uses for "data" in the RPC spec
	maxPriorityFeePerGas?: PrefixedHexString;
	maxFeePerGas?: PrefixedHexString;
	type?: PrefixedHexString;
}

export interface RPCTxRes {
	from: PrefixedHexString;
	to?: PrefixedHexString;
	gas: PrefixedHexString;
	gasPrice: PrefixedHexString;
	value: PrefixedHexString;
	input?: PrefixedHexString;
	data?: PrefixedHexString;
	maxPriorityFeePerGas: PrefixedHexString;
	maxFeePerGas: PrefixedHexString;
	type: PrefixedHexString;
}

/**
 * Convert the return value from eth_getTransactionByHash to a {@link RPCTx} interface
 */
export type TxResult = Record<string, string> & RPCTxRes;

export function toRPCTx(t: TxResult): RPCTx {
	const rpcTx: RPCTx = {
		from: t.from,
		gas: t.gas,
		gasPrice: t.gasPrice,
		value: t.value,
		data: t.input ?? t.data,
		maxPriorityFeePerGas: t.maxPriorityFeePerGas,
		maxFeePerGas: t.maxFeePerGas,
		type: t.type,
	};
	t.to !== null && (rpcTx.to = t.to);
	return rpcTx;
}

export type RPCMethod = (...params: any) => any;

export type RPCError = {
	code: number;
	message: string;
	data?: unknown;
	trace?: string;
};

export type RpcApiEnv = {
	Variables: {
		ok: (
			c: Context<RpcApiEnv>,
			result: any,
			status?: ContentfulStatusCode,
		) => Response;
		fail: (
			c: Context<RpcApiEnv>,
			error: RPCError,
			status?: ContentfulStatusCode,
		) => Response;
		jsonrpc: string;
		rpcParams: any[];
		rpcId: string | number | null;
		rpcMethod: string;
	};
};

const rpcParamsSchema = z
	.array(
		z.union([z.record(z.string(), z.unknown()), z.array(z.unknown()), z.any()]),
	)
	.default([]);

export const rpcRequestSchema = z.object({
	jsonrpc: z.literal("2.0", { error: "Invalid JSON-RPC version" }),
	method: z.string({ error: "Invalid method" }),
	id: z.union([z.string(), z.number(), z.null()]).optional(),
	params: rpcParamsSchema,
});

export type RpcRequest = z.infer<typeof rpcRequestSchema>;

export type RpcMethodFn = (
	c: Context<RpcApiEnv>,
	params: any[],
) => SafePromise<any>;

export type RpcHandlerOptions = {
	debug?: boolean;
};

export type RpcHandler<T> = (
	parsed: T,
	c: Context<RpcApiEnv>,
) => Promise<any> | any;

export type RpcParams = z.infer<typeof rpcParamsSchema>;
