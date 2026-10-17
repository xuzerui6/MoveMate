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

test("free workout structural changes preserve IDs, effort, idempotence and unique XP",async()=>{
 let w=await gym.startWorkout(owner,{id:randomUUID(),free:{exercises:[{exerciseId:"motion:squat",sets:[{reps:10}]}]}});
 const first=w.sets[0].id;
 w=await act(w,"edit",{edit:{kind:"copy",targetId:first}});const copied=w.sets[1].id;
 w=await act(w,"edit",{edit:{kind:"remove",targetId:first}});assert.equal(w.sets[w.cursor].id,copied);
 w=await act(w,"edit",{edit:{kind:"undo",targetId:first}});assert.equal(w.sets.filter((s:any)=>s.status==="pending").length,2);
 w=await act(w,"start");
 await assert.rejects(act(w,"edit",{edit:{kind:"replace",targetId:first,exerciseId:"motion:jumping_jack"}}),/当前组/);
 w=await act(w,"pause",{reps:6,effort:{kind:"rpe",value:7},notes:"备注"});assert.equal(w.sets[w.cursor].effort.value,7);
 w=await act(w,"complete",{reps:6});const elapsed=w.session.effectiveSeconds;
 w=await act(w,"rest",{restDelta:15});w=await act(w,"rest",{restSkip:true});assert.equal(w.session.effectiveSeconds,elapsed);
 const op={operationId:randomUUID(),version:w.version,action:"edit",edit:{kind:"add",exerciseId:"motion:jumping_jack"}};
 w=await gym.actWorkout(owner,w.id,op);const count=w.sets.length;w=await gym.actWorkout(owner,w.id,op);assert.equal(w.sets.length,count);
 await assert.rejects(gym.actWorkout(owner,w.id,{...op,operationId:randomUUID()}),/其他页面/);
 w=await act(w,"finish");assert.equal(w.session.xpEarned,0);
 const p=await gym.saveWorkoutPlan(owner,w.id,{name:"另存自由训练"});assert.ok(p.id);assert.equal(w.planId,null);
 await assert.rejects(gym.saveWorkoutPlan(other,w.id,{name:"越权"}));
});
test("training preferences merge without losing account or body settings",async()=>{
 const prefs=require("../src/gym/preferences");await prefs.saveSettings(owner,{unit:"lb",effort:"rir",timeZone:"Pacific/Auckland"});
 await gym.saveMeasurement(owner,{date:"2026-10-17",weightKg:70,goalKg:68});
 assert.equal((await prefs.settings(owner)).unit,"lb");assert.equal((await prefs.settings(other)).unit,"kg");
 await assert.rejects(prefs.saveSettings(owner,{timeZone:"invalid/timezone"}));
});
