import { test } from "node:test";
import assert from "node:assert/strict";
import {
  plateLoading,
  displayWeight,
  canonicalWeight,
  KG_PER_LB,
} from "../src/features/gym/trainingMath";
test("plate loading respects paired owned counts and reports remainder", () => {
  const p = plateLoading(62.5, 20, [
    { kg: 20, count: 2 },
    { kg: 1.25, count: 2 },
  ]);
  assert.equal(p.actualKg, 62.5);
  assert.equal(p.sides[0].count, 1);
  assert.equal(
    plateLoading(65, 20, [
      { kg: 20, count: 1 },
      { kg: 10, count: 2 },
    ]).actualKg,
    40,
  );
  assert.equal(plateLoading(19, 20, []).belowBar, true);
});
test("bounded reconstruction never consumes a plate bundle twice", () => {
  for (let target = 20; target < 140; target += 0.5) {
    const plates = [
        { kg: 7.5, count: 4 },
        { kg: 5, count: 6 },
        { kg: 1.25, count: 2 },
      ],
      r = plateLoading(target, 20, plates);
    assert.ok(r.actualKg <= target);
    assert.ok(
      r.sides.every(
        (s) => s.count * 2 <= plates.find((p) => p.kg === s.kg)!.count,
      ),
    );
    assert.equal(
      r.actualKg,
      20 + r.sides.reduce((n, s) => n + s.kg * s.count * 2, 0),
    );
  }
});
test("unit display never mutates canonical kg", () => {
  const kg = 13.123456;
  displayWeight(kg, "lb");
  assert.equal(kg, 13.123456);
  assert.ok(Math.abs(canonicalWeight(100, "lb") - 100 * KG_PER_LB) < 1e-10);
});
