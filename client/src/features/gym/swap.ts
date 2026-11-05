import {
  regionFilterCodes,
  REGION_LABELS,
  OUTLINELESS_FILTERS,
} from "./media";

// 目录里同一肌群有多种等价写法（如 quads 与 quadriceps、delts 与
// deltoids）：等价集合由人体图浏览的区域→代码映射反推，与 P1 的筛选
// 口径一致，不另立一份别名表。找不到任何区域时只含目标本身。
export function equivalentTargetCodes(target: string): string[] {
  const codes = new Set<string>([target]);
  for (const region of Object.keys(REGION_LABELS)) {
    const set = regionFilterCodes(region);
    if (set.includes(target)) for (const code of set) codes.add(code);
  }
  // 背阔肌在示意图上没有轮廓，它的等价代码只写在 OUTLINELESS_FILTERS
  // 里（latissimus dorsi 与 lats），区域映射里查不到，要单独并进来。
  for (const filter of OUTLINELESS_FILTERS)
    if (filter.codes.includes(target))
      for (const code of filter.codes) codes.add(code);
  return [...codes].sort();
}

// 换同肌群的候选排序：有完整示范素材的在前，其余保持目录原有顺序；
// 同一动作只出现一次。排序必须稳定，轮换才不会跳来跳去。当前动作不
// 在这里排除——同一份排序会被同肌群的多行共用，由取用时按行排除。
export function orderSwapCandidates<T extends { id: string }>(
  items: T[],
  hasMedia: (id: string) => boolean,
): string[] {
  const seen = new Set<string>();
  const withMedia: string[] = [],
    without: string[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    (hasMedia(item.id) ? withMedia : without).push(item.id);
  }
  return [...withMedia, ...without];
}

// 轮换取下一个：从上次换到的那个之后开始，绕回开头；没有上次记录
// （或上次的已不在候选里）就从第一个开始。候选为空返回 null。
export function nextSwapId(ordered: string[], lastId?: string): string | null {
  if (!ordered.length) return null;
  const at = lastId ? ordered.indexOf(lastId) : -1;
  return ordered[(at + 1) % ordered.length];
}
