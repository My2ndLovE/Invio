/**
 * Sliding Window Rate Limiter for Authentication Endpoints
 *
 * Protects against brute-force and credential stuffing attacks by limiting
 * failed authentication attempts. Tracks attempts by:
 * 1. IP + Username combination (prevents single IP attacking one account)
 * 2. Username only (prevents distributed attacks on single account from multiple IPs)
 * 3. IP only (prevents single IP attacking multiple accounts)
 *
 * Uses an in-memory sliding window algorithm for Deno environments.
 */

import { getEnv } from "../utils/env.ts";

interface RateLimitEntry {
  attempts: number;
  windowStart: number;
  timestamps: number[];
}

// In-memory stores for rate limit entries
// Separate stores for different tracking strategies
const ipUserStore = new Map<string, RateLimitEntry>();      // "ip:username" key
const usernameStore = new Map<string, RateLimitEntry>();    // username only
const ipStore = new Map<string, RateLimitEntry>();          // IP only

// Cleanup interval to prevent memory leaks (runs every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Get rate limit configuration from environment variables
 */
export function getRateLimitConfig(): {
  enabled: boolean;
  maxAttempts: number;
  windowSeconds: number;
  trustProxy: boolean;
} {
  const enabled = (getEnv("RATE_LIMIT_ENABLED", "true") || "true").toLowerCase() !== "false";
  const maxAttempts = parseInt(getEnv("RATE_LIMIT_MAX_ATTEMPTS", "5") || "5", 10);
  const windowSeconds = parseInt(getEnv("RATE_LIMIT_WINDOW_SECONDS", "900") || "900", 10);
  const trustProxy = (getEnv("RATE_LIMIT_TRUST_PROXY", "false") || "false").toLowerCase() === "true";

  return {
    enabled,
    maxAttempts: Number.isFinite(maxAttempts) && maxAttempts > 0 ? maxAttempts : 5,
    windowSeconds: Number.isFinite(windowSeconds) && windowSeconds > 0 ? windowSeconds : 900,
    trustProxy,
  };
}

/**
 * Extract client IP address from request headers
 * Respects X-Forwarded-For when RATE_LIMIT_TRUST_PROXY is enabled
 */
export function getClientIp(headers: Headers, trustProxy: boolean): string {
  if (trustProxy) {
    // Check X-Forwarded-For first (most common proxy header)
    const xForwardedFor = headers.get("x-forwarded-for");
    if (xForwardedFor) {
      // Take the first IP (original client) from the chain
      const firstIp = xForwardedFor.split(",")[0]?.trim();
      if (firstIp) return firstIp;
    }

    // Check X-Real-IP (nginx)
    const xRealIp = headers.get("x-real-ip");
    if (xRealIp) return xRealIp.trim();

    // Check CF-Connecting-IP (Cloudflare)
    const cfConnectingIp = headers.get("cf-connecting-ip");
    if (cfConnectingIp) return cfConnectingIp.trim();
  }

  // Fallback: use a generic identifier if no IP can be determined
  // In production behind a proxy, this should not happen if configured correctly
  return "unknown";
}

/**
 * Sanitize username for use as a key
 */
function sanitizeUsername(username: string): string {
  return username.toLowerCase().replace(/[^a-z0-9@._-]/gi, "");
}

/**
 * Check if entry is rate limited
 */
function checkEntry(
  store: Map<string, RateLimitEntry>,
  key: string,
  maxAttempts: number,
  windowMs: number
): { limited: boolean; retryAfter: number; remaining: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry) {
    return { limited: false, retryAfter: 0, remaining: maxAttempts };
  }

  // Filter timestamps to only include those within the current window
  const validTimestamps = entry.timestamps.filter(ts => now - ts < windowMs);

  if (validTimestamps.length >= maxAttempts) {
    // Calculate when the oldest attempt will expire
    const oldestTimestamp = Math.min(...validTimestamps);
    const retryAfter = Math.ceil((oldestTimestamp + windowMs - now) / 1000);
    return {
      limited: true,
      retryAfter: Math.max(1, retryAfter),
      remaining: 0
    };
  }

  return {
    limited: false,
    retryAfter: 0,
    remaining: maxAttempts - validTimestamps.length
  };
}

/**
 * Check if a request is rate limited
 * Checks all three strategies: IP+user, username only, IP only
 * Returns limited if ANY of the checks fail
 */
export function isRateLimited(ip: string, username?: string): {
  limited: boolean;
  retryAfter: number;
  remaining: number;
  reason?: "ip" | "username" | "ip_username";
} {
  const config = getRateLimitConfig();

  if (!config.enabled) {
    return { limited: false, retryAfter: 0, remaining: config.maxAttempts };
  }

  const windowMs = config.windowSeconds * 1000;

  // Check IP only (prevents single IP attacking multiple accounts)
  const ipCheck = checkEntry(ipStore, ip, config.maxAttempts, windowMs);
  if (ipCheck.limited) {
    return { ...ipCheck, reason: "ip" };
  }

  if (username) {
    const sanitizedUser = sanitizeUsername(username);

    // Check username only (prevents distributed attacks on single account)
    const usernameCheck = checkEntry(usernameStore, sanitizedUser, config.maxAttempts, windowMs);
    if (usernameCheck.limited) {
      return { ...usernameCheck, reason: "username" };
    }

    // Check IP + username combination
    const ipUserKey = `${ip}:${sanitizedUser}`;
    const ipUserCheck = checkEntry(ipUserStore, ipUserKey, config.maxAttempts, windowMs);
    if (ipUserCheck.limited) {
      return { ...ipUserCheck, reason: "ip_username" };
    }

    // Return the minimum remaining attempts across all checks
    const minRemaining = Math.min(ipCheck.remaining, usernameCheck.remaining, ipUserCheck.remaining);
    return { limited: false, retryAfter: 0, remaining: minRemaining };
  }

  return { limited: false, retryAfter: 0, remaining: ipCheck.remaining };
}

/**
 * Record a failed attempt in a store
 */
function recordAttempt(store: Map<string, RateLimitEntry>, key: string, windowMs: number): void {
  const now = Date.now();
  const entry = store.get(key);

  if (entry) {
    // Clean old timestamps and add new one
    const validTimestamps = entry.timestamps.filter(ts => now - ts < windowMs);
    validTimestamps.push(now);

    store.set(key, {
      attempts: validTimestamps.length,
      windowStart: entry.windowStart,
      timestamps: validTimestamps,
    });
  } else {
    store.set(key, {
      attempts: 1,
      windowStart: now,
      timestamps: [now],
    });
  }
}

/**
 * Record a failed authentication attempt
 * Records in all three stores for comprehensive tracking
 */
export function recordFailedAttempt(ip: string, username?: string): void {
  const config = getRateLimitConfig();

  if (!config.enabled) return;

  const windowMs = config.windowSeconds * 1000;

  // Always record by IP
  recordAttempt(ipStore, ip, windowMs);

  if (username) {
    const sanitizedUser = sanitizeUsername(username);

    // Record by username only (for distributed attack protection)
    recordAttempt(usernameStore, sanitizedUser, windowMs);

    // Record by IP + username combination
    const ipUserKey = `${ip}:${sanitizedUser}`;
    recordAttempt(ipUserStore, ipUserKey, windowMs);
  }
}

/**
 * Reset rate limit counter for a successful login
 * This prevents legitimate users from being locked out after password recovery
 */
export function resetRateLimit(ip: string, username?: string): void {
  // Reset IP + username combination
  if (username) {
    const sanitizedUser = sanitizeUsername(username);
    const ipUserKey = `${ip}:${sanitizedUser}`;
    ipUserStore.delete(ipUserKey);

    // Reduce username-only counter (don't fully reset to prevent abuse)
    const usernameEntry = usernameStore.get(sanitizedUser);
    if (usernameEntry) {
      const reduced = Math.max(0, usernameEntry.attempts - 1);
      if (reduced === 0) {
        usernameStore.delete(sanitizedUser);
      } else {
        usernameEntry.attempts = reduced;
        usernameEntry.timestamps = usernameEntry.timestamps.slice(-reduced);
        usernameStore.set(sanitizedUser, usernameEntry);
      }
    }
  }

  // Reduce IP-only counter (don't fully reset to prevent abuse)
  const ipEntry = ipStore.get(ip);
  if (ipEntry) {
    const reduced = Math.max(0, ipEntry.attempts - 1);
    if (reduced === 0) {
      ipStore.delete(ip);
    } else {
      ipEntry.attempts = reduced;
      ipEntry.timestamps = ipEntry.timestamps.slice(-reduced);
      ipStore.set(ip, ipEntry);
    }
  }
}

/**
 * Create HTTP 429 response with appropriate headers
 */
export function createRateLimitResponse(retryAfter: number): Response {
  return new Response(
    JSON.stringify({
      error: "Too many login attempts. Please try again later.",
      retryAfter,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
        "X-RateLimit-Remaining": "0",
      },
    }
  );
}

/**
 * Cleanup expired entries from a store
 */
function cleanupStore(store: Map<string, RateLimitEntry>, windowMs: number): void {
  const now = Date.now();

  for (const [key, entry] of store.entries()) {
    const validTimestamps = entry.timestamps.filter(ts => now - ts < windowMs);
    if (validTimestamps.length === 0) {
      store.delete(key);
    } else if (validTimestamps.length !== entry.timestamps.length) {
      entry.timestamps = validTimestamps;
      entry.attempts = validTimestamps.length;
    }
  }
}

/**
 * Cleanup expired entries to prevent memory leaks
 */
function cleanupExpiredEntries(): void {
  const config = getRateLimitConfig();
  const windowMs = config.windowSeconds * 1000;

  cleanupStore(ipUserStore, windowMs);
  cleanupStore(usernameStore, windowMs);
  cleanupStore(ipStore, windowMs);
}

// Start cleanup interval
setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL_MS);

/**
 * Get current store sizes (for monitoring/debugging)
 */
export function getRateLimitStoreSizes(): { ipUser: number; username: number; ip: number } {
  return {
    ipUser: ipUserStore.size,
    username: usernameStore.size,
    ip: ipStore.size,
  };
}
