import { proxyRequest } from "../../../utils/backend.ts";
import { Handlers } from "fresh/compat";

function fullPath(req: Request) {
  const u = new URL(req.url);
  return u.pathname + u.search;
}

export const handler: Handlers = {
  async GET(ctx) {
    const req = ctx.req;

    return await proxyRequest(req, fullPath(req));
  },
  async POST(ctx) {
    const req = ctx.req;

    return await proxyRequest(req, fullPath(req));
  },
  async PUT(ctx) {
    const req = ctx.req;

    return await proxyRequest(req, fullPath(req));
  },
  async PATCH(ctx) {
    const req = ctx.req;

    return await proxyRequest(req, fullPath(req));
  },
  async DELETE(ctx) {
    const req = ctx.req;

    return await proxyRequest(req, fullPath(req));
  },
  async OPTIONS(req) {
    return await proxyRequest(req, fullPath(req));
  },
};
