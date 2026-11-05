// 「最近用过」的数据来自训练记录接口（/workout-sessions，按创建时间
// 倒序返回，每组都带开始训练时快照的完整动作对象）。按记录顺序取
// 动作 id：先出现的更近，重复只留第一次，畸形记录跳过不报错。
export function recentExerciseIds(workouts: any[], limit = 30): string[] {
  const seen = new Set<string>(),
    ids: string[] = [];
  for (const workout of workouts || []) {
    for (const set of workout?.sets || []) {
      const id = set?.exercise?.id;
      if (typeof id !== "string" || !id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      if (ids.length >= limit) return ids;
    }
  }
  return ids;
}
