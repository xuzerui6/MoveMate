import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useGymQuery, request, getErrorMessage, beginWorkout } from "./api";
import { Header } from "../motion/components/Header";
import { askCoach, probeCoach } from "../motion/lib/coachClient";
import { Icon } from "../motion/components/Icons";
export function PlanEntry() {
  const query = useGymQuery("/training-plans"),
    navigate = useNavigate(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const day = new Date().getDay(),
    today =
      query.data?.items.flatMap((p: any) =>
        p.mode === "rotation"
          ? [
              {
                plan: p,
                routine: p.routines[p.rotationCursor % p.routines.length],
              },
            ]
          : p.routines
              .filter((r: any) => r.weekdays.includes(day))
              .map((routine: any) => ({ plan: p, routine })),
      ) || [];
  const begin = async (p: any, r: any) => {
    setBusy(true);
    try {
      const w = await beginWorkout({ planId: p.id, routineId: r.id });
      navigate("/train/workout/" + w.id);
    } catch (e) {
      setError(getErrorMessage(e));
      setBusy(false);
    }
  };
  return (
    <section className="gym-entry">
      <div className="gym-section-title">
        <h3>今日计划</h3>
        <Link to="/train/plans">
          管理计划 <Icon name="arrow" size={16} />
        </Link>
      </div>
      {(query.error || error) && (
        <div className="gym-error">
          {query.error || error}
          <button onClick={query.reload}>重新读取</button>
        </div>
      )}
      {query.loading ? (
        <p>正在读取计划…</p>
      ) : today.length ? (
        today.map(({ plan, routine }: any) => (
          <article className="gym-today" key={plan.id + routine.id}>
            <span className="gym-eyebrow">
              {plan.mode === "rotation" ? "轮到这一练" : "今天的安排"}
            </span>
            <h3>{routine.name}</h3>
            <p>
              {plan.name} · {routine.exercises.length} 个动作 ·{" "}
              {routine.exercises.reduce(
                (n: number, e: any) => n + e.sets.length,
                0,
              )}{" "}
              组
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void begin(plan, routine)}
            >
              {busy ? "正在准备…" : "开始计划训练"}
              <Icon name="arrow" />
            </button>
          </article>
        ))
      ) : (
        <article className="gym-today">
          <h3>
            {query.data?.items.length
              ? "今天休息，也可以自由安排"
              : "从一个适合你的计划开始"}
          </h3>
          <p>安排动作，逐组记录，看看每一次进步。</p>
          <Link className="primary" to="/train/plans">
            {query.data?.items.length ? "选择训练日" : "选择训练模板"}
            <Icon name="arrow" />
          </Link>
        </article>
      )}
      <div className="gym-shortcuts">
        <Link to="/train/library">
          <Icon name="dumbbell" />
          动作库
        </Link>
        <Link to="/train/stats">
          <Icon name="bolt" />
          训练分析
        </Link>
        <Link to="/train/body">
          <Icon name="user" />
          身体记录
        </Link>
        <Link to="/train/data">
          <Icon name="bag" />
          数据管理
        </Link>
      </div>
      <p className="gym-muted">计划训练：每有效分钟 1 XP，组间休息不计时。</p>
    </section>
  );
}
function PlanAdvice() {
  const [goal, setGoal] = useState("建立规律"),
    [days, setDays] = useState("3"),
    [text, setText] = useState(""),
    [source, setSource] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <details className="gym-form">
      <summary>帮我选择计划结构</summary>
      <p className="gym-muted">
        建议只供选择模板；动作、目标和重量仍由你确认，系统不会自动改计划。
      </p>
      <div className="gym-two">
        <label>
          本次目标
          <select value={goal} onChange={(e) => setGoal(e.target.value)}>
            <option>建立规律</option>
            <option>力量基础</option>
            <option>分部位练习</option>
          </select>
        </label>
        <label>
          每周可安排天数
          <select value={days} onChange={(e) => setDays(e.target.value)}>
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      <button
        className="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const fallback =
            goal === "力量基础"
              ? "可以从 5×5 基础模板开始，先熟悉动作，再自行确认负重。"
              : Number(days) >= 4
                ? "可以查看上下肢或推拉腿模板，分开安排训练日，保留休息日。"
                : "可以从全身训练模板开始，把训练安排在不连续的日子。";
          try {
            if (await probeCoach()) {
              const result = await askCoach([
                {
                  role: "system",
                  content:
                    "你为动伴选择训练计划结构。只能在全身、上下肢、推拉腿、5×5四个模板中解释选择，不提供重量、医疗或营养建议，不声称已修改计划。请用80字以内中文。",
                },
                {
                  role: "user",
                  content: "目标：" + goal + "；每周可安排" + days + "天。",
                },
              ]);
              setText(result.ok ? result.text : fallback);
              setSource(
                result.ok
                  ? "已配置 HTTP 陪练建议"
                  : "服务暂不可用 · 本地规则建议",
              );
            } else {
              setText(fallback);
              setSource("未配置 HTTP 陪练 · 本地规则建议");
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "正在整理建议…" : "查看结构建议"}
      </button>
      {text && (
        <p role="status">
          <b>{source}</b>
          <br />
          {text}
        </p>
      )}
    </details>
  );
}
export default function PlanHub() {
  const navigate = useNavigate(),
    query = useGymQuery("/training-plans"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const create = async (template: any) => {
    setBusy(true);
    try {
      const p = await request("POST", "/training-plans", template);
      navigate("/train/plans/" + p.id + "/edit");
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page gym-page">
      <Header title="我的训练计划" back={() => navigate("/train")} />
      <p className="gym-lead">把想练的，安排成自己的节奏。</p>
      <div className="gym-toolbar">
        <Link to="/train/library">动作库</Link>
        <Link to="/train/stats">训练分析</Link>
        <Link to="/train/body">身体记录</Link>
        <Link to="/train/data">导入／导出</Link>
      </div>
      {(query.error || error) && (
        <div className="gym-error">
          {query.error || error}
          <button onClick={query.reload}>重试</button>
        </div>
      )}
      <h3>我的计划</h3>
      {query.loading ? (
        <p>正在读取…</p>
      ) : !query.data?.items.length ? (
        <p className="gym-empty">还没有计划，从下面的模板创建一份。</p>
      ) : (
        query.data.items.map((p: any) => (
          <article className="gym-plan-row" key={p.id}>
            <div>
              <h3>{p.name}</h3>
              <p>
                {p.mode === "rotation" ? "按 A / B / C 循环" : "按每周日程"} ·{" "}
                {p.routines.length} 个训练日
              </p>
              <div className="gym-routine-links">
                {p.routines.map((r: any) => (
                  <button
                    key={r.id}
                    className="secondary"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const w = await beginWorkout({
                          planId: p.id,
                          routineId: r.id,
                        });
                        navigate("/train/workout/" + w.id);
                      } catch (e) {
                        setError(getErrorMessage(e));
                        setBusy(false);
                      }
                    }}
                  >
                    {r.name} · 开始
                  </button>
                ))}
              </div>
            </div>
            <Link to={"/train/plans/" + p.id + "/edit"}>
              编辑
              <Icon name="pencil" size={18} />
            </Link>
          </article>
        ))
      )}
      <PlanAdvice />
      <h3>从模板开始</h3>
      <p className="gym-muted">
        模板只提供结构；负重默认 0 kg，由你选择适合自己的设置。
      </p>
      <div className="gym-template-grid">
        {query.data?.templates.map((t: any) => (
          <button key={t.key} disabled={busy} onClick={() => void create(t)}>
            <Icon name="dumbbell" />
            <b>{t.name}</b>
            <small>{t.routines.length} 个训练日 · 可自由编辑</small>
            <span>使用模板 →</span>
          </button>
        ))}
      </div>
    </div>
  );
}
