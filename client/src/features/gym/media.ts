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
