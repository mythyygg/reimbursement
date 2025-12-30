import crypto from "node:crypto";
import { createMiddleware } from "hono/factory";

export const requestIdMiddleware = createMiddleware(async (c, next) => {
  const headerRequestId = c.req.header("x-request-id");
  const requestId = headerRequestId && headerRequestId.length < 128
    ? headerRequestId
    : crypto.randomUUID();

  c.set("requestId", requestId);

  try {
    await next();
  } finally {
    c.header("x-request-id", requestId);
  }
});
