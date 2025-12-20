import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { projects, receipts } from "@reimbursement/shared/db";
import { db } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import { errorResponse, ok } from "../utils/http.js";

const router = new Hono();

const projectCreateSchema = z.object({
  name: z.string().trim().min(1, "name_required"),
  description: z.string().trim().optional(),
  pinned: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

const projectUpdateSchema = z.object({
  name: z.string().trim().optional(),
  description: z.string().trim().optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

router.use("*", authMiddleware);

router.get("/", async (c) => {
  const { userId } = c.get("auth");
  const search = c.req.query("search");
  const pinned = c.req.query("pinned");
  const archived = c.req.query("archived");

  const filters: SQL<unknown>[] = [eq(projects.userId, userId)];

  if (archived === undefined) {
    // Default to showing only active projects unless caller opts into archived ones.
    filters.push(eq(projects.archived, false));
  } else {
    filters.push(eq(projects.archived, archived === "true"));
  }

  if (pinned !== undefined) {
    filters.push(eq(projects.pinned, pinned === "true"));
  }

  if (search) {
    const term = `%${search}%`;
    // Case-insensitive search across name/description.
    const searchFilter = or(ilike(projects.name, term), ilike(projects.description, term));
    if (searchFilter) {
      filters.push(searchFilter);
    }
  }

  // Aggregate receipt counts per project (excluding soft-deleted receipts)
  const receiptCounts = db
    .select({
      projectId: receipts.projectId,
      receiptCount: sql<number>`count(*)`.as("receiptCount"),
    })
    .from(receipts)
    .where(and(eq(receipts.userId, userId), isNull(receipts.deletedAt)))
    .groupBy(receipts.projectId)
    .as("receipt_counts");

  const data = await db
    .select({
      projectId: projects.projectId,
      userId: projects.userId,
      name: projects.name,
      description: projects.description,
      pinned: projects.pinned,
      archived: projects.archived,
      tags: projects.tags,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      receiptCount: sql<number>`coalesce(${receiptCounts.receiptCount}, 0)`.as(
        "receiptCount"
      ),
    })
    .from(projects)
    .leftJoin(receiptCounts, eq(receiptCounts.projectId, projects.projectId))
    // Avoid returning projects with empty names—these are considered invalid drafts.
    .where(and(...filters, sql`nullif(${projects.name}, '') is not null`))
    .orderBy(desc(projects.pinned), desc(projects.updatedAt));

  return ok(c, data);
});

router.post("/", async (c) => {
  const { userId } = c.get("auth");
  const body = projectCreateSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  const [project] = await db
    .insert(projects)
    .values({
      userId,
      name: body.data.name,
      description: body.data.description,
      pinned: body.data.pinned ?? false,
      tags: body.data.tags ?? [],
    })
    .returning();

  return ok(c, project);
});

router.patch(":projectId", async (c) => {
  const { userId } = c.get("auth");
  const projectId = c.req.param("projectId");
  const body = projectUpdateSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  const [project] = await db
    .update(projects)
    .set({
      ...body.data,
      updatedAt: new Date(),
    })
    .where(and(eq(projects.projectId, projectId), eq(projects.userId, userId)))
    .returning();

  if (!project) {
    return errorResponse(c, 404, "PROJECT_NOT_FOUND", "Project not found");
  }

  return ok(c, project);
});

router.post(":projectId/archive", async (c) => {
  const { userId } = c.get("auth");
  const projectId = c.req.param("projectId");
  const [project] = await db
    .update(projects)
    .set({ archived: true, updatedAt: new Date() })
    .where(and(eq(projects.projectId, projectId), eq(projects.userId, userId)))
    .returning();

  if (!project) {
    return errorResponse(c, 404, "PROJECT_NOT_FOUND", "Project not found");
  }

  return ok(c, project);
});

export default router;
