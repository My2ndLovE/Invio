import { sign, verify, decode } from "hono/jwt";
import { getJwtSecret, getAdminCredentials } from "./env.ts";

function validateSecret(secretKey: string) {
  if (!secretKey || secretKey.trim().length === 0) {
    throw new Error("JWT_SECRET must not be empty");
  }

  const trimmed = secretKey.trim();
  if (trimmed.length < 16) {
    console.warn("Warning: JWT_SECRET is shorter than 16 characters. Consider using a longer secret for better security.");
  }
}

function validateAdminCredentials(env?: Record<string, any>) {
  const { username, password } = getAdminCredentials(env);
  if (!username || username.trim().length === 0) {
    throw new Error("ADMIN_USER must not be empty");
  }
  if (!password || password.trim().length === 0) {
    throw new Error("ADMIN_PASS must not be empty");
  }
}

export async function createJWT(payload: Record<string, unknown>, env?: Record<string, any>) {
  validateAdminCredentials(env);
  const secret = getJwtSecret(env);
  validateSecret(secret);
  return await sign(payload, secret, "HS256");
}

export async function generateJWT(adminUser: string) {
  return await createJWT({ user: adminUser });
}

export async function verifyJWT(token: string, env?: Record<string, any>) {
  try {
    const secret = getJwtSecret(env);
    return await verify(token, secret, "HS256");
  } catch (error) {
    console.error("JWT verification failed:", error);
    return null;
  }
}

export function decodeJWT(token: string) {
  const { payload } = decode(token);
  return payload;
}
