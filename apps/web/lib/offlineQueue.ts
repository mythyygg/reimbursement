import Dexie, { Table } from "dexie";
import { apiFetch } from "./api";

export type QueueItemType = "expense" | "receipt";

export type QueueItem = {
  id?: number;
  type: QueueItemType;
  payload: Record<string, unknown>;
  createdAt: number;
  status: "pending" | "processing" | "failed";
  error?: string;
};

class OfflineQueueDb extends Dexie {
  queue!: Table<QueueItem, number>;

  constructor() {
    super("offlineQueue");
    this.version(1).stores({
      queue: "++id, type, createdAt, status"
    });
  }
}

const db = new OfflineQueueDb();

export async function enqueueExpense(payload: Record<string, unknown>) {
  await db.queue.add({ type: "expense", payload, createdAt: Date.now(), status: "pending" });
}

export async function enqueueReceipt(payload: Record<string, unknown>) {
  await db.queue.add({ type: "receipt", payload, createdAt: Date.now(), status: "pending" });
}

export async function flushQueue() {
  const items = await db.queue.orderBy("createdAt").toArray();
  for (const item of items) {
    if (item.status === "processing") {
      continue;
    }
    await db.queue.update(item.id as number, { status: "processing", error: undefined });
    try {
      if (item.type === "expense") {
        await processExpenseItem(item.payload);
      }
      if (item.type === "receipt") {
        await processReceiptItem(item.payload);
      }
      await db.queue.delete(item.id as number);
    } catch (error) {
      await db.queue.update(item.id as number, { status: "failed", error: String(error) });
    }
  }
}

export function startQueueListener() {
  if (typeof window === "undefined") {
    return;
  }
  window.addEventListener("online", () => {
    void flushQueue();
  });
}

async function processExpenseItem(payload: Record<string, unknown>) {
  const projectId = payload.projectId as string;
  const body = payload.body as Record<string, unknown>;
  await apiFetch(`/projects/${projectId}/expenses`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

async function processReceiptItem(payload: Record<string, unknown>) {
  const projectId = payload.projectId as string;
  const file = payload.file as Blob;
  const fileExt = payload.fileExt as string;
  const contentType = payload.contentType as string;

  const receipt = await apiFetch<{ receiptId: string }>(`/projects/${projectId}/receipts`, {
    method: "POST",
    body: JSON.stringify({ client_request_id: payload.clientRequestId })
  });

  const upload = await apiFetch<{ signed_url: string; public_url: string }>(
    `/receipts/${receipt.receiptId}/upload-url`,
    {
      method: "POST",
      body: JSON.stringify({ file_ext: fileExt, content_type: contentType, file_size: file.size })
    }
  );

  await fetch(upload.signed_url, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: file
  });

  await apiFetch(`/receipts/${receipt.receiptId}/complete`, {
    method: "POST",
    body: JSON.stringify({ hash: payload.hash ?? payload.clientRequestId })
  });
}
