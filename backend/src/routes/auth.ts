import { Hono } from "hono";
import { createJWT } from "../utils/jwt.ts";
import { getAdminCredentials, getEnv } from "../utils/env.ts";
import {
  getRateLimitConfig,
  getClientIp,
  isRateLimited,
  recordFailedAttempt,
  resetRateLimit,
  createRateLimitResponse,
} from "../middleware/rateLimiter.ts";

function getSessionTtlSeconds(): number {
  const parsed = parseInt(getEnv("SESSION_TTL_SECONDS", "3600") || "3600", 10);
  const candidate = Number.isFinite(parsed) ? parsed : 3600;
  return Math.max(300, Math.min(60 * 60 * 12, candidate));
}

const authRoutes = new Hono();

authRoutes.post("/auth/login", async (c) => {
  const config = getRateLimitConfig();
  const clientIp = getClientIp(c.req.raw.headers, config.trustProxy);

  let username: string | undefined;
  let password: string | undefined;

  try {
    const body = await c.req.json();
    if (body && typeof body.username === "string" && typeof body.password === "string") {
      username = body.username;
      password = body.password;
    }
  } catch {
    // ignore parse errors; fall through to missing credentials handling
  }

  if (!username || !password) {
    return c.json({ error: "Missing credentials" }, 400);
  }

  // Check rate limit before attempting authentication
  // This checks by IP, username, and IP+username combination
  const rateLimitCheck = isRateLimited(clientIp, username);
  if (rateLimitCheck.limited) {
    return createRateLimitResponse(rateLimitCheck.retryAfter);
  }

  const { username: adminUser, password: adminPass } = getAdminCredentials(c.env);
  if (username !== adminUser || password !== adminPass) {
    // Record failed attempt for rate limiting (tracks IP, username, and combination)
    recordFailedAttempt(clientIp, username);
    return c.json({ error: "Invalid credentials" }, 401);
  }

  // Successful login: reset rate limit counters
  resetRateLimit(clientIp, username);

  const sessionTtl = getSessionTtlSeconds();
  const now = Math.floor(Date.now() / 1000);
  const token = await createJWT({ username: adminUser, iat: now, exp: now + sessionTtl }, c.env);
  return c.json({ token, expiresIn: sessionTtl });
});

export { authRoutes };
