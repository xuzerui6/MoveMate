import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkFile, sha } from "../src/features/gym/transferFile";
test("large JSON is split without losing ordering, quantities or source identity", async () => {
  const root = {
    format: "movemate-gym",
    version: 2,
    customExercises: [{ id: "custom", nameZh: "测试" }],
    plans: [{ id: "p", name: "计划" }],
    workouts: Array.from({ length: 210 }, (_, i) => ({
      id: String(i),
      createdAt: "2026-10-01",
      sets: [{ exerciseId: "custom", reps: 10, loadKg: 1 }],
    })),
    body: { items: [{ date: "2026-10-01", weightKg: 70 }] },
    settings: { unit: "lb" },
  };
  const result = chunkFile(JSON.stringify(root), "movemate");
  assert.equal(result.parts[0].customExercises.length, 1);
  assert.equal(
    result.parts.reduce((n, p) => n + (p.workouts?.length || 0), 0),
    210,
  );
  assert.ok(result.parts.every((p) => JSON.stringify(p).length < 350000));
  assert.equal((await sha(result.parts[0])).length, 64);
});
test("CSV adapters preserve quoted names and convert lb once before normalized chunks", () => {
  for (const kind of ["strong", "hevy", "fitnotes"]) {
    const r = chunkFile(
      'Date,Workout Name,Exercise Name,Weight,Reps,Seconds\n2026-10-01,Test,"Row, cable",100,5,30',
      kind,
      "lb",
    );
    assert.equal(r.format, "movemate");
    assert.equal(r.parts[0].workouts[0].sets[0].loadKg, 45.359237);
    assert.equal(r.parts[0].workouts[0].sets[0].name, "Row, cable");
  }
});
test("unfinished timers are not restored and unknown structural shapes fail visibly", () => {
  assert.throws(
    () =>
      chunkFile(
        JSON.stringify({
          format: "movemate-gym",
          version: 2,
          workouts: [{ phase: "working" }],
        }),
        "movemate",
      ),
    /没有可识别/,
  );
  assert.throws(() => chunkFile("{bad", "movemate"));
});
