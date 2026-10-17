import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Header } from "../motion/components/Header";
import Dialog from "../../components/Dialog";
import { ExerciseLibrary } from "./Library";
import paths from "./muscle-paths.json";
import { WeightInput } from "./WeightInput";
import { canonicalWeight, displayWeight } from "./trainingMath";
import FullTransfer from "./FullTransfer";
import { AnalysisExtras } from "./AnalysisExtras";
import {
  request,
  useGymQuery,
  getErrorMessage,
  download,
  label,
  formatTime,
} from "./api";
function Status({ query }: { query: ReturnType<typeof useGymQuery> }) {
  return query.error ? (
    <div className="gym-error" role="alert">
      {query.error}
      <button onClick={query.reload}>重试</button>
    </div>
  ) : query.loading && !query.data ? (
    <p>正在读取…</p>
  ) : null;
}
function Page({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="page gym-page">
      <Header title={title} back={() => navigate("/train")} />
      {children}
    </div>
  );
}
const muscleBody: Record<string, string> = {
  upperChest: "chest",
  lowerChest: "chest",
  upperAbs: "waist",
  lowerAbs: "waist",
  innerQuad: "upper legs",
  outerQuad: "upper legs",
  hipFlexors: "upper legs",
  frontDeltoid: "shoulders",
  rearDeltoid: "shoulders",
  upperTrapezius: "back",
  lats: "back",
  chest: "chest",
  abs: "waist",
  obliques: "waist",
  quadriceps: "upper legs",
  hamstring: "upper legs",
  gluteal: "upper legs",
  glutes: "upper legs",
  calves: "lower legs",
  biceps: "upper arms",
  triceps: "upper arms",
  forearm: "lower arms",
  forearms: "lower arms",
  deltoids: "shoulders",
  upperBack: "back",
  lowerBack: "back",
  trapezius: "back",
  adductors: "upper legs",
  tibialis: "lower legs",
};
export function Analytics() {
  const prefs = useGymQuery("/training-settings"),
    unit = prefs.data?.unit || "kg";
  const query = useGymQuery("/training-analytics"),
    a = query.data,
    [side, setSide] = useState<"front" | "back">("front"),
    [part, setPart] = useState(""),
    [period, setPeriod] = useState("months");
  return (
    <Page title="训练分析">
      <nav className="gym-links">
        <Link to="/history">全部运动记录</Link>
        <Link to="/train/records">逐组记录</Link>
        <Link to="/train/body">身体记录</Link>
        <Link to="/train/data">导入与导出</Link>
      </nav>
      <Status query={query} />
      {a && (
        <>
          <AnalysisExtras data={a} />
          <p className="gym-muted">
            统计计划训练及导入的逐组记录；独立动作与个人计时可在运动记录查看。外部负重训练量
            = kg × 次数，每侧记录按两侧合计。徒手动作不估算体重负重。
          </p>
          <div className="gym-stat-grid">
            {[
              ["训练次数", a.workouts],
              ["完成组数", a.sets],
              ["累计次数", a.reps],
              ["外部训练量 " + unit, displayWeight(a.volume, unit)],
            ].map(([name, value]) => (
              <div key={name}>
                <span>{name}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <section className="gym-form">
            <div className="gym-section-title">
              <h2>肌群覆盖</h2>
              <button
                className="secondary"
                onClick={() => setSide(side === "front" ? "back" : "front")}
              >
                {side === "front" ? "查看背面" : "查看正面"}
              </button>
            </div>
            <p className="gym-muted">
              展示记录覆盖与最近训练日期，不代表确定的身体恢复状态。选择区域可查看对应动作。
            </p>
            <div className="gym-muscle-layout">
              <svg
                className="gym-muscle-map"
                viewBox={side === "front" ? "0 95 727 1280" : "718 95 727 1280"}
                aria-label={
                  side === "front" ? "正面肌群覆盖图" : "背面肌群覆盖图"
                }
                role="img"
              >
                {paths[side].map((m: any, i: number) => {
                  const b = muscleBody[m.muscle] || m.muscle,
                    n = a.muscles[b]?.sets || 0;
                  return (
                    <g key={i} onClick={() => setPart(b)} aria-hidden="true">
                      {m.paths.map((p: string, j: number) => (
                        <path
                          key={j}
                          d={p}
                          fill={
                            part === b ? "#00bb57" : n ? "#8fe7b1" : "#e5ece8"
                          }
                          stroke="#fff"
                          strokeWidth="3"
                        />
                      ))}
                    </g>
                  );
                })}
              </svg>
              <div>
                <p>近期覆盖（30 天）：</p>
                {Object.entries(a.muscles as Record<string, any>).map(
                  ([key, value]) => (
                    <button
                      className={
                        "gym-muscle-item " + (part === key ? "selected" : "")
                      }
                      key={key}
                      onClick={() => setPart(key)}
                    >
                      <b>{label(key)}</b>
                      <span>
                        {value.sets} 组 · 最近{" "}
                        {new Date(value.lastAt).toLocaleDateString("zh-CN")}
                      </span>
                    </button>
                  ),
                )}
                {!Object.keys(a.muscles).length && (
                  <p>完成训练后显示肌群覆盖。</p>
                )}
                {part && (
                  <Link
                    className="secondary"
                    to={"/train/library?muscle=" + encodeURIComponent(part)}
                  >
                    查看{label(part)}动作
                  </Link>
                )}
              </div>
            </div>
            <small className="gym-muted">
              人体图形：MuscleMap（MIT）。
              <a href="/licenses/MuscleMap-MIT.txt">许可与署名</a>
            </small>
          </section>
          <section className="gym-form">
            <div className="gym-section-title">
              <h2>训练量趋势</h2>
              <select
                aria-label="趋势周期"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                <option value="weeks">按周</option>
                <option value="months">按月</option>
              </select>
            </div>
            {Object.entries((a[period] || {}) as Record<string, number>)
              .slice(-12)
              .map(([date, v]) => (
                <div className="gym-trend" key={date}>
                  <span>{date}</span>
                  <meter
                    min={0}
                    max={Math.max(
                      1,
                      ...(Object.values(a[period] || {}) as number[]),
                    )}
                    value={v}
                  />
                  <b>
                    {displayWeight(v, unit)} {unit}
                  </b>
                </div>
              ))}
            {!Object.keys(a[period] || {}).length && <p>尚无训练量记录。</p>}
          </section>
          <section className="gym-form">
            <h2>训练日历</h2>
            <div className="gym-calendar">
              {Array.from({ length: 84 }, (_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - (83 - i));
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
                  n = a.days[key] || 0;
                return (
                  <div
                    key={key}
                    title={`${key}：${n} 次训练`}
                    aria-label={`${key}：${n} 次训练`}
                    style={{ background: n ? "#00a74e" : "#eef2ef" }}
                  />
                );
              })}
            </div>
            <p className="gym-muted">近 12 周，绿色代表有完成的训练。</p>
          </section>
          <section className="gym-form">
            <h2>个人纪录</h2>
            {a.records.length ? (
              a.records.map((r: any, i: number) => (
                <div key={i} className="gym-list-row">
                  <b>{r.name}</b>
                  <span>
                    最大负重 {displayWeight(r.loadKg, unit)}
                    {unit} · 最多 {r.reps} 次 · 单组{" "}
                    {displayWeight(r.volume, unit)}
                    {unit}·次
                  </span>
                </div>
              ))
            ) : (
              <p>完成一组，留下你的第一条纪录。</p>
            )}
          </section>
        </>
      )}
    </Page>
  );
}
export function BodyRecords() {
  const q = useGymQuery("/body-measurements"),
    [form, setForm] = useState<Record<string, string>>({
      date: new Date().toLocaleDateString("en-CA"),
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [measure, setMeasure] = useState("weightKg");
  const unit = q.data?.settings?.unit || "kg";
  return (
    <Page title="身体记录">
      <p className="gym-muted">
        仅当前账号可见。记录供趋势参考，不作为健康诊断。
      </p>
      <Status query={q} />
      <form
        className="gym-form"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          void request(
            "PUT",
            "/body-measurements",
            Object.fromEntries(
              Object.entries(form)
                .filter(([, v]) => v !== "")
                .map(([k, v]) => [k, k === "date" ? v : Number(v)]),
            ),
          )
            .then((data) => {
              q.setData(data);
              setMessage("记录已保存");
            })
            .catch((e) => setError(getErrorMessage(e)))
            .finally(() => setBusy(false));
        }}
      >
        <label>
          日期
          <input
            type="date"
            required
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </label>
        <div className="gym-two">
          {[
            ["weightKg", "体重 " + unit],
            ["goalKg", "目标体重 " + unit],
            ["waistCm", "腰围 cm"],
            ["chestCm", "胸围 cm"],
            ["hipCm", "臀围 cm"],
          ].map(([id, title]) => (
            <label key={id}>
              {title}
              <input
                type="number"
                min="1"
                max={
                  id.endsWith("Kg") ? (unit === "lb" ? 1543.2358 : 700) : 400
                }
                step="0.1"
                value={
                  form[id]
                    ? id.endsWith("Kg")
                      ? displayWeight(Number(form[id]), unit)
                      : form[id]
                    : ""
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    [id]:
                      e.target.value !== "" && id.endsWith("Kg")
                        ? String(canonicalWeight(Number(e.target.value), unit))
                        : e.target.value,
                  })
                }
              />
            </label>
          ))}
        </div>
        <button className="primary" disabled={busy}>
          {busy ? "正在保存…" : "保存身体记录"}
        </button>
        {error && (
          <p className="gym-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="gym-success">
            {message}
          </p>
        )}
      </form>
      {q.data && (
        <section className="gym-form">
          <h2>体重与围度趋势</h2>
          <p>
            目标体重：
            {q.data.settings.goalKg
              ? `${displayWeight(q.data.settings.goalKg, unit)} ${unit}`
              : "尚未设置"}
          </p>
          <label>
            趋势指标
            <select
              value={measure}
              onChange={(e) => setMeasure(e.target.value)}
            >
              {[
                ["weightKg", "体重 " + unit],
                ["waistCm", "腰围 cm"],
                ["chestCm", "胸围 cm"],
                ["hipCm", "臀围 cm"],
              ].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <div className="gym-weight-chart">
            {q.data.items
              .filter((r: any) => r[measure])
              .slice(-20)
              .map((r: any) => (
                <div key={r.date}>
                  <span>
                    {measure === "weightKg"
                      ? displayWeight(r[measure], unit)
                      : r[measure]}
                    {measure === "weightKg" ? unit : "cm"}
                  </span>
                  <div
                    style={{
                      height: Math.max(
                        10,
                        (r[measure] /
                          Math.max(
                            ...q.data.items.map((x: any) => x[measure] || 0),
                          )) *
                          120,
                      ),
                    }}
                  />
                  <small>{r.date.slice(5)}</small>
                </div>
              ))}
          </div>
          {q.data.items.length ? (
            q.data.items
              .slice()
              .reverse()
              .map((r: any) => (
                <button
                  key={r.date}
                  className="gym-body-row"
                  onClick={() => {
                    setForm(
                      Object.fromEntries(
                        Object.entries(r).map(([k, v]) => [k, String(v)]),
                      ),
                    );
                    setMessage("已载入，可修改后保存");
                  }}
                >
                  <b>{r.date}</b>
                  <span>
                    体重{" "}
                    {r.weightKg != null ? displayWeight(r.weightKg, unit) : "—"}
                    {unit} · 腰 {r.waistCm ?? "—"} · 胸 {r.chestCm ?? "—"} · 臀{" "}
                    {r.hipCm ?? "—"} cm
                  </span>
                  <small>编辑</small>
                </button>
              ))
          ) : (
            <p>还没有身体记录。</p>
          )}
        </section>
      )}
    </Page>
  );
}
export function WorkoutRecords() {
  const prefs = useGymQuery("/training-settings"),
    unit = prefs.data?.unit || "kg";
  const q = useGymQuery("/workout-sessions"),
    [editing, setEditing] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Page title="逐组训练记录">
      <Status query={q} />
      <p className="gym-muted">
        编辑历史只重新计算训练分析，不改变已经结算的时长、XP 或识别成长。
      </p>
      {q.data?.length
        ? q.data.map((w: any) => (
            <article className="gym-form" key={w.id}>
              <div className="gym-section-title">
                <div>
                  <h3>{w.name}</h3>
                  <time>{new Date(w.createdAt).toLocaleString("zh-CN")}</time>
                </div>
                <strong>
                  {w.imported
                    ? "历史导入 · 0 XP"
                    : w.phase !== "finished"
                      ? "未结束"
                      : w.session.settled
                        ? `+${w.session.xpEarned} XP`
                        : "待活动结算"}
                </strong>
              </div>
              <p>
                {w.sets.filter((s: any) => s.status === "completed").length}{" "}
                组完成 ·{" "}
                {w.session
                  ? formatTime(w.session.effectiveSeconds)
                  : "无可结算时长"}
              </p>
              {w.phase !== "finished" ? (
                <Link to={"/train/workout/" + w.id} className="primary">
                  恢复训练
                </Link>
              ) : (
                <>
                  <details>
                    <summary>查看每组</summary>
                    {w.sets.map((s: any, i: number) => (
                      <div className="gym-list-row" key={s.id}>
                        <span>
                          {i + 1}. {s.exercise.nameZh}
                        </span>
                        <b>
                          {s.reps}{" "}
                          {s.exercise.cameraType === "high_knees" ? "对" : "次"}{" "}
                          × {displayWeight(s.loadKg, unit)}
                          {unit} · {s.seconds}秒
                        </b>
                        <small>
                          {s.inputMode === "camera"
                            ? s.score.count
                              ? `识别均分 ${Math.round(s.score.total / s.score.count)}`
                              : "未产生评分"
                            : "手动记录"}
                        </small>
                        {s.effort && (
                          <small>
                            本人填写 {s.effort.kind.toUpperCase()}：
                            {s.effort.value} / 10
                          </small>
                        )}
                        {s.notes && <small>备注：{s.notes}</small>}
                      </div>
                    ))}
                  </details>
                  <button
                    className="secondary"
                    onClick={() => {
                      setEditing(structuredClone(w));
                      setError("");
                    }}
                  >
                    编辑重量与次数
                  </button>
                </>
              )}
            </article>
          ))
        : q.data && (
            <div className="gym-empty">
              <h2>还没有计划训练记录</h2>
              <Link className="primary" to="/train/plans">
                创建你的第一个计划
              </Link>
            </div>
          )}
      {editing && (
        <Dialog title="编辑训练历史" onClose={() => !busy && setEditing(null)}>
          <div className="gym-page">
            <p>保存后这些组标为手动记录，保留原始已结算 XP。</p>
            {editing.sets.map((s: any, i: number) => (
              <div className="gym-form" key={s.id}>
                <b>{s.exercise.nameZh}</b>
                <div className="gym-two">
                  {[["reps", "实际次数"]].map(([key, title]) => (
                    <label key={key}>
                      {title}
                      <input
                        type="number"
                        min="0"
                        max={key === "reps" ? 100000 : 1000}
                        step={key === "reps" ? 1 : 0.25}
                        value={s[key]}
                        onChange={(e) =>
                          setEditing((w: any) => ({
                            ...w,
                            sets: w.sets.map((x: any, j: number) =>
                              j === i
                                ? { ...x, [key]: Number(e.target.value) }
                                : x,
                            ),
                          }))
                        }
                      />
                    </label>
                  ))}
                  <WeightInput
                    kg={s.loadKg}
                    unit={unit}
                    onChange={(kg) =>
                      setEditing((w: any) => ({
                        ...w,
                        sets: w.sets.map((x: any, j: number) =>
                          j === i ? { ...x, loadKg: kg } : x,
                        ),
                      }))
                    }
                  />
                </div>
              </div>
            ))}
            {error && <p className="gym-error">{error}</p>}
            <button
              className="primary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void request(
                  "PATCH",
                  "/workout-sessions/" + editing.id + "/history",
                  {
                    version: editing.version,
                    sets: editing.sets.map((s: any) => ({
                      id: s.id,
                      reps: s.reps,
                      loadKg: s.loadKg,
                    })),
                  },
                )
                  .then(() => {
                    setEditing(null);
                    q.reload();
                  })
                  .catch((e) => setError(getErrorMessage(e)))
                  .finally(() => setBusy(false));
              }}
            >
              保存历史更正
            </button>
          </div>
        </Dialog>
      )}
    </Page>
  );
}
const csvCell = (v: any) =>
  '"' +
  String(v ?? "")
    .replace(/^[=+@-]/, "'$&")
    .replace(/"/g, '""') +
  '"';
export function DataManagement() {
  const [format, setFormat] = useState("opengym"),
    [text, setText] = useState(""),
    [unit, setUnit] = useState("kg"),
    [preview, setPreview] = useState<any>(null),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [pick, setPick] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [planFile, setPlanFile] = useState<any>(null);
  const perform = async (job: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await job();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const payload = { format, text, unit, mapping };
  return (
    <Page title="训练数据管理">
      <FullTransfer />
      <p className="gym-muted">
        下方粘贴入口只处理单批内容，导入和补录均不补发 XP；每批最多 100
        次训练、2000 组、1.8 MB。所有未知动作匹配后才会写入。
      </p>
      <details className="gym-form">
        <summary>粘贴记录／导入分享计划</summary>
        <div className="gym-two">
          <label>
            文件格式
            <select
              value={format}
              onChange={(e) => {
                setFormat(e.target.value);
                setPreview(null);
              }}
            >
              {[
                ["opengym", "openGym JSON"],
                ["movemate", "动伴 JSON"],
                ["strong", "Strong CSV"],
                ["hevy", "Hevy CSV"],
                ["fitnotes", "FitNotes CSV"],
              ].map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
          </label>
          <label>
            CSV 原始重量单位
            <select
              value={unit}
              onChange={(e) => {
                setUnit(e.target.value);
                setPreview(null);
              }}
            >
              <option value="kg">千克 kg</option>
              <option value="lb">磅 lb（将转换为 kg）</option>
            </select>
          </label>
        </div>
        <label>
          选择本人导出文件
          <input
            type="file"
            accept=".json,.csv,text/csv,application/json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setPreview(null);
              setMapping({});
              setPlanFile(null);
              if (file.size > 1800000) {
                setError("文件超过 1.8MB，请拆分后导入");
                return;
              }
              void file.text().then((value) => {
                setText(value);
                try {
                  const parsed = JSON.parse(value);
                  if (parsed.format === "movemate-plan") setPlanFile(parsed);
                } catch {}
              });
            }}
          />
        </label>
        <label>
          或粘贴文件内容
          <textarea
            rows={6}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPreview(null);
              setPlanFile(null);
            }}
          />
        </label>
        <button
          className="primary"
          disabled={busy || !text}
          onClick={() =>
            void perform(async () => {
              try {
                const parsed = JSON.parse(text);
                if (parsed.format === "movemate-plan") {
                  setPlanFile(parsed);
                  return;
                }
              } catch {}
              setPreview(
                await request("POST", "/training-imports/preview", payload),
              );
            })
          }
        >
          解析并预览，不写入
        </button>
        {planFile && (
          <div className="gym-preview">
            <h3>计划：{planFile.plan?.name}</h3>
            <p>
              {planFile.plan?.routines?.length}{" "}
              个训练日，自定义动作会复制到当前账号，进阶修改仍需本人确认。
            </p>
            <button
              disabled={busy}
              className="primary"
              onClick={() =>
                void perform(async () => {
                  const r = await request(
                    "POST",
                    "/training-imports/plan",
                    planFile,
                  );
                  setMessage(
                    r.duplicate
                      ? "这份计划已导入，无重复创建"
                      : "计划已导入，可在我的计划编辑",
                  );
                  setPlanFile(null);
                  setText("");
                })
              }
            >
              确认导入计划
            </button>
          </div>
        )}
        {preview && (
          <div className="gym-preview">
            <h3>
              发现 {preview.count} 次训练，{preview.duplicates} 次重复
            </h3>
            <p>
              本次预计新增 {preview.count - preview.duplicates} 次历史 · 0 XP
            </p>
            {preview.workouts.slice(0, 10).map((w: any, i: number) => (
              <p key={i}>
                {w.date.slice(0, 10)} · {w.name} · {w.sets.length} 组
              </p>
            ))}
            {preview.missing.map((name: string) => (
              <div className="gym-list-row" key={name}>
                <span>无法匹配：{name}</span>
                <button className="secondary" onClick={() => setPick(name)}>
                  {mapping[name] ? "重新匹配" : "选择对应动作"}
                </button>
              </div>
            ))}
            <button
              className="primary"
              disabled={busy || preview.missing.length > 0}
              onClick={() =>
                void perform(async () => {
                  const r = await request(
                    "POST",
                    "/training-imports/commit",
                    payload,
                  );
                  setMessage(
                    `已导入 ${r.imported} 次，跳过 ${r.duplicates} 次重复，不补发 XP`,
                  );
                  setPreview(null);
                  setText("");
                })
              }
            >
              确认写入历史
            </button>
          </div>
        )}
      </details>
      <section className="gym-form">
        <h2>导出本人数据</h2>
        <p>
          版本 2 JSON 包含计划、自定义动作、逐组记录、身体记录及个人设置；CSV
          用于表格查看，不包含账号凭据。计划在编辑页可打印为 PDF。
        </p>
        <div className="gym-links">
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void perform(async () =>
                download(
                  "movemate-training.json",
                  JSON.stringify(
                    await request("GET", "/training-export"),
                    null,
                    2,
                  ),
                ),
              )
            }
          >
            导出 JSON
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                const d = await request("GET", "/training-export");
                const rows = [
                  [
                    "Date",
                    "Workout Name",
                    "Exercise Name",
                    "Set Order",
                    "Weight",
                    "Reps",
                    "Seconds",
                  ],
                  ...d.workouts.flatMap((w: any) =>
                    w.sets
                      .filter((s: any) => s.status === "completed")
                      .map((s: any, i: number) => [
                        w.createdAt,
                        w.name,
                        s.exercise.nameZh,
                        i + 1,
                        s.loadKg,
                        s.reps,
                        s.seconds,
                      ]),
                  ),
                ];
                download(
                  "movemate-training.csv",
                  "\uFEFF" +
                    rows.map((r) => r.map(csvCell).join(",")).join("\r\n"),
                  "text/csv;charset=utf-8",
                );
              })
            }
          >
            导出 CSV
          </button>
        </div>
        <p>
          <a href="/licenses/Exercises-dataset-MIT.txt">动作文本数据许可</a> ·{" "}
          <a href="/licenses/MuscleMap-MIT.txt">人体图数据许可</a>
        </p>
      </section>
      {error && (
        <p className="gym-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="gym-success" role="status">
          {message}
        </p>
      )}
      {pick && (
        <Dialog title={"匹配动作：" + pick} onClose={() => setPick("")}>
          <div className="gym-page">
            <ExerciseLibrary
              onPick={(e) => {
                const next = { ...mapping, [pick]: e.id };
                setMapping(next);
                setPick("");
                void perform(async () =>
                  setPreview(
                    await request("POST", "/training-imports/preview", {
                      ...payload,
                      mapping: next,
                    }),
                  ),
                );
              }}
            />
          </div>
        </Dialog>
      )}
    </Page>
  );
}
