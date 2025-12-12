import z from "zod";

export const peerInfoSchema = z.object({
	id: z
		.string()
		.transform(
			(val) => new Uint8Array(val.split(":").map((byte) => parseInt(byte, 16))),
		)
		.optional(),
	address: z.string().optional(),
	udpPort: z.number().int().min(0).max(65535).optional(),
	tcpPort: z.number().int().min(0).max(65535).optional(),
	vectorClock: z.number().int().min(0).optional(),
});

export const nodeInfoSchema = z.any();

export const peersSchema = z.any();
