-- D1 Migration: Add new tables from upstream merge

CREATE TABLE IF NOT EXISTS tax_definitions (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE,
  name TEXT,
  percent NUMERIC NOT NULL,
  category_code TEXT,
  country_code TEXT,
  vendor_specific_id TEXT,
  default_included BOOLEAN DEFAULT 0,
  metadata TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoice_item_taxes (
  id TEXT PRIMARY KEY,
  invoice_item_id TEXT NOT NULL REFERENCES invoice_items(id) ON DELETE CASCADE,
  tax_definition_id TEXT REFERENCES tax_definitions(id),
  percent NUMERIC NOT NULL,
  taxable_amount NUMERIC NOT NULL,
  amount NUMERIC NOT NULL,
  included BOOLEAN NOT NULL DEFAULT 0,
  sequence INTEGER DEFAULT 0,
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoice_taxes (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  tax_definition_id TEXT REFERENCES tax_definitions(id),
  percent NUMERIC NOT NULL,
  taxable_amount NUMERIC NOT NULL,
  tax_amount NUMERIC NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  sku TEXT,
  unit TEXT DEFAULT 'piece',
  category TEXT,
  tax_definition_id TEXT REFERENCES tax_definitions(id),
  is_active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_categories (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_builtin BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_units (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_builtin BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

INSERT OR IGNORE INTO product_categories (id, code, name, sort_order, is_builtin) VALUES
  ('service', 'service', 'Service', 1, 1),
  ('goods', 'goods', 'Goods', 2, 1),
  ('subscription', 'subscription', 'Subscription', 3, 1),
  ('other', 'other', 'Other', 4, 1);

INSERT OR IGNORE INTO product_units (id, code, name, sort_order, is_builtin) VALUES
  ('piece', 'piece', 'Piece', 1, 1),
  ('hour', 'hour', 'Hour', 2, 1),
  ('day', 'day', 'Day', 3, 1),
  ('kg', 'kg', 'Kilogram', 4, 1),
  ('m', 'm', 'Meter', 5, 1),
  ('lump_sum', 'lump_sum', 'Lump Sum', 6, 1);
