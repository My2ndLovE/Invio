import type { DB } from "sqlite";

export interface Customer {
  id: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  taxId?: string;
  createdAt: Date;
}

export class CustomerModel {
  constructor(private db: DB) {}

  async create(
    customer: Omit<Customer, "id" | "createdAt">,
  ): Promise<Customer> {
    const id = crypto.randomUUID();
    const createdAt = new Date();
    await this.db.query(
      "INSERT INTO customers (id, name, contact_name, email, phone, address, city, postal_code, tax_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        customer.name,
        customer.contactName,
        customer.email,
        customer.phone,
        customer.address,
        customer.city,
        customer.postalCode,
        customer.taxId,
        createdAt,
      ],
    );
    return { id, createdAt, ...customer };
  }

  async findAll(): Promise<Customer[]> {
    const results = await this.db.query(
      "SELECT * FROM customers ORDER BY created_at DESC",
    );
    return results.map((row: unknown[]) => ({
      id: row[0] as string,
      name: row[1] as string,
      contactName: row[2] as string,
      email: row[3] as string,
      phone: row[4] as string,
      address: row[5] as string,
      city: row[6] as string,
      postalCode: row[7] as string,
      taxId: row[8] as string,
      createdAt: new Date(row[9] as string),
    }));
  }

  async findById(id: string): Promise<Customer | null> {
    const result = await this.db.query("SELECT * FROM customers WHERE id = ?", [
      id,
    ]);
    if (result.length === 0) return null;
    const row = result[0] as unknown[];
    return {
      id: row[0] as string,
      name: row[1] as string,
      contactName: row[2] as string,
      email: row[3] as string,
      phone: row[4] as string,
      address: row[5] as string,
      city: row[6] as string,
      postalCode: row[7] as string,
      taxId: row[8] as string,
      createdAt: new Date(row[9] as string),
    };
  }

  async update(
    id: string,
    customer: Partial<Omit<Customer, "id" | "createdAt">>,
  ): Promise<Customer | null> {
    const existingCustomer = await this.findById(id);
    if (!existingCustomer) return null;

    const updatedCustomer = { ...existingCustomer, ...customer };
    await this.db.query(
      "UPDATE customers SET name = ?, contact_name = ?, email = ?, phone = ?, address = ?, city = ?, postal_code = ?, tax_id = ? WHERE id = ?",
      [
        updatedCustomer.name,
        updatedCustomer.contactName,
        updatedCustomer.email,
        updatedCustomer.phone,
        updatedCustomer.address,
        updatedCustomer.city,
        updatedCustomer.postalCode,
        updatedCustomer.taxId,
        id,
      ],
    );
    return updatedCustomer;
  }

  async delete(id: string): Promise<boolean> {
    await this.db.query("DELETE FROM customers WHERE id = ?", [id]);
    return true;
  }
}
