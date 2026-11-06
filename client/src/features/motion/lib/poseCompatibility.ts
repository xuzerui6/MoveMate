import type {PoseModel} from './poseProtocol';
export type PoseModelPreference = PoseModel | 'auto';
export type PoseSessionPlan = {model: PoseModel; mainThread: boolean; experiment: PoseModel | null};
/** One decision for how a camera session starts. Default ('auto') preserves the shipped
 * behaviour exactly: Apple touch devices run Lite on the main thread, everything else
 * probes Full in a worker. An explicit experiment variant is honoured on every path —
 * including iOS, where Full/Heavy run on the main thread and the probe in
 * useAdaptivePose recovers the session to Lite if the variant cannot keep up. */
export function planPoseSession(preference: PoseModelPreference, appleCamera: boolean, forceLite: boolean): PoseSessionPlan {
  if (forceLite || preference === 'lite') return {model: 'lite', mainThread: true, experiment: null};
  if (preference === 'full' || preference === 'heavy') return {model: preference, mainThread: appleCamera, experiment: preference};
  return {model: appleCamera ? 'lite' : 'full', mainThread: appleCamera, experiment: null};
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
