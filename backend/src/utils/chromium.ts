// chrome-headless-shell candidates per platform
const UNIX_CANDIDATES = [
  "/usr/local/bin/chrome-headless-shell",
  "/usr/bin/chrome-headless-shell",
];

const MAC_CANDIDATES = [
  "/Applications/chrome-headless-shell",
];

const WINDOWS_CANDIDATES = [
  "C:/Program Files/chrome-headless-shell/chrome-headless-shell.exe",
  "C:/Program Files (x86)/chrome-headless-shell/chrome-headless-shell.exe",
];

function candidatePaths(): string[] {
  // Gracefully handle non-Deno environments (e.g. Cloudflare Workers)
  if (typeof Deno === "undefined") return [];

  const envShell = Deno.env.get("CHROME_HEADLESS_SHELL_PATH");
  const list: string[] = [];
  if (envShell && envShell.trim()) {
    list.push(envShell.trim());
  }

  const platform = Deno.build.os;
  if (platform === "windows") {
    list.push(...WINDOWS_CANDIDATES);
  } else if (platform === "darwin") {
    list.push(...MAC_CANDIDATES);
  } else {
    list.push(...UNIX_CANDIDATES);
  }
  return list;
}

async function fileExists(path: string): Promise<boolean> {
  if (typeof Deno === "undefined") return false;
  try {
    const stat = await Deno.stat(path);
    return stat.isFile;
  } catch (_e) {
    return false;
  }
}

export async function findHeadlessShell(candidates = candidatePaths()): Promise<string | undefined> {
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export async function resolveChromiumPath(): Promise<{ executablePath: string; candidates: string[] }> {
  const candidates = candidatePaths();
  const executablePath = await findHeadlessShell(candidates);
  if (executablePath) {
    return { executablePath, candidates };
  }
  throw new Error(
    "No chrome-headless-shell executable found. " +
    "Set CHROME_HEADLESS_SHELL_PATH to the binary path. Checked: " +
    candidates.join(", "),
  );
}

export async function logChromiumAvailability(): Promise<void> {
  try {
    const { executablePath } = await resolveChromiumPath();
    console.log(`chrome-headless-shell detected at ${executablePath}`);
  } catch {
    const candidates = candidatePaths();
    console.error(
      "⚠️  No chrome-headless-shell executable detected. " +
      "PDF generation requires chrome-headless-shell. " +
      "Set CHROME_HEADLESS_SHELL_PATH. Checked paths: " +
        candidates.join(", "),
    );
  }
}
