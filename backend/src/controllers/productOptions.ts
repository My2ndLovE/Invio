/**
 * Product Options Controller
 * Manages product categories and units.
 * Categories/units can only be deleted if not used by any product.
 */
import { getDatabase } from "../database/init.ts";

export interface ProductCategory {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isBuiltin: boolean;
  createdAt: Date;
}

export interface ProductUnit {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isBuiltin: boolean;
  createdAt: Date;
}

type OptionRow = [string, string, string, number, number, string];

function mapCategory(row: OptionRow): ProductCategory {
  const [id, code, name, sortOrder, isBuiltin, createdAt] = row;
  return {
    id,
    code,
    name,
    sortOrder: sortOrder || 0,
    isBuiltin: Boolean(isBuiltin),
    createdAt: new Date(createdAt),
  };
}

function mapUnit(row: OptionRow): ProductUnit {
  const [id, code, name, sortOrder, isBuiltin, createdAt] = row;
  return {
    id,
    code,
    name,
    sortOrder: sortOrder || 0,
    isBuiltin: Boolean(isBuiltin),
    createdAt: new Date(createdAt),
  };
}

// Categories
export async function getCategories(): Promise<ProductCategory[]> {
  const db = getDatabase();
  const rows = await db.query(
    "SELECT id, code, name, sort_order, is_builtin, created_at FROM product_categories ORDER BY sort_order ASC, name ASC"
  );
  return rows.map((row) => mapCategory(row as OptionRow));
}

export async function getCategoryById(id: string): Promise<ProductCategory | null> {
  const db = getDatabase();
  const rows = await db.query(
    "SELECT id, code, name, sort_order, is_builtin, created_at FROM product_categories WHERE id = ?",
    [id]
  );
  if (rows.length === 0) return null;
  return mapCategory(rows[0] as OptionRow);
}

export async function createCategory(data: { code: string; name: string }): Promise<ProductCategory> {
  const db = getDatabase();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const maxRows = await db.query("SELECT MAX(sort_order) FROM product_categories");
  const maxSort = (maxRows[0] as [number | null])[0] || 0;
  await db.query(
    "INSERT INTO product_categories (id, code, name, sort_order, is_builtin, created_at) VALUES (?, ?, ?, ?, 0, ?)",
    [id, data.code, data.name, maxSort + 1, now]
  );
  const created = await getCategoryById(id);
  return created!;
}

export async function updateCategory(id: string, data: { code?: string; name?: string }): Promise<ProductCategory | null> {
  const db = getDatabase();
  const existing = await getCategoryById(id);
  if (!existing) return null;
  const code = data.code ?? existing.code;
  const name = data.name ?? existing.name;
  await db.query("UPDATE product_categories SET code = ?, name = ? WHERE id = ?", [code, name, id]);
  return await getCategoryById(id);
}

export async function deleteCategory(id: string): Promise<boolean> {
  const db = getDatabase();
  const existing = await getCategoryById(id);
  if (!existing) return false;
  if (existing.isBuiltin) {
    throw new Error("Cannot delete built-in category");
  }
  const usage = await db.query("SELECT COUNT(*) FROM products WHERE category = ?", [existing.code]);
  const count = (usage[0] as [number])[0];
  if (count > 0) {
    throw new Error(`Category is used by ${count} product(s)`);
  }
  await db.query("DELETE FROM product_categories WHERE id = ?", [id]);
  return true;
}

export async function isCategoryUsed(id: string): Promise<{ used: boolean; count: number }> {
  const db = getDatabase();
  const existing = await getCategoryById(id);
  if (!existing) return { used: false, count: 0 };
  const usage = await db.query("SELECT COUNT(*) FROM products WHERE category = ?", [existing.code]);
  const count = (usage[0] as [number])[0];
  return { used: count > 0, count };
}

// Units
export async function getUnits(): Promise<ProductUnit[]> {
  const db = getDatabase();
  const rows = await db.query(
    "SELECT id, code, name, sort_order, is_builtin, created_at FROM product_units ORDER BY sort_order ASC, name ASC"
  );
  return rows.map((row) => mapUnit(row as OptionRow));
}

export async function getUnitById(id: string): Promise<ProductUnit | null> {
  const db = getDatabase();
  const rows = await db.query(
    "SELECT id, code, name, sort_order, is_builtin, created_at FROM product_units WHERE id = ?",
    [id]
  );
  if (rows.length === 0) return null;
  return mapUnit(rows[0] as OptionRow);
}

export async function createUnit(data: { code: string; name: string }): Promise<ProductUnit> {
  const db = getDatabase();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const maxRows = await db.query("SELECT MAX(sort_order) FROM product_units");
  const maxSort = (maxRows[0] as [number | null])[0] || 0;
  await db.query(
    "INSERT INTO product_units (id, code, name, sort_order, is_builtin, created_at) VALUES (?, ?, ?, ?, 0, ?)",
    [id, data.code, data.name, maxSort + 1, now]
  );
  const created = await getUnitById(id);
  return created!;
}

export async function updateUnit(id: string, data: { code?: string; name?: string }): Promise<ProductUnit | null> {
  const db = getDatabase();
  const existing = await getUnitById(id);
  if (!existing) return null;
  const code = data.code ?? existing.code;
  const name = data.name ?? existing.name;
  await db.query("UPDATE product_units SET code = ?, name = ? WHERE id = ?", [code, name, id]);
  return await getUnitById(id);
}

export async function deleteUnit(id: string): Promise<boolean> {
  const db = getDatabase();
  const existing = await getUnitById(id);
  if (!existing) return false;
  if (existing.isBuiltin) {
    throw new Error("Cannot delete built-in unit");
  }
  const usage = await db.query("SELECT COUNT(*) FROM products WHERE unit = ?", [existing.code]);
  const count = (usage[0] as [number])[0];
  if (count > 0) {
    throw new Error(`Unit is used by ${count} product(s)`);
  }
  await db.query("DELETE FROM product_units WHERE id = ?", [id]);
  return true;
}

export async function isUnitUsed(id: string): Promise<{ used: boolean; count: number }> {
  const db = getDatabase();
  const existing = await getUnitById(id);
  if (!existing) return { used: false, count: 0 };
  const usage = await db.query("SELECT COUNT(*) FROM products WHERE unit = ?", [existing.code]);
  const count = (usage[0] as [number])[0];
  return { used: count > 0, count };
}
