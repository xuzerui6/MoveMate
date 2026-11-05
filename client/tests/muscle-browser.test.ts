import test from "node:test";
import assert from "node:assert/strict";
import {
  muscleRegions,
  regionFilterCodes,
  REGION_LABELS,
  OUTLINELESS_FILTERS,
} from "../src/features/gym/media";
import paths from "../src/features/gym/muscle-paths.json";
import catalogue from "../../server/src/gym/catalog.json";

// 人体图浏览的区域→筛选代码映射由 muscleGroups 反演：详情页会涂色的区域，
// 在浏览图上点它必须能筛出这个动作（口径一致，正反双向都要成立）。
test("region filter codes invert the detail-page muscle regions", () => {
  const targets = new Set<string>();
  for (const e of catalogue as any[]) {
    if (e.target) targets.add(e.target);
    for (const s of e.secondaryMuscles || []) targets.add(s);
  }
  for (const target of targets) {
    for (const region of muscleRegions(target)) {
      assert.ok(
        regionFilterCodes(region).includes(target),
        `${target} paints ${region} but the region filter misses it`,
      );
    }
  }
});

test("equivalent catalog codes are grouped per region", () => {
  assert.deepEqual(regionFilterCodes("quadriceps").sort(), [
    "quadriceps",
    "quads",
  ]);
  assert.ok(regionFilterCodes("chest").includes("pectorals"));
  assert.ok(regionFilterCodes("upperChest").includes("upper chest"));
  assert.ok(regionFilterCodes("trapezius").includes("traps"));
  assert.ok(regionFilterCodes("trapezius").includes("trapezius"));
  assert.ok(regionFilterCodes("tibialis").includes("shins"));
});

test("regions without a catalog meaning stay non-interactive", () => {
  for (const region of ["hair", "head", "knees"]) {
    assert.deepEqual(regionFilterCodes(region), []);
  }
  // 背阔肌源图无独立轮廓：区域映射为空，只能走按钮补位
  assert.deepEqual(regionFilterCodes("lats"), []);
  assert.equal(OUTLINELESS_FILTERS.length, 1);
  assert.deepEqual(OUTLINELESS_FILTERS[0].codes, ["latissimus dorsi", "lats"]);
});

test("every interactive region in the artwork has codes and a label", () => {
  const seen = new Set<string>();
  for (const side of ["front", "back"] as const) {
    for (const m of (paths as any)[side]) seen.add(m.muscle);
  }
  for (const region of seen) {
    if (regionFilterCodes(region).length) {
      assert.ok(REGION_LABELS[region], `region ${region} needs a label`);
    }
  }
});
