import type {PoseModel} from './poseProtocol';
import models from './pose-models.json';

/** The vision WASM set the pose loader fetches from /pose/wasm at runtime. Preparing
 * these into the pose-models cache means a first training start never waits on them. */
export const POSE_WASM_FILES = [
  '/pose/wasm/vision_wasm_internal.js',
  '/pose/wasm/vision_wasm_internal.wasm',
  '/pose/wasm/vision_wasm_nosimd_internal.js',
  '/pose/wasm/vision_wasm_nosimd_internal.wasm',
] as const;

export interface PrepareFileSpec {
  key: string;
  src: string;
  /** Known total size in bytes, or null when only the response can tell us. */
  totalBytes: number | null;
  kind: 'model' | 'wasm';
}

/** Files a training start needs in the pose-models cache for the given start model:
 * the model itself (size pinned by pose-models.json) plus the WASM set. */
export function buildPrepareFileList(model: PoseModel): PrepareFileSpec[] {
  const item = models[model];
  const files: PrepareFileSpec[] = [
    {key: 'model', src: item.src, totalBytes: item.bytes, kind: 'model'},
  ];
  for (const src of POSE_WASM_FILES) files.push({key: `wasm:${src}`, src, totalBytes: null, kind: 'wasm'});
  return files;
}

interface FileProgress {loaded: number; total: number | null; done: boolean}

/** Aggregates real per-file byte progress into one honest snapshot. A file whose
 * total is not known yet contributes its loaded bytes to the total as well, so the
 * fraction never exceeds 1 and never invents bytes that were not measured. */
export class ProgressTracker {
  private files = new Map<string, FileProgress>();
  private samples: {t: number; loaded: number}[] = [];

  register(key: string, totalBytes: number | null) {
    if (!this.files.has(key)) this.files.set(key, {loaded: 0, total: totalBytes, done: false});
  }
  setTotal(key: string, totalBytes: number) {
    const file = this.files.get(key); if (!file) return;
    file.total = totalBytes; if (file.loaded > totalBytes) file.loaded = totalBytes;
  }
  setLoaded(key: string, loaded: number, now: number) {
    const file = this.files.get(key); if (!file) return;
    file.loaded = Math.max(0, loaded); this.record(now);
  }
  addBytes(key: string, bytes: number, now: number) {
    const file = this.files.get(key); if (!file) return;
    file.loaded += bytes; this.record(now);
  }
  /** A file already in cache completes instantly with its real byte count. */
  markCached(key: string, bytes: number, now: number) {
    const file = this.files.get(key); if (!file) return;
    file.loaded = bytes; if (file.total === null) file.total = bytes; file.done = true; this.record(now);
  }
  markDone(key: string, now: number) {
    const file = this.files.get(key); if (!file) return;
    if (file.total !== null) file.loaded = file.total;
    file.done = true; this.record(now);
  }
  private record(now: number) {
    const loaded = this.loadedBytes();
    const last = this.samples[this.samples.length - 1];
    if (last && now - last.t < 200 && last.loaded === loaded) return;
    this.samples.push({t: now, loaded});
    if (this.samples.length > 40) this.samples.shift();
  }
  loadedBytes(): number {
    let sum = 0; for (const f of this.files.values()) sum += f.total !== null ? Math.min(f.loaded, f.total) : f.loaded; return sum;
  }
  totalBytes(): number {
    let sum = 0; for (const f of this.files.values()) sum += f.total !== null ? f.total : f.loaded; return sum;
  }
  get complete(): boolean {
    if (!this.files.size) return false;
    for (const f of this.files.values()) if (!f.done) return false; return true;
  }
  /** Measured download rate over the recent window; 0 until two samples span ≥0.8 s. */
  rateBps(now: number): number {
    const samples = this.samples; if (samples.length < 2) return 0;
    const last = samples[samples.length - 1];
    let first = samples[0];
    for (const s of samples) { if (last.t - s.t <= 5000) { first = s; break; } }
    const span = (last.t - first.t) / 1000; if (span < 0.8) return 0;
    const gained = last.loaded - first.loaded; return gained > 0 ? gained / span : 0;
    void now;
  }
  etaSeconds(now: number): number | null {
    for (const f of this.files.values()) if (!f.done && f.total === null) return null;
    const rate = this.rateBps(now); if (rate <= 0) return null;
    const remaining = this.totalBytes() - this.loadedBytes(); if (remaining <= 0) return 0;
    return Math.ceil(remaining / rate);
  }
  snapshot(now: number) {
    const loadedBytes = this.loadedBytes(), totalBytes = this.totalBytes();
    return {
      loadedBytes,
      totalBytes,
      fraction: totalBytes > 0 ? Math.min(1, loadedBytes / totalBytes) : 0,
      rateBps: this.rateBps(now),
      etaSeconds: this.etaSeconds(now),
      complete: this.complete,
    };
  }
}

export type PreparePhase = 'idle' | 'checking' | 'downloading' | 'ready' | 'failed';

export function nextPreparePhase(current: PreparePhase, event: 'start' | 'progress' | 'complete' | 'error-retryable' | 'error-final'): PreparePhase {
  switch (event) {
    case 'start': return 'checking';
    case 'progress': return current === 'ready' || current === 'failed' ? current : 'downloading';
    case 'complete': return 'ready';
    case 'error-retryable': return current === 'ready' ? current : 'downloading';
    case 'error-final': return 'failed';
  }
}

/** Slow = still incomplete after 8 s, or the measured rate is under 0.5 MB/s. */
export function isSlowPrepare(input: {startedAt: number | null; now: number; rateBps: number; complete: boolean}): boolean {
  if (input.complete || input.startedAt === null) return false;
  if (input.now - input.startedAt > 8000) return true;
  return input.rateBps > 0 && input.rateBps < 500_000;
}

/** Verification problems (size / integrity) mean the bytes themselves are wrong;
 * retrying the same download cannot fix them, so they are final. Network problems
 * get up to 3 attempts. */
export function isVerificationError(error: unknown): boolean {
  return error instanceof Error && (error.message.includes('大小') || error.message.includes('完整性'));
}
export function shouldRetryPrepare(error: unknown, attemptsMade: number): boolean {
  return attemptsMade < 3 && !isVerificationError(error);
}
export const prepareBackoffMs = (attemptsMade: number) => (attemptsMade <= 1 ? 600 : 1500);

/** One-decimal MB figure (1 MB = 1,000,000 bytes, matching the design board). */
export const formatMB = (bytes: number) => (bytes / 1_000_000).toFixed(1);
