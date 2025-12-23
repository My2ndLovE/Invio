// @ts-nocheck: route handlers use Hono context without typings to keep edits minimal
import { Hono } from "hono";
import {
  createInvoice,
  deleteInvoice,
  duplicateInvoice,
  getInvoiceById,
  getInvoices,
  publishInvoice,
  unpublishInvoice,
  updateInvoice,
} from "../controllers/invoices.ts";
import {
  createTemplate,
  deleteTemplate,
  getTemplateById,
  getTemplates,
  installTemplateFromManifest,
  loadTemplateFromFile,
  renderTemplate,
  setDefaultTemplate,
} from "../controllers/templates.ts";
import {
  deleteSetting,
  getSetting,
  getSettings,
  setSetting,
  updateSettings,
} from "../controllers/settings.ts";
import {
  createCustomer,
  deleteCustomer,
  getCustomerById,
  getCustomers,
  updateCustomer,
} from "../controllers/customers.ts";
import {
  createTaxDefinition,
  deleteTaxDefinition,
  getTaxDefinitionById,
  getTaxDefinitions,
  updateTaxDefinition,
} from "../controllers/taxDefinitions.ts";
import { buildInvoiceHTML, generatePDF } from "../utils/pdf.ts";
import { resetDatabaseFromDemo, getNextInvoiceNumber, getDatabase } from "../database/init.ts";
import { isDemoMode } from "../utils/env.ts";
import { requireAdminAuth } from "../middleware/auth.ts";

const adminRoutes = new Hono();

const DEMO_MODE = isDemoMode();

adminRoutes.use("/*", requireAdminAuth);

adminRoutes.post("/admin/demo/reset", async (c) => {
  if (!DEMO_MODE) return c.json({ error: "Demo mode is not enabled" }, 400);
  try {
    await resetDatabaseFromDemo();
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

adminRoutes.get("/invoices/next-number", async (c) => {
  try {
    const next = await getNextInvoiceNumber();
    return c.json({ next });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

adminRoutes.post("/invoices", async (c) => {
  const data = await c.req.json();
  try {
    const invoice = await createInvoice(data);
    return c.json(invoice);
  } catch (e) {
    return c.json({ error: String(e) }, 400);
  }
});

adminRoutes.get("/invoices", async (c) => {
  const invoices = await getInvoices();
  const list = await Promise.all(invoices.map(async (inv) => {
    const customer = await getCustomerById(inv.customerId);
    const issue_date = inv.issueDate ? new Date(inv.issueDate).toISOString().slice(0, 10) : undefined;
    return { ...inv, customer: customer ? { name: customer.name } : undefined, issue_date };
  }));
  return c.json(list);
});

adminRoutes.get("/invoices/:id", async (c) => {
  const invoice = await getInvoiceById(c.req.param("id"));
  if (!invoice) return c.json({ error: "Invoice not found" }, 404);
  return c.json(invoice);
});

adminRoutes.put("/invoices/:id", async (c) => {
  const invoice = await updateInvoice(c.req.param("id"), await c.req.json());
  return c.json(invoice);
});

adminRoutes.delete("/invoices/:id", async (c) => {
  await deleteInvoice(c.req.param("id"));
  return c.json({ success: true });
});

adminRoutes.post("/invoices/:id/publish", async (c) => {
  try {
    const result = await publishInvoice(c.req.param("id"));
    return c.json(result);
  } catch (e) {
    return c.json({ error: String(e) }, 400);
  }
});

adminRoutes.post("/invoices/:id/unpublish", async (c) => {
  const result = await unpublishInvoice(c.req.param("id"));
  return c.json(result);
});

adminRoutes.post("/invoices/:id/duplicate", async (c) => {
  const copy = await duplicateInvoice(c.req.param("id"));
  if (!copy) return c.json({ error: "Invoice not found" }, 404);
  return c.json(copy);
});

adminRoutes.get("/templates", async (c) => {
  let templates = await getTemplates();
  const settings = await getSettings();
  const map = settings.reduce((acc: any, s) => { acc[s.key] = s.value; return acc; }, {} as any);
  const current = map.templateId;
  return c.json(templates.map(t => ({ ...t, isDefault: t.id === current, updatable: !!map[`templateSource:${t.id}`] })));
});

adminRoutes.post("/templates", async (c) => {
  const template = await createTemplate(await c.req.json());
  return c.json(template);
});

adminRoutes.get("/tax-definitions", async (c) => {
  return c.json(await getTaxDefinitions());
});

adminRoutes.post("/tax-definitions", async (c) => {
  return c.json(await createTaxDefinition(await c.req.json()), 201);
});

adminRoutes.get("/settings", async (c) => {
  const settings = await getSettings();
  const map = settings.reduce((acc: any, s) => { acc[s.key] = s.value; return acc; }, {} as any);
  map.demoMode = DEMO_MODE ? "true" : "false";
  return c.json(map);
});

adminRoutes.put("/settings", async (c) => {
  const data = await c.req.json();
  const settings = await updateSettings(data);
  if (data.templateId) await setDefaultTemplate(data.templateId);
  return c.json(settings);
});

adminRoutes.patch("/settings", async (c) => {
  const data = await c.req.json();
  const settings = await updateSettings(data);
  if (data.templateId) await setDefaultTemplate(data.templateId);
  return c.json(settings);
});

adminRoutes.get("/customers", async (c) => {
  return c.json(await getCustomers());
});

adminRoutes.post("/customers", async (c) => {
  const data = await c.req.json();
  try {
    const customer = await createCustomer(data);
    return c.json(customer);
  } catch (e) {
    return c.json({ error: String(e) }, 400);
  }
});

adminRoutes.get("/customers/:id", async (c) => {
  const customer = await getCustomerById(c.req.param("id"));
  if (!customer) return c.json({ error: "Customer not found" }, 404);
  return c.json(customer);
});

adminRoutes.put("/customers/:id", async (c) => {
  const customer = await updateCustomer(c.req.param("id"), await c.req.json());
  if (!customer) return c.json({ error: "Customer not found" }, 404);
  return c.json(customer);
});

adminRoutes.delete("/customers/:id", async (c) => {
  await deleteCustomer(c.req.param("id"));
  return c.json({ success: true });
});

// PDF and HTML generation
adminRoutes.get("/invoices/:id/pdf", async (c) => {
  const invoice = await getInvoiceById(c.req.param("id"));
  if (!invoice) return c.json({ message: "Invoice not found" }, 404);

  const settingsArr = await getSettings();
  const settings = settingsArr.reduce((acc: any, s) => { acc[s.key] = s.value; return acc; }, {} as any);

  const businessSettings = {
    companyName: settings.companyName || "Your Company",
    companyAddress: settings.companyAddress || "",
    logo: settings.logo || settings.logoUrl,
    currency: settings.currency || "USD",
  };

  const pdfBuffer = await generatePDF(
    invoice,
    businessSettings,
    settings.templateId,
    settings.highlight,
    {
      embedXml: settings.embedXmlInPdf === "true",
      embedXmlProfileId: settings.xmlProfileId || "ubl21",
      dateFormat: settings.dateFormat,
      numberFormat: settings.numberFormat,
      locale: settings.locale,
      browser: c.env?.BROWSER, // Pass Cloudflare Browser Rendering binding
    },
  );

  return new Response(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`,
    },
  });
});

export { adminRoutes };
