import { createContext } from "preact";
import { ComponentChildren } from "preact";
import { createTranslator, DEFAULT_LOCALIZATION, LocalizationConfig } from "./mod.ts";

export const LocalizationContext = createContext<LocalizationConfig>(
  DEFAULT_LOCALIZATION,
);

// Module-level storage for SSR localization (workaround for Fresh 2.x context issues)
let ssrLocalization: LocalizationConfig = DEFAULT_LOCALIZATION;

export function setSSRLocalization(config: LocalizationConfig) {
  ssrLocalization = config;
}

export function LocalizationProvider(
  props: { value: LocalizationConfig; children: ComponentChildren },
) {
  // Also set the module-level variable for SSR
  ssrLocalization = props.value;
  return (
    <LocalizationContext.Provider value={props.value}>
      {props.children}
    </LocalizationContext.Provider>
  );
}

export function useTranslations(): LocalizationConfig {
  // On the client, read from HTML attributes (set during SSR)
  if (typeof document !== "undefined") {
    const html = document.documentElement;
    const htmlLang = html.lang || "en";
    const numberFormat = (html.dataset.numberFormat as "comma" | "period") || "comma";
    const dateFormat = html.dataset.dateFormat || "YYYY-MM-DD";
    
    const { t, messages } = createTranslator(htmlLang);
    return {
      locale: htmlLang,
      messages,
      t,
      numberFormat,
      dateFormat,
    };
  }
  
  // Server-side: use the module-level variable (workaround for Fresh 2.x)
  return ssrLocalization;
}
