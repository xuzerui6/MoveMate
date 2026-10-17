import { pool } from "../db";
import { json } from "./model";
export const ONLINE_GRACE_MS = 45000;
/** Server-confirmed online checkpoints; an expired interval ends at its last acknowledgement. */
export function onlineCutoff(
  row: { metrics: string; active_since: string | null },
  now = Date.now(),
) {
  const at = json(row.metrics).planOnlineAt;
  return typeof at === "number" && now - at > ONLINE_GRACE_MS
    ? Math.max(Date.parse(row.active_since || new Date(at).toISOString()), at)
    : now;
}
export async function refreshOnline(id: string, renew: boolean, force = false) {
  const s = (await pool.query("SELECT * FROM sport_sessions WHERE id=$1", [id]))
    .rows[0];
  if (!s) return false;
  const metrics = json(s.metrics);
  if (typeof metrics.planOnlineAt !== "number") return false; // legacy sessions keep their original rules
  const now = Date.now();
  const cutoff = force
      ? Math.max(
          Date.parse(
            s.active_since || new Date(metrics.planOnlineAt).toISOString(),
          ),
          metrics.planOnlineAt,
        )
      : onlineCutoff(s, now),
    expired = s.status === "running" && (force || cutoff < now);
  if (expired) {
    const ms = Math.max(0, cutoff - Date.parse(s.active_since));
    await pool.query(
      "UPDATE sport_intervals SET ended_at=$2,effective_ms=$3 WHERE session_id=$1 AND ended_at IS NULL",
      [id, new Date(cutoff).toISOString(), ms],
    );
    await pool.query(
      "UPDATE sport_sessions SET effective_ms=effective_ms+$2,status='paused',active_since=NULL WHERE id=$1",
      [id, ms],
    );
    await pool.query(
      "UPDATE gym_sets SET seconds=seconds+$2 WHERE workout_id=(SELECT id FROM gym_workouts WHERE sport_session_id=$1) AND status='working'",
      [id, Math.floor(ms / 1000)],
    );
    await pool.query(
      "UPDATE gym_workouts SET phase='paused',version=version+1 WHERE sport_session_id=$1",
      [id],
    );
  }
  if (renew && !expired)
    await pool.query("UPDATE sport_sessions SET metrics=$2 WHERE id=$1", [
      id,
      JSON.stringify({ ...metrics, planOnlineAt: Date.now() }),
    ]);
  return expired;
}
