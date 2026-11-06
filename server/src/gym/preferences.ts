import { z } from "zod";
import { pool, withTransaction } from "../db";
import { json } from "./model";
/** 产品定调：仅面向中国大陆，一切用户可见时间用北京时间，不提供时区设置。 */
export const APP_TIME_ZONE = "Asia/Shanghai";
export const settingsSchema = z.object({
  unit: z.enum(["kg", "lb"]).default("kg"),
  // 仅为兼容旧数据/API 形状保留：用户提交的值一律忽略，
  // settings()/saveSettings() 始终钉死为 APP_TIME_ZONE。
  timeZone: z.string().default(APP_TIME_ZONE),
  effort: z.enum(["off", "rpe", "rir"]).default("off"),
  sound: z.boolean().default(false),
  wakeLock: z.boolean().default(false),
  equipment: z.array(z.string().min(1).max(50)).max(50).default([]),
  barKg: z.number().min(0).max(100).default(20),
  plates: z
    .array(
      z.object({
        kg: z.number().positive().max(100),
        count: z.number().int().min(0).max(100),
      }),
    )
    .max(30)
    .default([
      { kg: 20, count: 2 },
      { kg: 10, count: 2 },
      { kg: 5, count: 2 },
      { kg: 2.5, count: 2 },
      { kg: 1.25, count: 2 },
    ]),
  goalKg: z.number().min(1).max(700).optional(),
});
export async function settings(uid: number) {
  const parsed = settingsSchema.parse(
    json(
      (
        await pool.query("SELECT data FROM gym_settings WHERE user_id=$1", [
          uid,
        ])
      ).rows[0]?.data || "{}",
    ),
  );
  // 无论库里存过什么时区，对外一律北京时间。
  return { ...parsed, timeZone: APP_TIME_ZONE };
}
export async function saveSettings(uid: number, input: any) {
  return withTransaction(async () => {
    const next = {
      ...settingsSchema.parse({
        ...(await settings(uid)),
        ...settingsSchema.partial().parse(input),
      }),
      timeZone: APP_TIME_ZONE,
    };
    await pool.query(
      "INSERT INTO gym_settings(user_id,data) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET data=$2",
      [uid, JSON.stringify(next)],
    );
    return next;
  });
}
export function dateInZone(utc: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(utc));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
