// Dotenv is only loaded in Deno environment
let envLoaded = false;

async function loadEnvOnce() {
  if (typeof Deno === "undefined") return;
  if (envLoaded) return;
  try {
    const dotEnvModule = "dotenv";
    const { load } = await import(dotEnvModule);
    const parsed = await load();
    for (const [key, value] of Object.entries(parsed)) {
      if (!Deno.env.get(key)) {
        Deno.env.set(key, value);
      }
    }
    envLoaded = true;
  } catch (e) {
    console.debug("No .env file found or dotenv failed to load", e);
  }
}

export function getEnv(key: string, defaultValue?: string): string | undefined {
  if (typeof Deno !== "undefined") {
    return Deno.env.get(key) || defaultValue;
  }
  return defaultValue;
}

export function requireEnv(key: string): string {
  const val = getEnv(key);
  if (!val) {
    if (typeof Deno === "undefined") return ""; // Don't crash in Worker if secret missing
    throw new Error(`Environment variable ${key} is required`);
  }
  return val;
}

export function getAdminCredentials(env?: Record<string, any>) {
  // If env is provided (Cloudflare Workers), use it directly
  if (env) {
    return {
      username: env.ADMIN_USER || "admin",
      password: env.ADMIN_PASS || "admin",
    };
  }
  // Otherwise fall back to getEnv (Deno)
  return {
    username: getEnv("ADMIN_USER") || "admin",
    password: getEnv("ADMIN_PASS") || "admin",
  };
}

export function getJwtSecret(env?: Record<string, any>): string {
  // If env is provided (Cloudflare Workers), use it directly
  if (env && env.JWT_SECRET) {
    return env.JWT_SECRET;
  }
  return getEnv("JWT_SECRET") || "default-secret-change-me";
}

export function isDemoMode(): boolean {
  return getEnv("DEMO_MODE") === "true";
}
