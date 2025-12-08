export interface AccountInfo {
	index: number;
	address: string;
	privateKey: string;
	role: string;
}

export interface RPCResponse {
	jsonrpc: string;
	id: number;
	result?: any;
	error?: { code: number; message: string };
}
