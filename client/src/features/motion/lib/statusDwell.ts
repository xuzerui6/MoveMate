/**
 * Display dwell for live status lines (2026-11-09 walking test).
 *
 * In marginal visibility the tracker's state can flip several times a
 * second; rendering every flip makes the status capsule, the header state
 * and the coach line strobe faster than anyone can read. This tiny state
 * machine decides what is actually SHOWN: a new value appears only after
 * it has persisted as the candidate for `minCandidateMs` AND the currently
 * shown value has been up for at least `minShownMs`. Measurement is never
 * dwelled — counts, the session clock and event lines stay immediate; only
 * these derived display strings pass through here.
 */
export interface DwellState {
  shown: string | null;
  shownAt: number;
  candidate: string | null;
  candidateAt: number;
}

export const createDwellState = (): DwellState => ({ shown: null, shownAt: 0, candidate: null, candidateAt: 0 });

export function dwellPush(state: DwellState, value: string, now: number, minShownMs = 1500, minCandidateMs = 400): string {
  if (state.shown === null) {
    state.shown = value;
    state.shownAt = now;
    state.candidate = null;
    return value;
  }
  if (value === state.shown) {
    state.candidate = null;
    return state.shown;
  }
  if (state.candidate !== value) {
    state.candidate = value;
    state.candidateAt = now;
    return state.shown;
  }
  if (now - state.candidateAt >= minCandidateMs && now - state.shownAt >= minShownMs) {
    state.shown = value;
    state.shownAt = now;
    state.candidate = null;
  }
  return state.shown;
}
