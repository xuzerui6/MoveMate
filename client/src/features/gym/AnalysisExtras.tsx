import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useGymQuery, request, getErrorMessage, label } from "./api";
import { displayWeight, plateLoading } from "./trainingMath";
import { WeightInput } from "./WeightInput";
export function PlateCalculator() {
  const q = useGymQuery("/training-settings"),
    [target, setTarget] = useState(60),
    [message, setMessage] = useState("");
  const v = q.data,
    unit = v?.unit || "kg";
  let result: any = null;
  try {
    if (v) result = plateLoading(target, v.barKg, v.plates);
  } catch (e) {
    result = { error: getErrorMessage(e) };
  }
  return (
    <details className="gym-form">
      <summary>杠铃配重计算</summary>
      {q.error && <p className="gym-error">{q.error}</p>}
      {v && (
        <>
          <div className="gym-two">
            <WeightInput
              kg={target}
              unit={unit}
              onChange={setTarget}
              label="目标总重"
            />
            <WeightInput
              kg={v.barKg}
              unit={unit}
              onChange={(kg) => q.setData({ ...v, barKg: kg })}
              label="空杆重量"
            />
          </div>
          <p className="gym-muted">
            杠铃片数量是两侧合计。只计算对称方案，不会更改训练目标。
          </p>
          {v.plates.map((p: any, i: number) => (
            <div className="gym-two" key={i}>
              <WeightInput
                kg={p.kg}
                unit={unit}
                onChange={(kg) =>
                  q.setData({
                    ...v,
                    plates: v.plates.map((x: any, j: number) =>
                      j === i ? { ...x, kg } : x,
                    ),
                  })
                }
                label="杠铃片重量"
              />
              <label>
                拥有数量
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={p.count}
                  onChange={(e) =>
                    q.setData({
                      ...v,
                      plates: v.plates.map((x: any, j: number) =>
                        j === i ? { ...x, count: Number(e.target.value) } : x,
                      ),
                    })
                  }
                />
              </label>
            </div>
          ))}
          <div className="gym-inline-actions">
            <button
              onClick={() =>
                q.setData({
                  ...v,
                  plates: [...v.plates, { kg: 1.25, count: 2 }],
                })
              }
              disabled={v.plates.length >= 30}
            >
              添加片规格
            </button>
            <button
              onClick={async () => {
                try {
                  q.setData(
                    await request("PUT", "/training-settings", {
                      barKg: v.barKg,
                      plates: v.plates,
                    }),
                  );
                  setMessage("器械配置已保存");
                } catch (e) {
                  setMessage(getErrorMessage(e));
                }
              }}
            >
              保存器械配置
            </button>
          </div>
          {message && <p role="status">{message}</p>}
          {result && !result.error && (
            <p role="status">
              每侧：
              {result.sides
                .map(
                  (s: any) =>
                    `${displayWeight(s.kg, unit)} ${unit} × ${s.count}`,
                )
                .join(" + ") || "不加片"}
              。总重 {displayWeight(result.actualKg, unit)} {unit}；距目标{" "}
              {displayWeight(result.differenceKg, unit)} {unit}
              {result.belowBar ? "，目标低于空杆重量" : ""}。
            </p>
          )}
          {result?.error && <p role="alert">{result.error}</p>}
        </>
      )}
    </details>
  );
}
export function AnalysisExtras({ data }: { data: any }) {
  const prefs = useGymQuery("/training-settings"),
    [id, setId] = useState(""),
    [metric, setMetric] = useState("volume"),
    unit = prefs.data?.unit || "kg";
  const entries = Object.entries(data.exerciseHistory || {}) as [
    string,
    any[],
  ][];
  const selected = entries.find(([key]) => key === id) || entries[0];
  const calendar = useMemo(() => {
    const end = new Date(
      (data.today || new Date().toISOString().slice(0, 10)) + "T12:00:00Z",
    );
    return Array.from({ length: 366 }, (_, i) => {
      const d = new Date(end);
      d.setUTCDate(d.getUTCDate() - 365 + i);
      const date = d.toISOString().slice(0, 10);
      return { date, count: data.days?.[date] || 0 };
    });
  }, [data.today, data.days]);
  return (
    <>
      <section className="gym-form">
        <h2>一年活动日历</h2>
        <p className="gym-muted">
          按 {data.timeZone || "账号时区"} 展示；深绿色代表更多训练。
        </p>
        <div
          className="gym-year-calendar"
          role="img"
          aria-label="最近366天训练日历"
        >
          {calendar.map((d) => (
            <span
              key={d.date}
              title={`${d.date} · ${d.count} 次训练`}
              aria-label={`${d.date} ${d.count}次`}
              data-level={Math.min(3, d.count)}
            />
          ))}
        </div>
      </section>
      <section className="gym-form">
        <h2>逐动作历史与趋势</h2>
        {!entries.length ? (
          <p>完成训练后显示趋势。</p>
        ) : (
          <>
            <label>
              查看动作
              <select
                value={selected?.[0] || ""}
                onChange={(e) => setId(e.target.value)}
              >
                {entries.map(([key, rows]) => (
                  <option value={key} key={key}>
                    {rows[0]?.name || key}
                  </option>
                ))}
              </select>
            </label>
            <p className="gym-muted">
              估算 1RM = 重量 × (1 + 次数 ÷ 30)，仅正式完成、外部负重且 1–10
              次的组；仅作回顾，不作为训练处方。
            </p>
            <label>
              趋势指标
              <select
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
              >
                <option value="volume">训练量</option>
                <option value="loadKg">最大外部负重</option>
                <option value="reps">完成次数</option>
                <option value="e1rm">估算 1RM</option>
              </select>
            </label>
            <svg
              viewBox="0 0 600 150"
              role="img"
              aria-label="所选动作历史趋势曲线"
              className="gym-line-chart"
            >
              <polyline
                fill="none"
                stroke="#00b863"
                strokeWidth="3"
                points={(selected?.[1] || [])
                  .filter((r: any) => r[metric] !== null)
                  .map(
                    (r: any, i: number, rows: any[]) =>
                      `${20 + (i * 560) / Math.max(1, rows.length - 1)},${130 - (r[metric] / Math.max(1, ...rows.map((x: any) => x[metric] || 0))) * 110}`,
                  )
                  .join(" ")}
              />
            </svg>
            <div className="gym-trend-bars">
              {selected?.[1].slice(-20).map((r: any, i: number) => (
                <div
                  key={i}
                  title={`${r.date} · ${displayWeight(r.volume, unit)} ${unit}·次`}
                >
                  <span
                    style={{
                      height:
                        Math.max(
                          4,
                          Math.min(
                            100,
                            (r.volume /
                              Math.max(
                                1,
                                ...selected[1].map((x: any) => x.volume),
                              )) *
                              100,
                          ),
                        ) + "%",
                    }}
                  />
                  <small>{r.date.slice(5)}</small>
                </div>
              ))}
            </div>
            <div className="gym-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>最大负重 {unit}</th>
                    <th>次数</th>
                    <th>训练量 {unit}·次</th>
                    <th>估算 1RM {unit}</th>
                  </tr>
                </thead>
                <tbody>
                  {selected?.[1].map((r: any, i: number) => (
                    <tr key={i}>
                      <td>{r.date}</td>
                      <td>{displayWeight(r.loadKg, unit)}</td>
                      <td>{r.reps}</td>
                      <td>{displayWeight(r.volume, unit)}</td>
                      <td>{r.e1rm ? displayWeight(r.e1rm, unit) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="gym-muted">
              上方为训练量趋势；表内负重、次数、估算 1RM 按日期对照。
            </p>
          </>
        )}
      </section>
      <details className="gym-form">
        <summary>主练与辅助肌群明细（近 30 天）</summary>
        {Object.entries(data.muscleDetails || {}).map(
          ([name, m]: [string, any]) => (
            <p key={name}>
              {label(name)} · 主练 {m.primary} 组 · 辅助 {m.secondary} 组 ·
              距上次{" "}
              {Math.max(
                0,
                Math.floor((Date.now() - Date.parse(m.lastAt)) / 86400000),
              )}{" "}
              天
            </p>
          ),
        )}
        <p className="gym-muted">
          依据训练记录展示覆盖，不推断确定的生理恢复状态。
        </p>
      </details>
      <PlateCalculator />
      <Link to="/train/settings">更改显示单位与时区</Link>
    </>
  );
}
