import { displayWeight } from "./trainingMath";
import { setPlanRows, setTargetLabel } from "./trainingPresentation";

/**
 * 准备阶段左栏的「本组安排」卡（方案 B「安排上移」）：数据直接来自训练
 * 安排本身（row.sets，与下方「调整本次训练安排」编辑器同一份），不另存
 * 状态；「调整 ›」由页面负责展开并滚动到编辑器。
 */
export function SetPlanCard({
  sets,
  cursor,
  unit,
  onAdjust,
}: {
  sets: any[];
  cursor: number;
  unit?: string;
  onAdjust: () => void;
}) {
  const rows = setPlanRows(sets, cursor);
  if (!rows.length) return null;
  const unitLabel = unit || "kg";
  return (
    <section className="gym-set-plan" aria-label="本组安排">
      <div className="gym-set-plan-head">
        <b>本组安排</b>
        <button type="button" className="gym-set-plan-adjust" onClick={onAdjust}>
          调整 ›
        </button>
      </div>
      <ul className="gym-set-plan-list">
        {rows.map((row) => {
          const load = row.set.targetLoadKg ?? row.set.loadKg;
          return (
            <li key={row.set.id} className={row.isCurrent ? "is-current" : undefined}>
              <span className="gym-set-plan-main">
                <b>第 {row.position} 组</b>
                <span>
                  {setTargetLabel(row.set)}
                  {typeof load === "number" && load > 0
                    ? ` · ${displayWeight(load, unitLabel)} ${unitLabel}`
                    : ""}
                </span>
              </span>
              <span className="gym-set-plan-state">{row.stateText}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
