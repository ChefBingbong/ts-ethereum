import debug from "debug";
import type { Socket } from "node:net";
import type { MAC } from "../../../transport/rlpx/mac";

const log = debug("p2p:ecies:validation");

/**
 * Check for leftover data in socket buffer and validate socket state
 * Returns any leftover data found
 */
export function checkLeftoverSocketData(socket: Socket, phase: string): {
	hasLeftover: boolean;
	leftoverBytes: number;
	warning: string | null;
} {
	// Check if socket is readable and has data
	const readable = socket.readable;
	const destroyed = socket.destroyed;
	
	log(`🔍 [${phase}] Socket state check: readable=${readable}, destroyed=${destroyed}`);
	
	// Note: Node.js sockets don't expose a direct way to check buffered data
	// But we can check listener counts to detect potential issues
	const listenerCounts = {
		data: socket.listenerCount("data"),
		error: socket.listenerCount("error"),
		close: socket.listenerCount("close"),
	};
	
	log(`🔍 [${phase}] Socket listener counts: data=${listenerCounts.data}, error=${listenerCounts.error}, close=${listenerCounts.close}`);
	
	if (listenerCounts.data > 1) {
		return {
			hasLeftover: false,
			leftoverBytes: 0,
			warning: `Multiple data listeners detected (${listenerCounts.data}). This may cause data corruption.`,
		};
	}
	
	return {
		hasLeftover: false,
		leftoverBytes: 0,
		warning: null,
	};
}

/**
 * Validate MAC initialization state
 * Checks that MAC instances are properly initialized and match expected state
 */
export function validateMacState(
	ingressMac: MAC,
	egressMac: MAC,
	phase: string,
	expectedIngressDigest?: Uint8Array,
	expectedEgressDigest?: Uint8Array,
): {
	valid: boolean;
	errors: string[];
	warnings: string[];
} {
	const errors: string[] = [];
	const warnings: string[] = [];
	
	if (!ingressMac || !egressMac) {
		errors.push("MAC instances are null or undefined");
		return { valid: false, errors, warnings };
	}
	
	try {
		const ingressDigest = ingressMac.digest();
		const egressDigest = egressMac.digest();
		
		log(`🔍 [${phase}] MAC state validation:`);
		log(`  ingressMac digest: ${Buffer.from(ingressDigest).toString("hex").slice(0, 16)}...`);
		log(`  egressMac digest: ${Buffer.from(egressDigest).toString("hex").slice(0, 16)}...`);
		
		// If expected digests are provided, validate against them
		if (expectedIngressDigest) {
			const matches = ingressDigest.every((byte, i) => byte === expectedIngressDigest[i]);
			if (!matches) {
				errors.push(
					`Ingress MAC digest mismatch. Expected: ${Buffer.from(expectedIngressDigest).toString("hex").slice(0, 16)}..., Got: ${Buffer.from(ingressDigest).toString("hex").slice(0, 16)}...`,
				);
			}
		}
		
		if (expectedEgressDigest) {
			const matches = egressDigest.every((byte, i) => byte === expectedEgressDigest[i]);
			if (!matches) {
				errors.push(
					`Egress MAC digest mismatch. Expected: ${Buffer.from(expectedEgressDigest).toString("hex").slice(0, 16)}..., Got: ${Buffer.from(egressDigest).toString("hex").slice(0, 16)}...`,
				);
			}
		}
		
		// Check if MACs are identical (shouldn't be)
		const macsIdentical = ingressDigest.every((byte, i) => byte === egressDigest[i]);
		if (macsIdentical) {
			warnings.push("Ingress and egress MAC digests are identical - this may indicate initialization error");
		}
		
	} catch (err: any) {
		errors.push(`Failed to get MAC digest: ${err.message}`);
	}
	
	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}

/**
 * Ensure all socket listeners are cleaned up before starting new phase
 */
export function ensureCleanSocketListeners(
	socket: Socket,
	phase: string,
	allowedListeners: string[] = ["close", "error", "end"],
): {
	cleaned: boolean;
	removedListeners: string[];
	warnings: string[];
} {
	const removedListeners: string[] = [];
	const warnings: string[] = [];
	
	// Get all event types that have listeners
	const events = socket.eventNames();
	
	log(`🔍 [${phase}] Checking socket listeners before phase transition`);
	log(`  Current listeners: ${Array.from(events).join(", ")}`);
	
	// Remove data listeners (they should be cleaned up by previous phase)
	if (socket.listenerCount("data") > 0) {
		warnings.push(`Found ${socket.listenerCount("data")} data listener(s) - these should have been cleaned up`);
		// Don't remove them automatically - let the previous phase cleanup handle it
	}
	
	// Check for other unexpected listeners
	// Note: "end" is a normal Node.js socket event, so we allow it
	for (const event of events) {
		const eventName = String(event);
		if (!allowedListeners.includes(eventName) && socket.listenerCount(eventName) > 0) {
			warnings.push(`Unexpected listener found: ${eventName} (${socket.listenerCount(eventName)} listeners)`);
		}
	}
	
	return {
		cleaned: warnings.length === 0,
		removedListeners,
		warnings,
	};
}

/**
 * Validate handshake phase transition
 * Ensures clean state between AUTH/ACK and HELLO phases
 */
export function validateHandshakeTransition(
	socket: Socket,
	ingressMac: MAC,
	egressMac: MAC,
	fromPhase: string,
	toPhase: string,
): {
	valid: boolean;
	errors: string[];
	warnings: string[];
} {
	const errors: string[] = [];
	const warnings: string[] = [];
	
	log(`🔄 Validating handshake transition: ${fromPhase} → ${toPhase}`);
	
	// Check socket state
	const socketCheck = checkLeftoverSocketData(socket, `transition:${fromPhase}→${toPhase}`);
	if (socketCheck.warning) {
		warnings.push(socketCheck.warning);
	}
	
	// Check listener cleanup
	const listenerCheck = ensureCleanSocketListeners(socket, `transition:${fromPhase}→${toPhase}`);
	warnings.push(...listenerCheck.warnings);
	
	// Validate MAC state
	const macCheck = validateMacState(ingressMac, egressMac, `transition:${fromPhase}→${toPhase}`);
	errors.push(...macCheck.errors);
	warnings.push(...macCheck.warnings);
	
	const valid = errors.length === 0;
	
	if (!valid) {
		log(`❌ [${fromPhase}→${toPhase}] Validation failed:`);
		errors.forEach((err) => log(`  ERROR: ${err}`));
	}
	if (warnings.length > 0) {
		log(`⚠️ [${fromPhase}→${toPhase}] Warnings:`);
		warnings.forEach((warn) => log(`  WARN: ${warn}`));
	}
	if (valid && warnings.length === 0) {
		log(`✅ [${fromPhase}→${toPhase}] Validation passed`);
	}
	
	return { valid, errors, warnings };
}

/**
 * Log MAC state for debugging
 */
export function logMacState(
	ingressMac: MAC,
	egressMac: MAC,
	phase: string,
	context?: Record<string, any>,
): void {
	try {
		const ingressDigest = ingressMac.digest();
		const egressDigest = egressMac.digest();
		
		log(`📊 [${phase}] MAC State:`);
		log(`  ingressMac: ${Buffer.from(ingressDigest).toString("hex")}`);
		log(`  egressMac: ${Buffer.from(egressDigest).toString("hex")}`);
		
		if (context) {
			log(`  Context:`, context);
		}
	} catch (err: any) {
		log(`❌ [${phase}] Failed to log MAC state: ${err.message}`);
	}
}

