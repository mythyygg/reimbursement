import assert from "node:assert/strict";
import { test } from "node:test";
import { getMissingProjectIds } from "../src/utils/ownership.js";

test("getMissingProjectIds returns missing project ids", () => {
  const requested = ["project-a", "project-b", "project-a", "project-c"];
  const owned = ["project-a", "project-c"];

  const missing = getMissingProjectIds(requested, owned);
  assert.deepEqual(missing, ["project-b"]);
});
