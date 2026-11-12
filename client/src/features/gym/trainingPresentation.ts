export function repUnit(exercise: any) {
  return (exercise?.cameraType || exercise?.planCamera?.profile) === "high_knees" ? "对" : "次";
}
export function setTargetLabel(set: any) {
  return set.targetSeconds > 0 ? `${set.targetSeconds} 秒` : `${set.targetReps} ${repUnit(set.exercise)}`;
}
export type SetPlanRow = {
  set: any;
  index: number;
  position: number;
  isCurrent: boolean;
  stateText: string;
};
/**
 * 准备页「本组安排」卡的行数据：与「调整本次训练安排」编辑器共用同一份
 * row.sets，只取当前动作的组、按动作内顺序编号；已移除的组不再算进安排
 * （仍可在编辑器里撤销）。当前组由 cursor 决定，状态文案与「查看全部
 * 训练组」保持一致。
 */
export function setPlanRows(sets: any[], cursor: number): SetPlanRow[] {
  const current = sets?.[cursor];
  if (!current) return [];
  const rows: SetPlanRow[] = [];
  for (let index = 0; index < sets.length; index++) {
    const set = sets[index];
    if (set.exercise?.id !== current.exercise?.id) continue;
    if (set.status === "removed" && index !== cursor) continue;
    const isCurrent = index === cursor;
    rows.push({
      set,
      index,
      position: rows.length + 1,
      isCurrent,
      stateText: isCurrent
        ? "当前组"
        : ({ pending: "未开始", completed: "已完成", skipped: "已跳过", working: "当前组" } as any)[set.status] || "未开始",
    });
  }
  return rows;
}
export type QueryState = {loading: boolean; error: string; data: any};
export function todayPlanState(plans: QueryState, schedule: QueryState) {
  if (schedule.loading) return "loading";
  if (schedule.error || !schedule.data) return "error";
  if (schedule.data.entries?.length) return "scheduled";
  if (plans.loading) return "loading";
  if (plans.error || !plans.data) return "error";
  return plans.data.items?.length ? "rest" : "empty";
}
