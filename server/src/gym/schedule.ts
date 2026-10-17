import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool, withTransaction } from "../db";
import { plans } from "./service";
import { settings, dateInZone } from "./preferences";
import { InvalidStateError, ValidationError } from "../utils/errors";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    try {
      return new Date(v + "T12:00:00Z").toISOString().slice(0, 10) === v;
    } catch {
      return false;
    }
  }, "日期无效");
export async function schedule(uid: number, query: any = {}) {
  const prefs = await settings(uid),
    today = dateInZone(new Date().toISOString(), prefs.timeZone),
    from = date.parse(query.from || today),
    days = Math.min(62, Math.max(1, Number(query.days) || 7));
  const ps = (await plans(uid)).items,
    exceptions = (
      await pool.query("SELECT * FROM gym_schedule WHERE user_id=$1", [uid])
    ).rows;
  const entries: any[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10),
      weekday = d.getUTCDay();
    for (const p of ps)
      for (const r of p.routines) {
        const due =
          p.mode === "rotation"
            ? key === today &&
              p.routines[p.rotationCursor % p.routines.length]?.id === r.id
            : r.weekdays.includes(weekday);
        const ex = exceptions.find(
          (x) =>
            x.plan_id === p.id &&
            x.routine_id === r.id &&
            x.original_date === key &&
            x.kind !== "restore",
        );
        if (due && !ex)
          entries.push({
            date: key,
            plan: p,
            routine: r,
            rotation: p.mode === "rotation",
          });
      }
    for (const ex of exceptions.filter(
      (x) => x.target_date === key && x.kind === "move",
    )) {
      const p = ps.find((p) => p.id === ex.plan_id),
        r = p?.routines.find((r: any) => r.id === ex.routine_id);
      if (p && r)
        entries.push({
          date: key,
          plan: p,
          routine: r,
          exceptionId: ex.id,
          movedFrom: ex.original_date,
        });
    }
  }
  return { today, timeZone: prefs.timeZone, entries, exceptions };
}
export async function saveSchedule(uid: number, input: any) {
  return withTransaction(async () => {
    const data = z
      .object({
        id: z.string().max(80).optional(),
        version: z.number().int().min(0).default(0),
        planId: z.string(),
        routineId: z.string(),
        originalDate: date,
        targetDate: date.optional(),
        kind: z.enum(["move", "skip", "restore"]),
      })
      .parse(input);
    const p = (await plans(uid)).items.find((p) => p.id === data.planId);
    if (!p?.routines.some((r: any) => r.id === data.routineId))
      throw new ValidationError("训练日不存在");
    const old = (
      await pool.query(
        "SELECT * FROM gym_schedule WHERE user_id=$1 AND plan_id=$2 AND routine_id=$3 AND original_date=$4",
        [uid, data.planId, data.routineId, data.originalDate],
      )
    ).rows[0];
    if ((old?.version || 0) !== data.version)
      throw new InvalidStateError("日程已在其他页面更新，请刷新");
    if (
      data.kind === "move" &&
      (!data.targetDate || data.targetDate === data.originalDate)
    )
      throw new ValidationError("请选择不同的目标日期");
    await pool.query(
      "INSERT INTO gym_schedule(id,user_id,plan_id,routine_id,original_date,target_date,kind,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id,plan_id,routine_id,original_date) DO UPDATE SET target_date=$6,kind=$7,version=$8",
      [
        old?.id || randomUUID(),
        uid,
        p.id,
        data.routineId,
        data.originalDate,
        data.kind === "move" ? data.targetDate : null,
        data.kind,
        (old?.version || 0) + 1,
      ],
    );
    return schedule(uid, { from: data.originalDate });
  });
}
