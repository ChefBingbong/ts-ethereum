import { type NodeOptions, PeerNode } from "./node";

export async function createNode(options: NodeOptions): Promise<PeerNode> {
	const node = new PeerNode(options);

	if (options.start) {
		await node.start();
	}

	return node;
}
