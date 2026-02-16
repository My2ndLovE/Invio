// Utility functions for formatting numbers and currency

// Validate ISO 4217 currency code (3 uppercase letters)
function isValidCurrencyCode(code: string): boolean {
  return typeof code === "string" && /^[A-Z]{3}$/i.test(code.trim());
}

export function formatMoney(
  value: number | undefined,
  currency: string = "USD",
  numberFormat: "comma" | "period" = "comma",
): string {
  if (typeof value !== "number") return "";

  // Validate and sanitize currency code
  const safeCurrency = isValidCurrencyCode(currency) ? currency.toUpperCase() : "USD";

  // Create a custom locale based on the number format preference
  let locale: string;
  let options: Intl.NumberFormatOptions;

  if (numberFormat === "period") {
    // European style: 1.000,00
    locale = "de-DE"; // German locale uses period as thousands separator and comma as decimal
    options = { style: "currency", currency: safeCurrency };
  } else {
    // US style: 1,000.00
    locale = "en-US";
    options = { style: "currency", currency: safeCurrency };
  }

  return new Intl.NumberFormat(locale, options).format(value);
}

// Helper function to get number format from settings
export function getNumberFormat(
  settings?: Record<string, unknown>,
): "comma" | "period" {
  const format = (settings?.numberFormat as string) || "comma";
  return format === "period" ? "period" : "comma";
}
