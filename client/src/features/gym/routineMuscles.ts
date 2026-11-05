import { muscleRegions } from "./media";

// 一个训练日里所有动作的目标肌群映射到人体图区域后的并集。与详情页、
// 肌群覆盖共用同一套 muscleRegions 口径：背阔肌在源图上没有独立轮廓，
// 因此点不亮——与详情页一致，绝不拿别的背部肌群冒充。
export function litMuscleRegions(
  exercises: Array<{ target?: string | null } | null | undefined>,
): string[] {
  const lit = new Set<string>();
  for (const exercise of exercises)
    if (exercise?.target)
      for (const region of muscleRegions(exercise.target)) lit.add(region);
  return [...lit].sort();
}
