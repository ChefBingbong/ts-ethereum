import { ConnectionHandler } from "../connection";
import type {
	,
	MuxedConnection,
} from "../connection/connection";

export class MessageRouter {
	private handlers: ConnectionHandler[] = [];

	register(handler: ConnectionHandler) {
		this.handlers.push(handler);
	}

	public handle: ConnectionHandler = async (
		conn: MuxedConnection,
		frame: any,
	) => {
		for (const h of this.handlers) {
			await h(conn, frame);
		}
	};
}
