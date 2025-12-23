import { Uint8ArrayList } from "uint8arraylist";
import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";
import { AbstractMessageStream } from "../stream/default-message-stream";
import { MAX_PROTOCOL_LENGTH, PROTOCOL_ID } from "./constants";
import type { MultistreamSelectInit } from "./index";
import { encode, lpStream } from "./lp-stream";
import { readString } from "./multistream";

/**
 * Handle multistream protocol selections for the given list of protocols.
 *
 * Note that after a protocol is handled `listener` can no longer be used.
 *
 * @param stream - A duplex iterable stream to listen on
 * @param protocols - A list of protocols (or single protocol) that this listener is able to speak.
 * @param options - an options object containing an AbortSignal
 * @returns The protocol that was selected from the list of protocols provided
 */
export async function handle(
	stream: AbstractMessageStream,
	protocols: string | string[],
	options: MultistreamSelectInit = {},
): Promise<string> {
	protocols = Array.isArray(protocols) ? protocols : [protocols];

	const log = stream.log.newScope("mss:handle");

	const lp = lpStream(stream, {
		...options,
		maxDataLength: MAX_PROTOCOL_LENGTH,
		maxLengthLength: 2, // 2 bytes is enough to length-prefix MAX_PROTOCOL_LENGTH
	});

	while (true) {
		log.trace("reading incoming string");
		const protocol = await readString(lp, options);
		log.trace('read "%s"', protocol);

		if (protocol === PROTOCOL_ID) {
			log.trace('respond with "%s" for "%s"', PROTOCOL_ID, protocol);
			await lp.write(uint8ArrayFromString(`${PROTOCOL_ID}\n`), options);
			log.trace('responded with "%s" for "%s"', PROTOCOL_ID, protocol);
			continue;
		}

		if (protocols.includes(protocol)) {
			log.trace('respond with "%s" for "%s"', protocol, protocol);
			await lp.write(uint8ArrayFromString(`${protocol}\n`), options);
			log.trace('responded with "%s" for "%s"', protocol, protocol);

			lp.unwrap();

			return protocol;
		}

		if (protocol === "ls") {
			// <varint-msg-len><varint-proto-name-len><proto-name>\n<varint-proto-name-len><proto-name>\n\n
			const protos = new Uint8ArrayList(
				...protocols.map((p) => encode.single(uint8ArrayFromString(`${p}\n`))),
				uint8ArrayFromString("\n"),
			);

			log.trace('respond with "%s" for %s', protocols, protocol);
			await lp.write(protos, options);
			log.trace('responded with "%s" for %s', protocols, protocol);
			continue;
		}

		log.trace('respond with "na" for "%s"', protocol);
		await lp.write(uint8ArrayFromString("na\n"), options);
		log('responded with "na" for "%s"', protocol);
	}
}
