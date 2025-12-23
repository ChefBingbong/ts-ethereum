/**
 * Rate Limiting Implementation
 *
 * Token bucket algorithm for rate limiting RPC requests
 */

import type { RateLimitOptions, RateLimitResult, TokenBucket } from "./types.ts";

/**
 * Token bucket rate limiter
 */
export class RateLimiter {
	private buckets: Map<string, TokenBucket> = new Map();
	private readonly requestsPerSecond: number;
	private readonly requestsPerMinute: number;
	private readonly burstSize: number;
	private readonly perMethod: boolean;
	private readonly whitelist: Set<string>;
	private readonly blacklist: Set<string>;
	private cleanupInterval: NodeJS.Timeout | undefined;

	constructor(options: RateLimitOptions = {}) {
		this.requestsPerSecond = options.requestsPerSecond ?? 100;
		this.requestsPerMinute = options.requestsPerMinute ?? 6000;
		this.burstSize = options.burstSize ?? 200;
		this.perMethod = options.perMethod ?? false;
		this.whitelist = new Set(options.whitelist ?? []);
		this.blacklist = new Set(options.blacklist ?? []);

		// Cleanup old buckets every 5 minutes
		this.cleanupInterval = setInterval(() => {
			this.cleanup();
		}, 5 * 60 * 1000);
	}

	/**
	 * Check if request is allowed
	 */
	allows(ip: string, method?: string): RateLimitResult {
		// Check whitelist
		if (this.whitelist.has(ip)) {
			return { allowed: true };
		}

		// Check blacklist
		if (this.blacklist.has(ip)) {
			return {
				allowed: false,
				retryAfter: 60, // 1 minute
				remaining: 0,
			};
		}

		const key = this.perMethod && method ? `${ip}:${method}` : ip;
		const bucket = this.getBucket(key);
		const now = Date.now();

		// Refill tokens based on time elapsed
		const elapsedSeconds = (now - bucket.lastRefill) / 1000;
		const tokensToAdd = elapsedSeconds * this.requestsPerSecond;
		bucket.tokens = Math.min(
			this.burstSize,
			bucket.tokens + tokensToAdd,
		);
		bucket.lastRefill = now;

		// Check if request is allowed
		if (bucket.tokens >= 1) {
			bucket.tokens -= 1;
			return {
				allowed: true,
				remaining: Math.floor(bucket.tokens),
			};
		}

		// Calculate retry after time
		const tokensNeeded = 1 - bucket.tokens;
		const retryAfter = Math.ceil(tokensNeeded / this.requestsPerSecond);

		return {
			allowed: false,
			retryAfter,
			remaining: 0,
		};
	}

	/**
	 * Record a request (for metrics)
	 */
	record(ip: string, method?: string): void {
		// This is called after allows() which already consumes tokens
		// So we don't need to do anything here, but it's useful for metrics
	}

	/**
	 * Get or create token bucket for key
	 */
	private getBucket(key: string): TokenBucket {
		let bucket = this.buckets.get(key);
		if (!bucket) {
			bucket = {
				tokens: this.burstSize,
				lastRefill: Date.now(),
			};
			this.buckets.set(key, bucket);
		}
		return bucket;
	}

	/**
	 * Cleanup old buckets (older than 1 hour)
	 */
	private cleanup(): void {
		const now = Date.now();
		const maxAge = 60 * 60 * 1000; // 1 hour

		for (const [key, bucket] of this.buckets.entries()) {
			if (now - bucket.lastRefill > maxAge) {
				this.buckets.delete(key);
			}
		}
	}

	/**
	 * Reset rate limiter
	 */
	reset(): void {
		this.buckets.clear();
	}

	/**
	 * Close rate limiter and cleanup
	 */
	close(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = undefined;
		}
		this.buckets.clear();
	}
}

