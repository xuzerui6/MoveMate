import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import Dialog from "../../components/Dialog";
import { Header } from "../motion/components/Header";
import { ExerciseLibrary } from "./Library";
import { request, useGymQuery, getErrorMessage, download } from "./api";
const emptySet = () => ({
  kind: "work",
  reps: 10,
  seconds: 0,
  loadKg: 0,
  restSec: 90,
  side: "both",
  superset: "",
});
export default function PlanEditor() {
  const { planId } = useParams(),
    navigate = useNavigate(),
    query = useGymQuery("/training-plans"),
    [plan, setPlan] = useState<any>(null),
    [day, setDay] = useState(0),
    [picker, setPicker] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [remove, setRemove] = useState(false),
    [proposal, setProposal] = useState<any>(null);
  useEffect(() => {
    if (!plan && query.data) {
      const p = query.data.items.find((p: any) => p.id === planId);
      if (p) {
        let draft: any = null;
        try {
          draft = JSON.parse(
            localStorage.getItem(
              "gym:draft:" + useAuthStore.getState().user?.id + ":" + planId,
            ) || "null",
          );
        } catch {}
        if (draft?.id === p.id && draft.version === p.version) {
          setPlan(draft);
          setMessage("已恢复当前账号的未保存草稿");
        } else {
          setPlan(structuredClone(p));
          if (draft) setError("服务器计划已更新，旧草稿未覆盖服务器内容。");
        }
      } else setError("计划不存在或无权访问");
    }
  }, [query.data, planId]);
  const draftKey =
    "gym:draft:" + useAuthStore((s) => s.user?.id) + ":" + planId;
  const ids =
    plan?.routines
      .flatMap((r: any) => r.exercises.map((e: any) => e.exerciseId))
      .join(",") || "";
  const names = useGymQuery(
    "/exercises?limit=500&ids=" + encodeURIComponent(ids),
  );
  const map = Object.fromEntries(
    (names.data?.items || []).map((e: any) => [e.id, e]),
  );
  const edit = (change: (p: any) => void) => {
    setPlan((old: any) => {
      const p = structuredClone(old);
      change(p);
      localStorage.setItem(draftKey, JSON.stringify(p));
      return p;
    });
    setMessage("");
  };
  const save = async (next = plan) => {
    setBusy(true);
    setError("");
    try {
      const p = await request("PUT", "/training-plans/" + planId, next);
      setPlan(p);
      localStorage.removeItem(draftKey);
      setMessage("已保存到当前账号");
      setProposal(null);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  if (!plan)
    return (
      <div className="page gym-page">
        <Header title="编辑计划" back={() => navigate("/train/plans")} />
        {error || query.error ? (
          <div className="gym-error">
            {error || query.error}
            <button
              onClick={() => {
                query.reload();
                setError("");
              }}
            >
              重试
            </button>
          </div>
        ) : (
          <p>正在读取计划…</p>
        )}
      </div>
    );
  const routine = plan.routines[day];
  return (
    <div className="page gym-page gym-editor">
      <Header title="编辑训练计划" back={() => navigate("/train/plans")} />
      <p className="gym-muted">
        计划修改影响下次训练；正在进行的训练保留开始时的安排。
      </p>
      <div className="gym-form">
        <label>
          计划名称
          <input
            value={plan.name}
            maxLength={80}
            onChange={(e) => edit((p) => (p.name = e.target.value))}
          />
        </label>
        <div className="gym-two">
          <label>
            安排方式
            <select
              value={plan.mode}
              onChange={(e) => edit((p) => (p.mode = e.target.value))}
            >
              <option value="weekly">每周排课</option>
              <option value="rotation">A / B / C 循环</option>
            </select>
          </label>
          {plan.mode === "rotation" && (
            <label>
              下一次训练
              <select
                value={plan.rotationCursor}
                onChange={(e) =>
                  edit((p) => (p.rotationCursor = Number(e.target.value)))
                }
              >
                {plan.routines.map((r: any, i: number) => (
                  <option key={r.id} value={i}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>
      <div className="gym-day-tabs" role="tablist" aria-label="训练日">
        {plan.routines.map((r: any, i: number) => (
          <button
            key={r.id}
            role="tab"
            aria-selected={i === day}
            onClick={() => setDay(i)}
          >
            {r.name}
          </button>
        ))}
        <button
          onClick={() => {
            edit((p) =>
              p.routines.push({
                id: crypto.randomUUID(),
                name: "新训练日",
                weekdays: [],
                exercises: [],
              }),
            );
            setDay(plan.routines.length);
          }}
          disabled={plan.routines.length >= 14}
        >
          ＋训练日
        </button>
      </div>
      <section className="gym-form">
        <label>
          训练日名称
          <input
            value={routine.name}
            onChange={(e) =>
              edit((p) => (p.routines[day].name = e.target.value))
            }
          />
        </label>
        {plan.mode === "weekly" && (
          <fieldset className="gym-weekdays">
            <legend>安排在哪些天</legend>
            {["日", "一", "二", "三", "四", "五", "六"].map((d, i) => (
              <label key={i}>
                <input
                  type="checkbox"
                  checked={routine.weekdays.includes(i)}
                  onChange={(e) =>
                    edit((p) => {
                      const r = p.routines[day];
                      r.weekdays = e.target.checked
                        ? [...r.weekdays, i]
                        : r.weekdays.filter((v: number) => v !== i);
                    })
                  }
                />
                周{d}
              </label>
            ))}
          </fieldset>
        )}
        {routine.exercises.map((entry: any, index: number) => (
          <article className="gym-edit-exercise" key={index + entry.exerciseId}>
            <div className="gym-section-title">
              <h3>{map[entry.exerciseId]?.nameZh || entry.exerciseId}</h3>
              <div className="gym-small-actions">
                <button
                  aria-label="上移动作"
                  disabled={!index}
                  onClick={() =>
                    edit((p) => {
                      const a = p.routines[day].exercises;
                      [a[index - 1], a[index]] = [a[index], a[index - 1]];
                    })
                  }
                >
                  上移
                </button>
                <button
                  aria-label="下移动作"
                  disabled={index === routine.exercises.length - 1}
                  onClick={() =>
                    edit((p) => {
                      const a = p.routines[day].exercises;
                      [a[index + 1], a[index]] = [a[index], a[index + 1]];
                    })
                  }
                >
                  下移
                </button>
                <button
                  onClick={() =>
                    edit((p) => p.routines[day].exercises.splice(index, 1))
                  }
                >
                  移除动作
                </button>
              </div>
            </div>
            {entry.sets.map((s: any, i: number) => (
              <div className="gym-set-editor" key={i}>
                <b>第{i + 1}组</b>
                <label>
                  组类型
                  <select
                    value={s.kind}
                    onChange={(e) =>
                      edit(
                        (p) =>
                          (p.routines[day].exercises[index].sets[i].kind =
                            e.target.value),
                      )
                    }
                  >
                    {Object.entries({
                      warmup: "热身组",
                      work: "正式组",
                      drop: "递减组",
                      rest_pause: "休息暂停组",
                    }).map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                {[
                  ["reps", "目标次数／对", 1, 500],
                  ["loadKg", "外部负重 kg", 0, 1000],
                  ["seconds", "计时目标秒（0为次数）", 0, 7200],
                  ["restSec", "组后休息秒", 0, 900],
                ].map(([key, title, min, max]) => (
                  <label key={key}>
                    {title}
                    <input
                      type="number"
                      min={min}
                      max={max}
                      step={key === "loadKg" ? 0.25 : 1}
                      value={s[key]}
                      onChange={(e) =>
                        edit(
                          (p) =>
                            (p.routines[day].exercises[index].sets[i][key] =
                              Number(e.target.value)),
                        )
                      }
                    />
                  </label>
                ))}
                <label>
                  左右侧
                  <select
                    value={s.side}
                    onChange={(e) =>
                      edit(
                        (p) =>
                          (p.routines[day].exercises[index].sets[i].side =
                            e.target.value),
                      )
                    }
                  >
                    <option value="both">双侧合计</option>
                    <option value="each">每侧次数</option>
                    <option value="left">仅左侧</option>
                    <option value="right">仅右侧</option>
                  </select>
                </label>
                <label>
                  超级组编号（可空）
                  <input
                    value={s.superset}
                    maxLength={20}
                    placeholder="如 A，同编号交替"
                    onChange={(e) =>
                      edit(
                        (p) =>
                          (p.routines[day].exercises[index].sets[i].superset =
                            e.target.value),
                      )
                    }
                  />
                </label>
                <button
                  disabled={entry.sets.length < 2}
                  onClick={() =>
                    edit((p) =>
                      p.routines[day].exercises[index].sets.splice(i, 1),
                    )
                  }
                >
                  移除此组
                </button>
              </div>
            ))}
            <button
              className="secondary"
              disabled={entry.sets.length >= 20}
              onClick={() =>
                edit((p) =>
                  p.routines[day].exercises[index].sets.push({
                    ...entry.sets[entry.sets.length - 1],
                  }),
                )
              }
            >
              添加一组
            </button>
          </article>
        ))}
        <button className="secondary" onClick={() => setPicker(true)}>
          从动作库添加动作
        </button>
        <button
          className="text-btn"
          disabled={plan.routines.length < 2}
          onClick={() => {
            edit((p) => p.routines.splice(day, 1));
            setDay(0);
          }}
        >
          移除这个训练日
        </button>
      </section>
      <details className="gym-form gym-progression">
        <summary>进阶规则（默认关闭）</summary>
        <label>
          规则
          <select
            value={plan.progression.mode}
            onChange={(e) => edit((p) => (p.progression.mode = e.target.value))}
          >
            <option value="off">关闭</option>
            <option value="linear">线性：完成后增加负重</option>
            <option value="double">双重：先加次数，再加负重</option>
            <option value="triple">三级：次数、组数、负重</option>
          </select>
        </label>
        <div className="gym-two">
          {[
            ["incrementKg", "每次加重 kg", 0.25, 20],
            ["minReps", "加重后次数", 1, 500],
            ["maxReps", "次数上限", 1, 500],
            ["maxSets", "组数上限", 1, 20],
          ].map(([key, title, min, max]) => (
            <label key={key}>
              {title}
              <input
                type="number"
                min={min}
                max={max}
                step={key === "incrementKg" ? 0.25 : 1}
                value={plan.progression[key]}
                onChange={(e) =>
                  edit((p) => (p.progression[key] = Number(e.target.value)))
                }
              />
            </label>
          ))}
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={async () => {
            setError("");
            try {
              const result = await request(
                "GET",
                "/training-plans/" + planId + "/progression",
              );
              setProposal(result);
            } catch (e) {
              setError(getErrorMessage(e));
            }
          }}
        >
          根据已保存计划查看进阶建议
        </button>
        {proposal && (
          <div>
            <p>
              {proposal.suggestions.length
                ? `${proposal.suggestions.length}项建议，确认后才会修改计划。`
                : proposal.reason || "还没有达到进阶条件。"}
            </p>
            {proposal.suggestions.map((s: any, i: number) => (
              <p key={i}>
                {map[s.exerciseId]?.nameZh || s.exerciseId}：{s.before.loadKg}→
                {s.after.loadKg}kg，{s.before.reps}→{s.after.reps}次
              </p>
            ))}
            {!!proposal.suggestions.length && (
              <button
                className="primary"
                onClick={() =>
                  void save({ ...proposal.plan, version: plan.version })
                }
                disabled={busy}
              >
                确认应用并保存建议
              </button>
            )}
          </div>
        )}
      </details>
      {error && (
        <div className="gym-error" role="alert">
          {error}
          <button
            onClick={() => {
              setPlan(null);
              query.reload();
              setError("");
            }}
          >
            重新读取服务器版本
          </button>
        </div>
      )}
      {message && (
        <p className="gym-success" role="status">
          {message}
        </p>
      )}
      <div className="gym-save-bar">
        <button
          className="text-btn"
          onClick={() => {
            localStorage.removeItem(draftKey);
            setPlan(null);
            setError("");
            query.reload();
          }}
        >
          放弃本机草稿，读取服务器
        </button>
        <button className="primary" disabled={busy} onClick={() => void save()}>
          {busy ? "正在保存…" : "保存计划"}
        </button>
        <button
          className="secondary"
          onClick={() => {
            const copy = structuredClone(plan);
            copy.routines.forEach((r: any) =>
              r.exercises.forEach((e: any) =>
                e.sets.forEach((s: any) => (s.loadKg = 0)),
              ),
            );
            download(
              plan.name + ".json",
              JSON.stringify(
                {
                  format: "movemate-plan",
                  plan: copy,
                  customExercises: Object.values(map).filter((e: any) =>
                    e.id.startsWith("user:"),
                  ),
                },
                null,
                2,
              ),
            );
          }}
        >
          分享计划文件
        </button>
        <button className="secondary" onClick={() => window.print()}>
          打印／存为 PDF
        </button>
        <button className="text-btn" onClick={() => setRemove(true)}>
          删除计划
        </button>
      </div>
      <div className="gym-print-document">
        <h1>{plan.name}</h1>
        {plan.routines.map((r: any) => (
          <section key={r.id}>
            <h2>{r.name}</h2>
            {r.exercises.map((e: any, i: number) => (
              <div key={i}>
                <h3>{map[e.exerciseId]?.nameZh || e.exerciseId}</h3>
                {e.sets.map((s: any, j: number) => (
                  <p key={j}>
                    第 {j + 1} 组 · {s.kind} ·{" "}
                    {s.seconds ? s.seconds + " 秒" : s.reps + " 次／对"} ·{" "}
                    {s.loadKg} kg · 休息 {s.restSec} 秒{" "}
                    {s.superset ? "· 超级组 " + s.superset : ""}
                  </p>
                ))}
              </div>
            ))}
          </section>
        ))}
      </div>
      {picker && (
        <Dialog title="添加动作" onClose={() => setPicker(false)}>
          <div className="gym-page">
            <ExerciseLibrary
              onPick={(ex) => {
                edit((p) =>
                  p.routines[day].exercises.push({
                    exerciseId: ex.id,
                    sets: [emptySet(), emptySet(), emptySet()],
                  }),
                );
                setPicker(false);
              }}
            />
          </div>
        </Dialog>
      )}
      {remove && (
        <Dialog title="删除这个计划？" onClose={() => setRemove(false)}>
          <p>仅删除计划，已完成训练与历史记录保留。</p>
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await request("DELETE", "/training-plans/" + planId);
                navigate("/train/plans");
              } catch (e) {
                setError(getErrorMessage(e));
                setRemove(false);
                setBusy(false);
              }
            }}
          >
            确认删除
          </button>
        </Dialog>
      )}
    </div>
  );
}
