// @ts-ignore: Shim for dependencies that expect __dirname (like yargs)
if (typeof __dirname === "undefined") globalThis.__dirname = "/";
// @ts-ignore: Shim for dependencies that expect __filename
if (typeof __filename === "undefined") globalThis.__filename = "/app.js";

import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";
import { initDatabase, createD1Database, runWithDatabase } from "./database/init.ts";
import { adminRoutes } from "./routes/admin.ts";
import { publicRoutes } from "./routes/public.ts";
import { authRoutes } from "./routes/auth.ts";
import { logChromiumAvailability } from "./utils/chromium.ts";
import { getEnv } from "./utils/env.ts";

interface CloudflareBindings {
  DB: any;
  ADMIN_USER?: string;
  ADMIN_PASS?: string;
  JWT_SECRET?: string;
  [key: string]: any;
}

const app = new Hono<{ Bindings: CloudflareBindings }>();

// Database Initialization Middleware for Cloudflare D1
app.use("*", async (c, next) => {
  if (c.env?.DB) {
    const d1 = createD1Database(c.env.DB);
    return await runWithDatabase(d1, () => next());
  } else {
    // Local Deno / Single-tenant mode
    // initDatabase is called at the bottom for Deno
    await next();
  }
});

// Basic Middleware
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

// Routes - authRoutes and publicRoutes must come BEFORE adminRoutes
// because adminRoutes has a wildcard middleware that would catch all requests
app.route("/api/v1", authRoutes);
app.route("/api/v1", publicRoutes);
app.route("/api/v1", adminRoutes);

app.get("/", (c: Context) => c.redirect("/health"));
app.get("/health", (c: Context) => c.json({ status: "ok" }, 200));


// Deno startup
if (import.meta.main) {
  try {
    await initDatabase();
    await logChromiumAvailability();
  } catch (error) {
    console.warn("Local database init warning:", error);
  }

  const port = Number(getEnv("PORT") || "3000");
  console.log(`Starting backend on port ${port}`);
  Deno.serve({ port }, app.fetch);
}

// Export for Cloudflare Workers
export default app;
