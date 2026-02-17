import {
  calculateInvoiceTotals,
  generateDraftInvoiceNumber,
  getDatabase,
  getNextInvoiceNumber,
} from "../database/init.ts";
import {
  CreateInvoiceRequest,
  Invoice,
  InvoiceItem,
  InvoiceWithDetails,
  UpdateInvoiceRequest,
} from "../types/index.ts";
import { generateShareToken, generateUUID } from "../utils/uuid.ts";
import { getCustomerById } from "./customers.ts";
import { getSettings } from "./settings.ts";

type LineTaxInput = {
  percent: number;
  taxDefinitionId?: string;
  code?: string;
  included?: boolean;
  note?: string;
};

type ItemInput = {
  description: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
  taxes?: LineTaxInput[];
};

type PerLineCalc = {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  perItem: Array<{
    taxable: number;
    taxes: Array<{ percent: number; amount: number; note?: string; taxDefinitionId?: string }>;
  }>;
  summary: Array<{ percent: number; taxable: number; amount: number }>;
};

function calculatePerLineTotals(
  items: ItemInput[],
  discountPercentage = 0,
  discountAmount = 0,
  pricesIncludeTax = false,
  _roundingMode: "line" | "total" = "line",
): PerLineCalc {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const lineGrosses = items.map((it) => (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0));
  const subtotal = lineGrosses.reduce((a, b) => a + b, 0);

  let finalDiscountAmount = Math.min(Math.max(discountPercentage > 0 ? subtotal * (discountPercentage / 100) : (Number(discountAmount) || 0), 0), subtotal);

  let distributed = 0;
  const lineDiscounts = lineGrosses.map((g, idx) => {
    if (subtotal === 0) return 0;
    if (idx === lineGrosses.length - 1) return r2(finalDiscountAmount - distributed);
    const d = r2(finalDiscountAmount * (g / subtotal));
    distributed += d;
    return d;
  });

  const perItem: PerLineCalc["perItem"] = [];
  let taxAmount = 0;
  let total = 0;
  const summaryMap = new Map<number, { taxable: number; amount: number }>();

  for (let i = 0; i < items.length; i++) {
    const gross = lineGrosses[i] || 0;
    const afterDiscount = Math.max(0, gross - (lineDiscounts[i] || 0));
    const taxes = items[i].taxes || [];
    const rateSum = taxes.reduce((s, t) => s + (Number(t.percent) || 0), 0) / 100;

    let net = afterDiscount;
    if (pricesIncludeTax && rateSum > 0) net = afterDiscount / (1 + rateSum);

    const itemTaxes: any[] = [];
    for (const t of taxes) {
      const p = (Number(t.percent) || 0) / 100;
      const amt = r2(net * p);
      itemTaxes.push({ percent: r2(p * 100), amount: amt, note: t.note, taxDefinitionId: t.taxDefinitionId });
      const s = summaryMap.get(r2(p * 100)) || { taxable: 0, amount: 0 };
      s.taxable = r2(s.taxable + net);
      s.amount = r2(s.amount + amt);
      summaryMap.set(r2(p * 100), s);
    }

    const itemTaxSum = r2(itemTaxes.reduce((a, b) => a + b.amount, 0));
    perItem.push({ taxable: r2(net), taxes: itemTaxes });
    if (pricesIncludeTax) {
      total = r2(total + afterDiscount);
      taxAmount = r2(taxAmount + itemTaxSum);
    } else {
      total = r2(total + net + itemTaxSum);
      taxAmount = r2(taxAmount + itemTaxSum);
    }
  }

  const summary = Array.from(summaryMap.entries()).map(([percent, v]) => ({ percent, taxable: r2(v.taxable), amount: r2(v.amount) })).sort((a, b) => a.percent - b.percent);

  return { subtotal: r2(subtotal), discountAmount: r2(finalDiscountAmount), taxAmount: r2(taxAmount), total: r2(total), perItem, summary };
}

export const createInvoice = async (data: CreateInvoiceRequest): Promise<InvoiceWithDetails> => {
  const db = getDatabase();

  // Validate customer exists before any DB writes
  const customer = await getCustomerById(data.customerId);
  if (!customer) throw new Error("Customer not found");

  const invoiceId = generateUUID();
  const shareToken = generateShareToken();
  let invoiceNumber = data.invoiceNumber;
  if (invoiceNumber) {
    const exists = await db.query("SELECT 1 FROM invoices WHERE invoice_number = ? LIMIT 1", [invoiceNumber]);
    if (exists.length > 0) throw new Error("Invoice number already exists");
  } else {
    try {
      const rows = await db.query("SELECT value FROM settings WHERE key = 'invoiceNumberPattern' LIMIT 1");
      const pattern = rows.length > 0 ? String((rows[0] as any)[0] || "").trim() : "";
      invoiceNumber = (pattern && /\{SEQ\}/.test(pattern)) ? await getNextInvoiceNumber() : generateDraftInvoiceNumber();
    } catch {
      invoiceNumber = generateDraftInvoiceNumber();
    }
  }

  const settingsArr = await getSettings();
  const settings = settingsArr.reduce((acc: any, s) => { acc[s.key] = s.value; return acc; }, {} as any);

  const defaultPricesIncludeTax = String(settings.defaultPricesIncludeTax || "false").toLowerCase() === "true";
  const defaultRoundingMode = String(settings.defaultRoundingMode || "line");
  const defaultTaxRate = Number(settings.defaultTaxRate || 0) || 0;

  const hasPerLineTaxes = Array.isArray(data.items) && data.items.some((i: any) => Array.isArray(i.taxes) && i.taxes.length > 0);
  let totals = { subtotal: 0, discountAmount: 0, taxAmount: 0, total: 0 };
  let perLineCalc: PerLineCalc | undefined = undefined;

  if (hasPerLineTaxes) {
    perLineCalc = calculatePerLineTotals(data.items as any, data.discountPercentage || 0, data.discountAmount || 0, data.pricesIncludeTax ?? defaultPricesIncludeTax, (data.roundingMode || defaultRoundingMode) as any);
    totals = { subtotal: perLineCalc.subtotal, discountAmount: perLineCalc.discountAmount, taxAmount: perLineCalc.taxAmount, total: perLineCalc.total };
  } else {
    totals = calculateInvoiceTotals(data.items, data.discountPercentage || 0, data.discountAmount || 0, (typeof data.taxRate === "number" ? data.taxRate : defaultTaxRate), data.pricesIncludeTax ?? defaultPricesIncludeTax, (data.roundingMode || defaultRoundingMode) as any);
  }

  const now = new Date();
  const invoice: Invoice = {
    id: invoiceId,
    invoiceNumber: invoiceNumber!,
    customerId: data.customerId,
    issueDate: data.issueDate ? new Date(data.issueDate) : now,
    dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
    currency: data.currency || settings.currency || "USD",
    status: data.status || "draft",
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount,
    discountPercentage: data.discountPercentage || 0,
    taxRate: hasPerLineTaxes ? 0 : (data.taxRate || 0),
    taxAmount: totals.taxAmount,
    total: totals.total,
    pricesIncludeTax: data.pricesIncludeTax ?? defaultPricesIncludeTax,
    roundingMode: data.roundingMode || defaultRoundingMode,
    paymentTerms: data.paymentTerms || settings.paymentTerms || "Due in 30 days",
    notes: data.notes,
    shareToken,
    createdAt: now,
    updatedAt: now,
  };

  await db.execute(`INSERT INTO invoices (id, invoice_number, customer_id, issue_date, due_date, currency, status, subtotal, discount_amount, discount_percentage, tax_rate, tax_amount, total, payment_terms, notes, share_token, created_at, updated_at, prices_include_tax, rounding_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [invoice.id, invoice.invoiceNumber, invoice.customerId, invoice.issueDate.toISOString(), invoice.dueDate?.toISOString() ?? null, invoice.currency, invoice.status, invoice.subtotal, invoice.discountAmount, invoice.discountPercentage, invoice.taxRate, invoice.taxAmount, invoice.total, invoice.paymentTerms, invoice.notes, invoice.shareToken, invoice.createdAt.toISOString(), invoice.updatedAt.toISOString(), invoice.pricesIncludeTax ? 1 : 0, invoice.roundingMode]);

  const items: InvoiceItem[] = [];
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    const itemId = generateUUID();
    const lineTotal = item.quantity * item.unitPrice;
    const invItem: InvoiceItem = { id: itemId, invoiceId, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, lineTotal, notes: item.notes, sortOrder: i };
    await db.execute(`INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, line_total, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [itemId, invoiceId, item.description, item.quantity, item.unitPrice, lineTotal, item.notes, i]);
    items.push(invItem);

    if (hasPerLineTaxes && perLineCalc) {
      const calc = perLineCalc.perItem[i];
      if (calc && Array.isArray(item.taxes)) {
        for (const t of calc.taxes) {
          await db.execute(`INSERT INTO invoice_item_taxes (id, invoice_item_id, tax_definition_id, percent, taxable_amount, amount, included, sequence, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [generateUUID(), itemId, t.taxDefinitionId || null, t.percent, calc.taxable, t.amount, invoice.pricesIncludeTax ? 1 : 0, 0, t.note || null, now.toISOString()]);
        }
      }
    }
  }

  if (hasPerLineTaxes && perLineCalc) {
    for (const s of perLineCalc.summary) {
      await db.execute(`INSERT INTO invoice_taxes (id, invoice_id, tax_definition_id, percent, taxable_amount, tax_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [generateUUID(), invoiceId, null, s.percent, s.taxable, s.amount, now.toISOString()]);
    }
  } else if ((data as any).taxDefinitionId) {
    const percent = invoice.taxRate || 0;
    const rate = percent / 100;
    const afterDiscount = invoice.subtotal - invoice.discountAmount;
    const taxable = invoice.pricesIncludeTax ? (rate > 0 ? afterDiscount / (1 + rate) : afterDiscount) : afterDiscount;
    await db.execute(`INSERT INTO invoice_taxes (id, invoice_id, tax_definition_id, percent, taxable_amount, tax_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [generateUUID(), invoiceId, (data as any).taxDefinitionId, percent, taxable, invoice.taxAmount, now.toISOString()]);
  }

  return { ...invoice, customer, items, taxes: perLineCalc?.summary.map(s => ({ id: "", invoiceId, percent: s.percent, taxableAmount: s.taxable, taxAmount: s.amount })) };
};

const mapRowToInvoice = (row: any): Invoice => ({
  id: row[0], invoiceNumber: row[1], customerId: row[2], issueDate: new Date(row[3]), dueDate: row[4] ? new Date(row[4]) : undefined, currency: row[5], status: row[6], subtotal: row[7], discountAmount: row[8], discountPercentage: row[9], taxRate: row[10], taxAmount: row[11], total: row[12], paymentTerms: row[13], notes: row[14], shareToken: row[15], createdAt: new Date(row[16]), updatedAt: new Date(row[17]), pricesIncludeTax: Boolean(row[18]), roundingMode: row[19] || "line"
});

export const getInvoices = async (): Promise<Invoice[]> => {
  const db = getDatabase();
  const results = await db.query(`SELECT id, invoice_number, customer_id, issue_date, due_date, currency, status, subtotal, discount_amount, discount_percentage, tax_rate, tax_amount, total, payment_terms, notes, share_token, created_at, updated_at, prices_include_tax, rounding_mode FROM invoices ORDER BY created_at DESC`);
  return results.map(row => mapRowToInvoice(row));
};

export const getInvoiceById = async (id: string): Promise<InvoiceWithDetails | null> => {
  const db = getDatabase();
  const result = await db.query(`SELECT id, invoice_number, customer_id, issue_date, due_date, currency, status, subtotal, discount_amount, discount_percentage, tax_rate, tax_amount, total, payment_terms, notes, share_token, created_at, updated_at, prices_include_tax, rounding_mode FROM invoices WHERE id = ?`, [id]);
  if (result.length === 0) return null;
  const invoice = mapRowToInvoice(result[0]);
  const customer = await getCustomerById(invoice.customerId) ?? {
    id: invoice.customerId, name: "(Deleted Customer)", createdAt: new Date(),
  };

  const itemsResult = await db.query(`SELECT id, invoice_id, description, quantity, unit_price, line_total, notes, sort_order FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order`, [id]);
  const items = itemsResult.map((row: any) => ({ id: row[0], invoiceId: row[1], description: row[2], quantity: row[3], unitPrice: row[4], lineTotal: row[5], notes: row[6], sortOrder: row[7] }));

  const taxesByItem = new Map();
  if (items.length > 0) {
    const taxRows = await db.query(`SELECT invoice_item_id, tax_definition_id, percent, taxable_amount, amount, included, note FROM invoice_item_taxes WHERE invoice_item_id IN (${items.map(() => "?").join(",")})`, items.map(it => it.id));
    for (const r of taxRows) {
      const itemId = String((r as any)[0]);
      if (!taxesByItem.has(itemId)) taxesByItem.set(itemId, []);
      taxesByItem.get(itemId).push({ taxDefinitionId: (r as any)[1], percent: (r as any)[2], taxableAmount: (r as any)[3], amount: (r as any)[4], included: Boolean((r as any)[5]), note: (r as any)[6] });
    }
  }

  const invTaxRows = await db.query(`SELECT id, invoice_id, tax_definition_id, percent, taxable_amount, tax_amount FROM invoice_taxes WHERE invoice_id = ?`, [id]);
  const taxes = invTaxRows.map((r: any) => ({ id: r[0], invoiceId: r[1], taxDefinitionId: r[2], percent: r[3], taxableAmount: r[4], taxAmount: r[5] }));

  return { ...invoice, customer, items: items.map(it => ({ ...it, taxes: taxesByItem.get(it.id) })), taxes };
};

export const getInvoiceByShareToken = async (shareToken: string) => {
  const db = getDatabase();
  const result = await db.query(`SELECT id FROM invoices WHERE share_token = ?`, [shareToken]);
  if (result.length === 0) return null;
  return await getInvoiceById((result[0] as any)[0]);
};

export const deleteInvoice = async (id: string) => {
  const db = getDatabase();
  await db.execute("DELETE FROM invoices WHERE id = ?", [id]);
};

export const updateInvoice = async (id: string, data: UpdateInvoiceRequest) => {
  const db = getDatabase();

  const existing = await getInvoiceById(id);
  if (!existing) throw new Error("Invoice not found");

  // If only status is provided (no items), do a simple status update
  if (!data.items || data.items.length === 0) {
    if (data.status) {
      await db.execute("UPDATE invoices SET status = ?, updated_at = ? WHERE id = ?", [data.status, new Date().toISOString(), id]);
    }
    return await getInvoiceById(id);
  }

  // Full update: recalculate totals from items
  const settingsArr = await getSettings();
  const settings = settingsArr.reduce((acc: any, s) => { acc[s.key] = s.value; return acc; }, {} as any);

  const defaultPricesIncludeTax = String(settings.defaultPricesIncludeTax || "false").toLowerCase() === "true";
  const defaultRoundingMode = String(settings.defaultRoundingMode || "line");
  const defaultTaxRate = Number(settings.defaultTaxRate || 0) || 0;

  const hasPerLineTaxes = data.items.some((i: any) => Array.isArray(i.taxes) && i.taxes.length > 0);
  let totals = { subtotal: 0, discountAmount: 0, taxAmount: 0, total: 0 };
  let perLineCalc: PerLineCalc | undefined = undefined;

  if (hasPerLineTaxes) {
    perLineCalc = calculatePerLineTotals(data.items as any, data.discountPercentage || 0, data.discountAmount || 0, data.pricesIncludeTax ?? defaultPricesIncludeTax, (data.roundingMode || defaultRoundingMode) as any);
    totals = { subtotal: perLineCalc.subtotal, discountAmount: perLineCalc.discountAmount, taxAmount: perLineCalc.taxAmount, total: perLineCalc.total };
  } else {
    totals = calculateInvoiceTotals(data.items, data.discountPercentage || 0, data.discountAmount || 0, (typeof data.taxRate === "number" ? data.taxRate : defaultTaxRate), data.pricesIncludeTax ?? defaultPricesIncludeTax, (data.roundingMode || defaultRoundingMode) as any);
  }

  const now = new Date();
  const invoiceNumber = data.invoiceNumber || existing.invoiceNumber;
  if (data.invoiceNumber && data.invoiceNumber !== existing.invoiceNumber) {
    const dup = await db.query("SELECT 1 FROM invoices WHERE invoice_number = ? AND id != ? LIMIT 1", [data.invoiceNumber, id]);
    if (dup.length > 0) throw new Error("Invoice number already exists");
  }

  await db.execute(
    `UPDATE invoices SET invoice_number = ?, issue_date = ?, due_date = ?, currency = ?, status = ?, subtotal = ?, discount_amount = ?, discount_percentage = ?, tax_rate = ?, tax_amount = ?, total = ?, payment_terms = ?, notes = ?, updated_at = ?, prices_include_tax = ?, rounding_mode = ? WHERE id = ?`,
    [
      invoiceNumber,
      data.issueDate ? new Date(data.issueDate).toISOString() : existing.issueDate.toISOString(),
      data.dueDate ? new Date(data.dueDate).toISOString() : (existing.dueDate?.toISOString() ?? null),
      data.currency || existing.currency,
      data.status || existing.status,
      totals.subtotal,
      totals.discountAmount,
      data.discountPercentage ?? existing.discountPercentage ?? 0,
      hasPerLineTaxes ? 0 : (typeof data.taxRate === "number" ? data.taxRate : existing.taxRate ?? 0),
      totals.taxAmount,
      totals.total,
      data.paymentTerms ?? existing.paymentTerms,
      data.notes ?? existing.notes,
      now.toISOString(),
      (data.pricesIncludeTax ?? existing.pricesIncludeTax) ? 1 : 0,
      data.roundingMode || existing.roundingMode || "line",
      id,
    ],
  );

  // Delete old items (cascade deletes invoice_item_taxes too)
  await db.execute("DELETE FROM invoice_items WHERE invoice_id = ?", [id]);
  // Delete old invoice-level taxes
  await db.execute("DELETE FROM invoice_taxes WHERE invoice_id = ?", [id]);

  // Re-insert items
  const items: InvoiceItem[] = [];
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    const itemId = generateUUID();
    const lineTotal = item.quantity * item.unitPrice;
    const invItem: InvoiceItem = { id: itemId, invoiceId: id, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, lineTotal, notes: item.notes, sortOrder: i };
    await db.execute(`INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, line_total, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [itemId, id, item.description, item.quantity, item.unitPrice, lineTotal, item.notes, i]);
    items.push(invItem);

    if (hasPerLineTaxes && perLineCalc) {
      const calc = perLineCalc.perItem[i];
      if (calc && Array.isArray((item as any).taxes)) {
        for (const t of calc.taxes) {
          await db.execute(`INSERT INTO invoice_item_taxes (id, invoice_item_id, tax_definition_id, percent, taxable_amount, amount, included, sequence, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [generateUUID(), itemId, t.taxDefinitionId || null, t.percent, calc.taxable, t.amount, (data.pricesIncludeTax ?? defaultPricesIncludeTax) ? 1 : 0, 0, t.note || null, now.toISOString()]);
        }
      }
    }
  }

  if (hasPerLineTaxes && perLineCalc) {
    for (const s of perLineCalc.summary) {
      await db.execute(`INSERT INTO invoice_taxes (id, invoice_id, tax_definition_id, percent, taxable_amount, tax_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [generateUUID(), id, null, s.percent, s.taxable, s.amount, now.toISOString()]);
    }
  } else if ((data as any).taxDefinitionId) {
    const percent = hasPerLineTaxes ? 0 : (data.taxRate || 0);
    const rate = percent / 100;
    const afterDiscount = totals.subtotal - totals.discountAmount;
    const pit = data.pricesIncludeTax ?? defaultPricesIncludeTax;
    const taxable = pit ? (rate > 0 ? afterDiscount / (1 + rate) : afterDiscount) : afterDiscount;
    await db.execute(`INSERT INTO invoice_taxes (id, invoice_id, tax_definition_id, percent, taxable_amount, tax_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [generateUUID(), id, (data as any).taxDefinitionId, percent, taxable, totals.taxAmount, now.toISOString()]);
  }

  return await getInvoiceById(id);
};

export const publishInvoice = async (id: string) => {
  const db = getDatabase();
  const invoice = await getInvoiceById(id);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status !== "draft") return invoice;

  // Assign final number if it was draft
  if (invoice.invoiceNumber.startsWith("DRAFT-")) {
    const nextNum = await getNextInvoiceNumber();
    await db.execute("UPDATE invoices SET invoice_number = ?, status = 'published' WHERE id = ?", [nextNum, id]);
  } else {
    await db.execute("UPDATE invoices SET status = 'published' WHERE id = ?", [id]);
  }
  return await getInvoiceById(id);
};

export const unpublishInvoice = async (id: string) => {
  const db = getDatabase();
  await db.execute("UPDATE invoices SET status = 'draft' WHERE id = ?", [id]);
  return await getInvoiceById(id);
};

export const duplicateInvoice = async (id: string) => {
  const invoice = await getInvoiceById(id);
  if (!invoice) return null;
  return await createInvoice({
    customerId: invoice.customerId,
    items: invoice.items.map(it => ({ description: it.description, quantity: it.quantity, unitPrice: it.unitPrice, notes: it.notes, taxes: it.taxes })),
    currency: invoice.currency,
    discountPercentage: invoice.discountPercentage,
    discountAmount: invoice.discountAmount,
    taxRate: invoice.taxRate,
    pricesIncludeTax: invoice.pricesIncludeTax,
    roundingMode: invoice.roundingMode as any,
    notes: invoice.notes,
    paymentTerms: invoice.paymentTerms,
  });
};
