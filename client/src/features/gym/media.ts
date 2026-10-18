import catalogue from "./exercise-media.json";
export type MediaFile = {
  bytes:number;
  src: string;
  sha256: string;
  phase?: string;
  aspectRatio?: number;
  sourceIndex?: number;
  sourceTime?: number;
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
};
export type ExerciseMedia = {
  note: string;
  images: MediaFile[];
  video?: MediaFile & { poster: string;posterSha256:string };
  sources: MediaSource[];
};
export const exerciseMedia = catalogue.entries as Record<string, ExerciseMedia>;
export const demonstratedIds = Object.keys(exerciseMedia);
export type MediaFilter = "all" | "images" | "video";
export function mediaIds(filter: MediaFilter): string[] | undefined {
  return filter === "all" ? undefined : demonstratedIds.filter(id =>
    filter === "images" ? exerciseMedia[id].images.length > 0 : !!exerciseMedia[id].video);
}
// An ID allowlist keeps custom/imported movements and similar variants separate.
export function mediaFor(id: string | undefined) {
  return id ? exerciseMedia[id] : undefined;
}
const muscleGroups: Record<string, string[]> = {
  pectorals: ["upperChest", "lowerChest", "chest"],
  chest: ["upperChest", "lowerChest", "chest"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  forearms: ["forearm", "forearms"],
  delts: ["frontDeltoid", "rearDeltoid", "deltoids"],
  shoulders: ["frontDeltoid", "rearDeltoid", "deltoids"],
  traps: ["upperTrapezius", "trapezius"],
  lats: ["lats"],
  "upper back": ["upperBack"],
  "lower back": ["lowerBack"],
  abs: ["upperAbs", "lowerAbs", "abs"],
  obliques: ["obliques"],
  quadriceps: ["innerQuad", "outerQuad", "quadriceps"],
  hamstrings: ["hamstring"],
  glutes: ["gluteal", "glutes"],
  calves: ["calves"],
  adductors: ["adductors"],
  "hip flexors": ["hipFlexors"],
  "tibialis anterior": ["tibialis"],
};
export function muscleRegions(target: string) {
  return muscleGroups[target] || [];
}
