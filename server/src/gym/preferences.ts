import { z } from "zod";
import { pool, withTransaction } from "../db";
import { json } from "./model";
export const settingsSchema = z.object({
  unit: z.enum(["kg", "lb"]).default("kg"),
  timeZone: z
    .string()
    .refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "时区无效")
    .default("Asia/Shanghai"),
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
  return settingsSchema.parse(
    json(
      (
        await pool.query("SELECT data FROM gym_settings WHERE user_id=$1", [
          uid,
        ])
      ).rows[0]?.data || "{}",
    ),
  );
}
export async function saveSettings(uid: number, input: any) {
  return withTransaction(async () => {
    const next = settingsSchema.parse({
      ...(await settings(uid)),
      ...settingsSchema.partial().parse(input),
    });
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
