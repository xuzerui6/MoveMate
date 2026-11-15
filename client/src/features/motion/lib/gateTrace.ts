/**
 * Per-sample live gate trace (2026-11-15, hammer round 3) — the counting
 * gates' dashcam. The aggregate gate counters twice supported attributions
 * that turned out wrong or unprovable (2026-11-14's "return gate ate 3 reps"
 * was freeze/window evidence accounting; 2026-11-15's peak misses could not
 * be attributed from aggregates at all). This buffer records, for every
 * frame the hammer gate processes, the raw material a verdict actually
 * needs: when it happened, what each side's elbow read, whether the sample
 * was usable evidence, and where each side's gate stood after the frame.
 * Pure measurement: nothing here feeds back into counting, scoring or any
 * acceptance decision, and it is never rendered in the user UI. The Workout
 * page ships it with the gate counters on the operator diagnostics channel
 * (latest set wins); angles and gate state only — no image or landmark data.
 *
 * Sample tuple: [t, leftDeg, rightDeg, flags, leftPhase, leftQualMs,
 * rightPhase, rightQualMs]
 * — t: frame timestamp (ms, the tracker's frame clock);
 * — leftDeg/rightDeg: elbow angle in degrees (0.1° fidelity, −1 = no read);
 * — flags: bitmask of TRACE_FLAG;
 * — phase: TRACE_PHASE per side, AFTER this frame was processed;
 * — qualMs: the side's accumulated return qualifying ms after this frame
 *   (0 unless a peak is latched and return evidence is accumulating).
 */
export const TRACE_PHASE = { idle: 0, moving: 1, peakOpen: 2, latched: 3, completed: 4 } as const;
export const TRACE_FLAG = { scorable: 1, hole: 2, imageBasis: 4, startPose: 8 } as const;

export interface GateTraceEvent {
  /** 'loss': an interrupt met a pending (peak-latched, uncompleted) cycle.
   * 'end': set-end finalization evaluated a still-pending cycle — or, with
   * final=true, the one summary record of everything a finalizeSetEnd call
   * did (emitted on EVERY call, so a set whose cycles all died mid-set
   * still proves finalization ran).
   * 'freeze': a wrapper evidence-freeze episode boundary (round 4).
   * 'presence': the gate stopped / resumed consuming measured frames
   * (round 4) — together with 'freeze', these let a verdict attribute a
   * sample blackout to a layer: freeze episodes are the wrapper holding
   * frames it received; presence loss is an interrupt (its reason rides
   * along); a gap with neither is the pose pipeline producing nothing. */
  k: 'loss' | 'end' | 'freeze' | 'presence'
  t: number
  /** Cycle events (loss / per-cycle end) only: which side's cycle. */
  side?: 0 | 1
  /** loss only: true when the cycle survived the interrupt (preserved). */
  kept?: boolean
  /** loss: true when the cycle was PARKED for set-end re-evaluation
   * instead of destroyed (round 4). end: true when the evaluated cycle
   * was a parked one. */
  parked?: boolean
  /** end only: true when finalization counted the pending cycle. */
  counted?: boolean
  /** freeze / presence only: the transition direction — freeze
   * 'start' | 'end', presence 'lost' | 'found'. */
  phase?: 'start' | 'end' | 'lost' | 'found'
  /** presence 'lost' only: the interrupt reason that stopped the gate. */
  reason?: string
  /** end only: true on the single per-call summary event. */
  final?: boolean
  /** final summary only: parked cycles this call evaluated / credited /
   * dropped (seen = credited + dropped). */
  parkedSeen?: number
  parkedCredited?: number
  parkedDropped?: number
  /** final summary only: a completed single was flushed out of the
   * 600 ms pairing window by this call. */
  pendingFlushed?: boolean
  /** Cycle events only: the pending cycle's latched peak elbow (degrees). */
  peakElbow?: number
  /** Cycle events only: decision qualifying ms accumulated when captured. */
  qualMs?: number
  /** Cycle events only: highest elbow the return phase reached. */
  retMax?: number
}

export interface GateTracePayload {
  v: 1
  /** Exercise type the trace belongs to. */
  type: string
  /** Timestamp of the first retained sample. */
  t0: number
  /** Samples dropped by the caps (ring overwrite + serialized-size guard). */
  dropped: number
  samples: number[][]
  events: GateTraceEvent[]
}

/** Hard caps. At the pose pipeline's ~30 samples/s a 30 s set is ~900
 * samples; 2400 covers ~80 s at 30/s (~40 s at 60/s) before the ring starts
 * dropping the OLDEST samples (tail-keep: the end of the set, where
 * finalization and loss questions live, is always retained). The byte cap
 * is the second, independent guard applied at snapshot time. */
export const GATE_TRACE_MAX_SAMPLES = 2400;
export const GATE_TRACE_MAX_BYTES = 128 * 1024;
const GATE_TRACE_MAX_EVENTS = 64;
const FIELDS = 8;

export class GateTraceBuffer {
  /** Preallocated ring: one Float64Array, slots overwritten in place, so a
   * push is a fixed handful of indexed writes — no per-frame allocation. */
  private ring = new Float64Array(GATE_TRACE_MAX_SAMPLES * FIELDS);
  private head = 0;   // next write slot
  private count = 0;  // retained samples
  private droppedCount = 0;
  private events: GateTraceEvent[] = [];

  push(t: number, leftDeg: number, rightDeg: number, flags: number, leftPhase: number, leftQualMs: number, rightPhase: number, rightQualMs: number) {
    const o = this.head * FIELDS;
    this.ring[o] = t; this.ring[o + 1] = leftDeg; this.ring[o + 2] = rightDeg; this.ring[o + 3] = flags;
    this.ring[o + 4] = leftPhase; this.ring[o + 5] = leftQualMs; this.ring[o + 6] = rightPhase; this.ring[o + 7] = rightQualMs;
    this.head = (this.head + 1) % GATE_TRACE_MAX_SAMPLES;
    if (this.count < GATE_TRACE_MAX_SAMPLES) this.count++;
    else this.droppedCount++;
  }

  addEvent(e: GateTraceEvent) {
    const transition = e.k === 'freeze' || e.k === 'presence';
    // Transition coalescing (round 4): a transition that repeats the
    // immediately preceding one (same kind, same phase — an interrupt
    // storm re-firing 'lost', a freeze boundary re-reported) carries no
    // new information; dropping it keeps flicker from flooding the cap.
    if (transition) {
      const last = this.events[this.events.length - 1];
      if (last && last.k === e.k && last.phase === e.phase) return;
    }
    this.events.push(e);
    while (this.events.length > GATE_TRACE_MAX_EVENTS) {
      // Evict the oldest TRANSITION event first: cycle loss/end records
      // are the counting evidence a verdict needs, while transitions are
      // attribution context whose totals also live in the gate counters
      // (freezeEpisodes / frozenMs). Only when no transition remains does
      // the oldest event overall go (the round-3 tail-keep behaviour).
      const idx = this.events.findIndex(x => x.k === 'freeze' || x.k === 'presence');
      this.events.splice(idx >= 0 ? idx : 0, 1);
    }
  }

  get size() { return this.count; }

  /** Serialize the retained window (oldest → newest). Returns null when no
   * sample was ever recorded, so non-instrumented exercises ship nothing. */
  snapshot(type: string): GateTracePayload | null {
    if (!this.count) return null;
    const start = (this.head - this.count + GATE_TRACE_MAX_SAMPLES) % GATE_TRACE_MAX_SAMPLES;
    const round1 = (v: number) => Math.round(v * 10) / 10;
    let samples: number[][] = [];
    for (let i = 0; i < this.count; i++) {
      const o = ((start + i) % GATE_TRACE_MAX_SAMPLES) * FIELDS;
      samples.push([
        Math.round(this.ring[o]), round1(this.ring[o + 1]), round1(this.ring[o + 2]), this.ring[o + 3],
        this.ring[o + 4], Math.min(9999, Math.round(this.ring[o + 5])), this.ring[o + 6], Math.min(9999, Math.round(this.ring[o + 7])),
      ]);
    }
    let dropped = this.droppedCount;
    // Serialized-size guard: drop oldest until the payload fits (tail-keep).
    let payload: GateTracePayload = { v: 1, type, t0: samples[0][0], dropped, samples, events: [...this.events] };
    while (samples.length > 1 && JSON.stringify(payload).length > GATE_TRACE_MAX_BYTES) {
      const cut = Math.max(1, Math.floor(samples.length / 10));
      samples = samples.slice(cut); dropped += cut;
      payload = { v: 1, type, t0: samples[0][0], dropped, samples, events: payload.events };
    }
    return payload;
  }
}
