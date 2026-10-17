import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool, withTransaction } from "../db";
import { ValidationError } from "../utils/errors";
import {
  allExercises,
  digest,
  saveExercise,
  savePlan,
  saveMeasurement,
} from "./service";
import { setSchema } from "./model";

// Format adapters for user-owned exports. Independently implemented; no upstream parser code.
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new ValidationError("CSV引号没有闭合");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
const number = (value: any, fallback = 0) => {
  const n = value == null || value === "" ? fallback : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100000)
    throw new ValidationError("记录包含无效数字");
  return n;
};
function date(value: any) {
  const raw =
    typeof value === "number"
      ? value
      : String(value || "")
          .replace(/年|月/g, "-")
          .replace(/日/g, "")
          .replace(/^([0-9]{4})\//, "$1-")
          .replace(/\//g, "-");
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime()))
    throw new ValidationError("导入日期无法识别，请使用ISO日期或时间");
  return d.toISOString();
}
export function parseImport(format: string, text: string, unit = "kg"): any[] {
  if (text.length > 1800000)
    throw new ValidationError("单次文件最多1.8MB，请分批导入");
  if (format === "opengym" || format === "movemate") {
    let root: any;
    try {
      root = JSON.parse(text);
    } catch {
      throw new ValidationError("JSON格式无效");
    }
    root = root.state || root.S || root;
    const list = Array.isArray(root) ? root : root.workouts;
    if (!Array.isArray(list))
      throw new ValidationError("文件缺少workouts训练历史");
    return list.map((w: any) => ({
      name: String(w.name || w.title || w.routine || "导入训练"),
      date: date(w.createdAt || w.d || w.date || w.start),
      externalId: w.id,
      sets: w.entries
        ? w.entries.flatMap((e: any) =>
            (e.sets || [])
              .filter((s: any) => s.done !== false)
              .map((s: any) => ({
                exerciseId: e.id,
                name: e.name || e.id,
                reps: number(s.r ?? s.reps),
                loadKg:
                  number(s.w ?? s.loadKg) *
                  (root.unit === "lb" ? 0.45359237 : 1),
                seconds: number(s.sec ?? (s.min ? Number(s.min) * 60 : 0)),
                kind: s.warmup ? "warmup" : s.type === "drop" ? "drop" : "work",
              })),
          )
        : (w.sets || [])
            .filter((s: any) => !s.status || s.status === "completed")
            .map((s: any) => ({
              exerciseId: s.exercise?.id || s.exerciseId,
              name: s.exercise?.name || s.name || s.exerciseId,
              reps: number(s.reps),
              loadKg: number(s.loadKg),
              seconds: number(s.seconds),
              kind: s.kind || "work",
              effort:
                s.effort == null
                  ? null
                  : z
                      .object({
                        kind: z.enum(["rpe", "rir"]),
                        value: z.number().min(0).max(10),
                      })
                      .parse(s.effort),
              notes: z
                .string()
                .max(500)
                .parse(s.notes || ""),
              target: s.target
                ? setSchema.parse(s.target)
                : setSchema.parse({
                    ...s,
                    reps:
                      s.targetReps ??
                      Math.min(500, Math.max(1, number(s.reps))),
                    seconds: s.targetSeconds ?? number(s.seconds),
                    loadKg: number(s.loadKg),
                  }),
            })),
    }));
  }
  const [header, ...rows] = csvRows(text.replace(/^\uFEFF/, ""));
  if (!header) throw new ValidationError("CSV为空");
  const keys = header.map((h) => h.trim().toLowerCase().replace(/[ _]/g, ""));
  const by = (r: string[], ...names: string[]) => {
    for (const name of names) {
      const i = keys.indexOf(name);
      if (i >= 0 && r[i]) return r[i];
    }
    return "";
  };
  if (
    !keys.some((k) => ["exercisename", "exercisetitle", "exercise"].includes(k))
  )
    throw new ValidationError("CSV缺少动作名称列");
  const grouped = new Map<string, any>();
  for (const row of rows) {
    const d = date(by(row, "date", "starttime")),
      name = by(row, "workoutname", "title") || "导入训练",
      key = d + "|" + name;
    if (!grouped.has(key)) grouped.set(key, { name, date: d, sets: [] });
    grouped.get(key).sets.push({
      name: by(row, "exercisename", "exercisetitle", "exercise"),
      reps: number(by(row, "reps")),
      loadKg:
        number(by(row, "weightkg", "weight")) *
        (unit === "lb" && !keys.includes("weightkg") ? 0.45359237 : 1),
      seconds: number(
        by(row, "seconds", "durationseconds") ||
          (/^[\d:.]+$/.test(by(row, "time"))
            ? by(row, "time")
                .split(":")
                .reduce((n, v) => n * 60 + Number(v), 0)
            : 0),
      ),
      kind:
        by(row, "settype") === "warmup"
          ? "warmup"
          : by(row, "settype") === "dropset"
            ? "drop"
            : "work",
    });
  }
  return [...grouped.values()];
}
const inputSchema = z.object({
  format: z.enum(["opengym", "movemate", "strong", "hevy", "fitnotes"]),
  text: z.string().max(1800000),
  unit: z.enum(["kg", "lb"]).default("kg"),
  mapping: z.record(z.string()).default({}),
});
export async function previewImport(uid: number, input: any) {
  const data = inputSchema.parse(input),
    records = parseImport(data.format, data.text, data.unit);
  if (
    records.length > 100 ||
    records.reduce((n, w) => n + w.sets.length, 0) > 2000
  )
    throw new ValidationError("每批最多100次训练、2000组，请分批导入");
  if (!records.length) throw new ValidationError("文件没有训练记录");
  const library = await allExercises(uid),
    map = new Map(library.map((e) => [e.id, e])),
    missing = new Set<string>();
  const workouts = records.map((w) => ({
    ...w,
    key: digest({
      source: data.format,
      id: w.externalId || null,
      date: w.date,
      name: w.name,
      sets: w.sets.map((s: any) => ({
        exerciseId: s.exerciseId,
        name: s.name,
        reps: s.reps,
        loadKg: s.loadKg,
        seconds: s.seconds,
        kind: s.kind,
      })),
    }),
    sets: w.sets.map((s: any) => {
      const name = String(s.name || s.exerciseId || "未命名动作");
      const match =
        map.get(data.mapping[name]) ||
        map.get(s.exerciseId) ||
        map.get("exdb:" + s.exerciseId) ||
        library.find((e) =>
          [e.name, e.nameZh].some(
            (n) => n.toLowerCase() === name.toLowerCase(),
          ),
        );
      if (!match) missing.add(name);
      if (s.reps > 100000 || s.loadKg > 1000 || s.seconds > 7200)
        throw new ValidationError("导入数值超出允许范围");
      return { ...s, exercise: match || null };
    }),
  }));
  const existing = new Set(
    (
      await pool.query(
        "SELECT import_key FROM gym_workouts WHERE user_id=$1 AND import_key IS NOT NULL",
        [uid],
      )
    ).rows.map((r) => r.import_key),
  );
  return {
    workouts,
    missing: [...missing],
    count: workouts.length,
    duplicates: workouts.filter((w) => existing.has(w.key)).length,
    fingerprint: digest({ format: data.format, text: data.text }),
    xp: 0,
  };
}
export async function commitImport(uid: number, input: any) {
  return withTransaction(async () => {
    const preview = await previewImport(uid, input);
    if (preview.missing.length)
      throw new ValidationError("请先匹配全部未知动作");
    let imported = 0;
    for (const w of preview.workouts) {
      if (
        (
          await pool.query(
            "SELECT id FROM gym_workouts WHERE user_id=$1 AND import_key=$2",
            [uid, w.key],
          )
        ).rowCount
      )
        continue;
      const id = randomUUID();
      await pool.query(
        "INSERT INTO gym_workouts(id,user_id,snapshot,phase,created_at,import_key) VALUES($1,$2,$3,'finished',$4,$5)",
        [id, uid, JSON.stringify({ name: w.name }), w.date, w.key],
      );
      for (let i = 0; i < w.sets.length; i++) {
        const s = w.sets[i];
        await pool.query(
          "INSERT INTO gym_sets(id,workout_id,position,data,status,reps,load_g,seconds) VALUES($1,$2,$3,$4,'completed',$5,$6,$7)",
          [
            randomUUID(),
            id,
            i,
            JSON.stringify({
              ...setSchema.parse(
                s.target || {
                  kind: s.kind,
                  reps: Math.min(500, Math.max(1, s.reps)),
                  seconds: s.seconds,
                  loadKg: s.loadKg,
                },
              ),
              effort: s.effort || null,
              notes: s.notes || "",
              exercise: s.exercise,
              exerciseIndex: i,
              setIndex: 0,
            }),
            s.reps,
            Math.round(s.loadKg * 1000),
            s.seconds,
          ],
        );
      }
      imported++;
    }
    await pool.query(
      "INSERT INTO gym_imports(id,user_id,fingerprint,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,fingerprint) DO NOTHING",
      [randomUUID(), uid, preview.fingerprint, new Date().toISOString()],
    );
    return { imported, duplicates: preview.count - imported, xp: 0 };
  });
}
/** Shared plan files are data only. Remap custom IDs into the receiving account. */
export async function importPlan(uid: number, input: any) {
  return withTransaction(async () => {
    const root = z
      .object({
        format: z.literal("movemate-plan"),
        plan: z.any(),
        customExercises: z.array(z.any()).max(100).default([]),
      })
      .parse(input);
    const fingerprint = digest(root);
    if (
      (
        await pool.query(
          "SELECT id FROM gym_imports WHERE user_id=$1 AND fingerprint=$2",
          [uid, fingerprint],
        )
      ).rowCount
    )
      return { duplicate: true };
    const mapping = new Map<string, string>();
    for (const e of root.customExercises) {
      const own = await saveExercise(uid, e);
      mapping.set(e.id, own.id);
    }
    const candidate = structuredClone(root.plan);
    if (!Array.isArray(candidate?.routines))
      throw new ValidationError("计划格式无效");
    candidate.routines.forEach((r: any) =>
      r.exercises?.forEach((e: any) => {
        e.exerciseId = mapping.get(e.exerciseId) || e.exerciseId;
      }),
    );
    const plan = await savePlan(uid, candidate);
    await pool.query(
      "INSERT INTO gym_imports(id,user_id,fingerprint,created_at) VALUES($1,$2,$3,$4)",
      [randomUUID(), uid, fingerprint, new Date().toISOString()],
    );
    return { plan, duplicate: false };
  });
}
