/**
 * Products Controller
 * CRUD operations for product management.
 * Products can be selected when creating invoices to auto-fill line items.
 */
import { getDatabase } from "../database/init.ts";
import { CreateProductRequest, Product } from "../types/index.ts";
import { generateUUID } from "../utils/uuid.ts";

const mapRowToProduct = (row: unknown[]): Product => ({
  id: row[0] as string,
  name: row[1] as string,
  description: (row[2] ?? undefined) as string | undefined,
  unitPrice: Number(row[3]) || 0,
  sku: (row[4] ?? undefined) as string | undefined,
  unit: (row[5] ?? "piece") as string,
  category: (row[6] ?? undefined) as string | undefined,
  taxDefinitionId: (row[7] ?? undefined) as string | undefined,
  isActive: Boolean(row[8]),
  createdAt: new Date(row[9] as string),
  updatedAt: new Date(row[10] as string),
});

const toNullable = (v?: string): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

export async function getProducts(includeInactive = false): Promise<Product[]> {
  const db = getDatabase();
  const query = includeInactive
    ? "SELECT id, name, description, unit_price, sku, unit, category, tax_definition_id, is_active, created_at, updated_at FROM products ORDER BY name ASC"
    : "SELECT id, name, description, unit_price, sku, unit, category, tax_definition_id, is_active, created_at, updated_at FROM products WHERE is_active = 1 ORDER BY name ASC";
  const results = await db.query(query) as unknown[][];
  return results.map((row: unknown[]) => mapRowToProduct(row));
}

export async function getProductById(id: string): Promise<Product | null> {
  const db = getDatabase();
  const results = await db.query(
    "SELECT id, name, description, unit_price, sku, unit, category, tax_definition_id, is_active, created_at, updated_at FROM products WHERE id = ?",
    [id],
  ) as unknown[][];
  if (results.length === 0) return null;
  return mapRowToProduct(results[0] as unknown[]);
}

export async function createProduct(data: CreateProductRequest): Promise<Product> {
  const db = getDatabase();
  const productId = generateUUID();
  const now = new Date();

  const description = toNullable(data.description);
  const sku = toNullable(data.sku);
  const unit = toNullable(data.unit) || "piece";
  const category = toNullable(data.category);
  const taxDefinitionId = toNullable(data.taxDefinitionId);

  await db.query(
    `INSERT INTO products (id, name, description, unit_price, sku, unit, category, tax_definition_id, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      productId,
      data.name,
      description,
      data.unitPrice || 0,
      sku,
      unit,
      category,
      taxDefinitionId,
      now.toISOString(),
      now.toISOString(),
    ],
  );

  return {
    id: productId,
    name: data.name,
    description: description ?? undefined,
    unitPrice: data.unitPrice || 0,
    sku: sku ?? undefined,
    unit: unit,
    category: category ?? undefined,
    taxDefinitionId: taxDefinitionId ?? undefined,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateProduct(
  id: string,
  data: Partial<CreateProductRequest> & { isActive?: boolean },
): Promise<Product | null> {
  const db = getDatabase();
  const existing = await getProductById(id);
  if (!existing) return null;

  const now = new Date();

  const name = data.name ?? existing.name;
  const description =
    data.description !== undefined
      ? toNullable(data.description)
      : existing.description ?? null;
  const unitPrice =
    data.unitPrice !== undefined ? data.unitPrice : existing.unitPrice;
  const sku =
    data.sku !== undefined ? toNullable(data.sku) : existing.sku ?? null;
  const unit =
    data.unit !== undefined
      ? toNullable(data.unit) || "piece"
      : existing.unit ?? "piece";
  const category =
    data.category !== undefined
      ? toNullable(data.category)
      : existing.category ?? null;
  const taxDefinitionId =
    data.taxDefinitionId !== undefined
      ? toNullable(data.taxDefinitionId)
      : existing.taxDefinitionId ?? null;
  const isActive =
    data.isActive !== undefined ? data.isActive : existing.isActive;

  await db.query(
    `UPDATE products SET
      name = ?, description = ?, unit_price = ?, sku = ?, unit = ?, category = ?, tax_definition_id = ?, is_active = ?, updated_at = ?
     WHERE id = ?`,
    [
      name,
      description,
      unitPrice,
      sku,
      unit,
      category,
      taxDefinitionId,
      isActive ? 1 : 0,
      now.toISOString(),
      id,
    ],
  );

  return getProductById(id);
}

export async function deleteProduct(productId: string): Promise<void> {
  const db = getDatabase();
  const existing = await getProductById(productId);
  if (!existing) {
    throw new Error("Product not found");
  }

  // Soft-delete: set is_active = false
  await db.query(
    `UPDATE products SET is_active = 0, updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), productId],
  );
}

export async function isProductUsedInInvoices(productId: string): Promise<boolean> {
  const db = getDatabase();
  const results = await db.query(
    "SELECT COUNT(*) FROM invoice_items WHERE product_id = ?",
    [productId],
  ) as unknown[][];
  return Number(results[0]?.[0] ?? 0) > 0;
}

export async function reactivateProduct(productId: string): Promise<Product | null> {
  const db = getDatabase();
  const existing = await getProductById(productId);
  if (!existing) return null;

  await db.query(
    `UPDATE products SET is_active = 1, updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), productId],
  );

  return getProductById(productId);
}
