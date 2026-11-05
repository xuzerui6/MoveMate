import test from "node:test";
import assert from "node:assert/strict";
import { recentExerciseIds } from "../src/features/gym/recent";

// 训练记录按创建时间倒序返回：最近一次训练里的动作排在最前，同一
// 动作只出现一次（保留最近的那次位置）。
test("recent exercise ids follow workout order and dedupe", () => {
  const workouts = [
    { sets: [{ exercise: { id: "b" } }, { exercise: { id: "a" } }, { exercise: { id: "b" } }] },
    { sets: [{ exercise: { id: "c" } }, { exercise: { id: "a" } }] },
  ];
  assert.deepEqual(recentExerciseIds(workouts), ["b", "a", "c"]);
});

test("recent exercise ids respect the limit and tolerate bad rows", () => {
  const workouts = [
    { sets: [{ exercise: { id: "a" } }, { exercise: {} }, {}, { exercise: { id: "" } }, { exercise: { id: "b" } }, { exercise: { id: "c" } }] },
    null,
    {},
    { sets: null },
  ];
  assert.deepEqual(recentExerciseIds(workouts as any, 2), ["a", "b"]);
  assert.deepEqual(recentExerciseIds([]), []);
  assert.deepEqual(recentExerciseIds(undefined as any), []);
});
