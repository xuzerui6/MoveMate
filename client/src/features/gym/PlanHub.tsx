import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useGymQuery, request, getErrorMessage, beginWorkout } from "./api";
import { Header } from "../motion/components/Header";
import { Icon } from "../motion/components/Icons";
import PlanDraft from "./PlanDraft";
export function PlanEntry() {
  const query = useGymQuery("/training-plans"),
    navigate = useNavigate(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const schedule=useGymQuery("/training-schedule?days=1");
  const today=schedule.data?.entries||[];
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
      <Link className="secondary" to="/train/free">自由训练 · 先选动作再开始</Link>
      <nav className="gym-links"><Link to="/train/schedule">查看一周日程</Link><Link to="/train/settings">训练设置与器械</Link></nav><div className="gym-shortcuts">
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
        <Link to="/train/free">自由训练</Link><Link to="/train/schedule">训练日程</Link><Link to="/train/settings">训练设置</Link><Link to="/train/library">动作库</Link>
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
      <PlanDraft />
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
