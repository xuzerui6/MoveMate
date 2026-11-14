/**
 * Recognition gate counters (WS2 instrumentation, 2026-11-14): per-set tallies
 * of WHERE frames and reps die inside the recognition layer — form/soft
 * interrupts by reason, wrapper framing rejects, evidence freezes, per-side
 * peak vs return confirmations, wiped hammer pendings and calibration
 * re-latches. Pure measurement: nothing in here feeds back into counting,
 * scoring or any acceptance decision. The Workout page reads a snapshot at
 * set end and posts it to the operator diagnostics channel (latest set wins);
 * it is never rendered in the user UI.
 */
export interface GateCounters {
  /** ExtendedExerciseTracker.formInterrupt() calls, keyed by the rejection copy. */
  formInterrupts: Record<string, number>
  /** ExtendedExerciseTracker.softInterrupt() calls, keyed by the gate reason. */
  softInterrupts: Record<string, number>
  /** AdaptiveRecognition wrapper framing rejects (framingFeedback fired). */
  framingRejects: number
  /** Wrapper evidence-freeze episodes (hammer basis/visibility freeze, squat weak freeze). */
  freezeEpisodes: number
  /** Total wall time spent inside wrapper evidence freezes, ms (frame timestamps). */
  frozenMs: number
  /** Hammer per-side confirmed peaks [left, right] (closed peak episodes). */
  peaksConfirmed: [number, number]
  /** Hammer per-side confirmed returns [left, right] (return dwell reached the hold). */
  returnsConfirmed: [number, number]
  /** Hammer pending completions discarded by an interrupt without being emitted. */
  hammerPendingWipes: number
  /** Calibration latches after the first one (re-arms inside a set). */
  calibrationRelatches: number
}
export const emptyGateCounters = (): GateCounters => ({
  formInterrupts: {}, softInterrupts: {}, framingRejects: 0, freezeEpisodes: 0, frozenMs: 0,
  peaksConfirmed: [0, 0], returnsConfirmed: [0, 0], hammerPendingWipes: 0, calibrationRelatches: 0,
});
export function bumpReason(map: Record<string, number>, reason: string) { map[reason] = (map[reason] || 0) + 1; }
export function cloneGateCounters(c: GateCounters): GateCounters {
  return {
    formInterrupts: { ...c.formInterrupts }, softInterrupts: { ...c.softInterrupts },
    framingRejects: c.framingRejects, freezeEpisodes: c.freezeEpisodes, frozenMs: c.frozenMs,
    peaksConfirmed: [c.peaksConfirmed[0], c.peaksConfirmed[1]], returnsConfirmed: [c.returnsConfirmed[0], c.returnsConfirmed[1]],
    hammerPendingWipes: c.hammerPendingWipes, calibrationRelatches: c.calibrationRelatches,
  };
}
/** Sum two partial counter sets (the adaptive wrapper merges its own tallies
 * with the base tracker's when the base exposes any). */
export function mergeGateCounters(a: GateCounters, b: GateCounters): GateCounters {
  const reasons = (x: Record<string, number>, y: Record<string, number>) => {
    const out = { ...x }; for (const k of Object.keys(y)) out[k] = (out[k] || 0) + y[k]; return out;
  };
  return {
    formInterrupts: reasons(a.formInterrupts, b.formInterrupts), softInterrupts: reasons(a.softInterrupts, b.softInterrupts),
    framingRejects: a.framingRejects + b.framingRejects, freezeEpisodes: a.freezeEpisodes + b.freezeEpisodes, frozenMs: a.frozenMs + b.frozenMs,
    peaksConfirmed: [a.peaksConfirmed[0] + b.peaksConfirmed[0], a.peaksConfirmed[1] + b.peaksConfirmed[1]],
    returnsConfirmed: [a.returnsConfirmed[0] + b.returnsConfirmed[0], a.returnsConfirmed[1] + b.returnsConfirmed[1]],
    hammerPendingWipes: a.hammerPendingWipes + b.hammerPendingWipes, calibrationRelatches: a.calibrationRelatches + b.calibrationRelatches,
  };
}
