import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { editWorkout } from "./editing";
import {saveSettings} from "./preferences";
import { pool, withTransaction, afterCommit } from "../db";
import * as motion from "../services/motion.service";
import { pushToUser, broadcastToGame } from "../websocket/notification.handler";
import {
  InvalidStateError,
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from "../utils/errors";
import {
  exercises,
  planSchema,
  setSchema,
  templates,
  json,
  type Plan,
  type Exercise,
} from "./model";

const now = () => new Date().toISOString();
const digest = (value: any) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const notify = (uid: number) =>
  afterCommit(() =>
    pushToUser(uid, {
      id: 0,
      type: "motion_changed",
      title: "",
      content: "",
      gameId: null,
      createdAt: now(),
    }),
  );
async function owned(
  table: "gym_plans" | "gym_workouts",
  id: string,
  uid: number,
) {
  const row = (
    await pool.query(`SELECT * FROM ${table} WHERE id=$1 AND user_id=$2`, [
      id,
      uid,
    ])
  ).rows[0];
  if (!row) throw new NotFoundError("记录不存在");
  return row;
}
export async function allExercises(uid: number): Promise<Exercise[]> {
  return [
    ...exercises,
    ...(
      await pool.query("SELECT data FROM gym_exercises WHERE user_id=$1", [uid])
    ).rows.map((r) => json(r.data)),
  ];
}
export async function library(uid: number, query: any) {
  const list = await allExercises(uid),
    favorite = new Set(
      (
        await pool.query(
          "SELECT exercise_id FROM gym_favorites WHERE user_id=$1",
          [uid],
        )
      ).rows.map((r) => r.exercise_id),
    );
  const wanted = query.ids
    ? new Set(String(query.ids).split(",").slice(0, 500))
    : null;
  const q = String(query.q || "")
      .toLowerCase()
      .trim(),
    cursor = Math.max(0, Number(query.cursor) || 0),
    limit = Math.min(wanted ? 500 : 50, Math.max(1, Number(query.limit) || 24));
  const result = list.filter(
    (e) =>
      (!wanted || wanted.has(e.id)) &&
      (!q ||
        [e.name, e.nameZh, ...e.instructions]
          .join(" ")
          .toLowerCase()
          .includes(q)) &&
      (!query.muscle ||
        e.bodyPart === query.muscle ||
        e.target === query.muscle) &&
      (!query.equipment || e.equipment === query.equipment) &&
      (!query.category || e.category === query.category) &&
      (!query.favorite || favorite.has(e.id)),
  );
  return {
    items: result
      .slice(cursor, cursor + limit)
      .map((e) => ({ ...e, favorite: favorite.has(e.id) })),
    total: result.length,
    next: cursor + limit < result.length ? cursor + limit : null,
    muscles: [...new Set(list.map((e) => e.bodyPart))],
    equipment: [...new Set(list.map((e) => e.equipment))],
    categories: [...new Set(list.map((e) => e.category))],
  };
}
export async function saveExercise(uid: number, data: any) {
  const e = z
    .object({
      nameZh: z.string().trim().min(1).max(80),
      bodyPart: z.string().min(1).max(40),
      equipment: z.string().min(1).max(40),
      target: z.string().max(40),
      instructions: z.array(z.string().min(1).max(500)).min(1).max(12),
      category: z.enum(["strength", "cardio", "timed"]).default("strength"),
    })
    .parse(data);
  const id = "user:" + uid + ":" + randomUUID();
  await pool.query(
    "INSERT INTO gym_exercises(id,user_id,data) VALUES($1,$2,$3)",
    [
      id,
      uid,
      JSON.stringify({ ...e, id, name: e.nameZh, secondaryMuscles: [] }),
    ],
  );
  return { id, ...e };
}
export async function favorite(uid: number, id: string, enabled: boolean) {
  if (!(await allExercises(uid)).some((e) => e.id === id))
    throw new NotFoundError("动作不存在");
  await pool.query(
    enabled
      ? "INSERT INTO gym_favorites(user_id,exercise_id) VALUES($1,$2) ON CONFLICT DO NOTHING"
      : "DELETE FROM gym_favorites WHERE user_id=$1 AND exercise_id=$2",
    [uid, id],
  );
  return { enabled };
}
export async function plans(uid: number) {
  return {
    items: (
      await pool.query(
        "SELECT * FROM gym_plans WHERE user_id=$1 ORDER BY created_at DESC",
        [uid],
      )
    ).rows.map((r) => ({ id: r.id, version: r.version, ...json(r.data) })),
    templates: templates(),
  };
}
export async function savePlan(uid: number, input: any, id?: string) {
  return withTransaction(async () => {
    const data = planSchema.parse(input);
    if (data.rotationCursor >= data.routines.length)
      throw new ValidationError("循环训练日超出计划范围");
    if (data.progression.minReps > data.progression.maxReps)
      throw new ValidationError("进阶最低次数不能大于次数上限");
    if (new Set(data.routines.map((r) => r.id)).size !== data.routines.length)
      throw new ValidationError("训练日ID重复");
    if (
      data.routines.reduce(
        (n, r) => n + r.exercises.reduce((m, e) => m + e.sets.length, 0),
        0,
      ) > 500
    )
      throw new ValidationError("每个计划最多500组");
    const ids = new Set((await allExercises(uid)).map((e) => e.id));
    if (
      data.routines.some((r) => r.exercises.some((e) => !ids.has(e.exerciseId)))
    )
      throw new ValidationError("计划包含不存在或无权访问的动作");
    if (id) {
      const old = await owned("gym_plans", id, uid);
      if (input.version !== old.version)
        throw new InvalidStateError("计划已在其他页面更新，请重新读取");
      await pool.query(
        "UPDATE gym_plans SET data=$2,version=version+1 WHERE id=$1",
        [id, JSON.stringify(data)],
      );
      return { id, version: old.version + 1, ...data };
    }
    const key = randomUUID();
    await pool.query(
      "INSERT INTO gym_plans(id,user_id,data,created_at) VALUES($1,$2,$3,$4)",
      [key, uid, JSON.stringify(data), now()],
    );
    return { id: key, version: 1, ...data };
  });
}
export async function removePlan(uid: number, id: string) {
  await owned("gym_plans", id, uid);
  await pool.query("DELETE FROM gym_plans WHERE id=$1", [id]);
  return { deleted: true };
}
export async function gamePlan(uid: number, gameId: number) {
  const game = (await pool.query("SELECT * FROM games WHERE id=$1", [gameId]))
    .rows[0];
  if (!game) throw new NotFoundError("活动不存在");
  return {
    gameId,
    snapshot: json(
      (
        await pool.query(
          "SELECT snapshot FROM gym_game_plans WHERE game_id=$1",
          [gameId],
        )
      ).rows[0]?.snapshot || "null",
    ),
    canEdit:
      Number(game.host_id) === uid &&
      ["recruiting", "full", "ready"].includes(game.status),
  };
}
export async function attachPlan(
  uid: number,
  gameId: number,
  planId: string,
  routineId: string,
) {
  return withTransaction(async () => {
    const game = (await pool.query("SELECT * FROM games WHERE id=$1", [gameId]))
      .rows[0];
    if (!game || Number(game.host_id) !== uid) throw new ForbiddenError();
    if (
      game.sport_type !== "fitness" ||
      !["recruiting", "full", "ready"].includes(game.status)
    )
      throw new InvalidStateError("健身活动开始前才能附训练计划");
    const plan = json<Plan>((await owned("gym_plans", planId, uid)).data),
      routine = plan.routines.find((r) => r.id === routineId);
    if (!routine) throw new NotFoundError("训练日不存在");
    // Share targets, never personal history or previous weights.
    const snapshot = await snapshotRoutine(uid, plan.name, {
      ...routine,
      exercises: routine.exercises.map((e) => ({
        ...e,
        sets: e.sets.map((s) => ({ ...s, loadKg: 0 })),
      })),
    });
    await pool.query(
      "INSERT INTO gym_game_plans(game_id,snapshot) VALUES($1,$2) ON CONFLICT(game_id) DO UPDATE SET snapshot=$2",
      [gameId, JSON.stringify(snapshot)],
    );
    afterCommit(() =>
      broadcastToGame(gameId, "game_update", {
        gameId,
        changes: { trainingPlan: true },
      }),
    );
    return { gameId, snapshot };
  });
}
async function snapshotRoutine(
  uid: number,
  name: string,
  routine: Plan["routines"][number],
) {
  const map = new Map((await allExercises(uid)).map((e) => [e.id, e]));
  const entries = routine.exercises.map((entry, exerciseIndex) =>
    entry.sets.map((set, setIndex) => {
      const e = map.get(entry.exerciseId);
      if (!e) throw new ValidationError("动作不存在");
      return { ...set, exercise: e, exerciseIndex, setIndex };
    }),
  );
  const sets: Array<
    (typeof entries)[number][number] & { supersetRound?: number }
  > = [];
  for (let i = 0; i < entries.length; i++) {
    const tag = entries[i].find((s) => s.kind !== "warmup")?.superset,
      group = [entries[i]];
    if (
      tag &&
      entries[i].every((s) => s.kind === "warmup" || s.superset === tag)
    ) {
      while (
        i + 1 < entries.length &&
        entries[i + 1].every((s) => s.kind === "warmup" || s.superset === tag)
      ) {
        group.push(entries[++i]);
      }
    }
    if (group.length > 1) {
      for (const g of group) sets.push(...g.filter((s) => s.kind === "warmup"));
      const work = group.map((g) => g.filter((s) => s.kind !== "warmup"));
      for (
        let round = 0;
        round < Math.max(...work.map((g) => g.length));
        round++
      )
        for (const g of work)
          if (g[round]) sets.push({ ...g[round], supersetRound: round });
    } else sets.push(...group[0]);
  }
  return { name: name + " · " + routine.name, routineId: routine.id, sets };
}
export async function workout(uid: number, id: string) {
  const w = await owned("gym_workouts", id, uid);
  const s = w.sport_session_id
    ? (
        await pool.query("SELECT * FROM sport_sessions WHERE id=$1", [
          w.sport_session_id,
        ])
      ).rows[0]
    : null;
  const sets = (
    await pool.query(
      "SELECT * FROM gym_sets WHERE workout_id=$1 ORDER BY position",
      [id],
    )
  ).rows.map((r) => ({
    ...json(r.data),
    id: r.id,
    targetReps: json(r.data).reps,
    targetSeconds: json(r.data).seconds,
    status: r.status,
    reps: r.reps,
    loadKg: r.load_g / 1000,
    seconds: r.seconds,
    inputMode: r.input_mode,
    score: json(r.score),
  }));
  const previous = (
    await pool.query(
      "SELECT g.data,g.reps,g.load_g FROM gym_sets g JOIN gym_workouts w ON w.id=g.workout_id WHERE w.user_id=$1 AND w.id!=$2 AND g.status='completed' ORDER BY w.created_at DESC LIMIT 300",
      [uid, id],
    )
  ).rows;
  const best: Record<string, any> = {};
  for (const p of previous) {
    const d = json(p.data);
    if (!best[d.exercise.id])
      best[d.exercise.id] = { reps: p.reps, loadKg: p.load_g / 1000 };
  }
  return {
    id: w.id,
    planId: w.plan_id,
    version: w.version,
    name: json(w.snapshot).name,
    routineId: json(w.snapshot).routineId,
    phase: s?.status === "finished" ? "finished" : w.phase,
    cursor: w.cursor,
    restUntil: w.rest_until,
    createdAt: w.created_at,
    setElapsedSeconds:
      (sets[w.cursor]?.seconds || 0) +
      (s?.status === "running" && s.active_since
        ? Math.max(
            0,
            Math.floor((Date.now() - Date.parse(s.active_since)) / 1000),
          )
        : 0),
    imported: !s,
    sets,
    previous: best,
    session: s ? { ...motion.sessionView(s), workoutId: w.id } : null,
  };
}
// Bulk reads keep analytics/export independent of the number of workouts (no per-record queries).
export async function listWorkouts(uid: number) {
  const rows = (
    await pool.query(
      "SELECT * FROM gym_workouts WHERE user_id=$1 ORDER BY created_at DESC",
      [uid],
    )
  ).rows;
  const sessions = new Map(
    (
      await pool.query("SELECT * FROM sport_sessions WHERE user_id=$1", [uid])
    ).rows.map((r) => [r.id, r]),
  );
  const all = (
    await pool.query(
      "SELECT g.* FROM gym_sets g JOIN gym_workouts w ON g.workout_id=w.id WHERE w.user_id=$1 ORDER BY g.position",
      [uid],
    )
  ).rows;
  const grouped = new Map<string, any[]>();
  for (const r of all) {
    const group = grouped.get(r.workout_id) || [];
    group.push({
      ...json(r.data),
      id: r.id,
      targetReps: json(r.data).reps,
      targetSeconds: json(r.data).seconds,
      status: r.status,
      reps: r.reps,
      loadKg: r.load_g / 1000,
      seconds: r.seconds,
      inputMode: r.input_mode,
      score: json(r.score),
    });
    grouped.set(r.workout_id, group);
  }
  return rows.map((w) => {
    const s = sessions.get(w.sport_session_id);
    return {
      id: w.id,
      planId: w.plan_id,
      routineId: json(w.snapshot).routineId,
      version: w.version,
      name: json(w.snapshot).name,
      phase: s?.status === "finished" ? "finished" : w.phase,
      cursor: w.cursor,
      restUntil: w.rest_until,
      createdAt: w.created_at,
      imported: !s,
      sets: grouped.get(w.id) || [],
      previous: {},
      session: s ? { ...motion.sessionView(s), workoutId: w.id } : null,
    };
  });
}
export async function startWorkout(uid: number, input: any) {
  return withTransaction(async () => {
    const data = z
      .object({
        id: z.string().min(1).max(80),
        planId: z.string().optional(),
        routineId: z.string().optional(),
        gameId: z.number().int().positive().optional(),
        free: z.object({name:z.string().min(1).max(80).default("自由训练"), exercises:planSchema.shape.routines.element.shape.exercises}).optional(),
      })
      .parse(input);
    const duplicate = (
      await pool.query("SELECT * FROM gym_workouts WHERE id=$1", [data.id])
    ).rows[0];
    if (duplicate) {
      if (duplicate.user_id !== uid) throw new ForbiddenError();
      const old = await workout(uid, data.id);
      if (
        old.planId !== (data.planId || null) ||
        (data.routineId && old.routineId !== data.routineId) ||
        (old.session?.gameId || null) !== (data.gameId || null)
      )
        throw new InvalidStateError("训练动作与来源不可更改");
      if(data.free && json(duplicate.snapshot).creationDigest!==digest(data.free)) throw new InvalidStateError("创建请求内容已改变");
      return old;
    }
    let snapshot: any,
      planId = data.planId || null;
    if (data.gameId) {
      snapshot = (await gamePlan(uid, data.gameId)).snapshot;
      if (!snapshot) throw new NotFoundError("活动尚未附计划");
      planId = null;
    } else if (data.free) {
      snapshot=await snapshotRoutine(uid,data.free.name,{id:"free",name:"自由安排",weekdays:[],exercises:data.free.exercises});
      snapshot.creationDigest=digest(data.free);
    } else {
      const p = json<Plan>(
        (await owned("gym_plans", data.planId || "", uid)).data,
      );
      const r = p.routines.find((r) => r.id === data.routineId);
      if (!r) throw new NotFoundError("训练日不存在");
      snapshot = await snapshotRoutine(uid, p.name, r);
    }
    const parent = await motion.createSession(uid, {
      id: "gym:" + data.id,
      sportType: "fitness",
      source: "timer",
      gameId: data.gameId,
    });
    await motion.sessionAction(parent.id, uid, "pause", {}, true);
    await pool.query(
      "INSERT INTO gym_workouts(id,user_id,sport_session_id,plan_id,snapshot,created_at) VALUES($1,$2,$3,$4,$5,$6)",
      [data.id, uid, parent.id, planId, JSON.stringify(snapshot), now()],
    );
    for (let i = 0; i < snapshot.sets.length; i++) {
      const set = snapshot.sets[i];
      await pool.query(
        "INSERT INTO gym_sets(id,workout_id,position,data,load_g) VALUES($1,$2,$3,$4,$5)",
        [
          randomUUID(),
          data.id,
          i,
          JSON.stringify(set),
          Math.round(set.loadKg * 1000),
        ],
      );
    }
    notify(uid);
    return workout(uid, data.id);
  });
}
const actionSchema = z.object({
  operationId: z.string().min(1).max(80),
  version: z.number().int().positive(),
  action: z.enum([
    "start",
    "progress",
    "complete",
    "skip",
    "pause",
    "resume",
    "finish",
    "manual",
    "edit",
    "rest",
  ]),
  setId: z.string().optional(),
  edit: z.unknown().optional(),
  restDelta: z.number().int().min(-900).max(900).optional(),
  restSkip: z.boolean().optional(),
  effort: z.object({kind:z.enum(["rpe","rir"]),value:z.number().min(0).max(10)}).nullable().optional(),
  notes: z.string().max(500).optional(),
  inputMode: z.enum(["manual", "camera"]).optional(),
  reps: z.number().int().min(0).max(100000).optional(),
  loadKg: z.number().min(0).max(1000).optional(),
  seconds: z.number().int().min(0).max(7200).optional(),
  score: z
    .object({
      count: z.number().int().min(0).max(100000),
      total: z.number().min(0),
      depth: z.number().min(0),
      stability: z.number().min(0),
      trunk: z.number().min(0),
      symmetry: z.number().min(0),
    })
    .optional(),
});
export async function actWorkout(uid: number, id: string, input: any) {
  return withTransaction(async () => {
    const data = actionSchema.parse(input),
      w = await owned("gym_workouts", id, uid),
      payload = digest(data);
    const seen = (
      await pool.query(
        "SELECT payload FROM gym_operations WHERE workout_id=$1 AND operation_id=$2",
        [id, data.operationId],
      )
    ).rows[0];
    if (seen) {
      if (seen.payload !== payload)
        throw new InvalidStateError("操作ID已被其他内容使用");
      return workout(uid, id);
    }
    const current = await workout(uid, id);
    if (!current.session) throw new InvalidStateError("导入记录只能编辑历史");
    if (current.phase === "finished") {
      if (data.action === "finish") return current;
      throw new InvalidStateError("训练已结束，请编辑历史");
    }
    if (data.version !== w.version)
      throw new InvalidStateError("训练已在其他页面更新，请重新读取后重试");
    const set = current.sets[w.cursor],
      setRow = set
        ? (await pool.query("SELECT * FROM gym_sets WHERE id=$1", [set.id]))
            .rows[0]
        : null;
    if (data.setId && set?.id !== data.setId)
      throw new InvalidStateError("当前训练组已经改变");
    const parent = (
      await pool.query("SELECT * FROM sport_sessions WHERE id=$1", [
        w.sport_session_id,
      ])
    ).rows[0];
    // Each pause closes only this set's open interval; completed and rest periods never accrue time.
    const seconds =
      parent.status === "running" && parent.active_since
        ? Math.max(
            0,
            Math.floor((Date.now() - Date.parse(parent.active_since)) / 1000),
          )
        : 0;
    const pause = async () => {
      if (parent.status === "running") {
        await motion.sessionAction(parent.id, uid, "pause", {}, true);
        if (setRow)
          await pool.query(
            "UPDATE gym_sets SET seconds=seconds+$2 WHERE id=$1",
            [set.id, seconds],
          );
      }
    };
    const update = async () => {
      if (!setRow) return;
      if(data.effort!==undefined || data.notes!==undefined) await pool.query("UPDATE gym_sets SET data=$2 WHERE id=$1",[set.id,JSON.stringify({...json(setRow.data),...(data.effort!==undefined?{effort:data.effort}:{}),...(data.notes!==undefined?{notes:data.notes}:{})})]);
      const mode =
        data.action === "manual"
          ? set.inputMode === "camera"
            ? "mixed"
            : set.inputMode
          : set.inputMode;
      if (
        data.score &&
        data.action !== "manual" &&
        (mode !== "camera" ||
          data.score.count !== (data.reps ?? set.reps) ||
          Object.values(data.score).some((n) => n > data.score!.count * 100))
      )
        throw new ValidationError("识别评分与次数不一致");
      const reps =
        mode === "camera"
          ? Math.max(set.reps, data.reps ?? set.reps)
          : (data.reps ?? set.reps);
      const stale =
        mode === "camera" && data.reps != null && data.reps < set.reps;
      await pool.query(
        "UPDATE gym_sets SET reps=$2,load_g=$3,input_mode=$4,score=$5 WHERE id=$1",
        [
          set.id,
          reps,
          Math.round((data.loadKg ?? set.loadKg) * 1000),
          mode,
          mode === "camera"
            ? JSON.stringify(stale ? set.score : (data.score ?? set.score))
            : "{}",
        ],
      );
    };
    if(data.action === "edit") {
      await editWorkout(w,current,data.edit,await allExercises(uid));
    } else if(data.action === "rest") {
      if(w.phase!=="resting") throw new InvalidStateError("当前不在组间休息");
      const left=Math.max(0,Math.ceil((Date.parse(w.rest_until||now())-Date.now())/1000));
      const next=data.restSkip?0:Math.min(900,Math.max(0,left+(data.restDelta||0)));
      await pool.query("UPDATE gym_workouts SET rest_until=$2 WHERE id=$1",[id,new Date(Date.now()+next*1000).toISOString()]);
    } else if (data.action === "start") {
      if (!set || !["ready", "resting"].includes(w.phase))
        throw new InvalidStateError("请先完成或恢复当前组");
      const mode = data.inputMode || "manual";
      if (
        mode === "camera" &&
        (!set.exercise.cameraType ||
          set.targetSeconds > 0 ||
          set.side !== "both")
      )
        throw new ValidationError("该动作或计时组不支持摄像头记组");
      await motion.sessionAction(parent.id, uid, "resume", {}, true);
      await pool.query(
        "UPDATE gym_sets SET status='working',input_mode=$2 WHERE id=$1",
        [set.id, mode],
      );
      await pool.query(
        "UPDATE gym_workouts SET phase='working',rest_until=NULL WHERE id=$1",
        [id],
      );
    } else if (
      ["progress", "complete", "pause", "manual", "skip", "resume"].includes(
        data.action,
      )
    ) {
      if (!set) throw new InvalidStateError("全部组已完成，请结束训练");
      if (data.action === "resume") {
        if (w.phase !== "paused")
          throw new InvalidStateError("当前训练没有暂停");
        await motion.sessionAction(parent.id, uid, "resume", {}, true);
        await pool.query("UPDATE gym_sets SET status='working' WHERE id=$1", [
          set.id,
        ]);
        await pool.query(
          "UPDATE gym_workouts SET phase='working' WHERE id=$1",
          [id],
        );
      } else {
        if (data.action === "progress" && w.phase !== "working")
          throw new InvalidStateError("运动中才能同步次数");
        await update();
        if (data.action !== "progress") await pause();
        if (data.action === "pause" || data.action === "manual") {
          if (!["working", "paused"].includes(w.phase))
            throw new InvalidStateError("尚未开始本组");
          await pool.query(
            "UPDATE gym_workouts SET phase='paused' WHERE id=$1",
            [id],
          );
        }
        if (["complete", "skip"].includes(data.action)) {
          if (
            data.action === "complete" &&
            !["working", "paused"].includes(w.phase)
          )
            throw new InvalidStateError("请先开始本组");
          await pool.query("UPDATE gym_sets SET status=$2 WHERE id=$1", [
            set.id,
            data.action === "skip" ? "skipped" : "completed",
          ]);
          const nextIndex=current.sets.findIndex((s:any,i:number)=>i>w.cursor && s.status==="pending");
          const next = current.sets[nextIndex],
            rest =
              next &&
              set.superset &&
              set.superset === next.superset &&
              (set.supersetRound != null
                ? next.supersetRound === set.supersetRound
                : next.setIndex === set.setIndex)
                ? 0
                : set.restSec;
          await pool.query(
            "UPDATE gym_workouts SET phase='resting',cursor=$3,rest_until=$2 WHERE id=$1",
            [id, new Date(Date.now() + rest * 1000).toISOString(),nextIndex<0?current.sets.length:nextIndex],
          );
        }
      }
    } else if (data.action === "finish") {
      await update();
      await pause();
      if (setRow && setRow.status === "working")
        await pool.query("UPDATE gym_sets SET status='completed' WHERE id=$1", [
          set.id,
        ]);
      const rows = (
        await pool.query(
          "SELECT data,reps,input_mode,score,status FROM gym_sets WHERE workout_id=$1",
          [id],
        )
      ).rows;
      const recognized = rows.filter(
          (r) => r.status === "completed" && r.input_mode === "camera",
        ),
        count = recognized.reduce((n, r) => n + (json(r.score).count || 0), 0),
        total = recognized.reduce((n, r) => n + (json(r.score).total || 0), 0);
      const squatReps = recognized
        .filter((r) => json(r.data).exercise.cameraType === "squat")
        .reduce((n, r) => n + r.reps, 0);
      await motion.sessionAction(
        parent.id,
        uid,
        "finish",
        {
          formScore: count ? Math.round(total / count) : 0,
          planSquatReps: squatReps,
        },
        true,
      );
      await pool.query(
        "UPDATE gym_workouts SET phase='finished',rest_until=NULL WHERE id=$1",
        [id],
      );
      if (w.plan_id) {
        const planRow = (
          await pool.query(
            "SELECT * FROM gym_plans WHERE id=$1 AND user_id=$2",
            [w.plan_id, uid],
          )
        ).rows[0];
        if (planRow) {
          const p = json<Plan>(planRow.data);
          if (p.mode === "rotation" && p.routines[p.rotationCursor % p.routines.length]?.id === current.routineId && rows.every((r:any)=>["completed","removed"].includes(r.status))) {
            p.rotationCursor = (p.rotationCursor + 1) % p.routines.length;
            await pool.query(
              "UPDATE gym_plans SET data=$2,version=version+1 WHERE id=$1",
              [w.plan_id, JSON.stringify(p)],
            );
          }
        }
      }
    }
    await pool.query("UPDATE gym_workouts SET version=version+1 WHERE id=$1", [
      id,
    ]);
    await pool.query(
      "INSERT INTO gym_operations(workout_id,operation_id,payload) VALUES($1,$2,$3)",
      [id, data.operationId, payload],
    );
    return workout(uid, id);
  });
}
export async function editHistory(uid: number, id: string, input: any) {
  return withTransaction(async () => {
    const w = await workout(uid, id);
    if (w.phase !== "finished") throw new InvalidStateError("请先结束训练");
    if (input.version !== w.version)
      throw new InvalidStateError("记录已更新，请重新读取");
    const updates = z
      .array(
        z.object({
          id: z.string(),
          reps: z.number().int().min(0).max(100000),
          loadKg: z.number().min(0).max(1000),
        }),
      )
      .max(500)
      .parse(input.sets);
    for (const s of updates) {
      if (!w.sets.some((x) => x.id === s.id)) throw new ForbiddenError();
      await pool.query(
        "UPDATE gym_sets SET reps=$2,load_g=$3,input_mode='manual',score='{}' WHERE id=$1",
        [s.id, s.reps, Math.round(s.loadKg * 1000)],
      );
    }
    // Original sport session, recognized-growth snapshot and XP ledger remain immutable.
    await pool.query("UPDATE gym_workouts SET version=version+1 WHERE id=$1", [
      id,
    ]);
    return workout(uid, id);
  });
}
export async function measurements(uid: number) {
  return {
    items: (
      await pool.query(
        "SELECT date,data FROM gym_measurements WHERE user_id=$1 ORDER BY date",
        [uid],
      )
    ).rows.map((r) => ({ date: r.date, ...json(r.data) })),
    settings: json(
      (
        await pool.query("SELECT data FROM gym_settings WHERE user_id=$1", [
          uid,
        ])
      ).rows[0]?.data || "{}",
    ),
  };
}
export async function saveMeasurement(uid: number, input: any) {
  const data = z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      weightKg: z.number().min(1).max(700).optional(),
      waistCm: z.number().min(1).max(400).optional(),
      chestCm: z.number().min(1).max(400).optional(),
      hipCm: z.number().min(1).max(400).optional(),
      goalKg: z.number().min(1).max(700).optional(),
    })
    .refine((d) => Object.keys(d).length > 1, "请填写记录")
    .parse(input);
  if (
    !Number.isFinite(Date.parse(data.date + "T12:00:00Z")) ||
    new Date(data.date + "T12:00:00Z").toISOString().slice(0, 10) !== data.date
  )
    throw new ValidationError("日期无效");
  await withTransaction(async () => {
    const old = (
      await pool.query(
        "SELECT data FROM gym_measurements WHERE user_id=$1 AND date=$2",
        [uid, data.date],
      )
    ).rows[0];
    await pool.query(
      "INSERT INTO gym_measurements(user_id,date,data) VALUES($1,$2,$3) ON CONFLICT(user_id,date) DO UPDATE SET data=$3",
      [uid, data.date, JSON.stringify({ ...json(old?.data || "{}"), ...data })],
    );
    if (data.goalKg) await saveSettings(uid,{goalKg:data.goalKg});
  });
  return measurements(uid);
}
export async function analytics(uid: number) {
  const workouts = (await listWorkouts(uid)).filter(
      (w) => w.phase === "finished",
    ),
    muscles: Record<string, any> = {},
    records: Record<string, any> = {},
    days: Record<string, number> = {},
    months: Record<string, number> = {},
    weeks: Record<string, number> = {};
  let volume = 0,
    reps = 0,
    sets = 0;
  for (const w of workouts) {
    const date = w.createdAt.slice(0, 10),
      d = new Date(date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const week = d.toISOString().slice(0, 10);
    days[date] = (days[date] || 0) + 1;
    for (const s of w.sets.filter(
      (s) => s.status === "completed" && s.kind !== "warmup",
    )) {
      const v = s.loadKg * s.reps * (s.side === "each" ? 2 : 1),
        count = s.reps * (s.side === "each" ? 2 : 1);
      volume += v;
      reps += count;
      sets++;
      const m = s.exercise.bodyPart;
      if (Date.parse(w.createdAt) >= Date.now() - 30 * 86400000) {
        muscles[m] ||= { sets: 0, lastAt: w.createdAt };
        muscles[m].sets++;
      }
      if (!records[s.exercise.id])
        records[s.exercise.id] = {
          name: s.exercise.nameZh,
          loadKg: 0,
          reps: 0,
          volume: 0,
        };
      const r = records[s.exercise.id];
      r.loadKg = Math.max(r.loadKg, s.loadKg);
      r.reps = Math.max(r.reps, count);
      r.volume = Math.max(r.volume, v);
      months[date.slice(0, 7)] = (months[date.slice(0, 7)] || 0) + v;
      weeks[week] = (weeks[week] || 0) + v;
    }
  }
  const sorted = (r: Record<string, number>) =>
    Object.fromEntries(
      Object.entries(r).sort(([a], [b]) => a.localeCompare(b)),
    );
  return {
    workouts: workouts.length,
    volume: Math.round(volume * 10) / 10,
    reps,
    sets,
    muscles,
    records: Object.values(records),
    days,
    months: sorted(months),
    weeks: sorted(weeks),
  };
}
export async function progression(uid: number, id: string) {
  const p = json<Plan>((await owned("gym_plans", id, uid)).data);
  if (p.progression.mode === "off")
    return { plan: p, suggestions: [], reason: "进阶规则尚未开启" };
  const history = (await listWorkouts(uid)).filter(
      (w) => w.phase === "finished" && w.planId === id && !w.imported,
    ),
    suggestions: any[] = [];
  for (const routine of p.routines)
    for (const [entryIndex, entry] of routine.exercises.entries()) {
      const last = history.find((w) => w.routineId === routine.id);
      if (!last) continue;
      const target = entry.sets.filter((s) => s.kind !== "warmup"),
        done = last.sets.filter(
          (s) =>
            s.exercise.id === entry.exerciseId &&
            s.exerciseIndex === entryIndex &&
            s.kind !== "warmup",
        );
      if (
        !target.length ||
        done.length !== target.length ||
        done.some(
          (s, i) =>
            s.status !== "completed" ||
            s.reps < target[i].reps ||
            s.loadKg < target[i].loadKg,
        ) ||
        target.some((s) => s.seconds > 0)
      )
        continue;
      if (
        p.progression.mode === "triple" &&
        target.every((s) => s.reps >= p.progression.maxReps) &&
        target.length < p.progression.maxSets &&
        entry.sets.length < 20
      ) {
        const added = { ...target[target.length - 1] };
        entry.sets.push(added);
        suggestions.push({
          exerciseId: entry.exerciseId,
          before: { loadKg: added.loadKg, reps: added.reps },
          after: { ...added },
          reason: "增加一组",
        });
        continue;
      }
      for (const set of target) {
        const before = { ...set };
        if (p.progression.mode === "linear") {
          set.loadKg = Math.min(1000, set.loadKg + p.progression.incrementKg);
        } else if (set.reps < p.progression.maxReps) {
          set.reps++;
        } else {
          set.loadKg = Math.min(1000, set.loadKg + p.progression.incrementKg);
          set.reps = p.progression.minReps;
        }
        suggestions.push({
          exerciseId: entry.exerciseId,
          before,
          after: { ...set },
          reason: "上次达到全部目标；确认后才应用",
        });
      }
    }
  return { plan: p, suggestions };
}
export async function exportData(uid: number) {
  return {
    format: "movemate-gym",
    version: 1,
    exportedAt: now(),
    plans: (await plans(uid)).items,
    customExercises: (
      await pool.query("SELECT data FROM gym_exercises WHERE user_id=$1", [uid])
    ).rows.map((r) => json(r.data)),
    workouts: await listWorkouts(uid),
    body: await measurements(uid),
  };
}
export { digest };

export async function saveWorkoutPlan(uid:number,id:string,input:any){
 const w=await workout(uid,id);
 if(w.phase!=="finished") throw new InvalidStateError("结束后才能另存新计划");
 const exercises:any[]=[];
 for(const s of w.sets.filter((s:any)=>s.status!=="removed")){
  const last=exercises[exercises.length-1];
  const target=setSchema.parse({...s,reps:s.targetReps,seconds:s.targetSeconds,loadKg:s.loadKg});
  if(last?.exerciseId===s.exercise.id && last.sets.length<20) last.sets.push(target);
  else exercises.push({exerciseId:s.exercise.id,sets:[target]});
 }
 return savePlan(uid,{name:z.string().trim().min(1).max(80).parse(input.name),routines:[{id:randomUUID(),name:"训练日 A",weekdays:[],exercises}]});
}
