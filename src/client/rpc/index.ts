import { type ServerType, serve } from "@hono/node-server";
import type { Env } from "hono";
import { Hono } from "hono";
import { requestId } from "hono/request-id";
import type { EthereumClient } from "../client.ts";
import { createRpcHandlers } from "./modules/index.ts";
import { rpcRequestSchema } from "./types.ts";
import { rpcValidator } from "./validation.ts";

export type RPCArgs = {
	rpc: boolean;
	rpcAddr: string;
	rpcPort: number;
};

export const createRpcManager = (
	ethClient: EthereumClient,
	rpcArgs: RPCArgs,
) => {
	const createKadApi = () => {
		const { rpcHandlers, methods } = createRpcHandlers(ethClient, true);
		const namespaces = methods.map((m) => m.split("_")[0]);

		const client = new Hono<Env>()
			.use("*", requestId({ generator: () => Date.now().toString() }))
			.post("/", rpcValidator(rpcRequestSchema), rpcHandlers);

		const server = serve(
			{
				fetch: client.fetch,
				port: rpcArgs.rpcPort,
				hostname: rpcArgs.rpcAddr,
			},
			(i) => console.log(`Rpc listening on ${i?.address}`),
		);
		return { server, client, methods, namespaces };
	};

	const servers: ServerType[] = [];
	const manager = createKadApi();
	servers.push(manager.server);
	return servers;
};
