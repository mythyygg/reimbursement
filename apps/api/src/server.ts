import "./env.js";
import { serve } from "@hono/node-server";
import app from "./index.js";

const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port });

console.log(`API running on http://localhost:${port}`);

if (process.env.START_WORKER === "true") {
  // worker loop removed; exports and batch checks now run inline
}
