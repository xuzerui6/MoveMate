import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool, withTransaction } from "../db";
import { InvalidStateError, ValidationError } from "../utils/errors";
import {
  allExercises,
  digest,
  saveExercise,
  savePlan,
  saveMeasurement,
  workout,
} from "./service";
import { commitImport, parseImport } from "./imports";
import { json, planSchema } from "./model";
import { settings, saveSettings, settingsSchema } from "./preferences";

const inputSchema = z.object({
  format: z.enum(["movemate", "opengym"]),
  payload: z.any(),
  mapping: z.record(z.string()).default({}),
  choices: z.record(z.enum(["keep", "copy", "apply"])).default({}),
});
type Item = {
  kind: "exercise" | "plan" | "workout" | "body" | "settings";
  sourceId: string;
  value: any;
  key: string;
  hash: string;
  conflict?: boolean;
  duplicate?: boolean;
  missing?: string[];
};
const historyShape = (w: any) => ({
  name: w.name,
  date: w.date || w.createdAt,
  sets: (w.sets || [])
    .filter((s: any) => !s.status || s.status === "completed")
    .map((s: any) => ({
      exerciseId: s.exercise?.id || s.exerciseId,
      reps: s.reps,
      loadKg: s.loadKg,
      seconds: s.seconds || 0,
      kind: s.kind || "work",
    })),
});
function sourceRoot(input: any) {
  const root = input?.state || input?.S || input;
  if (!root || typeof root !== "object" || Array.isArray(root))
    throw new ValidationError("请选择包含计划、训练历史或身体记录的 JSON 对象");
  return root;
}
function normalizePlan(p: any, unit = "kg") {
  if (p.routines) return p;
  const entry = (e: any) => ({
    exerciseId: String(e.exerciseId || e.id || e.name),
    sets: (e.sets || [{ reps: 10 }]).map((s: any) => ({
      reps: s.reps ?? s.r ?? 10,
      loadKg: s.loadKg ?? Number(s.w || 0) * (unit === "lb" ? 0.45359237 : 1),
      seconds: s.seconds ?? s.sec ?? 0,
      restSec: s.restSec ?? s.rest ?? 90,
      kind: s.warmup ? "warmup" : s.kind || "work",
    })),
  });
  return {
    name: p.name || p.title || "导入计划",
    mode: "weekly",
    routines: [
      {
        id: String(p.id || "a"),
        name: p.name || "训练日",
        weekdays: p.weekdays || [],
        exercises: (p.exercises || p.entries || []).map(entry),
      },
    ],
  };
}
export function transferItems(format: string, payload: any): Item[] {
  const root = sourceRoot(payload);
  if (format === "movemate" && root.format !== "movemate-gym")
    throw new ValidationError("不是动伴完整导出文件");
  if (format === "movemate" && ![1, 2].includes(root.version))
    throw new ValidationError("不支持该导出版本");
  const items: Item[] = [];
  const add = (kind: Item["kind"], value: any, id: any) => {
    const sourceId = String(id || digest(value));
    const key = digest({ format, kind, id: sourceId });
    items.push({ kind, sourceId, value, key, hash: digest(value) });
  };
  for (const e of root.customExercises || []) add("exercise", e, e.id);
  const plans =
    root.plans || (Array.isArray(root.routines) ? root.routines : []);
  if (!Array.isArray(plans)) throw new ValidationError("计划格式无法识别");
  for (const p of plans) add("plan", normalizePlan(p, root.unit), p.id);
  if (root.workouts?.length) {
    const parsed = parseImport(
      format,
      JSON.stringify({
        ...root,
        plans: undefined,
        customExercises: undefined,
        body: undefined,
        settings: undefined,
      }),
    );
    for (const [i, w] of parsed.entries()) {
      if (root.workouts[i]?.phase && root.workouts[i].phase !== "finished")
        continue; // never recreate an active timer from a backup
      add("workout", w, root.workouts[i].id || digest(w));
    }
  }
  const body =
    root.body?.items ||
    root.bodyWeights ||
    root.bodyweights ||
    root.weighIns ||
    root.weights ||
    [];
  if (!Array.isArray(body)) throw new ValidationError("体重记录格式无法识别");
  for (const b of body) {
    const raw = b.date || b.d || b.createdAt;
    const date = String(raw || "").slice(0, 10);
    const weight = b.weightKg ?? b.kg ?? b.weight ?? b.w;
    add(
      "body",
      {
        ...b,
        date,
        ...(weight != null
          ? {
              weightKg:
                Number(weight) *
                (root.unit === "lb" && b.weightKg == null ? 0.45359237 : 1),
            }
          : {}),
      },
      date,
    );
  }
  if (root.settings || root.body?.settings)
    add("settings", root.settings || root.body.settings, "personal-settings");
  if (items.length > 200)
    throw new ValidationError("每批最多200条内容，请在页面使用分批导入");
  if (!items.length)
    throw new ValidationError("未识别到可导入的计划、完成历史、体重或设置");
  return items;
}
async function resolved(
  uid: number,
  format: string,
  id: string,
  mapping: Record<string, string>,
) {
  if (mapping[id]) return mapping[id];
  const r = (
    await pool.query(
      "SELECT target_id FROM gym_restore_items WHERE user_id=$1 AND fingerprint=$2",
      [uid, "map:" + digest({ format, kind: "exercise", id })],
    )
  ).rows[0];
  if (r?.target_id) return r.target_id;
  const match = (await allExercises(uid)).find(
    (e) =>
      [e.id, e.name, e.nameZh, "exdb:" + id].includes(id) ||
      e.id === "exdb:" + id,
  );
  return match?.id || id;
}
export async function previewTransfer(uid: number, input: any) {
  const data = inputSchema.parse(input);
  if (JSON.stringify(data.payload).length > 350000)
    throw new ValidationError("单批内容超过350KB，请减少分批大小");
  const items = transferItems(data.format, data.payload),
    catalog = await allExercises(uid),
    missing = new Set<string>();
  const embedded = new Set(
    items.filter((i) => i.kind === "exercise").map((i) => i.sourceId),
  );
  for (const item of items) {
    const saved = (
      await pool.query(
        "SELECT target_id FROM gym_restore_items WHERE user_id=$1 AND fingerprint=$2",
        [uid, item.key + ":" + item.hash],
      )
    ).rows[0];
    if (saved) {
      item.duplicate = true;
      continue;
    }
    let existing: any;
    if (item.kind === "exercise")
      existing = (
        await pool.query(
          "SELECT data FROM gym_exercises WHERE user_id=$1 AND id=$2",
          [uid, item.sourceId],
        )
      ).rows[0]?.data;
    if (item.kind === "plan")
      existing = (
        await pool.query(
          "SELECT data FROM gym_plans WHERE user_id=$1 AND id=$2",
          [uid, item.sourceId],
        )
      ).rows[0]?.data;
    if (item.kind === "workout") {
      const native = (
        await pool.query(
          "SELECT id FROM gym_workouts WHERE user_id=$1 AND id=$2",
          [uid, item.sourceId],
        )
      ).rows[0];
      if (native) {
        const old = await workout(uid, native.id);
        item.duplicate =
          digest(historyShape(old)) === digest(historyShape(item.value));
        item.conflict = !item.duplicate;
      }
    }
    if (item.kind === "body")
      existing = (
        await pool.query(
          "SELECT data FROM gym_measurements WHERE user_id=$1 AND date=$2",
          [uid, item.value.date],
        )
      ).rows[0]?.data;
    if (item.kind === "settings") {
      item.value = settingsSchema.partial().parse(item.value);
      existing = JSON.stringify(await settings(uid));
    }
    if (existing) {
      const old = json(existing);
      item.duplicate =
        JSON.stringify(item.kind === "plan" ? planSchema.parse(old) : old) ===
        JSON.stringify(
          item.kind === "plan" ? planSchema.parse(item.value) : item.value,
        );
      item.conflict = !item.duplicate;
    }
    // Source IDs can already have been restored under a new account-local ID.
    const prior = (
      await pool.query(
        "SELECT target_id FROM gym_restore_items WHERE user_id=$1 AND fingerprint=$2",
        [uid, item.key],
      )
    ).rows[0];
    if (prior && !item.duplicate) item.conflict = true;
    const refs =
      item.kind === "plan"
        ? item.value.routines?.flatMap(
            (r: any) => r.exercises?.map((e: any) => e.exerciseId) || [],
          )
        : item.kind === "workout"
          ? item.value.sets.map((s: any) => s.exerciseId || s.name)
          : [];
    item.missing = [];
    for (const ref of refs || []) {
      const id = await resolved(uid, data.format, String(ref), data.mapping);
      if (
        !embedded.has(String(ref)) &&
        !catalog.some((e) =>
          [e.id, e.name, e.nameZh, "exdb:" + String(ref)].includes(id),
        )
      ) {
        missing.add(String(ref));
        item.missing.push(String(ref));
      }
    }
  }
  return {
    items,
    missing: [...missing],
    conflicts: items
      .filter((i) => i.conflict)
      .map((i) => ({
        key: i.key,
        kind: i.kind,
        name: i.value.name || i.value.nameZh || i.value.date || "个人设置",
      })),
    duplicates: items.filter((i) => i.duplicate).length,
    previewHash: digest({
      format: data.format,
      payload: data.payload,
      mapping: data.mapping,
      items,
    }),
    xp: 0,
  };
}
const batchSchema = z.object({
  batchId: z.string().min(1).max(80),
  part: z.number().int().min(0).max(10000),
  total: z.number().int().min(1).max(10001),
  manifest: z.array(z.string().length(64)).max(10001),
  previewHash: z.string().length(64),
});
export async function transferStatus(uid: number, id: string) {
  const r = (
    await pool.query(
      "SELECT data FROM gym_import_batches WHERE id=$1 AND user_id=$2",
      [id, uid],
    )
  ).rows[0];
  return r ? json(r.data) : { cursor: 0, imported: 0 };
}
export async function commitTransfer(uid: number, input: any) {
  return withTransaction(async () => {
    const batch = batchSchema.parse(input),
      data = inputSchema.parse(input);
    if (
      batch.manifest.length !== batch.total ||
      batch.manifest[batch.part] !== digest(data.payload)
    )
      throw new ValidationError("文件分批校验不一致");
    const fingerprint = digest({
        format: data.format,
        manifest: batch.manifest,
      }),
      old = await transferStatus(uid, batch.batchId);
    const owned = (
      await pool.query("SELECT * FROM gym_import_batches WHERE id=$1", [
        batch.batchId,
      ])
    ).rows[0];
    if (owned && owned.user_id !== uid)
      throw new ValidationError("批次不属于当前账号");
    if (owned && owned.fingerprint !== fingerprint)
      throw new InvalidStateError("该批次对应另一份文件");
    if (batch.part < old.cursor) return old;
    if (batch.part !== old.cursor)
      throw new InvalidStateError("请从已确认的断点继续导入");
    const preview = await previewTransfer(uid, data);
    if (preview.previewHash !== batch.previewHash)
      throw new InvalidStateError("预览后数据已改变，请重新预览");
    if (preview.missing.length)
      throw new ValidationError("请先映射所有未知动作");
    if (preview.conflicts.some((c) => !data.choices[c.key]))
      throw new ValidationError("请逐项选择冲突处理方式；原数据不会被覆盖");
    let imported = 0;
    for (const item of preview.items) {
      if (item.duplicate || data.choices[item.key] === "keep") continue;
      let targetId = item.sourceId;
      if (item.kind === "exercise") {
        const next = await saveExercise(uid, item.value);
        targetId = next.id;
        await pool.query(
          "INSERT INTO gym_restore_items(user_id,fingerprint,target_id) VALUES($1,$2,$3) ON CONFLICT(user_id,fingerprint) DO UPDATE SET target_id=$3",
          [
            uid,
            "map:" +
              digest({
                format: data.format,
                kind: "exercise",
                id: item.sourceId,
              }),
            targetId,
          ],
        );
      } else if (item.kind === "plan") {
        const p = structuredClone(item.value);
        for (const r of p.routines || [])
          for (const e of r.exercises || [])
            e.exerciseId = await resolved(
              uid,
              data.format,
              e.exerciseId,
              data.mapping,
            );
        if (item.conflict) p.name = (p.name + "（导入副本）").slice(0, 80);
        targetId = (await savePlan(uid, p)).id;
      } else if (item.kind === "workout") {
        const w = structuredClone(item.value);
        for (const s of w.sets)
          s.exerciseId = await resolved(
            uid,
            data.format,
            s.exerciseId || s.name,
            data.mapping,
          );
        // The existing importer creates historical, manual-only sets without a sport session or XP ledger.
        await commitImport(uid, {
          format: "movemate",
          text: JSON.stringify({
            workouts: [
              { ...w, createdAt: w.date, id: item.key + ":" + item.hash },
            ],
          }),
          mapping: data.mapping,
        });
      } else if (item.kind === "body") {
        const previous = (
          await pool.query(
            "SELECT data FROM gym_measurements WHERE user_id=$1 AND date=$2",
            [uid, item.value.date],
          )
        ).rows[0];
        const candidate = item.conflict
          ? { ...item.value, ...json(previous?.data || "{}") }
          : item.value;
        await saveMeasurement(uid, candidate);
      } else await saveSettings(uid, item.value);
      for (const key of [item.key, item.key + ":" + item.hash])
        await pool.query(
          "INSERT INTO gym_restore_items(user_id,fingerprint,target_id) VALUES($1,$2,$3) ON CONFLICT(user_id,fingerprint) DO UPDATE SET target_id=$3",
          [uid, key, targetId],
        );
      imported++;
    }
    const next = {
      cursor: batch.part + 1,
      total: batch.total,
      imported: (old.imported || 0) + imported,
      done: batch.part + 1 === batch.total,
      xp: 0,
    };
    await pool.query(
      "INSERT INTO gym_import_batches(id,user_id,fingerprint,data,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET data=$4",
      [
        batch.batchId,
        uid,
        fingerprint,
        JSON.stringify(next),
        new Date().toISOString(),
      ],
    );
    return next;
  });
}
