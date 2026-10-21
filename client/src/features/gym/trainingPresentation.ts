export function repUnit(exercise: any) {
  return (exercise?.cameraType || exercise?.planCamera?.profile) === "high_knees" ? "对" : "次";
}
export function setTargetLabel(set: any) {
  return set.targetSeconds > 0 ? `${set.targetSeconds} 秒` : `${set.targetReps} ${repUnit(set.exercise)}`;
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
