/**
 * One-shot DB connectivity check.
 *
 * Usage:
 *   npm --workspace apps/api run db:check
 *
 * Notes:
 * - Loads env from apps/api/.env* via src/env.ts (imported by src/env.js at runtime).
 * - Avoids printing secrets (never logs DATABASE_URL).
 */

import "../env.js";

import { Pool } from "pg";

function safeDbTarget(raw: string | undefined): string {
  if (!raw) {
    return "<missing DATABASE_URL>";
  }
  try {
    const url = new URL(raw);
    const dbName = url.pathname?.replace(/^\//, "") || "<unknown>";
    const port = url.port || "<default>";
    return `${url.hostname}:${port}/${dbName}`;
  } catch {
    return "<unparseable DATABASE_URL>";
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exitCode = 1;
    return;
  }

  const target = safeDbTarget(connectionString);
  const start = Date.now();

  const pool = new Pool({
    connectionString,
    max: 1,
    min: 0,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });

  try {
    const result = await pool.query("select 1 as ok");
    const durationMs = Date.now() - start;
    console.log(
      JSON.stringify({
        message: "db.check.ok",
        target,
        durationMs,
        row: result.rows?.[0],
      })
    );
  } catch (error) {
    const durationMs = Date.now() - start;
    // Keep output simple and script-friendly; the API logger already prints richer details.
    const payload =
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { error };

    console.error(
      JSON.stringify({
        message: "db.check.failed",
        target,
        durationMs,
        ...payload,
      })
    );
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

await main();

