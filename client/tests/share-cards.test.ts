import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGymSetCard,
  buildLevelCard,
  buildMotionSetCard,
  buildRecordCard,
  buildStreakCard,
  buildWorkoutCardData,
  completionRecognitionAverage,
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

test("completion recognition average excludes withheld camera sets (one rule with the card average)", () => {
  // 出分组：按次 170/2 = 85。暂停组：锤式式存量分（峰值时序偏移在账 →
  // 稳定性轴 control 暂停、总分不呈现），其内部均值 40 不得进入任何平均。
  // 手动组：即便带 score 也不属于摄像头识别均分。
  const presented = { status: "completed", reps: 2, inputMode: "camera", exercise: { id: "e1" }, score: { count: 2, total: 170, depth: 170, stability: 150, trunk: 160, symmetry: 160 } };
  const withheld = { status: "completed", reps: 2, inputMode: "camera", exercise: { id: "e2" }, score: { count: 2, total: 80, depth: 170, stability: 60, trunk: 160, symmetry: 0, symmetryOffsetsMs: [100, 120] } };
  const manual = { status: "completed", reps: 5, inputMode: "manual", exercise: { id: "e1" }, score: { count: 5, total: 500 } };
  // 混合：均分 = 出分组自己的按次均分（旧行内口径会把暂停组算成 (170+80)/4 = 63）
  assert.equal(completionRecognitionAverage([presented, withheld, manual]), 85);
  // 全部暂停：null —— 完成屏整行隐藏，绝不回退到把暂停组算进来（旧口径会显示 40）
  assert.equal(completionRecognitionAverage([withheld]), null);
  // 无摄像头评分组：null（与旧 some 门一致）
  assert.equal(completionRecognitionAverage([manual]), null);
  assert.equal(completionRecognitionAverage([]), null);
});

test("completion recognition average keeps its per-rep weighting when every camera set is presented", () => {
  // 与改前行内公式逐字一致：Σtotal / Σcount = (1840 + 800) / (20 + 10) = 88；
  // 手动组不计。本轮只加暂停排除，不动权重与选组口径。
  const sets = [
    { status: "completed", reps: 20, inputMode: "camera", exercise: { id: "e1" }, score: { count: 20, total: 1840 } },
    { status: "completed", reps: 10, inputMode: "camera", exercise: { id: "e2" }, score: { count: 10, total: 800 } },
    { status: "completed", reps: 15, inputMode: "manual", exercise: { id: "e1" } },
  ];
  assert.equal(completionRecognitionAverage(sets), 88);
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
  assert.ok(scoredSvg.includes("M30 190 L88 118 L66 52")); // B 卡带内星图，与 A 卡共用组件
  const unscored = buildGymSetCard({ reps: 12, exercise: { nameZh: "深蹲", name: "squat" }, score: null }, 0, new Date(2026, 10, 7));
  const unscoredSvg = setCardSvg(unscored);
  assert.ok(unscoredSvg.includes("本组未评分，下次把全身放进画面试试"));
  assert.ok(!unscoredSvg.includes("本组得分"));
  assert.ok(unscoredSvg.includes("M30 190 L88 118 L66 52")); // 2026-11-07 真机修正推翻 v2 板 B 小样「不叠 motif」注记：带右半部不得为空带
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

test("set card svg prints the scope note beside a subset-scoped total, and only then", () => {
  // A stored subset-scoped map (a round-5-window front-raise set —
  // stored maps keep their historical presentation): the total is
  // presented over stability + trunk, depth as bands alongside.
  const scoped = buildGymSetCard(
    {
      reps: 2,
      exercise: { nameZh: "哑铃前平举", name: "front_raise" },
      score: { count: 2, total: 170, depth: 0, stability: 180, trunk: 160, symmetry: 0, depthBandCounts: { left: { shoulder: 2 }, right: { below: 1 } }, axisAssessment: { depth: { kind: "bands", left: "shoulder", right: "below" }, stability: { kind: "numeric" }, trunk: { kind: "numeric" }, symmetry: { kind: "unassessable", reason: "view" } } },
    },
    0,
    new Date(2026, 10, 7),
  );
  assert.equal(scoped.score, 85);
  assert.equal(scoped.scoreNote, "总分只按 稳定性、躯干 算；幅度看档位，不算进总分");
  const scopedSvg = setCardSvg(scoped);
  assert.ok(scopedSvg.includes("总分只按 稳定性、躯干 算；幅度看档位，不算进总分"));
  // The banded depth stays visible alongside the total, as state text.
  assert.ok(scopedSvg.includes("左 到达肩高 · 右 未到肩高"));
  // The same tallies WITHOUT a stored map derive the channel
  // suspensions (2026-11-09, Codex round-7): the card withholds the
  // total, prints no scope note, and shows no band text anywhere.
  const derived = buildGymSetCard(
    {
      reps: 2,
      exercise: { nameZh: "哑铃前平举", name: "front_raise" },
      score: { count: 2, total: 170, depth: 0, stability: 180, trunk: 160, symmetry: 0, depthBandCounts: { left: { shoulder: 2 }, right: { below: 1 } } },
    },
    0,
    new Date(2026, 10, 7),
  );
  assert.equal(derived.totalWithheld, true);
  assert.equal(derived.score, null);
  assert.equal(derived.scoreNote, null);
  const derivedSvg = setCardSvg(derived);
  assert.ok(!derivedSvg.includes("到达肩高"), "no band text on a channel-suspended card");
  assert.ok(!derivedSvg.includes("总分只按"));
  // A total covering every applicable axis keeps the previous card:
  // no scope note in the data, none in the SVG.
  const plain = buildGymSetCard(
    {
      reps: 20,
      exercise: { nameZh: "哑铃锤式弯举", name: "Dumbbell Hammer Curl" },
      score: { count: 20, total: 1840, depth: 1880, stability: 1760, trunk: 1920, symmetry: 1800 },
    },
    2,
    new Date(2026, 10, 7),
  );
  assert.equal(plain.scoreNote, null);
  assert.ok(!setCardSvg(plain).includes("总分只按"));
});

test("hammer set cards omit the depth value entirely (Codex round-8)", () => {
  // Gym/plan path: a post-contract hammer set (offsets derive the
  // suspension map, total withheld). Summary shows the depth number
  // WITH the limitation line; the standalone card has no note slot, so
  // its depth slot renders the unavailable treatment instead of the
  // bare amplitude number (93 = 560/6 here).
  const gymHammer = buildGymSetCard(
    { reps: 6, exercise: { name: "hammer_curl", nameZh: "锤式弯举" }, score: { count: 6, total: 540, depth: 560, stability: 520, trunk: 550, symmetry: 0, symmetryOffsetsMs: [80, 90, 70, 85, 95, 75] } },
    0,
    new Date(2026, 10, 7),
  );
  assert.equal(gymHammer.totalWithheld, true);
  assert.equal(gymHammer.axes?.[0].text, "—");
  assert.equal(gymHammer.axes?.[0].value, 0);
  const gymSvg = setCardSvg(gymHammer);
  assert.ok(gymSvg.includes("—"), "the depth slot carries the omission mark");
  assert.ok(!gymSvg.includes(">93</text>"), "no depth number anywhere in the card svg");
  // The other axes keep their existing states.
  assert.equal(gymHammer.axes?.[1].text, "暂时评不了");
  assert.equal(gymHammer.axes?.[3].text, "同步");

  // Motion path: the same omission for a live/restored hammer session
  // carrying its assessment map.
  const motionHammer = buildMotionSetCard(
    {
      id: "cur",
      exerciseType: "hammer_curl",
      source: "camera",
      startTime: new Date(2026, 10, 7),
      reps: 6,
      formScore: 95,
      perfectReps: 0,
      scoreAccumulator: { count: 6, total: 570, depth: 560, stability: 520, trunk: 550, symmetry: 0 },
      formBreakdown: { depth: 93, stability: 87, trunk: 92, symmetry: 0 },
      axisAssessment: { depth: { kind: "numeric" }, stability: { kind: "unassessable", reason: "control" }, trunk: { kind: "unassessable", reason: "channel" }, symmetry: { kind: "category", category: "sync" } },
    } as any,
    [] as any,
  );
  assert.equal(motionHammer.totalWithheld, true);
  assert.equal(motionHammer.axes?.[0].text, "—");
  assert.ok(!setCardSvg(motionHammer).includes(">93</text>"));

  // A NON-hammer withheld card keeps its depth number: the omission is
  // scoped to hammer's suppressed depth claim, not to withheld cards
  // in general (seated curl: stability suspended, depth untouched).
  const seated = buildGymSetCard(
    { reps: 6, exercise: { name: "seated_curl", nameZh: "坐姿弯举" }, score: { count: 6, total: 500, depth: 560, stability: 520, trunk: 550, symmetry: 540, axisAssessment: { depth: { kind: "numeric" }, stability: { kind: "unassessable", reason: "control" }, trunk: { kind: "numeric" }, symmetry: { kind: "numeric" } } } },
    0,
    new Date(2026, 10, 7),
  );
  assert.equal(seated.totalWithheld, true);
  assert.equal(seated.axes?.[0].text, undefined);
  assert.equal(seated.axes?.[0].value, 93);
  assert.ok(setCardSvg(seated).includes(">93</text>"));

  // A pre-contract legacy hammer set (no assessment evidence at all)
  // keeps today's card exactly: presented total, depth number shown.
  const legacy = buildGymSetCard(
    { reps: 6, exercise: { name: "hammer_curl", nameZh: "锤式弯举" }, score: { count: 6, total: 540, depth: 560, stability: 520, trunk: 550, symmetry: 530 } },
    0,
    new Date(2026, 10, 7),
  );
  assert.equal(legacy.totalWithheld, false);
  assert.equal(legacy.score, 90);
  assert.equal(legacy.axes?.[0].text, undefined);
  assert.equal(legacy.axes?.[0].value, 93);
});
