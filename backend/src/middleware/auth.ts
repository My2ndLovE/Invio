import type { Context, Next } from "hono";
import { verifyJWT } from "../utils/jwt.ts";
import { getAdminCredentials } from "../utils/env.ts";

function unauthorized(): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": "Bearer realm=\"Invio Admin\"",
    },
  });
}

export async function requireAdminAuth(c: Context, next: Next) {
  const auth = c.req.header("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return unauthorized();

  const token = auth.slice("Bearer ".length).trim();
  if (!token) return unauthorized();

  const payload = await verifyJWT(token, c.env);
  if (!payload || typeof payload !== "object") return unauthorized();

  const subject = (payload as { username?: string }).username || (payload as { user?: string }).user;
  const { username: adminUser } = getAdminCredentials(c.env);
  if (!subject || subject !== adminUser) return unauthorized();

  return await next();
}
