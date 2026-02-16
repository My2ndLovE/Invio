import * as esbuild from "esbuild";

// Plugin to map Deno-style bare specifiers to Node/Workers equivalents
const denoCompatPlugin = {
  name: "deno-compat",
  setup(build) {
    // Map "std/path" → "node:path" (available via nodejs_compat in Workers)
    build.onResolve({ filter: /^std\/path$/ }, () => ({
      path: "node:path",
      external: true,
    }));

    // Mark "sqlite" as external — only used as a type import, never at runtime
    build.onResolve({ filter: /^sqlite$/ }, () => ({
      path: "sqlite",
      external: true,
    }));

    // Mark @cloudflare/puppeteer as external — provided by Workers runtime
    build.onResolve({ filter: /^@cloudflare\/puppeteer$/ }, () => ({
      path: "@cloudflare/puppeteer",
      external: true,
    }));

    // Catch any deno.land URL imports that weren't converted to dynamic imports
    build.onResolve({ filter: /^https:\/\/deno\.land\// }, (args) => {
      console.warn(`Warning: static deno.land import found: ${args.path}`);
      return { path: args.path, external: true };
    });
  },
};

try {
  await esbuild.build({
    entryPoints: ["src/app.ts"],
    bundle: true,
    outfile: "dist/worker.mjs",
    format: "esm",
    target: "es2022",
    platform: "browser", // Workers are browser-like, not Node
    conditions: ["worker", "browser"],
    // Node built-ins are external (resolved at runtime via nodejs_compat)
    external: ["node:*"],
    plugins: [denoCompatPlugin],
    // Preserve dynamic imports (e.g., @cloudflare/puppeteer, zipjs)
    splitting: false,
    logLevel: "info",
  });
  console.log("Build complete: dist/worker.mjs");
} catch (e) {
  console.error("Build failed:", e);
  process.exit(1);
}
