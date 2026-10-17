import InstallApp from "./InstallApp";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Header } from "../motion/components/Header";
import {
  useGymQuery,
  request,
  getErrorMessage,
  beginWorkout,
  label,
} from "./api";
export function TrainingSettings() {
  const q = useGymQuery("/training-settings"),
    lib = useGymQuery("/exercises?limit=1"),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false),
    navigate = useNavigate();
  const v = q.data,
    change = (key: string, value: any) => q.setData({ ...v, [key]: value });
  return (
    <div className="page gym-page">
      <Header title="训练设置" back={() => navigate("/train/plans")} />
      {(q.error || message) && (
        <p
          role="status"
          className={q.error || failed ? "gym-error" : "gym-success"}
        >
          {q.error || message}
        </p>
      )}
      {v ? (
        <form
          className="gym-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setFailed(false);
            try {
              q.setData(await request("PUT", "/training-settings", v));
              setMessage("设置已保存");
            } catch (e) {
              setFailed(true);
              setMessage(getErrorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="gym-two">
            <label>
              显示单位
              <select
                value={v.unit}
                onChange={(e) => change("unit", e.target.value)}
              >
                <option value="kg">kg 公斤</option>
                <option value="lb">lb 磅</option>
              </select>
            </label>
            <label>
              日程与日历时区
              <input
                value={v.timeZone}
                onChange={(e) => change("timeZone", e.target.value)}
                list="gym-zones"
              />
              <datalist id="gym-zones">
                {[
                  "Asia/Shanghai",
                  "Asia/Hong_Kong",
                  "Asia/Tokyo",
                  "Europe/London",
                  "America/New_York",
                  "Pacific/Auckland",
                ].map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </datalist>
            </label>
          </div>
          <p className="gym-muted">
            记录统一保存 kg 和 UTC，切换显示不会重写原始精度或 XP。
          </p>
          <fieldset>
            <legend>我拥有的器械</legend>
            <div className="gym-equipment">
              {lib.data?.equipment
                .filter((x: string) => x !== "body weight")
                .map((x: string) => (
                  <label className="gym-checkbox" key={x}>
                    <input
                      type="checkbox"
                      checked={v.equipment.includes(x)}
                      onChange={(e) =>
                        change(
                          "equipment",
                          e.target.checked
                            ? [...v.equipment, x]
                            : v.equipment.filter((a: string) => a !== x),
                        )
                      }
                    />
                    {label(x)}
                  </label>
                ))}
            </div>
          </fieldset>
          <label>
            用力程度
            <select
              value={v.effort}
              onChange={(e) => change("effort", e.target.value)}
            >
              <option value="off">关闭</option>
              <option value="rpe">RPE</option>
              <option value="rir">RIR</option>
            </select>
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "正在保存…" : "保存个人设置"}
          </button>
        </form>
      ) : (
        <p>正在读取设置…</p>
      )}
      <InstallApp />
    </div>
  );
}
export default function Schedule() {
  const [from, setFrom] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    navigate = useNavigate();
  const q = useGymQuery(
    "/training-schedule?days=7" + (from ? "&from=" + from : ""),
  );
  const change = async (entry: any, kind: string, targetDate?: string) => {
    setBusy(true);
    try {
      const old = q.data.exceptions.find(
        (x: any) =>
          x.plan_id === entry.plan.id &&
          x.routine_id === entry.routine.id &&
          x.original_date === entry.date,
      );
      await request("PUT", "/training-schedule", {
        planId: entry.plan.id,
        routineId: entry.routine.id,
        originalDate: entry.date,
        targetDate,
        kind,
        version: old?.version || 0,
      });
      q.reload();
      setError("");
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page gym-page">
      <Header title="训练日程" back={() => navigate("/train/plans")} />
      <nav className="gym-links">
        <Link to="/train/settings">训练设置</Link>
        <Link to="/train/free">自由训练</Link>
      </nav>
      <p className="gym-muted">
        按 {q.data?.timeZone || "账号时区"}{" "}
        展示。临时调课不更改周计划，已有安排会并列保留。循环仅显示当前轮次。
      </p>
      <label>
        从这一天查看一周
        <input
          type="date"
          value={from || q.data?.today || ""}
          onChange={(e) => setFrom(e.target.value)}
        />
      </label>
      {(q.error || error) && (
        <div className="gym-error">
          {q.error || error}
          <button onClick={q.reload}>重试</button>
        </div>
      )}
      {q.data && !q.data.entries.length && (
        <p className="gym-empty">
          这一周没有安排，可在计划编辑器设置每周训练日。
        </p>
      )}
      {q.data?.entries.map((entry: any, i: number) => (
        <article
          className="gym-form"
          key={entry.date + entry.plan.id + entry.routine.id + i}
        >
          <span className="gym-eyebrow">
            {entry.date}
            {entry.movedFrom ? " · 从 " + entry.movedFrom + " 调来" : ""}
            {entry.rotation ? " · 循环当前轮次" : ""}
          </span>
          <h3>{entry.routine.name}</h3>
          <p>
            {entry.plan.name} · {entry.routine.exercises.length} 个动作
          </p>
          <div className="gym-inline-actions">
            <button
              disabled={busy}
              className="primary"
              onClick={async () => {
                setBusy(true);
                try {
                  const w = await beginWorkout({
                    planId: entry.plan.id,
                    routineId: entry.routine.id,
                  });
                  navigate("/train/workout/" + w.id);
                } catch (e) {
                  setError(getErrorMessage(e));
                  setBusy(false);
                }
              }}
            >
              开始这次训练
            </button>
            {!entry.exceptionId && (
              <button
                disabled={busy}
                onClick={() => void change(entry, "skip")}
              >
                跳过本次安排
              </button>
            )}
          </div>
          {!entry.exceptionId && !entry.rotation && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void change(
                  entry,
                  "move",
                  String(new FormData(e.currentTarget).get("date")),
                );
              }}
            >
              <label>
                调到
                <input
                  type="date"
                  name="date"
                  required
                  defaultValue={entry.date}
                />
              </label>
              <button disabled={busy}>确认单次调课</button>
            </form>
          )}
        </article>
      ))}
      <details className="gym-form">
        <summary>已调整／跳过的安排</summary>
        {q.data?.exceptions
          .filter((x: any) => x.kind !== "restore")
          .map((x: any) => (
            <div className="gym-list-row" key={x.id}>
              <span>
                {x.original_date} →{" "}
                {x.kind === "skip" ? "已跳过" : x.target_date}
              </span>
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await request("PUT", "/training-schedule", {
                      planId: x.plan_id,
                      routineId: x.routine_id,
                      originalDate: x.original_date,
                      kind: "restore",
                      version: x.version,
                    });
                    q.reload();
                  } catch (e) {
                    setError(getErrorMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                恢复原安排
              </button>
            </div>
          ))}
      </details>
    </div>
  );
}
