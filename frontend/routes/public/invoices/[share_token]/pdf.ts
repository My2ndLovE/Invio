import { BACKEND_URL } from "../../../../utils/backend.ts";
import { Handlers } from "fresh/compat";

export const handler: Handlers = {
  async GET(ctx) {
    const { share_token } = ctx.params as { share_token: string };
    const backendUrl =
      `${BACKEND_URL}/api/v1/public/invoices/${share_token}/pdf`;
    const res = await fetch(backendUrl);
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
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Robots-Tag", "noindex");
    return new Response(res.body, { status: 200, headers });
  },
};
