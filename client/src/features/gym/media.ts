import index from './exercise-media-index.json';
export type MediaFile = {
  bytes:number;
  src: string;
  sha256: string;
  phase?: string;
  aspectRatio?: number;
  sourceIndex?: number;
  sourceTime?: number;
  distribution?: "repository" | "site-only";
};
export type MediaSource = {
  name: string;
  author: string;
  license: string;
  licenseUrl: string;
  url: string;
  version: string;
  changes: string;
  sourceSha256?: string[];
  distribution?: "repository" | "site-only";
};
export type ExerciseMedia = {
  kind?: 'photo'|'illustration';
  note: string;
  images: MediaFile[];
  video?: MediaFile & { poster: string;posterSha256:string };
  sources: MediaSource[];
};
export type MediaSummary={thumb:string;kind:'photo'|'illustration';images:number;video:boolean;detail:string};
export const mediaIndex=index as Record<string,MediaSummary>;
export const demonstratedIds = Object.keys(mediaIndex);
export type MediaFilter = "all" | "images" | "video";
export function mediaIds(filter: MediaFilter): string[] | undefined {
  return filter === "all" ? undefined : demonstratedIds.filter(id =>
    filter === "images" ? mediaIndex[id].images > 0 : mediaIndex[id].video);
}
// An ID allowlist keeps custom/imported movements and similar variants separate.
export function mediaSummaryFor(id: string | undefined) {
  return id ? mediaIndex[id] : undefined;
}
const muscleGroups: Record<string, string[]> = {
  pectorals: ["upperChest", "lowerChest", "chest"],
  chest: ["upperChest", "lowerChest", "chest"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  forearms: ["forearm"],
  delts: ["frontDeltoid", "rearDeltoid", "deltoids"],
  shoulders: ["frontDeltoid", "rearDeltoid", "deltoids"],
  traps: ["upperTrapezius", "trapezius"],
  // This source diagram has no independent latissimus outline. Do not paint
  // another back muscle as a substitute merely to make the map look complete.
  lats: [],
  "upper back": ["upperBack"],
  "lower back": ["lowerBack"],
  abs: ["upperAbs", "lowerAbs", "abs"],
  obliques: ["obliques"],
  quadriceps: ["innerQuad", "outerQuad", "quadriceps"],
  hamstrings: ["hamstring"],
  glutes: ["gluteal"],
  calves: ["calves"],
  adductors: ["adductors"],
  "hip flexors": ["hipFlexors"],
  "tibialis anterior": ["tibialis"],
  "rear deltoids": ["rearDeltoid"],
  "lower abs": ["lowerAbs"],
  "upper chest": ["upperChest"],
  rhomboids: ["rhomboids"],
  "rotator cuff": ["rotatorCuff"],
  "serratus anterior": ["serratus"],
  serratus_anterior: ["serratus"],
};
const muscleAliases:Record<string,string>={quads:'quadriceps',deltoids:'delts',trapezius:'traps',abdominals:'abs','latissimus dorsi':'lats'};
export function muscleRegions(target: string) {
  return muscleGroups[muscleAliases[target]||target] || [];
}
// 人体图浏览：区域 → 目录肌群代码集合。由 muscleGroups 反演，保证与详情页
// 的着色口径完全一致（点中某区域筛出的，正是详情页会把该区域涂色的动作）；
// 别名代码一并纳入（如 quads 与 quadriceps 是同一肌群的两种目录写法）。
const regionCodes: Record<string, string[]> = (() => {
  const sets: Record<string, Set<string>> = {};
  const add = (region: string, code: string) =>
    (sets[region] ??= new Set()).add(code);
  for (const [code, regions] of Object.entries(muscleGroups))
    for (const region of regions) add(region, code);
  for (const [alias, canonical] of Object.entries(muscleAliases))
    for (const region of muscleGroups[canonical] || []) add(region, alias);
  // 目录里有对应目标、但示意图未单独着色的部位，按目录代码补齐
  const extras: Record<string, string[]> = {
    tibialis: ["shins"],
    neck: ["neck", "sternocleidomastoid"],
    ankles: ["ankles", "ankle stabilizers"],
    feet: ["feet"],
    hands: ["hands", "grip muscles"],
  };
  for (const [region, codes] of Object.entries(extras))
    for (const code of codes) add(region, code);
  return Object.fromEntries(
    Object.entries(sets).map(([region, codes]) => [region, [...codes].sort()]),
  );
})();
export function regionFilterCodes(region: string): string[] {
  return regionCodes[region] || [];
}
export const REGION_LABELS: Record<string, string> = {
  chest: "胸肌", upperChest: "上胸", lowerChest: "下胸",
  biceps: "肱二头肌", triceps: "肱三头肌", forearm: "前臂",
  frontDeltoid: "三角肌前束", rearDeltoid: "三角肌后束", deltoids: "三角肌",
  trapezius: "斜方肌", upperTrapezius: "斜方肌上部", lowerTrapezius: "斜方肌下部",
  upperBack: "上背", lowerBack: "下背", rhomboids: "菱形肌", rotatorCuff: "肩袖",
  abs: "腹肌", upperAbs: "上腹", lowerAbs: "下腹", obliques: "腹斜肌",
  quadriceps: "股四头肌", innerQuad: "股四头肌内侧", outerQuad: "股四头肌外侧",
  adductors: "大腿内侧", hipFlexors: "髋屈肌", hamstring: "腘绳肌",
  gluteal: "臀肌", calves: "小腿", tibialis: "胫前肌", neck: "颈部",
  serratus: "前锯肌", ankles: "踝部", feet: "足部", hands: "手部",
};
// 背阔肌在 MuscleMap 源图上没有独立轮廓（详情页同样不着色），浏览时用
// 按钮补位，不拿别的背部肌肉轮廓冒充。
export const OUTLINELESS_FILTERS: { key: string; label: string; codes: string[] }[] = [
  { key: "lats", label: "背阔肌", codes: ["latissimus dorsi", "lats"] },
];
