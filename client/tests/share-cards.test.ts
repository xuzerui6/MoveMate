import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGymSetCard,
  buildLevelCard,
  buildMotionSetCard,
  buildRecordCard,
  buildStreakCard,
  buildWorkoutCardData,
  detectRecordPr,
  durationParts,
  formatCardDate,
  gymExerciseEn,
  streakMilestone,
} from "../src/features/share/cardData";
import { milestoneCardSvg, setCardSvg, workoutCardSvg } from "../src/features/share/cardSvg";

test("card date formats with weekday", () => {
  const d = formatCardDate(new Date(2026, 10, 7));
  assert.equal(d.short, "2026.11.07");
  assert.equal(d.full, "2026.11.07 · 周六");
});

test("duration stays minutes under an hour and splits into hours above", () => {
  assert.deepEqual(durationParts(52 * 60 + 20), { kind: "minutes", minutes: 52 });
  assert.deepEqual(durationParts(59 * 60), { kind: "minutes", minutes: 59 });
  assert.deepEqual(durationParts(92 * 60), { kind: "hours", hours: 1, minutes: 32 });
});

const gymRow = (overrides: any = {}) => ({
  createdAt: "2026-11-07T08:00:00",
  session: { startTime: "2026-11-07T08:00:00", effectiveSeconds: 52 * 60 },
  sets: [
    { status: "completed", reps: 20, inputMode: "camera", exercise: { id: "e1" }, score: { count: 20, total: 1840 } },
    { status: "completed", reps: 15, inputMode: "manual", exercise: { id: "e1" } },
    { status: "completed", reps: 10, inputMode: "camera", exercise: { id: "e2" }, score: { count: 10, total: 800 } },
    { status: "skipped", reps: 99, inputMode: "camera", exercise: { id: "e3" }, score: { count: 1, total: 1 } },
  ],
  ...overrides,
});

test("workout card aggregates completed sets only and averages scored camera reps", () => {
  const data = buildWorkoutCardData(gymRow(), 12);
  assert.ok(data);
  assert.equal(data.exerciseCount, 2);
  assert.equal(data.totalSets, 3);
  assert.equal(data.totalReps, 45);
  // 板上口径：已评分组得分的平均 = (92 + 80) / 2，跳过组不计
  assert.equal(data.avgScore, 86);
  assert.equal(data.streakDays, 12);
  assert.equal(data.date.full, "2026.11.07 · 周六");
});

test("workout card average is null without scored camera sets and card is null for imports", () => {
  const manualOnly = gymRow({
    sets: [{ status: "completed", reps: 10, inputMode: "manual", exercise: { id: "e1" } }],
  });
  assert.equal(buildWorkoutCardData(manualOnly, 0)?.avgScore, null);
  assert.equal(buildWorkoutCardData(gymRow({ session: null }), 0), null);
  assert.equal(buildWorkoutCardData(null, 0), null);
});

test("gym set card folds the score accumulator into score and axes", () => {
  const data = buildGymSetCard(
    {
      reps: 20,
      exercise: { nameZh: "哑铃锤式弯举", name: "Dumbbell Hammer Curl" },
      score: { count: 20, total: 1840, depth: 1880, stability: 1760, trunk: 1920, symmetry: 1800 },
    },
    2,
    new Date(2026, 10, 7),
  );
  assert.equal(data.scored, true);
  assert.equal(data.score, 92);
  assert.deepEqual(data.axes?.map((a) => a.value), [94, 88, 96, 90]);
  assert.deepEqual(data.axes?.map((a) => a.label), ["幅度", "稳定性", "躯干", "对称"]);
  assert.equal(data.setIndex, 3);
  assert.equal(data.nameEn, "DUMBBELL HAMMER CURL");
});

test("gym set card degrades to unscored for manual sets", () => {
  const data = buildGymSetCard({ reps: 12, exercise: { nameZh: "深蹲", name: "squat" }, score: null }, 0, new Date(2026, 10, 7));
  assert.equal(data.scored, false);
  assert.equal(data.score, null);
  assert.equal(data.axes, null);
  assert.equal(data.personalBest, false);
});

test("gym english name normalizes ids", () => {
  assert.equal(gymExerciseEn("barbell_bench-press"), "BARBELL BENCH PRESS");
  assert.equal(gymExerciseEn(""), "");
});

const motionResult = (overrides: any = {}) => ({
  id: "s1",
  exerciseType: "squat",
  startTime: "2026-11-07T08:00:00",
  reps: 20,
  formScore: 92,
  formBreakdown: { depth: 90, stability: 88, trunk: 95, symmetry: 91 },
  scoreAccumulator: { count: 20 },
  source: "camera",
  ...overrides,
});

test("motion set card marks personal best only when beating a previous scored best", () => {
  const history: any[] = [
    { id: "old", exerciseType: "squat", formScore: 85, scoreAccumulator: { count: 10 }, source: "camera" },
  ];
  const card = buildMotionSetCard(motionResult() as any, history as any);
  assert.equal(card.scored, true);
  assert.equal(card.personalBest, true);
  assert.equal(card.nameZh, "深蹲");
  assert.equal(card.nameEn, "SQUAT");
  const stronger: any[] = [
    { id: "old", exerciseType: "squat", formScore: 95, scoreAccumulator: { count: 10 }, source: "camera" },
  ];
  assert.equal(buildMotionSetCard(motionResult() as any, stronger as any).personalBest, false);
});

test("motion set card degrades when nothing was scored", () => {
  const card = buildMotionSetCard(
    motionResult({ formScore: 0, scoreAccumulator: { count: 0 } }) as any,
    [] as any,
  );
  assert.equal(card.scored, false);
  assert.equal(card.axes, null);
});

test("streak milestone picks the highest reached and the next target", () => {
  assert.equal(streakMilestone(6), null);
  assert.deepEqual(streakMilestone(7), { milestone: 7, next: 14 });
  assert.deepEqual(streakMilestone(45), { milestone: 30, next: 50 });
  assert.deepEqual(streakMilestone(1200), { milestone: 1000, next: null });
});

test("streak card derives the start date and ring fraction", () => {
  const now = new Date(2026, 10, 7, 12, 0, 0);
  const card = buildStreakCard([{ startTime: now.toISOString() }], 30, now);
  assert.ok(card);
  assert.equal(card.num, "30");
  assert.equal(card.line1.map((s) => s.t).join(""), "从 10 月 9 日 到今天，一天没断。");
  assert.equal(card.line2.map((s) => s.t).join(""), "下一个小目标：第 50 天。");
  assert.equal(card.fraction, 0.6);
  assert.equal(card.foot, "STREAK · 30 DAYS");
  assert.equal(buildStreakCard([], 3, now), null);
});

test("level card reports remaining xp and first-step pill", () => {
  const card = buildLevelCard({ level: 6, xp: 100, date: new Date(2026, 10, 7) });
  assert.equal(card.num, "Lv.6");
  assert.equal(card.line2.map((s) => s.t).join(""), "距 Lv.7 还差 700 点经验。");
  assert.equal(card.fraction, 0.125);
  assert.equal(card.pill, "等级提升 LEVEL UP");
  assert.equal(buildLevelCard({ level: 2, xp: 0, date: new Date(2026, 10, 7) }).pill, "第一步 FIRST STEP");
});

const prRow = (sets: any[], personalBests: any) => ({
  createdAt: "2026-11-07T08:00:00",
  session: { startTime: "2026-11-07T08:00:00" },
  sets,
  personalBests,
});

test("record detection prefers a weight pr over a reps pr", () => {
  const row = prRow(
    [
      { status: "completed", kind: "work", reps: 8, loadKg: 25, exercise: { id: "e1", nameZh: "哑铃弯举", name: "Dumbbell Curl" } },
      { status: "completed", kind: "warmup", reps: 5, loadKg: 60, exercise: { id: "e1", nameZh: "哑铃弯举", name: "Dumbbell Curl" } },
    ],
    { e1: { loadKg: 22.5, reps: 10 } },
  );
  const pr = detectRecordPr(row);
  assert.equal(pr?.kind, "weight");
  assert.equal(pr?.value, 25);
  assert.equal(pr?.previous, 22.5);
  const card = buildRecordCard(row);
  assert.equal(card?.num, "25");
  assert.equal(card?.unit, "kg");
  assert.equal(card?.line1.map((s) => s.t).join(""), "比上次纪录多了 2.5 kg。");
  assert.equal(card?.fraction, 0.9);
});

test("record detection covers reps pr, first record and no record", () => {
  const repsRow = prRow(
    [{ status: "completed", kind: "work", reps: 12, loadKg: 25, exercise: { id: "e1", nameZh: "哑铃弯举", name: "Dumbbell Curl" } }],
    { e1: { loadKg: 25, reps: 10 } },
  );
  assert.equal(detectRecordPr(repsRow)?.kind, "reps");
  const firstRow = prRow(
    [{ status: "completed", kind: "work", reps: 8, loadKg: 20, exercise: { id: "e1", nameZh: "哑铃弯举", name: "Dumbbell Curl" } }],
    {},
  );
  const firstCard = buildRecordCard(firstRow);
  assert.equal(firstCard?.pill, "第一步 FIRST STEP");
  assert.equal(firstCard?.fraction, 1);
  const noneRow = prRow(
    [{ status: "completed", kind: "work", reps: 8, loadKg: 20, exercise: { id: "e1", nameZh: "哑铃弯举", name: "Dumbbell Curl" } }],
    { e1: { loadKg: 30, reps: 12 } },
  );
  assert.equal(buildRecordCard(noneRow), null);
});

test("workout card svg is a full-size R2 card with band motif and cells", () => {
  const data = buildWorkoutCardData(gymRow(), 12);
  assert.ok(data);
  const svg = workoutCardSvg(data);
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"'));
  assert.ok(svg.includes("M30 190 L88 118 L66 52")); // V4-B 星图（绿带白线版）
  assert.ok(svg.includes("训练完成"));
  assert.ok(svg.includes("平均分 AVG SCORE"));
  assert.ok(svg.includes("连续运动第 12 天"));
  assert.ok(svg.includes("每次运动，都算数。"));
});

test("workout card svg degrades: no average cell, first-day badge, hours hero", () => {
  const data = buildWorkoutCardData(
    gymRow({
      session: { startTime: "2026-11-07T08:00:00", effectiveSeconds: 92 * 60 },
      sets: [{ status: "completed", reps: 10, inputMode: "manual", exercise: { id: "e1" } }],
    }),
    1,
  );
  assert.ok(data);
  const svg = workoutCardSvg(data);
  assert.ok(!svg.includes("平均分 AVG SCORE"));
  assert.ok(svg.includes("总组数 SETS"));
  assert.ok(svg.includes("新的一天，从今天开始"));
  assert.ok(svg.includes("小时"));
});

test("set card svg renders scored axes and the unscored degradation", () => {
  const scored = buildGymSetCard(
    {
      reps: 20,
      exercise: { nameZh: "哑铃锤式弯举", name: "Dumbbell Hammer Curl" },
      score: { count: 20, total: 1840, depth: 1880, stability: 1760, trunk: 1920, symmetry: 1800 },
    },
    2,
    new Date(2026, 10, 7),
  );
  const scoredSvg = setCardSvg(scored);
  assert.ok(scoredSvg.includes("SET HIGHLIGHT"));
  assert.ok(scoredSvg.includes("/ 100 · 本组得分"));
  assert.ok(scoredSvg.includes("稳定性"));
  assert.ok(scoredSvg.includes("SET 03 · 2026.11.07"));
  const unscored = buildGymSetCard({ reps: 12, exercise: { nameZh: "深蹲", name: "squat" }, score: null }, 0, new Date(2026, 10, 7));
  const unscoredSvg = setCardSvg(unscored);
  assert.ok(unscoredSvg.includes("本组未评分，下次把全身放进画面试试"));
  assert.ok(!unscoredSvg.includes("本组得分"));
  assert.ok(!unscoredSvg.includes("M30 190 L88 118 L66 52")); // R2 的 B 卡不叠 motif
});

test("set card svg wraps long exercise names instead of truncating", () => {
  const data = buildGymSetCard(
    { reps: 10, exercise: { nameZh: "绳索绳柄坐姿低位划船加强版", name: "Cable Seated Row" }, score: null },
    0,
    new Date(2026, 10, 7),
  );
  const svg = setCardSvg(data);
  assert.ok(svg.includes("绳索绳柄坐姿低"));
  assert.ok(svg.includes("位划船加强版"));
});

test("milestone card svg ring offset follows the fraction", () => {
  const now = new Date(2026, 10, 7, 12, 0, 0);
  const card = buildStreakCard([{ startTime: now.toISOString() }], 30, now);
  assert.ok(card);
  const svg = milestoneCardSvg(card);
  assert.ok(svg.includes('stroke-dashoffset="683.6"'));
  assert.ok(svg.includes("连续打卡"));
  assert.ok(svg.includes("STREAK · 30 DAYS"));
  assert.ok(svg.includes("每次运动，都算数。"));
});
