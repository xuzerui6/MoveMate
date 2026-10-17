import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { askCoach, probeCoach } from "../motion/lib/coachClient";
import { useGymQuery, request, getErrorMessage } from "./api";
export default function PlanDraft() {
  const q = useGymQuery("/training-plans"),
    [template, setTemplate] = useState("full"),
    [goal, setGoal] = useState("建立规律，每周三天"),
    [draft, setDraft] = useState(""),
    [source, setSource] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    navigate = useNavigate();
  return (
    <details className="gym-form">
      <summary>生成可编辑的计划草稿</summary>
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
                  if (!raw.routines?.length) throw Error();
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
                  next = raw;
                  next.progression = { mode: "off" };
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
            计划 JSON 草稿（可编辑）
            <textarea
              rows={14}
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
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
                );
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
