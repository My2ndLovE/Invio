// @ts-nocheck: simplify handlers without explicit typings
import { Hono } from "hono";
import { normalize, relative, resolve } from "std/path";
import { getInvoiceByShareToken } from "../controllers/invoices.ts";
import { getSettings } from "../controllers/settings.ts";
import { buildInvoiceHTML, generatePDF } from "../utils/pdf.ts";
import { generateUBLInvoiceXML } from "../utils/ubl.ts";
import { generateInvoiceXML, listXMLProfiles } from "../utils/xmlProfiles.ts";
import { isDemoMode } from "../utils/env.ts";

const publicRoutes = new Hono();

function isSafeTemplateIdentifier(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(value);
}

// Expose a lightweight public endpoint so unauthenticated clients can
// detect whether the backend is running in demo (read-only) mode.
const DEMO_MODE = isDemoMode();
publicRoutes.get("/demo-mode", (c) => {
  return c.json({ demoMode: DEMO_MODE });
});

// Serve stored template files (fonts, html) for installed templates
publicRoutes.get("/_template-assets/:id/:version/*", async (c) => {
  const { id, version } = c.req.param();
  if (!isSafeTemplateIdentifier(id) || !isSafeTemplateIdentifier(version)) {
    return c.notFound();
  }
  const rest = c.req.param("*") || "";
  const normalizedRest = normalize(rest.replaceAll("\\", "/"));
  if (!normalizedRest || normalizedRest.startsWith("..")) {
    return c.notFound();
  }

  const baseDir = resolve("./data/templates");
  const candidate = resolve(baseDir, id, version, normalizedRest);
  const relativePath = relative(baseDir, candidate);
  if (!relativePath || relativePath.startsWith("..")) {
    return c.notFound();
  }

  try {
    const bytes = await Deno.readFile(candidate);
    return new Response(bytes);
  } catch {
    return c.notFound();
  }
});

publicRoutes.get("/public/invoices/:share_token", async (c) => {
  const shareToken = c.req.param("share_token");
  const invoice = await getInvoiceByShareToken(shareToken);

  if (!invoice) {
    return c.json({ message: "Invoice not found" }, 404);
  }

  return c.json(invoice);
});

publicRoutes.get("/public/invoices/:share_token/pdf", async (c) => {
  const shareToken = c.req.param("share_token");
  const invoice = await getInvoiceByShareToken(shareToken);
  if (!invoice) {
    return c.json({ message: "Invoice not found" }, 404);
  }

  // Settings map
  const settings = await getSettings();
  const settingsMap = settings.reduce((acc: Record<string, string>, s) => {
    acc[s.key] = s.value;
    return acc;
  }, {} as Record<string, string>);
  if (!settingsMap.logo && settingsMap.logoUrl) {
    settingsMap.logo = settingsMap.logoUrl as string;
  }

  // Construct BusinessSettings with sane defaults; unified single 'logo' field
  const businessSettings = {
    companyName: settingsMap.companyName || "Your Company",
    companyAddress: settingsMap.companyAddress || "",
    companyEmail: settingsMap.companyEmail || "",
    companyPhone: settingsMap.companyPhone || "",
    companyTaxId: settingsMap.companyTaxId || "",
    currency: settingsMap.currency || "USD",
      taxLabel: settingsMap.taxLabel || undefined,
    logo: settingsMap.logo,
    // pass-through layout controls
    // brandLayout removed; always treating as logo-left in rendering
    paymentMethods: settingsMap.paymentMethods || "Bank Transfer",
    bankAccount: settingsMap.bankAccount || "",
    paymentTerms: settingsMap.paymentTerms || "Due in 30 days",
    defaultNotes: settingsMap.defaultNotes || "",
    locale: settingsMap.locale || undefined,
  };

  // Use template/highlight from settings only (no query overrides)
  const highlight = settingsMap.highlight ?? undefined;
  let selectedTemplateId: string | undefined = settingsMap.templateId
    ?.toLowerCase();
  if (
    selectedTemplateId === "professional" ||
    selectedTemplateId === "professional-modern"
  ) {
    selectedTemplateId = "professional-modern";
  } else if (
    selectedTemplateId === "minimalist" ||
    selectedTemplateId === "minimalist-clean"
  ) {
    selectedTemplateId = "minimalist-clean";
  }

  try {
    const embedXml = String(settingsMap.embedXmlInPdf || "false").toLowerCase() === "true";
    const xmlProfileId = settingsMap.xmlProfileId || "ubl21";
    const pdfBuffer = await generatePDF(
      invoice,
      businessSettings,
      selectedTemplateId,
      highlight,
      {
        embedXml,
        embedXmlProfileId: xmlProfileId,
        dateFormat: settingsMap.dateFormat,
        numberFormat: settingsMap.numberFormat,
        locale: settingsMap.locale,
        browser: c.env?.BROWSER, // Cloudflare Browser Rendering binding
      },
    );
    // Detect embedded attachments for diagnostics
    let hasAttachment = false;
    let attachmentNames: string[] = [];
    try {
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.load(pdfBuffer);
      const maybe = (doc as unknown as { getAttachments?: () => Record<string, Uint8Array> }).getAttachments?.();
      if (maybe && typeof maybe === "object") {
        attachmentNames = Object.keys(maybe);
        hasAttachment = attachmentNames.length > 0;
      }
    } catch (_e) { /* ignore */ }
    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-${
          invoice.invoiceNumber || shareToken
        }.pdf"`,
        "X-Robots-Tag": "noindex",
        ...(hasAttachment ? { "X-Embedded-XML": "true", "X-Embedded-XML-Names": attachmentNames.join(",") } : { "X-Embedded-XML": "false" }),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("/public/invoices/:share_token/pdf failed:", msg);
    return c.json({ error: "Failed to generate PDF", details: msg }, 500);
  }
});

// Return invoice as HTML (same options as PDF, but no PDF generation)
publicRoutes.get("/public/invoices/:share_token/html", async (c) => {
  const shareToken = c.req.param("share_token");
  const invoice = await getInvoiceByShareToken(shareToken);
  if (!invoice) {
    return c.json({ message: "Invoice not found" }, 404);
  }

  const settings = await getSettings();
  const settingsMap = settings.reduce((acc: Record<string, string>, s) => {
    acc[s.key] = s.value;
    return acc;
  }, {} as Record<string, string>);
  if (!settingsMap.logo && settingsMap.logoUrl) {
    settingsMap.logo = settingsMap.logoUrl as string;
  }

  const businessSettings = {
    companyName: settingsMap.companyName || "Your Company",
    companyAddress: settingsMap.companyAddress || "",
    companyCity: settingsMap.companyCity || "",
    companyPostalCode: settingsMap.companyPostalCode || "",
    companyEmail: settingsMap.companyEmail || "",
    companyPhone: settingsMap.companyPhone || "",
    companyTaxId: settingsMap.companyTaxId || "",
    companyCountryCode: settingsMap.companyCountryCode ||
      settingsMap.countryCode || "",
    currency: settingsMap.currency || "USD",
      taxLabel: settingsMap.taxLabel || undefined,
    logo: settingsMap.logo,
    // brandLayout removed; always treating as logo-left in rendering
    paymentMethods: settingsMap.paymentMethods || "Bank Transfer",
    bankAccount: settingsMap.bankAccount || "",
    paymentTerms: settingsMap.paymentTerms || "Due in 30 days",
    defaultNotes: settingsMap.defaultNotes || "",
    locale: settingsMap.locale || undefined,
  };

  // Use template/highlight from settings only (no query overrides)
  const highlight = settingsMap.highlight ?? undefined;
  let selectedTemplateId: string | undefined = settingsMap.templateId
    ?.toLowerCase();
  if (
    selectedTemplateId === "professional" ||
    selectedTemplateId === "professional-modern"
  ) selectedTemplateId = "professional-modern";
  else if (
    selectedTemplateId === "minimalist" ||
    selectedTemplateId === "minimalist-clean"
  ) selectedTemplateId = "minimalist-clean";

  const html = await buildInvoiceHTML(
    invoice,
    businessSettings,
    selectedTemplateId,
    highlight,
    settingsMap.dateFormat,
    settingsMap.numberFormat,
    settingsMap.locale,
  );
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
});

// Return invoice as UBL (PEPPOL BIS Billing 3.0) XML
publicRoutes.get("/public/invoices/:share_token/ubl.xml", async (c) => {
  const shareToken = c.req.param("share_token");
  const invoice = await getInvoiceByShareToken(shareToken);
  if (!invoice) {
    return c.json({ message: "Invoice not found" }, 404);
  }

  const settings = await getSettings();
  const settingsMap = settings.reduce((acc: Record<string, string>, s) => {
    acc[s.key] = s.value;
    return acc;
  }, {} as Record<string, string>);

  const businessSettings = {
    companyName: settingsMap.companyName || "Your Company",
    companyAddress: settingsMap.companyAddress || "",
    companyCity: settingsMap.companyCity || "",
    companyPostalCode: settingsMap.companyPostalCode || "",
    companyEmail: settingsMap.companyEmail || "",
    companyPhone: settingsMap.companyPhone || "",
    companyTaxId: settingsMap.companyTaxId || "",
    currency: settingsMap.currency || "USD",
      taxLabel: settingsMap.taxLabel || undefined,
    logo: settingsMap.logo,
    paymentMethods: settingsMap.paymentMethods || "Bank Transfer",
    bankAccount: settingsMap.bankAccount || "",
    paymentTerms: settingsMap.paymentTerms || "Due in 30 days",
    defaultNotes: settingsMap.defaultNotes || "",
  };

  const xml = generateUBLInvoiceXML(invoice, businessSettings, {
    sellerEndpointId: settingsMap.peppolSellerEndpointId,
    sellerEndpointSchemeId: settingsMap.peppolSellerEndpointSchemeId,
    buyerEndpointId: settingsMap.peppolBuyerEndpointId,
    buyerEndpointSchemeId: settingsMap.peppolBuyerEndpointSchemeId,
    sellerCountryCode: settingsMap.companyCountryCode,
    buyerCountryCode: invoice.customer.countryCode,
  });

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="invoice-${
        invoice.invoiceNumber || shareToken
      }.xml"`,
      "X-Robots-Tag": "noindex",
    },
  });
});

// Generic XML export endpoint selecting a profile (built-in only for now)
// Query param: ?profile=ubl21 (default)
publicRoutes.get("/public/invoices/:share_token/xml", async (c) => {
  const shareToken = c.req.param("share_token");
  const invoice = await getInvoiceByShareToken(shareToken);
  if (!invoice) return c.json({ message: "Invoice not found" }, 404);

  const settings = await getSettings();
  const settingsMap = settings.reduce((acc: Record<string, string>, s) => {
    acc[s.key] = s.value;
    return acc;
  }, {} as Record<string, string>);

  const businessSettings = {
    companyName: settingsMap.companyName || "Your Company",
    companyAddress: settingsMap.companyAddress || "",
    companyEmail: settingsMap.companyEmail || "",
    companyPhone: settingsMap.companyPhone || "",
    companyTaxId: settingsMap.companyTaxId || "",
    currency: settingsMap.currency || "USD",
      taxLabel: settingsMap.taxLabel || undefined,
    logo: settingsMap.logo,
    paymentMethods: settingsMap.paymentMethods || "Bank Transfer",
    bankAccount: settingsMap.bankAccount || "",
    paymentTerms: settingsMap.paymentTerms || "Due in 30 days",
    defaultNotes: settingsMap.defaultNotes || "",
    companyCountryCode: settingsMap.companyCountryCode || "",
  };

  const url = new URL(c.req.url);
  const profileParam = url.searchParams.get("profile") || settingsMap.xmlProfileId || undefined;
  const { xml, profile } = generateInvoiceXML(profileParam, invoice, businessSettings, {
    sellerEndpointId: settingsMap.peppolSellerEndpointId,
    sellerEndpointSchemeId: settingsMap.peppolSellerEndpointSchemeId,
    buyerEndpointId: settingsMap.peppolBuyerEndpointId,
    buyerEndpointSchemeId: settingsMap.peppolBuyerEndpointSchemeId,
    sellerCountryCode: settingsMap.companyCountryCode,
    buyerCountryCode: invoice.customer.countryCode,
  });

  return new Response(xml, {
    headers: {
      "Content-Type": `${profile.mediaType}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="invoice-${invoice.invoiceNumber || shareToken}.${profile.fileExtension}"`,
      "X-Robots-Tag": "noindex",
    },
  });
});

// List available built-in XML profiles (public; could also require auth, but contents are non-sensitive)
publicRoutes.get("/public/xml-profiles", (c) => {
  const profiles = listXMLProfiles().map((p) => ({
    id: p.id,
    name: p.name,
    mediaType: p.mediaType,
    fileExtension: p.fileExtension,
    experimental: !!p.experimental,
    builtIn: true,
  }));
  return c.json(profiles);
});

export { publicRoutes };
