import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { batches, backendJobs } from "@reimbursement/shared/db";
import { db } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import { errorResponse, ok } from "../utils/http.js";

const router = new Hono();

const batchCreateSchema = z.object({
  name: z.string().optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  statuses: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional()
});

router.use("*", authMiddleware);

router.get("/projects/:projectId/batches", async (c) => {
  const { userId } = c.get("auth");
  const projectId = c.req.param("projectId");
  const data = await db
    .select()
    .from(batches)
    .where(and(eq(batches.userId, userId), eq(batches.projectId, projectId)))
    .orderBy(batches.createdAt);
  return ok(c, data);
});

router.post("/projects/:projectId/batches", async (c) => {
  const { userId } = c.get("auth");
  const projectId = c.req.param("projectId");
  const body = batchCreateSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  const name = body.data.name ?? `Batch ${new Date().toISOString().slice(0, 10)}`;
  const filterJson = {
    dateFrom: body.data.date_from,
    dateTo: body.data.date_to,
    statuses: body.data.statuses ?? ["processing"],
    categories: body.data.categories ?? []
  };

  const [batch] = await db
    .insert(batches)
    .values({
      userId,
      projectId,
      name,
      filterJson
    })
    .returning();

  await db.insert(backendJobs).values({
    type: "batch_check",
    payload: { batchId: batch.batchId, userId },
    status: "pending",
  });

  return ok(c, batch);
});

router.get("/batches/:batchId", async (c) => {
  const { userId } = c.get("auth");
  const batchId = c.req.param("batchId");
  const [batch] = await db
    .select()
    .from(batches)
    .where(and(eq(batches.batchId, batchId), eq(batches.userId, userId)));

  if (!batch) {
    return errorResponse(c, 404, "BATCH_NOT_FOUND", "Batch not found");
  }

  return ok(c, batch);
});

router.post("/batches/:batchId/check", async (c) => {
  const { userId } = c.get("auth");
  const batchId = c.req.param("batchId");
  const [batch] = await db
    .select()
    .from(batches)
    .where(and(eq(batches.batchId, batchId), eq(batches.userId, userId)));

  if (!batch) {
    return errorResponse(c, 404, "BATCH_NOT_FOUND", "Batch not found");
  }

  await db.insert(backendJobs).values({
    type: "batch_check",
    payload: { batchId, userId },
    status: "pending",
  });

  return ok(c, { success: true });
});

export default router;
