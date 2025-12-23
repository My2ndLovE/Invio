// @ts-nocheck: simplify handlers without explicit typings
import { Hono } from "hono";
import { getInvoiceByShareToken } from "../controllers/invoices.ts";
import { getSettings } from "../controllers/settings.ts";
import { buildInvoiceHTML, generatePDF } from "../utils/pdf.ts";
import { isDemoMode } from "../utils/env.ts";

const publicRoutes = new Hono();

const DEMO_MODE = isDemoMode();

publicRoutes.get("/demo-mode", (c) => {
  return c.json({ demoMode: DEMO_MODE });
});

publicRoutes.get("/public/invoices/:share_token", async (c) => {
  const invoice = await getInvoiceByShareToken(c.req.param("share_token"));
  if (!invoice) return c.json({ message: "Invoice not found" }, 404);
  return c.json(invoice);
});

publicRoutes.get("/public/invoices/:share_token/pdf", async (c) => {
  const shareToken = c.req.param("share_token");
  const invoice = await getInvoiceByShareToken(shareToken);
  if (!invoice) return c.json({ message: "Invoice not found" }, 404);

  const settingsArr = await getSettings();
  const settings = settingsArr.reduce((acc: any, s) => { acc[s.key] = s.value; return acc; }, {} as any);

  const businessSettings = {
    companyName: settings.companyName || "Your Company",
    companyAddress: settings.companyAddress || "",
    logo: settings.logo || settings.logoUrl,
    currency: settings.currency || "USD",
  };

  try {
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
        "Content-Disposition": `attachment; filename="invoice-${invoice.invoiceNumber || shareToken}.pdf"`,
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (e) {
    return c.json({ error: "Failed to generate PDF", details: String(e) }, 500);
  }
});

publicRoutes.get("/public/invoices/:share_token/html", async (c) => {
  const invoice = await getInvoiceByShareToken(c.req.param("share_token"));
  if (!invoice) return c.json({ message: "Invoice not found" }, 404);

  const settingsArr = await getSettings();
  const settings = settingsArr.reduce((acc: any, s) => { acc[s.key] = s.value; return acc; }, {} as any);

  const businessSettings = {
    companyName: settings.companyName || "Your Company",
    companyAddress: settings.companyAddress || "",
    logo: settings.logo || settings.logoUrl,
    currency: settings.currency || "USD",
  };

  const html = await buildInvoiceHTML(
    invoice,
    businessSettings,
    settings.templateId,
    settings.highlight,
    settings.dateFormat,
    settings.numberFormat,
    settings.locale,
  );

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
});

export { publicRoutes };
