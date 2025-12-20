import "./types.js";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { cors } from "hono/cors";
import authRoutes from "./routes/auth.js";
import projectRoutes from "./routes/projects.js";
import expenseRoutes from "./routes/expenses.js";
import receiptRoutes from "./routes/receipts.js";
import batchRoutes from "./routes/batches.js";
import exportRoutes from "./routes/exports.js";
import settingsRoutes from "./routes/settings.js";

const app = new Hono();

app.use("*", cors());
app.use("*", async (c, next) => {
  const started = Date.now();
  await next();
  const duration = Date.now() - started;
  // Lightweight request logging for latency and status visibility.
  console.log(
    `${c.req.method} ${c.req.path} -> ${c.res.status} (${duration}ms)`
  );
});
app.onError((err, c) => {
  const status = err instanceof HTTPException ? err.status : 500;
  // Centralized error handler to avoid leaking stack traces to clients.
  console.error("Unhandled error", err);
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: err?.message ?? "Internal Server Error",
      },
    },
    status
  );
});

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/api/v1/auth", authRoutes);
app.route("/api/v1/projects", projectRoutes);
app.route("/api/v1", expenseRoutes);
app.route("/api/v1", receiptRoutes);
app.route("/api/v1", batchRoutes);
app.route("/api/v1", exportRoutes);
app.route("/api/v1", settingsRoutes);

app.notFound((c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404)
);

export default app;
