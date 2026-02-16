import { getAuthHeaderFromCookie } from "../../../utils/backend.ts";
import { Handlers } from "fresh/compat";

export const handler: Handlers = {
  async POST(ctx) {
    const req = ctx.req;

    try {
      const auth = getAuthHeaderFromCookie(
        req.headers.get("cookie") || undefined,
      );
      if (!auth) return new Response("Unauthorized", { status: 401 });

      // Parse the incoming form data
      const formData = await req.formData();
      const file = formData.get("file");
      
      if (!file || !(file instanceof File)) {
        return new Response(JSON.stringify({ error: "No file uploaded" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Create new FormData to forward to backend
      const backendFormData = new FormData();
      backendFormData.append("file", file);
      
      const backendUrl = Deno.env.get("BACKEND_URL") || "http://localhost:3000";
      
      const res = await fetch(
        `${backendUrl}/api/v1/templates/upload`,
        {
          method: "POST",
          headers: {
            Authorization: auth,
          },
          body: backendFormData,
        },
      );

      const text = await res.text();
      const body = text && text.trim().startsWith("{")
        ? text
        : JSON.stringify({ ok: res.ok, status: res.status, body: text });
      
      return new Response(body, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
