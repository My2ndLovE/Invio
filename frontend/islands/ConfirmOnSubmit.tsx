import { useEffect } from "preact/hooks";
import { useTranslations } from "../i18n/context.tsx";

export default function ConfirmOnSubmit() {
  const { t } = useTranslations();
  useEffect(() => {
    const fallback = t("Are you sure?");
    const onSubmit = (e: Event) => {
      const target = e.target as Element | null;
      if (!target) return;
      const el = target as HTMLElement;
      // Guard: ensure matches exists on the element
      const matches = el.matches ? el.matches.bind(el) : null;
      if (
        matches && matches("form[data-confirm]")
      ) {
        const msg = el.getAttribute("data-confirm") || fallback;
        if (!globalThis.confirm(msg)) {
          e.preventDefault();
        }
      }
    };
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, [t]);
  return null;
}
