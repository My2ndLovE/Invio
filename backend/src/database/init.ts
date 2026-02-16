import { getEnv, isDemoMode } from "../utils/env.ts";
import { Database, SQLiteAdapter, D1Adapter } from "./adapter.ts";

let _db: Database | undefined;

// Request-scoped database for Cloudflare Workers (fallback when AsyncLocalStorage unavailable)
let _requestDb: Database | undefined;

// AsyncLocalStorage to handle request-scoped database on Cloudflare
// @ts-ignore: AsyncLocalStorage is global in Workers and Deno
const hasAsyncLocalStorage = typeof AsyncLocalStorage !== "undefined";
const storage = hasAsyncLocalStorage
  ? new AsyncLocalStorage<Database>()
  : null;

export function getDatabase(): Database {
  // Try AsyncLocalStorage first (Deno)
  if (storage) {
    const store = storage.getStore();
    if (store) return store;
  }
  // Try request-scoped database (Cloudflare Workers fallback)
  if (_requestDb) return _requestDb;
  // Fall back to global database (Deno single-tenant)
  if (!_db) {
    throw new Error("Database not initialized");
  }
  return _db;
}

export function setDatabase(db: Database) {
  _db = db;
}

export const runWithDatabase = async (db: Database, fn: () => any) => {
  if (storage) {
    return storage.run(db, fn);
  }
  // Fallback for Cloudflare Workers: store in module-level variable
  const prevDb = _requestDb;
  _requestDb = db;
  try {
    return await fn();
  } finally {
    _requestDb = prevDb;
  }
};

function resolvePath(p: string): string {
  if (typeof Deno === "undefined") return p;
  return p;
}

function simpleDirname(p: string): string {
  const i = p.lastIndexOf("/");
  if (i <= 0) return "/";
  return p.slice(0, i);
}

export async function initDatabase(): Promise<void> {
  if (typeof Deno === "undefined") return;

  const dbPath = resolvePath(getEnv("DATABASE_PATH", "./invio.db")!);

  try {
    const dir = simpleDirname(dbPath);
    if (dir && dir !== "." && dir !== "/") {
      Deno.mkdirSync(dir, { recursive: true });
    }
  } catch { /* ignore */ }

  const sqliteModule = "sqlite";
  const { DB } = await import(sqliteModule);
  const sqlite = new DB(dbPath);
  const adapter = new SQLiteAdapter(sqlite);
  _db = adapter;

  if (getEnv("CLOUDFLARE_WORKER") !== "true") {
    await runMigrations(sqlite);
    await insertBuiltinTemplates(adapter);
    await ensureTemplateDefaults(adapter);
    await ensureSchemaUpgrades(adapter);
  }

  console.log("Database initialized successfully");
}

async function runMigrations(sqlite: any) {
  const migrationSQL = Deno.readTextFileSync("./src/database/migrations.sql");
  const withoutComments = migrationSQL.split("\n").map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith("--")) return "";
    const idx = line.indexOf("--");
    return idx >= 0 ? line.slice(0, idx) : line;
  }).join("\n");

  const statements = withoutComments.split(";").map(stmt => stmt.trim()).filter(stmt => stmt.length > 0);
  for (const statement of statements) {
    try { sqlite.execute(statement); } catch { /* ignore */ }
  }
}

async function insertBuiltinTemplates(database: Database) {
  const loadHtml = (id: string): string => {
    const path = id === "professional-modern" ? "./static/templates/professional-modern.html" : "./static/templates/minimalist-clean.html";
    try { return Deno.readTextFileSync(path); } catch { return "<html><body>Template unavailable</body></html>"; }
  };

  const templates = [
    { id: "professional-modern", name: "Professional Modern", html: loadHtml("professional-modern"), isDefault: false },
    { id: "minimalist-clean", name: "Minimalist Clean", html: loadHtml("minimalist-clean"), isDefault: true }
  ];

  for (const t of templates) {
    try {
      const existing = await database.query("SELECT html FROM templates WHERE id = ?", [t.id]);
      if (existing.length === 0) {
        await database.query("INSERT INTO templates (id, name, html, is_default, created_at) VALUES (?, ?, ?, ?, ?)", [t.id, t.name, t.html, t.isDefault ? 1 : 0, new Date().toISOString()]);
      }
    } catch { /* ignore */ }
  }
}

async function ensureTemplateDefaults(database: Database) {
  try {
    await database.query("DELETE FROM templates WHERE id = ?", ["default-template"]);
    await database.query("UPDATE templates SET is_default = 0");
    await database.query("UPDATE templates SET is_default = 1 WHERE id = ?", ["minimalist-clean"]);
  } catch { /* ignore */ }
}

async function ensureSchemaUpgrades(database: Database) {
  try {
    // Ensure customers columns exist
    const cols = await database.query("PRAGMA table_info(customers)") as unknown[] as Array<unknown[]>;
    const names = new Set(cols.map((r) => String(r[1])));
    for (const col of [
      { name: "contact_name", sql: "ALTER TABLE customers ADD COLUMN contact_name TEXT" },
      { name: "country_code", sql: "ALTER TABLE customers ADD COLUMN country_code TEXT" },
      { name: "city", sql: "ALTER TABLE customers ADD COLUMN city TEXT" },
      { name: "postal_code", sql: "ALTER TABLE customers ADD COLUMN postal_code TEXT" },
    ]) {
      if (!names.has(col.name)) {
        try { await database.execute(col.sql); } catch { /* ignore duplicates */ }
      }
    }

    // Ensure invoices columns exist
    const invCols = await database.query("PRAGMA table_info(invoices)") as unknown[] as Array<unknown[]>;
    const invNames = new Set(invCols.map((r) => String(r[1])));
    if (!invNames.has("prices_include_tax")) {
      try { await database.execute("ALTER TABLE invoices ADD COLUMN prices_include_tax BOOLEAN DEFAULT 0"); } catch { /* ignore */ }
    }
    if (!invNames.has("rounding_mode")) {
      try { await database.execute("ALTER TABLE invoices ADD COLUMN rounding_mode TEXT DEFAULT 'line'"); } catch { /* ignore */ }
    }

    // Ensure normalized tax tables exist
    await database.execute(`CREATE TABLE IF NOT EXISTS tax_definitions (id TEXT PRIMARY KEY, code TEXT UNIQUE, name TEXT, percent NUMERIC NOT NULL, category_code TEXT, country_code TEXT, vendor_specific_id TEXT, default_included BOOLEAN DEFAULT 0, metadata TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await database.execute(`CREATE TABLE IF NOT EXISTS invoice_item_taxes (id TEXT PRIMARY KEY, invoice_item_id TEXT NOT NULL REFERENCES invoice_items(id) ON DELETE CASCADE, tax_definition_id TEXT REFERENCES tax_definitions(id), percent NUMERIC NOT NULL, taxable_amount NUMERIC NOT NULL, amount NUMERIC NOT NULL, included BOOLEAN NOT NULL DEFAULT 0, sequence INTEGER DEFAULT 0, note TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await database.execute(`CREATE TABLE IF NOT EXISTS invoice_taxes (id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE, tax_definition_id TEXT REFERENCES tax_definitions(id), percent NUMERIC NOT NULL, taxable_amount NUMERIC NOT NULL, tax_amount NUMERIC NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

    // Ensure products table exists
    await database.execute(`CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, unit_price NUMERIC NOT NULL DEFAULT 0, sku TEXT, unit TEXT DEFAULT 'piece', category TEXT, tax_definition_id TEXT REFERENCES tax_definitions(id), is_active BOOLEAN DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await database.execute(`CREATE TABLE IF NOT EXISTS product_categories (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, sort_order INTEGER DEFAULT 0, is_builtin BOOLEAN DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await database.execute(`CREATE TABLE IF NOT EXISTS product_units (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, sort_order INTEGER DEFAULT 0, is_builtin BOOLEAN DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

    // Insert default categories
    for (const cat of [
      { code: "service", name: "Service", sort: 1 },
      { code: "goods", name: "Goods", sort: 2 },
      { code: "subscription", name: "Subscription", sort: 3 },
      { code: "other", name: "Other", sort: 4 },
    ]) {
      try { await database.query("INSERT OR IGNORE INTO product_categories (id, code, name, sort_order, is_builtin) VALUES (?, ?, ?, ?, 1)", [cat.code, cat.code, cat.name, cat.sort]); } catch { /* ignore */ }
    }

    // Insert default units
    for (const unit of [
      { code: "piece", name: "Piece", sort: 1 },
      { code: "hour", name: "Hour", sort: 2 },
      { code: "day", name: "Day", sort: 3 },
      { code: "kg", name: "Kilogram", sort: 4 },
      { code: "m", name: "Meter", sort: 5 },
      { code: "lump_sum", name: "Lump Sum", sort: 6 },
    ]) {
      try { await database.query("INSERT OR IGNORE INTO product_units (id, code, name, sort_order, is_builtin) VALUES (?, ?, ?, ?, 1)", [unit.code, unit.code, unit.name, unit.sort]); } catch { /* ignore */ }
    }

    // Ensure invoice_items.product_id exists
    const itemCols = await database.query("PRAGMA table_info(invoice_items)") as unknown[] as Array<unknown[]>;
    const itemColNames = new Set(itemCols.map((r) => String(r[1])));
    if (!itemColNames.has("product_id")) {
      try { await database.execute("ALTER TABLE invoice_items ADD COLUMN product_id TEXT REFERENCES products(id)"); } catch { /* ignore */ }
    }
  } catch (e) {
    console.warn("Schema upgrade check failed:", e);
  }
}

export async function getNextInvoiceNumber(): Promise<string> {
  const db = getDatabase();
  let prefix = "INV";
  let includeYear = true;
  let pad = 3;
  let pattern: string | undefined = undefined;
  let numberingEnabled = true;

  try {
    const rows = await db.query("SELECT key, value FROM settings WHERE key IN ('invoicePrefix','invoiceIncludeYear','invoiceNumberPadding','invoiceNumberPattern','invoiceNumberingEnabled')");
    // @ts-ignore
    const map = new Map(rows.map((r: any) => [r[0], r[1]]));

    prefix = (map.get("invoicePrefix") || prefix).trim() || prefix;
    includeYear = (map.get("invoiceIncludeYear") || "true").toLowerCase() !== "false";
    const p = parseInt(map.get("invoiceNumberPadding") || String(pad), 10);
    if (!Number.isNaN(p) && p >= 2 && p <= 8) pad = p;
    pattern = (map.get("invoiceNumberPattern") || "").trim() || undefined;
    numberingEnabled = (map.get("invoiceNumberingEnabled") || "true").toLowerCase() !== "false";
  } catch { /* ignore */ }

  if (pattern && numberingEnabled) {
    const now = new Date();
    const YYYY = String(now.getFullYear());
    const YY = YYYY.slice(-2);
    const MM = String(now.getMonth() + 1).padStart(2, "0");
    const DD = String(now.getDate()).padStart(2, "0");
    const DATE = `${YYYY}${MM}${DD}`;
    const baseWithoutSeq = pattern.replace(/\{YYYY\}/g, YYYY).replace(/\{YY\}/g, YY).replace(/\{MM\}/g, MM).replace(/\{DD\}/g, DD).replace(/\{DATE\}/g, DATE).replace(/\{RAND4\}/g, () => Math.random().toString(36).substring(2, 6).toUpperCase());

    if (!/\{SEQ\}/.test(pattern)) return baseWithoutSeq;

    const prefixForSeq = baseWithoutSeq.split("{SEQ}")[0];
    const results = await db.query("SELECT invoice_number FROM invoices WHERE invoice_number LIKE ?", [`${prefixForSeq}%`]);
    let maxSeq = 0;
    const re = new RegExp(`^${prefixForSeq.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)`);
    for (const row of results) {
      const m = String((row as any)[0]).match(re);
      if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
    }
    return baseWithoutSeq.replace(/\{SEQ\}/g, String(maxSeq + 1).padStart(3, "0"));
  }

  const year = new Date().getFullYear();
  const base = includeYear ? `${prefix}-${year}-` : `${prefix}-`;
  const results = await db.query("SELECT invoice_number FROM invoices WHERE invoice_number LIKE ?", [`${base}%`]);
  let maxNum = 0;
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`);
  for (const row of results) {
    const m = String((row as any)[0]).match(re);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }
  return `${base}${String(maxNum + 1).padStart(pad, "0")}`;
}

export function generateDraftInvoiceNumber(): string {
  return `DRAFT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

export interface CalculatedTotals {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
}

export function calculateInvoiceTotals(
  items: Array<{ quantity: number; unitPrice: number }>,
  discountPercentage: number = 0,
  discountAmount: number = 0,
  taxRate: number = 0,
  pricesIncludeTax: boolean = false,
  roundingMode: "line" | "total" = "line",
): CalculatedTotals {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const rate = Math.max(0, Number(taxRate) || 0) / 100;

  const lineGrosses = items.map(it => (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0));
  const subtotal = lineGrosses.reduce((a, b) => a + b, 0);

  let finalDiscountAmount = Math.min(Math.max(discountPercentage > 0 ? subtotal * (discountPercentage / 100) : (Number(discountAmount) || 0), 0), subtotal);

  let taxAmount = 0;
  let total = 0;

  if (roundingMode === "line" && subtotal > 0) {
    let distributed = 0;
    const lineDiscounts = lineGrosses.map((g, idx) => {
      if (idx === lineGrosses.length - 1) return r2(finalDiscountAmount - distributed);
      const d = r2(finalDiscountAmount * (g / subtotal));
      distributed += d;
      return d;
    });

    let sumTax = 0;
    let sumTotal = 0;
    for (let i = 0; i < lineGrosses.length; i++) {
      const afterDiscount = Math.max(0, lineGrosses[i] - (lineDiscounts[i] || 0));
      if (pricesIncludeTax) {
        const net = rate > 0 ? afterDiscount / (1 + rate) : afterDiscount;
        sumTax += r2(afterDiscount - net);
        sumTotal += r2(afterDiscount);
      } else {
        const tax = afterDiscount * rate;
        sumTax += r2(tax);
        sumTotal += r2(afterDiscount + r2(tax));
      }
    }
    taxAmount = r2(sumTax);
    total = r2(sumTotal);
  } else {
    const afterDiscount = subtotal - finalDiscountAmount;
    if (pricesIncludeTax) {
      const net = rate > 0 ? afterDiscount / (1 + rate) : afterDiscount;
      taxAmount = r2(afterDiscount - net);
      total = r2(afterDiscount);
    } else {
      taxAmount = r2(afterDiscount * rate);
      total = r2(afterDiscount + taxAmount);
    }
  }

  return { subtotal: r2(subtotal), discountAmount: r2(finalDiscountAmount), taxAmount: r2(taxAmount), total: r2(total) };
}

export async function resetDatabaseFromDemo(): Promise<void> {
  if (typeof Deno === "undefined" || !isDemoMode()) return;
  const demoDb = getEnv("DEMO_DB_PATH");
  const activePath = resolvePath(getEnv("DATABASE_PATH", "./invio.db")!);
  if (!demoDb) return;

  try { _db?.close?.(); } catch { /* ignore */ }

  try {
    try { Deno.removeSync(activePath); } catch { /* ignore */ }
    Deno.copyFileSync(resolvePath(demoDb), activePath);
    await initDatabase();
  } catch (e) {
    console.error("Failed to reset demo database:", e);
  }
}

export function closeDatabase(): void {
  _db?.close?.();
}

export function createD1Database(d1: any): Database {
  return new D1Adapter(d1);
}
