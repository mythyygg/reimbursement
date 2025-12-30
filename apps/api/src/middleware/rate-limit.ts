import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { errorResponse } from "../utils/http.js";

export type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyPrefix?: string;
  keyGenerator?: (c: Context) => string;
};

type RateLimitState = {
  count: number;
  resetAt: number;
};

const store = new Map<string, RateLimitState>();

function cleanupExpired(now: number) {
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

function getClientIp(c: Context) {
  const forwardedFor = c.req.header("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }
  return (
    c.req.header("x-real-ip") ||
    c.req.header("cf-connecting-ip") ||
    "unknown"
  );
}

export function rateLimit(options: RateLimitOptions) {
  const keyPrefix = options.keyPrefix ?? "rate";
  const keyGenerator = options.keyGenerator ?? ((c) => getClientIp(c));

  return createMiddleware(async (c, next) => {
    const now = Date.now();
    cleanupExpired(now);

    const key = `${keyPrefix}:${keyGenerator(c)}`;
    const entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    if (entry.count >= options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      c.header("retry-after", retryAfterSeconds.toString());
      return errorResponse(c, 429, "RATE_LIMITED", "Too many requests");
    }

    entry.count += 1;
    return next();
  });
}
