import { test } from "node:test";
import assert from "node:assert/strict";
import { WorkoutSync,restoredSetMetrics } from "../src/features/gym/workoutSync";
test('set recovery restores mean score and dimensions without inventing manual grades',()=>{const m=restoredSetMetrics({reps:2,score:{count:2,total:190,depth:180,stability:190,trunk:180,symmetry:200}});assert.equal(m.formScore,95);assert.equal(m.formBreakdown.depth,90);assert.equal(m.reps,2);assert.equal(restoredSetMetrics({reps:10,score:{}}).scoreAccumulator,undefined)});
const row = () => ({ id: "a", version: 1, cursor: 0, sets: [{ id: "set1" }] });
test("plan controls serialize after progress with the returned version", async () => {
  let pending: any = null,
    server = row();
  const calls: any[] = [];
  const q = new WorkoutSync(
    server,
    async (body) => {
      calls.push(body);
      server = { ...server, version: server.version + 1 };
      return server;
    },
    async () => server,
    { get: () => pending, set: (p) => (pending = p) },
    () => {},
  );
  await Promise.all([
    q.run("progress", { reps: 1 }),
    q.run("pause", { reps: 1 }),
    q.run("finish", { reps: 1 }),
  ]);
  assert.deepEqual(
    calls.map((c) => [c.action, c.version]),
    [
      ["progress", 1],
      ["pause", 2],
      ["finish", 3],
    ],
  );
  assert.equal(pending, null);
});
test("lost finish response retains immutable operation and recovers by reading then replaying", async () => {
  let pending: any = null,
    server = row(),
    count = 0;
  const seen = new Set<string>(),
    calls: any[] = [];
  const q = new WorkoutSync(
    server,
    async (body) => {
      calls.push(body);
      if (!seen.has(body.operationId)) {
        seen.add(body.operationId);
        server = { ...server, version: 2 };
        count++;
        throw new Error("connection lost");
      }
      return server;
    },
    async () => server,
    { get: () => pending, set: (p) => (pending = p) },
    () => {},
  );
  await assert.rejects(q.run("finish"));
  assert.ok(pending);
  await assert.rejects(q.run("start"), /先恢复/);
  await q.recover();
  assert.equal(count, 1);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(pending, null);
});
test("another page version conflict reloads truth and never silently overwrites", async () => {
  let pending: any = null,
    accepted: any;
  const server = { ...row(), version: 4 };
  const q = new WorkoutSync(
    row(),
    async () => {
      throw { response: { status: 409 } };
    },
    async () => server,
    { get: () => pending, set: (p) => (pending = p) },
    (r) => (accepted = r),
  );
  await assert.rejects(q.run("pause"));
  assert.equal(accepted.version, 4);
  assert.equal(pending, null);
});
