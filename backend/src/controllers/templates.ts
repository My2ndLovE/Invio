import { getDatabase } from "../database/init.ts";
import { Template } from "../types/index.ts";
import { generateUUID } from "../utils/uuid.ts";
import { parse as parseYaml } from "yaml";

// Simplified path logic for cross-platform/cross-runtime
const simpleDirname = (p: string) => p.split(/[\\/]/).slice(0, -1).join("/") || ".";

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderTemplate(template: string, ctx: any): string {
  let result = template;

  // 1. Handle sections (arrays and booleans)
  // Pattern: {{#name}}content{{/name}}
  result = result.replace(
    /\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (match, key, content) => {
      const value = key.split(".").reduce((o: any, k: string) => o?.[k], ctx);

      if (Array.isArray(value)) {
        return value.map((item) => renderTemplate(content, { ...ctx, ...item, this: item })).join("");
      }
      if (value) {
        return renderTemplate(content, ctx);
      }
      return "";
    }
  );

  // 2. Handle inverted sections (empty arrays or falsey)
  // Pattern: {{^name}}content{{/name}}
  result = result.replace(
    /\{\{\^([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (match, key, content) => {
      const value = key.split(".").reduce((o: any, k: string) => o?.[k], ctx);
      if (!value || (Array.isArray(value) && value.length === 0)) {
        return renderTemplate(content, ctx);
      }
      return "";
    }
  );

  // 3. Handle simple variable replacement with escaping
  // Pattern: {{name}}
  result = result.replace(/\{\{([\w.]+)\}\}/g, (match, key) => {
    const value = key.split(".").reduce((o: any, k: string) => o?.[k], ctx);
    return escapeHtml(value);
  });

  // 4. Handle triple mustache for unescaped content (optional, but good to have)
  // Pattern: {{{name}}}
  result = result.replace(/\{\{\{([\w.]+)\}\}\}/g, (match, key) => {
    const value = key.split(".").reduce((o: any, k: string) => o?.[k], ctx);
    return value !== undefined ? String(value) : "";
  });

  return result;
}

const simpleJoin = (...parts: string[]) => parts.join("/").replace(/\/+/g, "/");

type ManifestHTML = {
  path: string;
  url: string;
  sha256?: string;
};

type TemplateManifest = {
  schema?: number;
  id: string;
  name: string;
  version?: string;
  description?: string;
  author?: string;
  html: ManifestHTML;
};

export const installTemplateFromManifest = async (manifestUrl: string) => {
  const db = getDatabase();
  const resp = await fetch(manifestUrl);
  if (!resp.ok) throw new Error("Failed to fetch manifest");
  const text = await resp.text();
  const manifest = parseYaml(text) as TemplateManifest;

  let html: string;
  if (manifest.html.url) {
    const baseUrl = new URL(manifestUrl);
    const htmlUrl = new URL(manifest.html.url, baseUrl).toString();
    const htmlResp = await fetch(htmlUrl);
    if (!htmlResp.ok) throw new Error("Failed to fetch template HTML");
    html = await htmlResp.text();
  } else {
    throw new Error("Manifest must provide html.url");
  }

  return await upsertTemplateWithId(manifest.id, {
    name: manifest.name,
    html,
    isDefault: false,
  });
};

export const getTemplates = async (): Promise<Template[]> => {
  const db = getDatabase();
  const result = await db.query(
    "SELECT id, name, html, is_default, created_at FROM templates ORDER BY name ASC",
  );
  return result.map((row: any) => ({
    id: row[0],
    name: row[1],
    html: row[2],
    isDefault: row[3] === 1,
    createdAt: new Date(row[4]),
  }));
};

export const getTemplateById = async (id: string): Promise<Template | null> => {
  const db = getDatabase();
  const result = await db.query(
    "SELECT id, name, html, is_default, created_at FROM templates WHERE id = ?",
    [id],
  );
  if (result.length === 0) return null;
  const row = result[0] as any;
  return {
    id: row[0],
    name: row[1],
    html: row[2],
    isDefault: row[3] === 1,
    createdAt: new Date(row[4]),
  };
};

export const getDefaultTemplate = async (): Promise<Template | null> => {
  const db = getDatabase();
  const result = await db.query(
    "SELECT id, name, html, is_default, created_at FROM templates WHERE is_default = 1 LIMIT 1",
  );
  if (result.length === 0) {
    const all = await getTemplates();
    return all[0] || null;
  }
  const row = result[0] as any;
  return {
    id: row[0],
    name: row[1],
    html: row[2],
    isDefault: row[3] === 1,
    createdAt: new Date(row[4]),
  };
};

export const createTemplate = async (data: { name: string; html: string; isDefault?: boolean }) => {
  const db = getDatabase();
  const id = generateUUID();
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO templates (id, name, html, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, data.name, data.html, data.isDefault ? 1 : 0, now, now],
  );
  return getTemplateById(id);
};

export const upsertTemplateWithId = async (id: string, data: { name: string; html: string; isDefault?: boolean }) => {
  const db = getDatabase();
  const current = await getTemplateById(id);
  const now = new Date().toISOString();
  if (current) {
    await db.execute(
      "UPDATE templates SET name = ?, html = ?, updated_at = ? WHERE id = ?",
      [data.name, data.html, now, id],
    );
  } else {
    await db.execute(
      "INSERT INTO templates (id, name, html, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, data.name, data.html, data.isDefault ? 1 : 0, now, now],
    );
  }
  return getTemplateById(id);
};

export const deleteTemplate = async (id: string) => {
  const db = getDatabase();
  await db.execute("DELETE FROM templates WHERE id = ? AND is_default = 0", [id]);
};

export const setDefaultTemplate = async (id: string) => {
  const db = getDatabase();
  await db.execute("UPDATE templates SET is_default = 0");
  await db.execute("UPDATE templates SET is_default = 1 WHERE id = ?", [id]);
};

export const loadTemplateFromFile = async (id: string) => {
  // Filesystem access is only for local Deno
  if (typeof Deno === "undefined") return null;
  try {
    const path = id === "minimalist-clean" ? "./static/templates/minimalist-clean.html" : "./static/templates/professional-modern.html";
    // @ts-ignore
    const html = await Deno.readTextFile(path);
    return await upsertTemplateWithId(id, { name: id.charAt(0).toUpperCase() + id.slice(1).replace("-", " "), html });
  } catch { return null; }
};
