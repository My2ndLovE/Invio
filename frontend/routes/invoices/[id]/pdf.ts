import {
  BACKEND_URL,
  getAuthHeaderFromCookie,
} from "../../../utils/backend.ts";
import { Handlers } from "fresh/compat";

export const handler: Handlers = {
  async GET(ctx) {
    const req = ctx.req;
    const auth = getAuthHeaderFromCookie(
      req.headers.get("cookie") || undefined,
    );
    if (!auth) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/login" },
      });
    }

    const { id } = ctx.params as { id: string };
    const backendUrl = `${BACKEND_URL}/api/v1/invoices/${id}/pdf`;

    const res = await fetch(backendUrl, { headers: { Authorization: auth } });
    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`;
      try {
        const body = await res.json() as { error?: string; details?: string };
        if (body.details) detail = body.details;
        else if (body.error) detail = body.error;
      } catch { /* body not JSON */ }
      return new Response(`PDF generation failed: ${detail}`, {
        status: res.status,
      });
    }

    const headers = new Headers();
    for (const [k, v] of res.headers.entries()) {
      if (k.toLowerCase() === "set-cookie") continue;
      headers.set(k, v);
    }
    // Ensure proper content type/disposition for PDF
    headers.set(
      "content-type",
      res.headers.get("content-type") ?? "application/pdf",
    );
    if (!headers.has("content-disposition")) {
      headers.set(
        "content-disposition",
        `attachment; filename=invoice-${id}.pdf`,
      );
    }
    return new Response(res.body, { status: 200, headers });
  },
};
