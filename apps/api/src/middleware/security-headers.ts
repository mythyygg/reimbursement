import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

const isProduction = process.env.NODE_ENV === "production";

export function applySecurityHeaders(c: Context) {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Frame-Options", "DENY");
  c.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");

  if (isProduction) {
    c.header("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
}

export const securityHeadersMiddleware = createMiddleware(async (c, next) => {
  try {
    await next();
  } finally {
    applySecurityHeaders(c);
  }
});
