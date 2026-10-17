import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
Object.assign(process.env, {
  SQLITE_PATH: path.join(
    mkdtempSync(path.join(tmpdir(), "gym-test-")),
    "gym.db",
  ),
  JWT_SECRET: "gym-test-secret".repeat(4),
  STUDENT_ID_SALT: "gym-test-salt".repeat(4),
  ENV_FILE: "absent",
  NODE_ENV: "test",
  SMTP_USER: "",
  SMTP_PASS: "",
});
const { pool, withTransaction } = require("../src/db");
const gym = require("../src/gym/service"),
  motion = require("../src/services/motion.service"),
  imports = require("../src/gym/imports");
const { templates, chineseName } = require("../src/gym/model");
let owner: number, other: number;
before(async () => {
  await pool.query("SELECT 1");
  for (const name of ["gym-owner", "gym-other"]) {
    const r = await pool.query(
      "INSERT INTO users(email,nickname,password_hash,email_verified,campus_id,student_id) VALUES($1,$1,$2,1,1,$1) RETURNING id",
      [name + "@dajju.local", "not-used"],
    );
    if (!owner) owner = r.rows[0].id;
    else other = r.rows[0].id;
  }
});
const plan = async (uid = owner, count = 2) =>
  gym.savePlan(uid, {
    name: "回归计划",
    mode: "rotation",
    routines: [
      {
        id: "a",
        name: "A",
        weekdays: [],
        exercises: [
          {
            exerciseId: "motion:squat",
            sets: Array.from({ length: count }, () => ({
              reps: 3,
              restSec: 60,
              loadKg: 5,
            })),
          },
        ],
      },
    ],
  });
const start = async (uid = owner, count = 2) => {
  const p = await plan(uid, count);
  return gym.startWorkout(uid, {
    id: randomUUID(),
    planId: p.id,
    routineId: "a",
  });
};
const act = (w: any, action: string, data: any = {}) =>
  gym.actWorkout(owner, w.id, {
    operationId: randomUUID(),
    version: w.version,
    action,
    setId: w.sets[w.cursor]?.id,
    ...data,
  });
async function age(w: any, seconds: number) {
  const date = new Date(Date.now() - seconds * 1000).toISOString();
  await pool.query("UPDATE sport_sessions SET active_since=$2 WHERE id=$1", [
    w.session.id,
    date,
  ]);
  await pool.query(
    "UPDATE sport_intervals SET started_at=$2 WHERE session_id=$1 AND ended_at IS NULL",
    [w.session.id, date],
  );
}
test("catalog is text-only, filters IDs, camera capability is restricted and custom exercises stay private", async () => {
  assert.equal(chineseName("throw down"), "throw down");
  assert.equal(chineseName("dumbbell bent over row"), "哑铃 俯身划船");
  const a = await gym.library(owner, {
    ids: "motion:squat,motion:push_up",
    limit: 500,
  });
  assert.equal(a.items.length, 2);
  assert.ok(a.items.every((e: any) => e.cameraType));
  const all = await gym.allExercises(owner);
  assert.ok(all.length > 1300);
  assert.ok(!JSON.stringify(all).includes("http"));
  assert.equal(all.filter((e: any) => e.cameraType).length, 4);
  const custom = await gym.saveExercise(owner, {
    nameZh: "我的动作",
    bodyPart: "back",
    target: "back",
    equipment: "band",
    instructions: ["安全摆好器械"],
  });
  assert.ok(
    !(await gym.allExercises(other)).some((e: any) => e.id === custom.id),
  );
  await gym.favorite(owner, custom.id, true);
  assert.equal((await gym.library(owner, { favorite: "1" })).total, 1);
  await assert.rejects(gym.favorite(other, custom.id, true));
});
test("templates and optimistic plan editing reject conflicting or inaccessible exercise data", async () => {
  assert.equal(templates().length, 4);
  const p = await plan();
  const updated = await gym.savePlan(owner, { ...p, name: "更新" }, p.id);
  assert.equal(updated.version, 2);
  await assert.rejects(gym.savePlan(owner, p, p.id), /其他页面/);
  await assert.rejects(gym.savePlan(other, updated, p.id));
  await assert.rejects(
    gym.savePlan(owner, {
      ...p,
      routines: [
        {
          ...p.routines[0],
          exercises: [{ exerciseId: "unknown", sets: [{}] }],
        },
      ],
    }),
    /不存在/,
  );
});
test("sets share one parent session; preparation/rest/pause excluded, finish and retries award exactly once", async () => {
  let w = await start();
  assert.equal(w.session.status, "paused");
  assert.equal(w.sets[0].targetReps, 3);
  assert.equal((await motion.activeSession(owner)).workoutId, w.id);
  await assert.rejects(
    motion.sessionAction(w.session.id, owner, "resume"),
    /计划训练/,
  );
  await assert.rejects(
    motion.createSession(owner, { sportType: "running", source: "timer" }),
    /已有/,
  );
  w = await act(w, "start");
  await age(w, 61);
  w = await act(w, "complete", { reps: 3, loadKg: 10 });
  assert.equal(w.phase, "resting");
  assert.ok(w.session.effectiveSeconds >= 61);
  const baseline = w.session.effectiveSeconds;
  w = await act(w, "start");
  await age(w, 30);
  w = await act(w, "pause", { reps: 2 });
  assert.ok(w.session.effectiveSeconds >= baseline + 30);
  assert.equal(w.session.status, "paused");
  w = await act(w, "resume");
  await age(w, 30);
  const payload = {
    operationId: randomUUID(),
    version: w.version,
    action: "finish",
    reps: 3,
  };
  w = await gym.actWorkout(owner, w.id, payload);
  assert.equal(w.phase, "finished");
  assert.equal(w.session.xpEarned, 2);
  assert.equal(
    (await gym.actWorkout(owner, w.id, payload)).session.xpEarned,
    2,
  );
  assert.equal((await act(w, "finish")).session.xpEarned, 2);
  assert.equal(
    (
      await pool.query("SELECT * FROM xp_ledger WHERE session_id=$1", [
        w.session.id,
      ])
    ).rowCount,
    1,
  );
  assert.equal(
    (await gym.plans(owner)).items.find((p: any) => p.id === w.planId)
      .rotationCursor,
    0,
  );
});
test("four recognized actions count in a plan without per-rep XP; half sets/manual fallback never fabricate scores", async () => {
  for (const type of ["squat", "jumping_jack", "high_knees", "push_up"]) {
    const p = await gym.savePlan(owner, {
      name: type,
      routines: [
        {
          id: "a",
          name: "A",
          exercises: [{ exerciseId: "motion:" + type, sets: [{ reps: 3 }] }],
        },
      ],
    });
    let w = await gym.startWorkout(owner, {
      id: randomUUID(),
      planId: p.id,
      routineId: "a",
    });
    w = await act(w, "start", { inputMode: "camera" });
    await age(w, 60);
    const score = {
      count: 2,
      total: 190,
      depth: 190,
      stability: 190,
      trunk: 190,
      symmetry: 190,
    };
    w = await act(w, "progress", { reps: 2, score });
    w = await act(w, "pause");
    assert.equal((await gym.workout(owner, w.id)).sets[0].reps, 2);
    w = await act(w, "finish");
    assert.equal(w.session.xpEarned, 1);
    assert.equal(w.session.metrics.formScore, 95);
    assert.equal(w.session.metrics.planSquatReps, type === "squat" ? 2 : 0);
  }
  let w = await start(owner, 1);
  w = await act(w, "start", { inputMode: "camera" });
  w = await act(w, "manual", {
    reps: 1,
    score: {
      count: 1,
      total: 95,
      depth: 95,
      stability: 95,
      trunk: 95,
      symmetry: 95,
    },
  });
  assert.equal(w.sets[0].inputMode, "mixed");
  assert.deepEqual(w.sets[0].score, {});
  w = await act(w, "finish");
  assert.equal(w.session.xpEarned, 0);
});
test("operation IDs serialize concurrent pages, reject changed payload and recover after rollback", async () => {
  let w = await start(owner, 1);
  await assert.rejects(
    gym.actWorkout(other, w.id, {
      operationId: "x",
      version: w.version,
      action: "start",
    }),
  );
  const data = {
    operationId: randomUUID(),
    version: w.version,
    action: "start",
  };
  const results = await Promise.allSettled([
    gym.actWorkout(owner, w.id, data),
    gym.actWorkout(owner, w.id, { ...data, operationId: randomUUID() }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  w = await gym.workout(owner, w.id);
  await assert.rejects(
    gym.actWorkout(owner, w.id, { ...data, action: "finish" }),
    /操作ID/,
  );
  await assert.rejects(
    act(w, "progress", {
      reps: 2,
      score: {
        count: 1,
        total: 90,
        depth: 90,
        stability: 90,
        trunk: 90,
        symmetry: 90,
      },
    }),
  );
  assert.equal((await gym.workout(owner, w.id)).version, w.version);
  w = await act(w, "finish");
  assert.equal(w.phase, "finished");
});
test("history corrections change analytics but never XP, camera growth or another account", async () => {
  const rows = await gym.listWorkouts(owner),
    w = rows.find((w: any) => w.session?.xpEarned === 2);
  const xp = (await motion.trainingState(owner)).totalXp;
  await gym.editHistory(owner, w.id, {
    version: w.version,
    sets: [{ id: w.sets[0].id, reps: 12, loadKg: 20 }],
  });
  assert.equal((await motion.trainingState(owner)).totalXp, xp);
  assert.ok((await gym.analytics(owner)).volume >= 240);
  assert.equal((await gym.analytics(other)).volume, 0);
  await assert.rejects(
    gym.editHistory(other, w.id, { version: w.version, sets: [] }),
  );
});
test("body records are account-private and invalid dates roll back cleanly", async () => {
  await gym.saveMeasurement(owner, {
    date: "2026-10-17",
    weightKg: 70,
    goalKg: 68,
    waistCm: 80,
  });
  assert.equal((await gym.measurements(owner)).settings.goalKg, 68);
  assert.equal((await gym.measurements(other)).items.length, 0);
  await assert.rejects(
    gym.saveMeasurement(owner, { date: "2026-99-99", weightKg: 75 }),
  );
});
test("CSV quote handling and openGym/Strong/Hevy/FitNotes adapters preserve record quantities", () => {
  assert.deepEqual(imports.csvRows('a,b\r\n"hello,there","two""quotes"'), [
    ["a", "b"],
    ["hello,there", 'two"quotes'],
  ]);
  assert.equal(
    imports.parseImport(
      "opengym",
      JSON.stringify({
        unit: "lb",
        workouts: [
          {
            id: 1,
            d: "2026-10-16",
            entries: [
              {
                id: "squat",
                name: "徒手深蹲",
                sets: [
                  { w: 10, r: 5, done: true },
                  { w: 1, r: 5, done: false },
                ],
              },
            ],
          },
        ],
      }),
    )[0].sets[0].loadKg,
    4.535923700000001,
  );
  for (const type of ["strong", "hevy", "fitnotes"]) {
    const csv =
      type === "hevy"
        ? "start_time,title,exercise_title,weight_kg,reps,duration_seconds\n2026-10-16,test,徒手深蹲,10,5,30"
        : type === "fitnotes"
          ? "Date,Exercise,Weight,Reps,Time\n2026-10-16,徒手深蹲,10,5,00:30"
          : "Date,Workout Name,Exercise Name,Weight,Reps,Seconds\n2026-10-16,test,徒手深蹲,10,5,30";
    const r = imports.parseImport(type, csv);
    assert.equal(r[0].sets[0].seconds, 30);
    assert.equal(r[0].sets[0].reps, 5);
  }
});
test("import previews unknown mappings, deduplicates retries and awards no XP or equipment", async () => {
  const text = JSON.stringify({
    workouts: [
      {
        id: "external",
        date: "2026-10-01",
        entries: [
          {
            id: "alien",
            name: "未知深蹲",
            sets: [{ w: 10, r: 5, done: true }],
          },
        ],
      },
    ],
  });
  let data = { format: "opengym", text };
  assert.deepEqual((await imports.previewImport(owner, data)).missing, [
    "未知深蹲",
  ]);
  await assert.rejects(imports.commitImport(owner, data));
  const input = { ...data, mapping: { 未知深蹲: "motion:squat" } };
  const xp = (await motion.trainingState(owner)).totalXp;
  assert.equal((await imports.commitImport(owner, input)).imported, 1);
  assert.equal((await imports.commitImport(owner, input)).duplicates, 1);
  assert.equal((await motion.trainingState(owner)).totalXp, xp);
  assert.equal(
    (await gym.listWorkouts(owner)).filter((w: any) => w.imported).length,
    1,
  );
});
test("shared plan remaps custom ownership, rejects invalid references and repeated files", async () => {
  const custom = await gym.saveExercise(owner, {
    nameZh: "共享动作",
    bodyPart: "chest",
    target: "chest",
    equipment: "body weight",
    instructions: ["慢速完成"],
  });
  const p = await gym.savePlan(owner, {
    name: "共享计划",
    routines: [
      {
        id: "a",
        name: "A",
        exercises: [{ exerciseId: custom.id, sets: [{}] }],
      },
    ],
  });
  const file = { format: "movemate-plan", plan: p, customExercises: [custom] };
  const result = await imports.importPlan(other, file);
  assert.ok(
    result.plan.routines[0].exercises[0].exerciseId.startsWith("user:" + other),
  );
  assert.equal((await imports.importPlan(other, file)).duplicate, true);
});
test("progression stays opt-in and suggestions require explicit optimistic save", async () => {
  const p = await plan();
  assert.equal((await gym.progression(owner, p.id)).suggestions.length, 0);
  const updated = await gym.savePlan(
    owner,
    {
      ...p,
      progression: {
        mode: "double",
        incrementKg: 2.5,
        minReps: 8,
        maxReps: 12,
        maxSets: 5,
      },
    },
    p.id,
  );
  let w = await gym.startWorkout(owner, {
    id: randomUUID(),
    planId: p.id,
    routineId: "a",
  });
  w = await act(w, "start");
  w = await act(w, "complete", { reps: 3, loadKg: 5 });
  w = await act(w, "start");
  w = await act(w, "complete", { reps: 3, loadKg: 5 });
  await act(w, "finish");
  const proposal = await gym.progression(owner, p.id);
  assert.equal(proposal.suggestions.length, 2);
  assert.equal(proposal.plan.routines[0].exercises[0].sets[0].reps, 4);
  assert.equal(
    (await gym.plans(owner)).items.find((x: any) => x.id === p.id).routines[0]
      .exercises[0].sets[0].reps,
    3,
  );
});
test("group plan snapshots hide private load; attendance, early finish and activity-end races settle once", async () => {
  const p = await plan(owner, 1),
    game = (
      await pool.query(
        "INSERT INTO games(host_id,sport_type,title,location,max_players,start_time,campus_id,status) VALUES($1,'fitness','计划组局','训练场',2,$2,1,'recruiting') RETURNING *",
        [owner, new Date(Date.now() + 600000).toISOString()],
      )
    ).rows[0];
  await gym.attachPlan(owner, game.id, p.id, "a");
  assert.equal((await gym.gamePlan(other, game.id)).snapshot.sets[0].loadKg, 0);
  await assert.rejects(
    gym.startWorkout(other, { id: randomUUID(), gameId: game.id }),
    /签到/,
  );
  for (const uid of [owner, other])
    await pool.query(
      "INSERT INTO game_members(game_id,user_id,checked_in_at,attendance_confirmed_at) VALUES($1,$2,$3,$3)",
      [game.id, uid, new Date().toISOString()],
    );
  await pool.query("UPDATE games SET status='in_progress' WHERE id=$1", [
    game.id,
  ]);
  let a = await gym.startWorkout(owner, { id: randomUUID(), gameId: game.id }),
    b = await gym.startWorkout(other, { id: randomUUID(), gameId: game.id });
  a = await act(a, "start");
  b = await gym.actWorkout(other, b.id, {
    operationId: randomUUID(),
    version: b.version,
    action: "start",
  });
  await age(a, 121);
  await age(b, 61);
  b = await gym.actWorkout(other, b.id, {
    operationId: randomUUID(),
    version: b.version,
    action: "finish",
    reps: 8,
  });
  assert.equal(b.session.settled, false);
  const games = require("../src/services/game.service");
  const results = await Promise.allSettled([
    games.completeGameWithAuth(game.id, owner),
    act(a, "finish", { reps: 3 }),
  ]);
  assert.ok(results.some((r) => r.status === "fulfilled"));
  a = await gym.workout(owner, a.id);
  b = await gym.workout(other, b.id);
  assert.equal(a.session.xpEarned, 2);
  assert.equal(b.session.xpEarned, 1);
  assert.equal(a.phase, "finished");
  assert.equal(b.session.settled, true);
  assert.equal(
    (
      await pool.query("SELECT * FROM xp_ledger WHERE session_id IN ($1,$2)", [
        a.session.id,
        b.session.id,
      ])
    ).rowCount,
    2,
  );
});
test("supersets alternate exercises and rest only between rounds", async () => {
  const p = await gym.savePlan(owner, {
    name: "超级组",
    routines: [
      {
        id: "a",
        name: "A",
        exercises: ["squat", "push_up"].map((type) => ({
          exerciseId: "motion:" + type,
          sets: [
            { superset: "A", reps: 3, restSec: 60 },
            { superset: "A", reps: 3, restSec: 60 },
          ],
        })),
      },
    ],
  });
  let w = await gym.startWorkout(owner, {
    id: randomUUID(),
    planId: p.id,
    routineId: "a",
  });
  assert.deepEqual(
    w.sets.map((s: any) => s.exercise.id),
    ["motion:squat", "motion:push_up", "motion:squat", "motion:push_up"],
  );
  w = await act(w, "start");
  w = await act(w, "complete", { reps: 3 });
  assert.ok(Date.parse(w.restUntil) <= Date.now());
  w = await act(w, "start");
  w = await act(w, "complete", { reps: 3 });
  assert.ok(Date.parse(w.restUntil) > Date.now() + 59000);
  await act(w, "finish");
});

test("free workout structural changes preserve IDs, effort, idempotence and unique XP", async () => {
  let w = await gym.startWorkout(owner, {
    id: randomUUID(),
    free: { exercises: [{ exerciseId: "motion:squat", sets: [{ reps: 10 }] }] },
  });
  const first = w.sets[0].id;
  w = await act(w, "edit", { edit: { kind: "copy", targetId: first } });
  const copied = w.sets[1].id;
  w = await act(w, "edit", { edit: { kind: "remove", targetId: first } });
  assert.equal(w.sets[w.cursor].id, copied);
  w = await act(w, "edit", { edit: { kind: "undo", targetId: first } });
  assert.equal(w.sets.filter((s: any) => s.status === "pending").length, 2);
  w = await act(w, "start");
  await assert.rejects(
    act(w, "edit", {
      edit: {
        kind: "replace",
        targetId: first,
        exerciseId: "motion:jumping_jack",
      },
    }),
    /当前组/,
  );
  w = await act(w, "pause", {
    reps: 6,
    effort: { kind: "rpe", value: 7 },
    notes: "备注",
  });
  assert.equal(w.sets[w.cursor].effort.value, 7);
  w = await act(w, "complete", { reps: 6 });
  const elapsed = w.session.effectiveSeconds;
  w = await act(w, "rest", { restDelta: 15 });
  w = await act(w, "rest", { restSkip: true });
  assert.equal(w.session.effectiveSeconds, elapsed);
  const op = {
    operationId: randomUUID(),
    version: w.version,
    action: "edit",
    edit: { kind: "add", exerciseId: "motion:jumping_jack" },
  };
  w = await gym.actWorkout(owner, w.id, op);
  const count = w.sets.length;
  w = await gym.actWorkout(owner, w.id, op);
  assert.equal(w.sets.length, count);
  await assert.rejects(
    gym.actWorkout(owner, w.id, { ...op, operationId: randomUUID() }),
    /其他页面/,
  );
  w = await act(w, "finish");
  assert.equal(w.session.xpEarned, 0);
  const p = await gym.saveWorkoutPlan(owner, w.id, { name: "另存自由训练" });
  assert.ok(p.id);
  assert.equal(w.planId, null);
  await assert.rejects(gym.saveWorkoutPlan(other, w.id, { name: "越权" }));
});
test("training preferences merge without losing account or body settings", async () => {
  const prefs = require("../src/gym/preferences");
  await prefs.saveSettings(owner, {
    unit: "lb",
    effort: "rir",
    timeZone: "Pacific/Auckland",
  });
  await gym.saveMeasurement(owner, {
    date: "2026-10-17",
    weightKg: 70,
    goalKg: 68,
  });
  assert.equal((await prefs.settings(owner)).unit, "lb");
  assert.equal((await prefs.settings(other)).unit, "kg");
  await assert.rejects(
    prefs.saveSettings(owner, { timeZone: "invalid/timezone" }),
  );
});

test("schedule moves retain collisions, optimistic exceptions and account timezone", async () => {
  const { schedule, saveSchedule } = require("../src/gym/schedule");
  const prefs = require("../src/gym/preferences");
  await prefs.saveSettings(owner, { timeZone: "Asia/Shanghai" });
  const p = await gym.savePlan(owner, {
    name: "日程",
    routines: [
      {
        id: "a",
        name: "A",
        weekdays: [1],
        exercises: [{ exerciseId: "motion:squat", sets: [{}] }],
      },
      {
        id: "b",
        name: "B",
        weekdays: [2],
        exercises: [{ exerciseId: "motion:push_up", sets: [{}] }],
      },
    ],
  });
  await saveSchedule(owner, {
    planId: p.id,
    routineId: "a",
    originalDate: "2026-10-19",
    targetDate: "2026-10-20",
    kind: "move",
  });
  let rows = await schedule(owner, { from: "2026-10-19", days: 2 });
  assert.equal(
    rows.entries.filter(
      (e: any) => e.date === "2026-10-20" && e.plan.id === p.id,
    ).length,
    2,
  );
  await assert.rejects(
    saveSchedule(owner, {
      planId: p.id,
      routineId: "a",
      originalDate: "2026-10-19",
      kind: "skip",
    }),
    /其他页面/,
  );
  await saveSchedule(owner, {
    planId: p.id,
    routineId: "a",
    originalDate: "2026-10-19",
    kind: "restore",
    version: 1,
  });
  rows = await schedule(owner, { from: "2026-10-19", days: 1 });
  assert.ok(rows.entries.some((e: any) => e.plan.id === p.id));
  await assert.rejects(
    saveSchedule(other, {
      planId: p.id,
      routineId: "a",
      originalDate: "2026-10-19",
      kind: "skip",
    }),
  );
});
test("custom exercise archive preserves snapshots; catalog Chinese names and aliases are independently extended", async () => {
  const e = await gym.saveExercise(owner, {
    nameZh: "归档动作",
    bodyPart: "back",
    equipment: "band",
    target: "lats",
    instructions: ["控制动作"],
  });
  let w = await gym.startWorkout(owner, {
    id: randomUUID(),
    free: { exercises: [{ exerciseId: e.id, sets: [{}] }] },
  });
  await gym.updateExercise(owner, e.id, { nameZh: "新名称", archived: true });
  assert.equal(
    (await gym.workout(owner, w.id)).sets[0].exercise.nameZh,
    "归档动作",
  );
  assert.ok(!(await gym.library(owner, { q: "新名称" })).items.length);
  assert.ok(
    (await gym.library(owner, { q: "新名称", archived: "1" })).items.length,
  );
  await assert.rejects(gym.updateExercise(other, e.id, { archived: false }));
  w = await act(w, "finish");
  const all = await gym.allExercises(owner);
  assert.ok(
    all
      .filter((e: any) => e.id.startsWith("exdb:"))
      .every((e: any) => /[\u4e00-\u9fff]/.test(e.nameZh)),
  );
});

test("rotation advances only after completing due routine; timed per-exercise suggestions are opt-in", async () => {
  const p = await gym.savePlan(owner, {
    name: "轮次",
    mode: "rotation",
    routines: [
      {
        id: "a",
        name: "A",
        exercises: [{ exerciseId: "motion:squat", sets: [{ reps: 1 }] }],
      },
      {
        id: "b",
        name: "B",
        exercises: [
          {
            exerciseId: "motion:push_up",
            progression: { mode: "time", incrementSeconds: 5 },
            sets: [{ seconds: 1 }],
          },
        ],
      },
    ],
  });
  let w = await gym.startWorkout(owner, {
    id: randomUUID(),
    planId: p.id,
    routineId: "b",
  });
  w = await act(w, "start");
  await age(w, 2);
  w = await act(w, "complete");
  w = await act(w, "finish");
  assert.equal(
    (await gym.plans(owner)).items.find((x: any) => x.id === p.id)
      .rotationCursor,
    0,
  );
  const proposal = await gym.progression(owner, p.id);
  assert.equal(proposal.suggestions[0].after.seconds, 6);
  assert.equal(
    (await gym.plans(owner)).items.find((x: any) => x.id === p.id).routines[1]
      .exercises[0].sets[0].seconds,
    1,
  );
  w = await gym.startWorkout(owner, {
    id: randomUUID(),
    planId: p.id,
    routineId: "a",
  });
  w = await act(w, "start");
  w = await act(w, "complete", { reps: 1 });
  w = await act(w, "finish");
  assert.equal(
    (await gym.plans(owner)).items.find((x: any) => x.id === p.id)
      .rotationCursor,
    1,
  );
});
test("analytics uses account dates, excludes warmups and bodyweight from Epley estimates", async () => {
  const input = {
    format: "strong",
    text: "Date,Workout Name,Exercise Name,Weight,Reps,Seconds\n2026-10-10T18:30:00Z,曲线,徒手深蹲,20,5,1\n2026-10-11T18:30:00Z,曲线,徒手深蹲,0,10,1",
  };
  await imports.commitImport(owner, input);
  const a = await gym.analytics(owner),
    history = a.exerciseHistory["motion:squat"];
  assert.ok(
    history.find((x: any) => x.date === "2026-10-11").e1rm >= 20 * (1 + 5 / 30),
  );
  assert.equal(history.find((x: any) => x.date === "2026-10-12").e1rm, null);
  assert.ok(a.muscleDetails.quadriceps.primary > 0);
});

test("versioned full transfer remaps ownership, resumes checkpoints and never restores XP or camera grades", async () => {
  const transfer = require("../src/gym/transfer");
  const c = await gym.saveExercise(owner, {
    nameZh: "迁移动作",
    bodyPart: "back",
    equipment: "band",
    target: "lats",
    instructions: ["控制节奏"],
  });
  const p = await gym.savePlan(owner, {
    name: "迁移计划",
    routines: [
      { id: "a", name: "A", exercises: [{ exerciseId: c.id, sets: [{}] }] },
    ],
  });
  const root = {
    format: "movemate-gym",
    version: 2,
    customExercises: [
      { ...(await gym.allExercises(owner)).find((e: any) => e.id === c.id) },
    ],
    plans: [p],
    workouts: [
      {
        id: "historical-full",
        name: "历史",
        createdAt: "2026-09-01T12:00:00Z",
        phase: "finished",
        sets: [
          {
            exercise: { id: c.id, name: "迁移动作" },
            reps: 8,
            loadKg: 10,
            seconds: 65,
            status: "completed",
            inputMode: "camera",
            notes: "恢复备注",
            effort: { kind: "rpe", value: 7 },
            score: { count: 8, total: 800 },
          },
        ],
      },
    ],
    body: { items: [{ date: "2026-09-01", weightKg: 70 }] },
    settings: { unit: "lb", timeZone: "Asia/Shanghai" },
  };
  const input = { format: "movemate", payload: root };
  let preview = await transfer.previewTransfer(other, input);
  assert.deepEqual(preview.missing, []);
  const choices = Object.fromEntries(
    preview.conflicts.map((x: any) => [x.key, "apply"]),
  );
  const op = {
    ...input,
    choices,
    batchId: randomUUID(),
    part: 0,
    total: 1,
    manifest: [gym.digest(root)],
    previewHash: preview.previewHash,
  };
  let r = await transfer.commitTransfer(other, op);
  assert.equal(r.cursor, 1);
  assert.equal(r.xp, 0);
  assert.deepEqual(await transfer.commitTransfer(other, op), r);
  const imported = (await gym.listWorkouts(other)).find(
    (w: any) => w.name === "历史",
  );
  assert.equal(imported.session, null);
  assert.equal(imported.sets[0].inputMode, "manual");
  assert.deepEqual(imported.sets[0].score, {});
  assert.equal(imported.sets[0].notes, "恢复备注");
  assert.equal(imported.sets[0].effort.value, 7);
  assert.notEqual(imported.sets[0].exercise.id, c.id);
  const ownPlan = (await gym.plans(other)).items.find(
    (x: any) => x.name === "迁移计划",
  );
  assert.equal(
    ownPlan.routines[0].exercises[0].exerciseId,
    imported.sets[0].exercise.id,
  );
  assert.equal((await transfer.previewTransfer(other, input)).duplicates, 5);
  await assert.rejects(transfer.commitTransfer(owner, op), /不属于/);
  assert.equal((await gym.exportData(owner)).version, 2);
});
test("transfer refuses unknown mappings, unconfirmed conflicts, changed preview and out of order parts", async () => {
  const transfer = require("../src/gym/transfer");
  const root = {
    format: "movemate-gym",
    version: 2,
    workouts: [
      {
        name: "未知历史",
        createdAt: "2026-08-01T12:00:00Z",
        sets: [{ exerciseId: "unknown-action", reps: 5, loadKg: 0 }],
      },
    ],
  };
  let input = { format: "movemate", payload: root, mapping: {} },
    preview = await transfer.previewTransfer(other, input);
  assert.deepEqual(preview.missing, ["unknown-action"]);
  const op = {
    ...input,
    batchId: randomUUID(),
    part: 0,
    total: 1,
    manifest: [gym.digest(root)],
    previewHash: preview.previewHash,
  };
  await assert.rejects(transfer.commitTransfer(other, op), /匹配|映射/);
  const mapped = { ...input, mapping: { "unknown-action": "motion:squat" } };
  preview = await transfer.previewTransfer(other, mapped);
  await assert.rejects(
    transfer.commitTransfer(other, { ...op, ...mapped }),
    /预览/,
  );
  await transfer.commitTransfer(other, {
    ...op,
    ...mapped,
    previewHash: preview.previewHash,
  });
  const conflict = {
    format: "movemate",
    payload: {
      format: "movemate-gym",
      version: 2,
      body: { items: [{ date: "2026-09-01", weightKg: 75, waistCm: 80 }] },
    },
  };
  preview = await transfer.previewTransfer(other, conflict);
  assert.equal(preview.conflicts.length, 1);
  const b = {
    ...conflict,
    batchId: randomUUID(),
    part: 0,
    total: 1,
    manifest: [gym.digest(conflict.payload)],
    previewHash: preview.previewHash,
  };
  await assert.rejects(transfer.commitTransfer(other, b), /冲突/);
  await transfer.commitTransfer(other, {
    ...b,
    choices: { [preview.conflicts[0].key]: "copy" },
  });
  const body = (await gym.measurements(other)).items.find(
    (x: any) => x.date === "2026-09-01",
  );
  assert.equal(body.weightKg, 70);
  assert.equal(body.waistCm, 80);
  const next = {
    ...op,
    ...mapped,
    batchId: randomUUID(),
    part: 1,
    total: 2,
    manifest: [gym.digest(root), gym.digest(root)],
    previewHash: (await transfer.previewTransfer(other, mapped)).previewHash,
  };
  await assert.rejects(transfer.commitTransfer(other, next), /断点/);
});
test("online plan checkpoints cut off disconnected time and preserve completed repetitions on recovery", async () => {
  let w = await gym.startWorkout(owner, {
    id: randomUUID(),
    free: { exercises: [{ exerciseId: "motion:squat", sets: [{}] }] },
  });
  w = await act(w, "start");
  await age(w, 180);
  const last = Date.now() - 120000;
  await pool.query("UPDATE sport_sessions SET metrics=$2 WHERE id=$1", [
    w.session.id,
    JSON.stringify({ planOnlineAt: last }),
  ]);
  w = await gym.readWorkout(owner, w.id);
  assert.equal(w.phase, "paused");
  assert.ok(
    w.session.effectiveSeconds >= 59 && w.session.effectiveSeconds <= 61,
  );
  w = await act(w, "finish");
  assert.equal(w.session.xpEarned, 1);
  const end = await act(w, "finish");
  assert.equal(end.session.xpEarned, 1);
});

test("a delayed offline pause cannot close a newer page's resumed interval", async () => {
  let w = await gym.startWorkout(owner, {
    id: randomUUID(),
    free: { exercises: [{ exerciseId: "motion:squat", sets: [{}] }] },
  });
  w = await act(w, "start");
  const stale = {
    operationId: randomUUID(),
    version: w.version,
    action: "pause",
    offline: true,
  };
  w = await act(w, "heartbeat");
  await assert.rejects(gym.actWorkout(owner, w.id, stale), /其他页面/);
  assert.equal((await gym.readWorkout(owner, w.id)).phase, "working");
  w = await act(w, "finish");
});
