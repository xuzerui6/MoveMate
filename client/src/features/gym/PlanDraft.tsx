import { useAuthStore } from "../../stores/authStore";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { readDraft, writeDraft, removeDraft, validPlanDraft, draftWriteWarning } from "./draftStorage";
import { askCoach, probeCoach } from "../motion/lib/coachClient";
import { useGymQuery, request, getErrorMessage } from "./api";
export default function PlanDraft() {
  const uid = useAuthStore((state) => state.user?.id),
    draftKey = "gym:draft:" + uid + ":advice",
    token = useRef(localStorage.getItem("token")).current;
  const q = useGymQuery("/training-plans"),
    [template, setTemplate] = useState("full"),
    [goal, setGoal] = useState("建立规律，每周三天"),
    [restored] = useState(() => readDraft<any>(draftKey, validPlanDraft)),
    [draft, setDraft] = useState(() => restored.state==='valid'?JSON.stringify(restored.value):''),
    [source, setSource] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    navigate = useNavigate();
  const [storageWarning,setStorageWarning] = useState(restored.state==='invalid'?'本机计划草稿损坏或格式不兼容，未自动载入。':restored.state==='unavailable'?'本机计划草稿无法读取，仍可生成和编辑新草稿。':'');
  const [invalidDraft,setInvalidDraft]=useState(restored.state==='invalid');
  const parsed = draft ? JSON.parse(draft) : null;
  const ids = [
    ...new Set(
      (parsed?.routines || []).flatMap((r: any) =>
        r.exercises.map((e: any) => e.exerciseId),
      ),
    ),
  ].join(",");
  const catalog = useGymQuery(
    "/exercises?ids=" + (ids || "motion:squat") + "&limit=500",
  );
  const edit = (fn: (plan: any) => void) =>
    setDraft((raw: string) => {
      const next = JSON.parse(raw);
      fn(next);
      return JSON.stringify(next);
    });
  useEffect(() => {
    if (draft && useAuthStore.getState().user?.id === uid)
      setStorageWarning(writeDraft(draftKey,JSON.parse(draft))?'':draftWriteWarning);
  }, [draft, draftKey, uid]);
  return (
    <details className="gym-form">
      <summary>生成可编辑的计划草稿</summary>
      {storageWarning && <div className="gym-cache-notice" role="status"><p>{storageWarning}</p>{invalidDraft && <button disabled={busy} onClick={()=>{if(removeDraft(draftKey)){setInvalidDraft(false);setStorageWarning('');}else setStorageWarning('本机草稿暂时无法清理，仍可生成新草稿。');}}>放弃损坏计划草稿</button>}</div>}
      <p className="gym-muted">
        草稿不会自动保存或开始训练；目标、动作和重量须本人确认。
      </p>
      <label>
        训练目标
        <input
          value={goal}
          maxLength={300}
          onChange={(e) => setGoal(e.target.value)}
        />
      </label>
      <label>
        基础模板
        <select value={template} onChange={(e) => setTemplate(e.target.value)}>
          {q.data?.templates.map((t: any) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={busy || !q.data}
        className="secondary"
        onClick={async () => {
          setBusy(true);
          setError("");
          const base = structuredClone(
            q.data.templates.find((t: any) => t.key === template),
          );
          delete base.key;
          try {
            let next = base;
            setSource("本地模板与规则草稿 · 未使用云端 AI");
            if (await probeCoach()) {
              if (useAuthStore.getState().user?.id !== uid) return;
              const result = await askCoach([
                {
                  role: "system",
                  content:
                    "只返回JSON训练计划，不含Markdown。保持所给schema、exerciseId和动作种类，只调整name、weekdays、reps(1-30)、restSec(0-300)。所有loadKg保持0。progression.mode保持off。不要声称已经保存。",
                },
                {
                  role: "user",
                  content: JSON.stringify({ goal, template: base }),
                },
              ]);
              if (result.ok) {
                try {
                  const raw = JSON.parse(
                    result.text.replace(/^```(?:json)?\s*|```$/g, ""),
                  );
                  if (!raw.routines?.length || raw.routines.length > 14)
                    throw Error();
                  const allowed = new Set(
                    base.routines.flatMap((r: any) =>
                      r.exercises.map((e: any) => e.exerciseId),
                    ),
                  );
                  if (
                    raw.routines.some((r: any) =>
                      r.exercises.some(
                        (e: any) =>
                          !allowed.has(e.exerciseId) ||
                          e.sets.some((s: any) => s.loadKg !== 0),
                      ),
                    )
                  )
                    throw Error();
                  next = {
                    ...base,
                    name:
                      typeof raw.name === "string"
                        ? raw.name.slice(0, 80)
                        : base.name,
                    progression: { mode: "off" },
                    routines: raw.routines.map((r: any, i: number) => {
                      if (!r.exercises.length || r.exercises.length > 30)
                        throw Error();
                      return {
                        id: String(r.id || i).slice(0, 80),
                        name:
                          typeof r.name === "string"
                            ? r.name.slice(0, 80)
                            : "训练日 " + (i + 1),
                        weekdays: Array.isArray(r.weekdays)
                          ? r.weekdays.filter(
                              (n: any) =>
                                Number.isInteger(n) && n >= 0 && n <= 6,
                            )
                          : [],
                        exercises: r.exercises.map((e: any) => {
                          if (!e.sets.length || e.sets.length > 20)
                            throw Error();
                          return {
                            exerciseId: e.exerciseId,
                            sets: e.sets.map((s: any) => {
                              const reps = s.reps ?? 10,
                                restSec = s.restSec ?? 90,
                                seconds = s.seconds ?? 0;
                              if (
                                !Number.isInteger(reps) ||
                                reps < 1 ||
                                reps > 30 ||
                                !Number.isInteger(restSec) ||
                                restSec < 0 ||
                                restSec > 300 ||
                                !Number.isInteger(seconds) ||
                                seconds < 0 ||
                                seconds > 7200
                              )
                                throw Error();
                              return {
                                kind: "work",
                                reps,
                                seconds,
                                loadKg: 0,
                                restSec,
                                side: "both",
                                superset: "",
                              };
                            }),
                          };
                        }),
                      };
                    }),
                  };
                  setSource("已配置 HTTP 陪练生成 · 等待本人编辑确认");
                } catch {
                  setSource("AI 返回格式无法验证 · 已回退本地模板草稿");
                }
              }
            }
            setDraft(JSON.stringify(next, null, 2));
          } catch {
            setSource("HTTP 陪练不可用 · 本地模板草稿");
            setDraft(JSON.stringify(base, null, 2));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "正在整理…" : "生成草稿"}
      </button>
      {draft && (
        <>
          <p role="status">{source}</p>
          <label>
            草稿名称
            <input
              value={parsed.name}
              maxLength={80}
              onChange={(e) => edit((p) => (p.name = e.target.value))}
            />
          </label>
          <p className="gym-muted">
            负重先保留 0
            kg，保存后可在计划编辑器逐组设置。这里的改动只保留为本人草稿。
          </p>
          {parsed.routines.map((r: any, ri: number) => (
            <fieldset key={r.id}>
              <legend>训练日 {ri + 1}</legend>
              <label>
                训练日名称
                <input
                  value={r.name}
                  maxLength={80}
                  onChange={(e) =>
                    edit((p) => (p.routines[ri].name = e.target.value))
                  }
                />
              </label>
              <div className="gym-inline-actions">
                {["周日", "周一", "周二", "周三", "周四", "周五", "周六"].map(
                  (day, d) => (
                    <label className="gym-checkbox" key={day}>
                      <input
                        type="checkbox"
                        checked={(r.weekdays || []).includes(d)}
                        onChange={(e) =>
                          edit(
                            (p) =>
                              (p.routines[ri].weekdays = e.target.checked
                                ? [...p.routines[ri].weekdays, d]
                                : p.routines[ri].weekdays.filter(
                                    (n: number) => n !== d,
                                  )),
                          )
                        }
                      />
                      {day}
                    </label>
                  ),
                )}
              </div>
              {r.exercises.map((entry: any, ei: number) => (
                <div key={ei} className="gym-form">
                  <b>
                    {catalog.data?.items.find(
                      (e: any) => e.id === entry.exerciseId,
                    )?.nameZh || entry.exerciseId}
                  </b>
                  <label>
                    目标组数
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={entry.sets.length}
                      onChange={(e) =>
                        edit((p) => {
                          const sets = p.routines[ri].exercises[ei].sets,
                            count = Math.max(
                              1,
                              Math.min(20, Number(e.target.value) || 1),
                            );
                          p.routines[ri].exercises[ei].sets = Array.from(
                            { length: count },
                            (_, i) =>
                              structuredClone(sets[i] || sets[sets.length - 1]),
                          );
                        })
                      }
                    />
                  </label>
                  {entry.sets.map((set: any, si: number) => (
                    <div className="gym-two" key={si}>
                      <label>
                        第 {si + 1} 组次数
                        <input
                          type="number"
                          min="1"
                          max="500"
                          value={set.reps}
                          onChange={(e) =>
                            edit(
                              (p) =>
                                (p.routines[ri].exercises[ei].sets[si].reps =
                                  Number(e.target.value)),
                            )
                          }
                        />
                      </label>
                      <label>
                        第 {si + 1} 组后休息（秒）
                        <input
                          type="number"
                          min="0"
                          max="900"
                          value={set.restSec}
                          onChange={(e) =>
                            edit(
                              (p) =>
                                (p.routines[ri].exercises[ei].sets[si].restSec =
                                  Number(e.target.value)),
                            )
                          }
                        />
                      </label>
                      {set.seconds > 0 && (
                        <label>
                          计时目标（秒）
                          <input
                            type="number"
                            min="1"
                            max="7200"
                            value={set.seconds}
                            onChange={(e) =>
                              edit(
                                (p) =>
                                  (p.routines[ri].exercises[ei].sets[
                                    si
                                  ].seconds = Number(e.target.value)),
                              )
                            }
                          />
                        </label>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </fieldset>
          ))}
          <button
            disabled={busy}
            className="primary"
            onClick={async () => {
              setBusy(true);
              try {
                const p = await request(
                  "POST",
                  "/training-plans",
                  JSON.parse(draft),
                  token,
                );
                removeDraft(draftKey);
                navigate("/train/plans/" + p.id + "/edit");
              } catch (e) {
                setError(getErrorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            确认草稿并保存到我的计划
          </button>
        </>
      )}
      {error && (
        <p className="gym-error" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
