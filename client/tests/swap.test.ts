import test from "node:test";
import assert from "node:assert/strict";
import {
  equivalentTargetCodes,
  orderSwapCandidates,
  nextSwapId,
} from "../src/features/gym/swap";
import catalogue from "../../server/src/gym/catalog.json";

// 等价肌群代码来自人体图区域映射的反演：目录里同一肌群的两种写法
// （目录的 quads 与内置动作的 quadriceps）必须互相可达。
test("equivalent target codes group catalog alias spellings", () => {
  const quads = equivalentTargetCodes("quads");
  assert.ok(quads.includes("quads"));
  assert.ok(quads.includes("quadriceps"));
  assert.deepEqual(equivalentTargetCodes("quadriceps"), quads);
  const delts = equivalentTargetCodes("delts");
  assert.ok(delts.includes("deltoids"));
  assert.ok(equivalentTargetCodes("lats").includes("latissimus dorsi"));
});

test("every catalog target is its own equivalent and stays grouped", () => {
  const targets = new Set<string>();
  for (const e of catalogue as any[]) if (e.target) targets.add(e.target);
  assert.ok(targets.size > 10);
  for (const target of targets) {
    const codes = equivalentTargetCodes(target);
    assert.ok(codes.includes(target), target);
    for (const code of codes)
      assert.ok(
        equivalentTargetCodes(code).includes(target),
        `${code} should group back to ${target}`,
      );
  }
});

test("unknown target has only itself as equivalent", () => {
  assert.deepEqual(equivalentTargetCodes("cardiovascular system"), [
    "cardiovascular system",
  ]);
});

test("swap candidates prefer complete media and stay stable", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "b" }, { id: "d" }];
  const ordered = orderSwapCandidates(items, (id) => id === "c" || id === "d");
  assert.deepEqual(ordered, ["c", "d", "a", "b"]);
  assert.deepEqual(orderSwapCandidates([], () => true), []);
});

test("next swap cycles through every candidate before repeating", () => {
  const ordered = ["a", "b", "c"];
  assert.equal(nextSwapId(ordered), "a");
  assert.equal(nextSwapId(ordered, "a"), "b");
  assert.equal(nextSwapId(ordered, "b"), "c");
  assert.equal(nextSwapId(ordered, "c"), "a");
  // 上次的候选已不在列表里（例如本行当前动作被排除）时从头开始
  assert.equal(nextSwapId(ordered, "gone"), "a");
  assert.equal(nextSwapId([], "a"), null);
  assert.equal(nextSwapId([]), null);
});
