import * as path from "node:path";
import { fileURLToPath } from "node:url";
import "../env.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve migration folder relative to the compiled dist path; drizzle CLI writes SQL here.
const migrationsFolder = path.resolve(__dirname, "../../drizzle");

// Run pending migrations then close the pool to exit cleanly.
await migrate(db, { migrationsFolder });
await pool.end();
