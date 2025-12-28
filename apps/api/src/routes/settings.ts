import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { settings } from "@reimbursement/shared/db";
import { db } from "../db/client.js";
import { errorResponse, ok } from "../utils/http.js";

const router = new Hono();

const matchRulesSchema = z.object({
  dateWindowDays: z.number().min(0).max(30),
  amountTolerance: z.number().min(0).max(1000),
  requireCategoryMatch: z.boolean()
});

const exportTemplateSchema = z.object({
  includeMerchantKeyword: z.boolean(),
  includeExpenseId: z.boolean(),
  includeReceiptIds: z.boolean(),
  sortDirection: z.enum(["asc", "desc"]),
  includePdf: z.boolean()
});

const settingsUpdateSchema = z.object({
  match_rules: matchRulesSchema.optional(),
  export_template: exportTemplateSchema.optional()
});


router.get("/settings", async (c) => {
  const { userId } = c.get("auth");
  const [existing] = await db.select().from(settings).where(eq(settings.userId, userId));
  if (existing) {
    return ok(c, existing);
  }

  const defaults = {
    userId,
    matchRulesJson: {
      dateWindowDays: 3,
      amountTolerance: 0,
      requireCategoryMatch: false
    },
    exportTemplateJson: {
      includeMerchantKeyword: false,
      includeExpenseId: false,
      includeReceiptIds: false,
      sortDirection: "asc",
      includePdf: true
    },
    updatedAt: new Date()
  };

  const [record] = await db.insert(settings).values(defaults).returning();
  return ok(c, record);
});

router.patch("/settings", async (c) => {
  const { userId } = c.get("auth");
  const body = settingsUpdateSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  const [existing] = await db.select().from(settings).where(eq(settings.userId, userId));
  const update: Record<string, unknown> = { updatedAt: new Date() };

  if (body.data.match_rules !== undefined) {
    update.matchRulesJson = body.data.match_rules;
  }
  if (body.data.export_template !== undefined) {
    update.exportTemplateJson = body.data.export_template;
  }

  if (!existing) {
    const defaults = {
      userId,
      matchRulesJson: {
        dateWindowDays: 3,
        amountTolerance: 0,
        requireCategoryMatch: false
      },
      exportTemplateJson: {
        includeMerchantKeyword: false,
        includeExpenseId: false,
        includeReceiptIds: false,
        sortDirection: "asc",
        includePdf: true
      },
      updatedAt: new Date()
    };
    const [record] = await db.insert(settings).values({ ...defaults, ...update }).returning();
    return ok(c, record);
  }

  const [record] = await db
    .update(settings)
    .set(update)
    .where(eq(settings.userId, userId))
    .returning();

  return ok(c, record);
});

export default router;
