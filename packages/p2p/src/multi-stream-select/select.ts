import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";
import { AbstractMessageStream } from "../stream/default-message-stream";
import { MAX_PROTOCOL_LENGTH, PROTOCOL_ID } from "./constants";
import type { MultistreamSelectInit } from "./index";
import { lpStream } from "./lp-stream";
import { readString } from "./multistream";

/**
 * Negotiate a protocol to use from a list of protocols.
 *
 * @param stream - A duplex iterable stream to dial on
 * @param protocols - A list of protocols (or single protocol) to negotiate with. Protocols are attempted in order until a match is made.
 * @param options - An options object containing an AbortSignal
 * @returns The protocol that was selected from the list of protocols provided to `select`.
 */
export async function select(
	stream: AbstractMessageStream,
	protocols: string | string[],
	options: MultistreamSelectInit = {},
): Promise<string> {
	protocols = Array.isArray(protocols) ? [...protocols] : [protocols];

	if (protocols.length === 0) {
		throw new Error("At least one protocol must be specified");
	}

	const log = stream.log.newScope("mss:select");
	const lp = lpStream(stream, {
		...options,
		maxDataLength: MAX_PROTOCOL_LENGTH,
	});

	for (let i = 0; i < protocols.length; i++) {
		const protocol = protocols[i];
		let response: string;

		if (i === 0) {
			// Write the multistream-select header along with the first protocol
			log.trace('write ["%s", "%s"]', PROTOCOL_ID, protocol);
			const p1 = uint8ArrayFromString(`${PROTOCOL_ID}\n`);
			const p2 = uint8ArrayFromString(`${protocol}\n`);
			await lp.writeV([p1, p2], options);

			log.trace("reading multistream-select header");
			response = await readString(lp, options);
			log.trace('read "%s"', response);

			// Read the protocol response if we got the protocolId in return
			if (response !== PROTOCOL_ID) {
				log.error("did not read multistream-select header from response");
				break;
			}
		} else {
			// We haven't gotten a valid ack, try the other protocols
			log.trace('write "%s"', protocol);
			await lp.write(uint8ArrayFromString(`${protocol}\n`), options);
		}

		log.trace("reading protocol response");
		response = await readString(lp, options);
		log.trace('read "%s"', response);

		if (response === protocol) {
			log.trace('selected "%s" after negotiation', response);
			lp.unwrap();

			return protocol;
		}
	}

	throw new Error(
		`Protocol selection failed - could not negotiate ${protocols}`,
	);
}
