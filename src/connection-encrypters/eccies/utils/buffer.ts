import { bytesToInt, concatBytes } from "../../../utils";

export class BufferAccumulator {
	private buffer = new Uint8Array(0);
	private expectedSize: number;
	private onComplete: (data: Uint8Array, isEIP8: boolean) => void;
	private checkEIP8: boolean;
	private gotEIP8 = false;

	constructor(
		initialExpectedSize: number,
		onComplete: (data: Uint8Array, isEIP8: boolean) => void,
		checkEIP8 = true,
	) {
		this.expectedSize = initialExpectedSize;
		this.onComplete = onComplete;
		this.checkEIP8 = checkEIP8;
	}

	onData(chunk: Uint8Array): boolean {
		this.buffer = concatBytes(this.buffer, chunk);

		if (this.checkEIP8 && !this.gotEIP8 && this.buffer.length >= 2) {
			if (this.buffer[0] !== 0x04) {
				this.gotEIP8 = true;
				this.expectedSize = bytesToInt(this.buffer.subarray(0, 2)) + 2;
			}
		}

		if (this.buffer.length >= this.expectedSize) {
			const packet = this.buffer.subarray(0, this.expectedSize);
			this.buffer = this.buffer.subarray(this.expectedSize);
			this.onComplete(packet, this.gotEIP8);
			return true;
		}
		return false;
	}

	isEIP8(): boolean {
		return this.gotEIP8;
	}

	getRemaining(): Uint8Array<ArrayBuffer> {
		return this.buffer as Uint8Array<ArrayBuffer>;
	}
}

export class FixedSizeAccumulator {
	private buffer = new Uint8Array(0);
	private expectedSize: number;
	private onComplete: (data: Uint8Array) => void;

	constructor(expectedSize: number, onComplete: (data: Uint8Array) => void) {
		this.expectedSize = expectedSize;
		this.onComplete = onComplete;
	}

	onData(chunk: Uint8Array): boolean {
		this.buffer = concatBytes(this.buffer, chunk);

		if (this.buffer.length >= this.expectedSize) {
			const packet = this.buffer.subarray(0, this.expectedSize);
			this.buffer = this.buffer.subarray(this.expectedSize);
			this.onComplete(packet);
			return true;
		}
		return false;
	}

	getRemaining(): Uint8Array<ArrayBuffer> {
		return this.buffer as Uint8Array<ArrayBuffer>;
	}

	setExpectedSize(size: number) {
		this.expectedSize = size;
	}
}

