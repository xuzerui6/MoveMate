import test from "node:test";
import assert from "node:assert/strict";
import { litMuscleRegions } from "../src/features/gym/routineMuscles";
import { muscleRegions } from "../src/features/gym/media";

// 迷你肌群图的聚合必须与详情页同一口径：每个动作目标肌群的区域全部点亮。
test("aggregation lights every region of every exercise target", () => {
  const lit = litMuscleRegions([
    { target: "chest" },
    { target: "hamstrings" },
  ]);
  for (const target of ["chest", "hamstrings"])
    for (const region of muscleRegions(target))
      assert.ok(lit.includes(region), `${target} → ${region}`);
  assert.deepEqual(
    lit,
    [...muscleRegions("chest"), ...muscleRegions("hamstrings")].sort(),
  );
});

test("aggregation dedupes, resolves aliases and skips unknown targets", () => {
  const lit = litMuscleRegions([
    { target: "chest" },
    { target: "pectorals" },
    { target: "quads" },
    { target: "quadriceps" },
    { target: "not-a-muscle" },
    {},
    { target: null },
    null,
    undefined,
  ]);
  assert.equal(new Set(lit).size, lit.length);
  assert.deepEqual(lit, [
    ...new Set([...muscleRegions("chest"), ...muscleRegions("quadriceps")]),
  ].sort());
});

// 源人体图没有背阔肌的独立轮廓（详情页同样不画）：点不亮就是点不亮，
// 不拿别的背部肌群冒充。
test("lats lights nothing and an empty routine lights nothing", () => {
  assert.deepEqual(litMuscleRegions([{ target: "lats" }]), []);
  assert.deepEqual(litMuscleRegions([]), []);
});
