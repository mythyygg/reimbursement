import { eq } from "drizzle-orm";
import { receipts, settings } from "@reimbursement/shared/db";
import { db } from "../db/client";
import { getProviderPreference, runOcr } from "../services/ocr";

export async function processOcrJob(input: {
  receiptId: string;
  userId: string;
}) {
  console.log("[ocr] start", {
    receiptId: input.receiptId,
    userId: input.userId,
  });
  const [receipt] = await db
    .select()
    .from(receipts)
    .where(eq(receipts.receiptId, input.receiptId));

  if (!receipt) {
    return;
  }

  if (receipt.ocrStatus !== "pending" || receipt.uploadStatus !== "uploaded") {
    return;
  }

  const [userSettings] = await db
    .select()
    .from(settings)
    .where(eq(settings.userId, input.userId));

  const ocrEnabled = userSettings?.ocrEnabled ?? true;
  const ocrFallbackEnabled = userSettings?.ocrFallbackEnabled ?? true;

  if (!ocrEnabled || !ocrFallbackEnabled) {
    await db
      .update(receipts)
      .set({ ocrStatus: "disabled", updatedAt: new Date() })
      .where(eq(receipts.receiptId, receipt.receiptId));
    return;
  }

  await db
    .update(receipts)
    .set({ ocrStatus: "processing", updatedAt: new Date() })
    .where(eq(receipts.receiptId, receipt.receiptId));

  const preference =
    userSettings?.ocrProviderPreference ?? getProviderPreference();
  const result = await runOcr({
    storageKey: receipt.storageKey ?? undefined,
    fileUrl: receipt.fileUrl ?? undefined,
    preference,
  });

  if (!result) {
    console.warn("[ocr] no result", { receiptId: receipt.receiptId });
    await db
      .update(receipts)
      .set({ ocrStatus: "failed", ocrSource: "none", updatedAt: new Date() })
      .where(eq(receipts.receiptId, receipt.receiptId));
    return;
  }

  await db
    .update(receipts)
    .set({
      ocrStatus: "ready",
      ocrSource: result.source,
      ocrAmount: result.amount ? String(result.amount) : null,
      ocrDate: result.date ? new Date(result.date) : null,
      merchantKeyword: result.merchantKeyword ?? null,
      ocrConfidence: result.confidence ? String(result.confidence) : null,
      updatedAt: new Date(),
    })
    .where(eq(receipts.receiptId, receipt.receiptId));
  console.log("[ocr] done", {
    receiptId: receipt.receiptId,
    source: result.source,
    amount: result.amount,
    date: result.date,
  });
}
