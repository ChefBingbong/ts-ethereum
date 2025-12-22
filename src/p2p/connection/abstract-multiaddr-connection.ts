import type { Multiaddr } from "@multiformats/multiaddr";
import { pEvent } from "p-event";
import {
	AbstractMessageStream,
	AbstractMessageStreamInit,
} from "../stream/default-message-stream";
import { MessageStreamDirection } from "../stream/types";
import { AbortOptions } from "./types";

export interface AbstractMultiaddrConnectionInit
	extends AbstractMessageStreamInit {
	remoteAddr: Multiaddr;
	direction: MessageStreamDirection;
	inactivityTimeout?: number;
	localAddr?: Multiaddr;
	logNamespace?: string;
}

export abstract class AbstractMultiaddrConnection extends AbstractMessageStream {
	public remoteAddr: Multiaddr;

	constructor(init: AbstractMultiaddrConnectionInit) {
		super({
			...init,
			logNamespace:
				init.logNamespace ?? `p2p:maconn:${init.remoteAddr.toString()}`,
		});
		this.remoteAddr = init.remoteAddr;
	}

	async close(options?: AbortOptions): Promise<void> {
		if (this.status !== "open") return;

		this.status = "closing";
		this.writeStatus = "closing";
		this.remoteWriteStatus = "closing";
		this.remoteReadStatus = "closing";

		// if we are currently sending data, wait for all the data to be written
		// into the underlying transport
		if (this.sendingData || this.writeBuffer.byteLength > 0) {
			this.log(
				"waiting for write queue to become idle before closing writable end of stream, %d unsent bytes",
				this.writeBuffer.byteLength,
			);
			await pEvent(this, "idle", {
				...options,
				rejectionEvents: ["close"],
			});
		}

		// now that the underlying transport has all the data, if the buffer is full
		// wait for it to be emptied
		if (this.writableNeedsDrain) {
			this.log(
				"waiting for write queue to drain before closing writable end of stream, %d unsent bytes",
				this.writeBuffer.byteLength,
			);
			await pEvent(this, "drain", {
				...options,
				rejectionEvents: ["close"],
			});
		}

		await this.sendClose(options);

		this.onTransportClosed();
	}

	/**
	 * Wait for any unsent data to be written to the underlying resource, then
	 * close the resource and resolve the returned promise
	 */
	abstract sendClose(options?: AbortOptions): Promise<void>;
}
