import { getDatabase } from "../database/init.ts";
import {
  CreateCustomerRequest,
  Customer,
} from "../types/index.ts";
import { generateUUID } from "../utils/uuid.ts";

const mapRowToCustomer = (row: any): Customer => ({
  id: row[0] as string,
  name: row[1] as string,
  contactName: (row[2] ?? undefined) as string | undefined,
  email: (row[3] ?? undefined) as string | undefined,
  phone: (row[4] ?? undefined) as string | undefined,
  address: (row[5] ?? undefined) as string | undefined,
  countryCode: (row[6] ?? undefined) as string | undefined,
  taxId: (row[7] ?? undefined) as string | undefined,
  createdAt: new Date(row[8] as string),
  // Optional city/postal_code columns if present at the end
  city: (row[9] ?? undefined) as string | undefined,
  postalCode: (row[10] ?? undefined) as string | undefined,
});

export const getCustomers = async (): Promise<Customer[]> => {
  const db = getDatabase();
  let results: any[][] = [];
  try {
    results = await db.query(
      "SELECT id, name, contact_name, email, phone, address, country_code, tax_id, created_at, city, postal_code FROM customers ORDER BY created_at DESC",
    ) as any[][];
  } catch (_e) {
    try {
      results = await db.query(
        "SELECT id, name, email, phone, address, country_code, tax_id, created_at, city, postal_code FROM customers ORDER BY created_at DESC",
      ) as any[][];
    } catch (_e2) {
      results = await db.query(
        "SELECT id, name, email, phone, address, country_code, tax_id, created_at FROM customers ORDER BY created_at DESC",
      ) as any[][];
    }
  }
  return results.map((row: any) => mapRowToCustomer(row));
};

export const getCustomerById = async (id: string): Promise<Customer | null> => {
  const db = getDatabase();
  let results: any[][] = [];
  try {
    results = await db.query(
      "SELECT id, name, contact_name, email, phone, address, country_code, tax_id, created_at, city, postal_code FROM customers WHERE id = ?",
      [id],
    ) as any[][];
  } catch (_e) {
    try {
      results = await db.query(
        "SELECT id, name, email, phone, address, country_code, tax_id, created_at, city, postal_code FROM customers WHERE id = ?",
        [id],
      ) as any[][];
    } catch (_e2) {
      results = await db.query(
        "SELECT id, name, email, phone, address, country_code, tax_id, created_at FROM customers WHERE id = ?",
        [id],
      ) as any[][];
    }
  }
  if (results.length === 0) return null;
  return mapRowToCustomer(results[0]);
};

const toNullable = (v?: string): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

export const createCustomer = async (data: CreateCustomerRequest): Promise<Customer> => {
  const db = getDatabase();
  const customerId = generateUUID();
  const now = new Date();

  const contactName = toNullable(data.contactName);
  const email = toNullable(data.email);
  const phone = toNullable(data.phone);
  const address = toNullable(data.address);
  const countryCode = toNullable(data.countryCode);
  const city = toNullable((data as { city?: string }).city);
  const postal = toNullable((data as { postalCode?: string }).postalCode);
  const taxId = toNullable(data.taxId);

  try {
    await db.query(
      `
      INSERT INTO customers (id, name, contact_name, email, phone, address, country_code, tax_id, created_at, city, postal_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [customerId, data.name, contactName, email, phone, address, countryCode, taxId, now, city, postal],
    );
  } catch (_e) {
    try {
      await db.query(
        `
        INSERT INTO customers (id, name, email, phone, address, country_code, tax_id, created_at, city, postal_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [customerId, data.name, email, phone, address, countryCode, taxId, now, city, postal],
      );
    } catch (_e2) {
      await db.query(
        `
        INSERT INTO customers (id, name, email, phone, address, country_code, tax_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [customerId, data.name, email, phone, address, countryCode, taxId, now],
      );
    }
  }

  return {
    id: customerId,
    name: data.name,
    contactName: contactName ?? undefined,
    email: email ?? undefined,
    phone: phone ?? undefined,
    address: address ?? undefined,
    countryCode: countryCode ?? undefined,
    taxId: taxId ?? undefined,
    createdAt: now,
    city: city ?? undefined,
    postalCode: postal ?? undefined,
  };
};

export const updateCustomer = async (
  id: string,
  data: Partial<CreateCustomerRequest>,
): Promise<Customer | null> => {
  const db = getDatabase();
  const existing = await getCustomerById(id);
  if (!existing) return null;

  const name = data.name ?? existing.name;
  const contactName = data.contactName !== undefined ? toNullable(data.contactName) : (existing.contactName ?? null);
  const email = data.email !== undefined ? toNullable(data.email) : (existing.email ?? null);
  const phone = data.phone !== undefined ? toNullable(data.phone) : (existing.phone ?? null);
  const address = data.address !== undefined ? toNullable(data.address) : (existing.address ?? null);
  const countryCode = data.countryCode !== undefined ? toNullable(data.countryCode) : (existing.countryCode ?? null);
  const taxId = data.taxId !== undefined ? toNullable(data.taxId) : (existing.taxId ?? null);
  const city = (data as { city?: string }).city !== undefined ? toNullable((data as { city?: string }).city) : (existing.city ?? null);
  const postal = (data as { postalCode?: string }).postalCode !== undefined ? toNullable((data as { postalCode?: string }).postalCode) : (existing.postalCode ?? null);

  try {
    await db.query(
      `
      UPDATE customers SET 
        name = ?, contact_name = ?, email = ?, phone = ?, address = ?, country_code = ?, tax_id = ?, city = ?, postal_code = ?
      WHERE id = ?
    `,
      [name, contactName, email, phone, address, countryCode, taxId, city, postal, id],
    );
  } catch (_e) {
    try {
      await db.query(
        `
        UPDATE customers SET 
          name = ?, email = ?, phone = ?, address = ?, country_code = ?, tax_id = ?, city = ?, postal_code = ?
        WHERE id = ?
      `,
        [name, email, phone, address, countryCode, taxId, city, postal, id],
      );
    } catch (_e2) {
      await db.query(
        `
        UPDATE customers SET 
          name = ?, email = ?, phone = ?, address = ?, country_code = ?, tax_id = ?
        WHERE id = ?
      `,
        [name, email, phone, address, countryCode, taxId, id],
      );
    }
  }

  return await getCustomerById(id);
};

export async function deleteCustomer(customerId: string): Promise<void> {
  const db = getDatabase();
  const invoices = await db.query(
    `SELECT COUNT(*) FROM invoices WHERE customer_id = ?`,
    [customerId],
  );

  const invoiceCount = invoices[0] ? Number((invoices[0] as any)[0]) : 0;
  if (invoiceCount > 0) {
    throw new Error(`Cannot delete customer: ${invoiceCount} invoice(s) exist.`);
  }

  await db.query(`DELETE FROM customers WHERE id = ?`, [customerId]);
}
