import { RPCResponse } from "../types";


export async function rpcCall(
	url: string,
	method: string,
	params: unknown[] = [],
): Promise<unknown> {
	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			method,
			params,
			id: Date.now(),
		}),
	});

	const json = (await response.json()) as RPCResponse;

	if (json.error) {
		throw new Error(
			`RPC Error: ${json.error.message} (code: ${json.error.code})`,
		);
	}

	return json.result;
}

export async function getTransactionCount(
	rpc: string,
	address: string,
): Promise<bigint> {
	const result = await rpcCall(rpc, "eth_getTransactionCount", [
		address,
		"latest",
	]);
	return BigInt(result as string);
}

export async function getGasPrice(rpc: string): Promise<bigint> {
	const result = await rpcCall(rpc, "eth_gasPrice", []);
	return BigInt(result as string);
}

export async function getChainId(rpc: string): Promise<bigint> {
	const result = await rpcCall(rpc, "eth_chainId", []);
	return BigInt(result as string);
}

export async function estimateGas(rpc: string, tx: object): Promise<bigint> {
	const result = await rpcCall(rpc, "eth_estimateGas", [tx]);
	return BigInt(result as string);
}

export async function sendRawTransaction(
	rpc: string,
	signedTx: string,
): Promise<string> {
	return await rpcCall(rpc, "eth_sendRawTransaction", [signedTx]) as string;
}

export async function getTransactionReceipt(
	rpc: string,
	txHash: string,
): Promise<unknown> {
	return await rpcCall(rpc, "eth_getTransactionReceipt", [txHash]);
}

export async function getBalance(rpc: string, address: string): Promise<bigint> {
	const result = await rpcCall(rpc, "eth_getBalance", [address, "latest"]);
	return BigInt(result as string);
}

export async function getBlockNumber(rpc: string): Promise<bigint> {
	const result = await rpcCall(rpc, "eth_blockNumber", []);
	return BigInt(result as string);
}
