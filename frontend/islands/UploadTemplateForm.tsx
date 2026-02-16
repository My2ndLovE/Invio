import { useState, useRef } from "preact/hooks";
import { useTranslations } from "../i18n/context.tsx";

function getAuthHeaderFromCookie(cookie: string): string | null {
  const parts = cookie.split(/;\s*/);
  for (const p of parts) {
    const i = p.indexOf("=");
    if (i === -1) continue;
    const k = decodeURIComponent(p.slice(0, i));
    const v = decodeURIComponent(p.slice(i + 1));
    if (k === "invio_session" && v) return `Bearer ${v}`;
  }
  return null;
}

export default function UploadTemplateForm() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslations();

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setErr(null);

    const fileInput = fileInputRef.current;
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      setErr(t("Please select a .zip file"));
      return;
    }

    const file = fileInput.files[0];
    if (!file.name.endsWith(".zip")) {
      setErr(t("File must be a .zip archive"));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErr(t("File too large (max 5MB)"));
      return;
    }

    try {
      setBusy(true);
      const auth = getAuthHeaderFromCookie(document.cookie);

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/templates/upload", {
        method: "POST",
        headers: {
          ...(auth ? { Authorization: auth } : {}),
        },
        body: formData,
      });

      if (!res.ok) {
        let message = t("Template upload failed with status {{status}}", {
          status: `${res.status} ${res.statusText}`,
        });
        try {
          const data = await res.json();
          if (data && (data.error || data.message)) {
            message = String(data.error || data.message);
          }
        } catch (_) { /* ignore parse issues */ }
        throw new Error(message);
      }

      globalThis.location?.reload();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <label class="form-control">
        <div class="label">
          <span class="label-text">{t("Upload Local Template (.zip)")}</span>
        </div>
        <div class="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            class="file-input file-input-bordered w-full"
          />
          <button type="submit" class="btn btn-primary" disabled={busy}>
            {busy ? t("Uploading...") : t("Upload")}
          </button>
        </div>
        {err && <span class="text-error text-sm mt-1">{err}</span>}
        <div class="label">
          <span class="label-text-alt">
            {t("Upload a .zip file containing manifest.yaml and your template HTML")}
          </span>
        </div>
      </label>
    </form>
  );
}
