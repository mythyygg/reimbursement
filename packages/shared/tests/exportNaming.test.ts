import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReceiptFilename } from "../src/utils/exportNaming";

test("buildReceiptFilename formats sequence and subindex", () => {
  const filename = buildReceiptFilename({
    sequence: 1,
    date: "2024-05-02",
    amount: 88.5,
    category: "travel",
    note: "Taxi to studio",
    receiptId: "receipt-abcdef123456",
    extension: "jpg",
    subIndex: 0
  });

  assert.ok(filename.startsWith("001a_2024-05-02_88.50_travel_Taxi to studio_"));
  assert.ok(filename.endsWith("3456.jpg"));
});
