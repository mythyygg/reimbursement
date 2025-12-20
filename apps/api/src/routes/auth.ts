import { Hono } from "hono";
import { z } from "zod";
import crypto from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { authSessions, users } from "@reimbursement/shared/db";
import { db } from "../db/client";
import {
  createAccessToken,
  createRefreshToken,
  hashPassword,
  hashToken,
  verifyPassword,
  verifyRefreshToken,
} from "../services/auth";
import { config } from "../config";
import { authMiddleware } from "../middleware/auth";
import { errorResponse, ok } from "../utils/http";

const router = new Hono();

const registerSchema = z.object({
  email_or_phone: z.string().min(3),
  password: z.string().min(8),
});

const loginSchema = registerSchema;

const refreshSchema = z.object({
  refresh_token: z.string().min(10),
});

router.post("/password/register", async (c) => {
  const body = registerSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  const { email_or_phone, password } = body.data;
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.emailOrPhone, email_or_phone));

  if (existing.length > 0) {
    return errorResponse(c, 409, "USER_EXISTS", "User already exists");
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({
      emailOrPhone: email_or_phone,
      passwordHash,
    })
    .returning();

  const auth = await createSession(user.userId, c);
  return ok(c, { user: sanitizeUser(user), tokens: auth });
});

router.post("/password/login", async (c) => {
  const body = loginSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  const { email_or_phone, password } = body.data;
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.emailOrPhone, email_or_phone));

  if (!user || !user.passwordHash) {
    return errorResponse(
      c,
      401,
      "AUTH_INVALID_CREDENTIALS",
      "Invalid credentials"
    );
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return errorResponse(
      c,
      401,
      "AUTH_INVALID_CREDENTIALS",
      "Invalid credentials"
    );
  }

  const auth = await createSession(user.userId, c);
  return ok(c, { user: sanitizeUser(user), tokens: auth });
});

router.post("/refresh", async (c) => {
  const body = refreshSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  try {
    const payload = await verifyRefreshToken(body.data.refresh_token);
    const [session] = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.sessionId, payload.sessionId));

    if (!session || session.revokedAt) {
      return errorResponse(c, 401, "SESSION_REVOKED", "Session revoked");
    }
    if (session.refreshTokenHash !== hashToken(body.data.refresh_token)) {
      return errorResponse(c, 401, "SESSION_REVOKED", "Session revoked");
    }
    if (session.expiresAt < new Date()) {
      return errorResponse(c, 401, "TOKEN_EXPIRED", "Refresh token expired");
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.userId, payload.sub));
    if (!user) {
      return errorResponse(c, 401, "SESSION_REVOKED", "Session revoked");
    }

    const tokens = await issueTokens(
      payload.sub,
      payload.sessionId,
      user.sessionVersion
    );
    await db
      .update(authSessions)
      .set({
        refreshTokenHash: hashToken(tokens.refresh_token),
        lastSeenAt: new Date(),
      })
      .where(eq(authSessions.sessionId, payload.sessionId));

    return ok(c, { tokens });
  } catch (error) {
    return errorResponse(c, 401, "TOKEN_INVALID", "Invalid token");
  }
});

router.post("/logout", authMiddleware, async (c) => {
  const { sessionId } = c.get("auth");
  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(eq(authSessions.sessionId, sessionId));
  return ok(c, { success: true });
});

router.post("/logout-all", authMiddleware, async (c) => {
  const { userId } = c.get("auth");
  await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.userId, userId));

  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt))
    );

  return ok(c, { success: true });
});

router.get("/me", authMiddleware, async (c) => {
  const { userId } = c.get("auth");
  const [user] = await db.select().from(users).where(eq(users.userId, userId));
  if (!user) {
    return errorResponse(c, 404, "USER_NOT_FOUND", "User not found");
  }
  return ok(c, { user: sanitizeUser(user) });
});

async function createSession(
  userId: string,
  c: { req: { header: (name: string) => string | undefined } }
) {
  const [user] = await db.select().from(users).where(eq(users.userId, userId));
  if (!user) {
    throw new Error("User not found");
  }
  const sessionId = crypto.randomUUID();
  const tokens = await issueTokens(userId, sessionId, user.sessionVersion);
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + config.jwtRefreshTtlSeconds * 1000
  );

  await db.insert(authSessions).values({
    sessionId,
    userId,
    refreshTokenHash: hashToken(tokens.refresh_token),
    expiresAt,
    userAgent: c.req.header("user-agent"),
    ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip"),
  });

  return tokens;
}

async function issueTokens(
  userId: string,
  sessionId: string,
  sessionVersion: number
) {
  const accessToken = await createAccessToken({
    sub: userId,
    sessionId,
    sessionVersion,
  });
  const refreshToken = await createRefreshToken({
    sub: userId,
    sessionId,
    sessionVersion,
  });
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: config.jwtAccessTtlSeconds,
  };
}

function sanitizeUser(user: typeof users.$inferSelect) {
  const { passwordHash, ...rest } = user;
  return rest;
}

export default router;
