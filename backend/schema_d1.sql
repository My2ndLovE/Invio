-- Invio D1 Schema

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES 
  ('companyName', 'Your Company'),
  ('companyAddress', '123 Business St, City, State 12345'),
  ('companyEmail', 'contact@yourcompany.com'),
  ('companyPhone', '+1 (555) 123-4567'),
  ('companyTaxId', 'TAX123456789'),
  ('companyCountryCode', 'US'),
  ('currency', 'USD'),
  ('logo', ''),
  ('paymentMethods', 'Bank Transfer, PayPal, Credit Card'),
  ('bankAccount', 'Account: 1234567890, Routing: 987654321'),
  ('paymentTerms', 'Due in 30 days'),
  ('defaultNotes', 'Thank you for your business!'),
  ('invoiceNumberPattern', ''),
  ('invoiceNumberingEnabled', 'true'),
  ('embedXmlInHtml', 'false'),
  ('peppolSellerEndpointId', ''),
  ('peppolSellerEndpointSchemeId', ''),
  ('peppolBuyerEndpointId', ''),
  ('peppolBuyerEndpointSchemeId', '');

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  country_code TEXT,
  tax_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT UNIQUE NOT NULL,
  customer_id TEXT REFERENCES customers(id),
  issue_date DATE NOT NULL,
  due_date DATE,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'draft',
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0,
  discount_percentage NUMERIC DEFAULT 0,
  tax_rate NUMERIC DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  total NUMERIC NOT NULL,
  payment_terms TEXT,
  notes TEXT,
  share_token TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  prices_include_tax BOOLEAN DEFAULT 0,
  rounding_mode TEXT DEFAULT 'line'
);

CREATE TABLE invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit_price NUMERIC NOT NULL,
  line_total NUMERIC NOT NULL,
  notes TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE invoice_attachments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  html TEXT NOT NULL,
  is_default BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tax_definitions (
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

CREATE TABLE invoice_item_taxes (
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

CREATE TABLE invoice_taxes (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  tax_definition_id TEXT REFERENCES tax_definitions(id),
  percent NUMERIC NOT NULL,
  taxable_amount NUMERIC NOT NULL,
  tax_amount NUMERIC NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_share_token ON invoices(share_token);
CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);
