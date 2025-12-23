/**
 * Rate Limiting Types
 */

/**
 * Rate limit configuration options
 */
export interface RateLimitOptions {
	/**
	 * Enable rate limiting
	 * @default true
	 */
	enabled?: boolean;

	/**
	 * Maximum requests per second per IP
	 * @default 100
	 */
	requestsPerSecond?: number;

	/**
	 * Maximum requests per minute per IP
	 * @default 6000
	 */
	requestsPerMinute?: number;

	/**
	 * Burst size (maximum requests allowed in a single burst)
	 * @default 200
	 */
	burstSize?: number;

	/**
	 * Enable per-method rate limiting
	 * @default false
	 */
	perMethod?: boolean;

	/**
	 * Whitelist of IPs that bypass rate limiting
	 * @default []
	 */
	whitelist?: string[];

	/**
	 * Blacklist of IPs that are always rate limited
	 * @default []
	 */
	blacklist?: string[];
}

/**
 * Token bucket state
 */
export interface TokenBucket {
	tokens: number;
	lastRefill: number;
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
	allowed: boolean;
	retryAfter?: number;
	remaining?: number;
}

