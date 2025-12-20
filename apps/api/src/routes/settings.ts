import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { settings } from "@reimbursement/shared/db";
import { db } from "../db/client";
import { authMiddleware } from "../middleware/auth";
import { errorResponse, ok } from "../utils/http";

const router = new Hono();

const matchRulesSchema = z.object({
  dateWindowDays: z.number().min(0).max(30),
  amountTolerance: z.number().min(0).max(1000),
  requireCategoryMatch: z.boolean()
});

const exportTemplateSchema = z.object({
  includeOcrAmount: z.boolean(),
  includeOcrDate: z.boolean(),
  includeMerchantKeyword: z.boolean(),
  includeExpenseId: z.boolean(),
  includeReceiptIds: z.boolean(),
  sortDirection: z.enum(["asc", "desc"]),
  includePdf: z.boolean()
});

const settingsUpdateSchema = z.object({
  ocr_enabled: z.boolean().optional(),
  ocr_fallback_enabled: z.boolean().optional(),
  ocr_provider_preference: z.array(z.string()).optional(),
  match_rules: matchRulesSchema.optional(),
  export_template: exportTemplateSchema.optional()
});

router.use("*", authMiddleware);

router.get("/settings", async (c) => {
  const { userId } = c.get("auth");
  const [existing] = await db.select().from(settings).where(eq(settings.userId, userId));
  if (existing) {
    return ok(c, existing);
  }

  const defaults = {
    userId,
    ocrEnabled: true,
    ocrFallbackEnabled: true,
    ocrProviderPreference: [],
    matchRulesJson: {
      dateWindowDays: 3,
      amountTolerance: 0,
      requireCategoryMatch: false
    },
    exportTemplateJson: {
      includeOcrAmount: false,
      includeOcrDate: false,
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
  if (body.data.ocr_enabled !== undefined) {
    update.ocrEnabled = body.data.ocr_enabled;
  }
  if (body.data.ocr_fallback_enabled !== undefined) {
    update.ocrFallbackEnabled = body.data.ocr_fallback_enabled;
  }
  if (body.data.ocr_provider_preference !== undefined) {
    update.ocrProviderPreference = body.data.ocr_provider_preference;
  }
  if (body.data.match_rules !== undefined) {
    update.matchRulesJson = body.data.match_rules;
  }
  if (body.data.export_template !== undefined) {
    update.exportTemplateJson = body.data.export_template;
  }

  if (!existing) {
    const defaults = {
      userId,
      ocrEnabled: true,
      ocrFallbackEnabled: true,
      ocrProviderPreference: [],
      matchRulesJson: {
        dateWindowDays: 3,
        amountTolerance: 0,
        requireCategoryMatch: false
      },
      exportTemplateJson: {
        includeOcrAmount: false,
        includeOcrDate: false,
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
