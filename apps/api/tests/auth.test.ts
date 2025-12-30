import assert from "node:assert/strict";
import { test } from "node:test";

process.env.JWT_ACCESS_SECRET = "test-access-secret-32-chars-long";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-32-chars-long";
process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_TTL = "900";
process.env.JWT_REFRESH_TTL = "2592000";
process.env.S3_ENDPOINT = "http://localhost:9000";
process.env.S3_REGION = "auto";
process.env.S3_ACCESS_KEY = "test-access-key";
process.env.S3_SECRET_KEY = "test-secret-key";
process.env.S3_BUCKET = "test-bucket";
process.env.S3_PUBLIC_BASE_URL = "http://localhost:9000/test-bucket";
process.env.CORS_ALLOWED_ORIGINS = "http://localhost:3002";
process.env.LOG_LEVEL = "error";

const auth = await import("../src/services/auth.js");

test("hashPassword and verifyPassword", async () => {
  const password = "password-123";
  const hash = await auth.hashPassword(password);

  assert.ok(hash.length > 20);
  assert.ok(await auth.verifyPassword(password, hash));
  assert.ok(!(await auth.verifyPassword("wrong-password", hash)));
});

test("createAccessToken and verifyAccessToken", async () => {
  const token = await auth.createAccessToken({
    sub: "user-1",
    sessionId: "session-1",
    sessionVersion: 1,
  });

  const payload = await auth.verifyAccessToken(token);
  assert.equal(payload.sub, "user-1");
  assert.equal(payload.sessionId, "session-1");
  assert.equal(payload.sessionVersion, 1);
});
