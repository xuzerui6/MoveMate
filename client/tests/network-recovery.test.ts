import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileNetworkRecovery } from "../src/features/gym/workoutSync";
test("disconnect-only version changes preserve frozen counts and control intent, while foreign changes still conflict", () => {
  const pending = {
      operationId: "fixed",
      version: 4,
      action: "progress",
      setId: "s",
      reps: 7,
      score: { count: 7, total: 650 },
    },
    row = {
      version: 5,
      phase: "paused",
      cursor: 0,
      sets: [{ id: "s" }],
      recovery: { paused: true, previousVersion: 4 },
    };
  const replay = reconcileNetworkRecovery(pending, row);
  assert.equal(replay.operationId, "fixed");
  assert.equal(replay.action, "pause");
  assert.equal(replay.version, 5);
  assert.equal(replay.reps, 7);
  assert.equal(pending.version, 4);
  assert.equal(
    reconcileNetworkRecovery(pending, {
      ...row,
      recovery: { paused: true, previousVersion: 6 },
    }),
    pending,
  );
  assert.equal(
    reconcileNetworkRecovery(pending, { ...row, sets: [{ id: "other" }] }),
    pending,
  );
  assert.equal(
    reconcileNetworkRecovery({ ...pending, action: "heartbeat" }, row),
    null,
  );
});
