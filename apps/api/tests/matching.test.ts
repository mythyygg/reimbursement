import assert from "node:assert/strict";
import { test } from "node:test";
import { getReceiptCandidates } from "../src/utils/matching";

const rules = {
  dateWindowDays: 3,
  amountTolerance: 0,
  requireCategoryMatch: false
};

test("getReceiptCandidates returns high confidence match", () => {
  const receipt = { amount: 100, date: "2024-05-01", category: "travel", note: null };
  const expenses = [
    { expenseId: "a", amount: 100, date: "2024-05-01", category: "travel", note: null },
    { expenseId: "b", amount: 50, date: "2024-05-01", category: "travel", note: null }
  ];

  const result = getReceiptCandidates(receipt, expenses, rules);
  assert.equal(result.length, 1);
  assert.equal(result[0].expenseId, "a");
  assert.equal(result[0].confidence, "high");
});

test("getReceiptCandidates filters out amount mismatches", () => {
  const receipt = { amount: 120, date: "2024-05-01", category: null, note: null };
  const expenses = [{ expenseId: "a", amount: 100, date: "2024-05-01", category: null, note: null }];
  const result = getReceiptCandidates(receipt, expenses, rules);
  assert.equal(result.length, 0);
});
