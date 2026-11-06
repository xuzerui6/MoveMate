import type {PoseModel} from './poseProtocol';
export type PoseModelPreference = PoseModel | 'auto';
export type PosePathKind = 'worker' | 'main';
export type PoseRung = {model: PoseModel; path: PosePathKind};
export type PoseSelectionSource = 'probe' | 'cache' | 'manual' | 'forced';
export type PoseSessionPlan = {experiment: PoseModel | null; ladder: PoseRung[]; startRung: number; selection: PoseSelectionSource};
export const poseRungId = (rung: PoseRung): string => `${rung.model}-${rung.path}`;
const FLOOR_RUNG: PoseRung = {model: 'lite', path: 'main'};
/** The adaptive ladder behind the default ('auto') choice, best first. A device
 * that measures capable settles on a better model; a device that doesn't lands
 * on Lite. The first rung is the desktop architecture (Worker + GPU delegate)
 * attempted on every platform — including iOS Safari, where it was never tried
 * because the main-thread Lite design predates current Safari Worker/WebGPU
 * support; the probe + watchdog in useAdaptivePose make a failed attempt a
 * normal step-down, never a frozen session. Heavy is NEVER automatic: it failed
 * the probe decisively on the reference iPhone and costs 30.7 MB per device. */
export const AUTO_POSE_LADDER: readonly PoseRung[] = [
  {model: 'full', path: 'worker'},
  {model: 'full', path: 'main'},
  {model: 'lite', path: 'main'},
];
/** One plan for how a camera session starts. 'auto' now means the measured
 * ladder (starting from the cached device verdict when one is fresh); an
 * explicit experiment variant stays a manual override — the chosen variant's
 * rung followed by the Lite floor, exactly the previous recovery behaviour. */
export function planPoseSession(preference: PoseModelPreference, appleCamera: boolean, forceLite: boolean, verdict?: PoseVerdict | null): PoseSessionPlan {
  if (forceLite) return {experiment: null, ladder: [FLOOR_RUNG], startRung: 0, selection: 'forced'};
  if (preference === 'lite') return {experiment: null, ladder: [FLOOR_RUNG], startRung: 0, selection: 'manual'};
  if (preference === 'full' || preference === 'heavy') return {experiment: preference, ladder: [{model: preference, path: appleCamera ? 'main' : 'worker'}, FLOOR_RUNG], startRung: 0, selection: 'manual'};
  const ladder = [...AUTO_POSE_LADDER];
  const cached = verdict ? ladder.findIndex(rung => poseRungId(rung) === verdict.rung) : -1;
  return {experiment: null, ladder, startRung: cached >= 0 ? cached : 0, selection: cached >= 0 ? 'cache' : 'probe'};
}

export type PoseVerdict = {rung: string; at: number};
const verdictStorageKey = 'movemate:pose-path-verdict-v1';
/** A proven better rung is trusted for a week; a floor verdict only for a day,
 * so a device that had one bad (hot / battery-saver) day retries the ladder
 * soon instead of being pinned to Lite. */
export const POSE_VERDICT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const POSE_VERDICT_FLOOR_TTL_MS = 24 * 60 * 60 * 1000;
export function loadPoseVerdict(now = Date.now()): PoseVerdict | null {
  try {
    const raw = globalThis.localStorage?.getItem(verdictStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PoseVerdict>;
    if (typeof parsed.rung !== 'string' || typeof parsed.at !== 'number' || !Number.isFinite(parsed.at)) return null;
    const rung = AUTO_POSE_LADDER.find(candidate => poseRungId(candidate) === parsed.rung);
    if (!rung) return null;
    const ttl = poseRungId(rung) === poseRungId(FLOOR_RUNG) ? POSE_VERDICT_FLOOR_TTL_MS : POSE_VERDICT_TTL_MS;
    if (parsed.at > now || now - parsed.at > ttl) return null;
    return {rung: parsed.rung, at: parsed.at};
  } catch { return null; }
}
export function savePoseVerdict(rung: string, now = Date.now()) {
  try {
    if (!AUTO_POSE_LADDER.some(candidate => poseRungId(candidate) === rung)) return;
    globalThis.localStorage?.setItem(verdictStorageKey, JSON.stringify({rung, at: now}));
  } catch { /* best-effort device cache */ }
}

export function usesMainThreadLite(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

export function decodedFrameCount(standard?: number, webkit?: number): number | null {
  // Some camera streams expose the standard counter but never increment it.
  if (typeof standard === 'number' && standard > 0) return standard;
  if (typeof webkit === 'number' && webkit > 0) return webkit;
  return null;
}
