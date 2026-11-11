import type {PoseModel} from './poseProtocol';
import {
  ProgressTracker,
  buildPrepareFileList,
  isSlowPrepare,
  nextPreparePhase,
  prepareBackoffMs,
  shouldRetryPrepare,
  type PrepareFileSpec,
  type PreparePhase,
} from './posePrepareCore';
import {
  poseModelItem,
  readCachedModelBytes,
  readCachedPoseAsset,
  writeCachedModelBytes,
  writeCachedPoseAsset,
} from './poseTransport';
import {loadPoseVerdict, planPoseSession, usesMainThreadLite} from './poseCompatibility';
import {loadPoseModelPreference} from './adaptiveRecognition';

export interface PrepareSnapshot {
  model: PoseModel;
  phase: PreparePhase;
  loadedBytes: number;
  totalBytes: number;
  rateBps: number;
  etaSeconds: number | null;
  fraction: number;
  slow: boolean;
  startedAt: number | null;
}

const emptySnapshot = (model: PoseModel): PrepareSnapshot => ({
  model, phase: 'idle', loadedBytes: 0, totalBytes: 0, rateBps: 0, etaSeconds: null, fraction: 0, slow: false, startedAt: null,
});

interface PrepareRun {
  snapshot: PrepareSnapshot;
  listeners: Set<(snapshot: PrepareSnapshot) => void>;
  promise: Promise<boolean> | null;
  tracker: ProgressTracker | null;
  lastEmit: number;
}

const runs = new Map<PoseModel, PrepareRun>();
const verifiedReady = new Set<PoseModel>();

function runFor(model: PoseModel): PrepareRun {
  let run = runs.get(model);
  if (!run) { run = {snapshot: emptySnapshot(model), listeners: new Set(), promise: null, tracker: null, lastEmit: 0}; runs.set(model, run); }
  return run;
}

export function getPosePrepareSnapshot(model: PoseModel): PrepareSnapshot {
  return runs.get(model)?.snapshot ?? emptySnapshot(model);
}

export function subscribePosePrepare(model: PoseModel, listener: (snapshot: PrepareSnapshot) => void): () => void {
  const run = runFor(model);
  run.listeners.add(listener);
  listener(run.snapshot);
  return () => { run.listeners.delete(listener); };
}

/** The model a training start will actually open first on this device, from the same
 * preference + verdict inputs the pose ladder itself uses. Preparing anything else
 * would warm the wrong cache entry. */
export function plannedPoseModel(forceLite = false): PoseModel {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const appleCamera = nav ? usesMainThreadLite(nav.userAgent, nav.platform, nav.maxTouchPoints) : false;
  const plan = planPoseSession(loadPoseModelPreference(), appleCamera, forceLite, loadPoseVerdict());
  return plan.ladder[Math.min(plan.startRung, plan.ladder.length - 1)].model;
}

function emit(run: PrepareRun, model: PoseModel, phaseEvent?: Parameters<typeof nextPreparePhase>[1], force = false) {
  const now = Date.now();
  if (!force && phaseEvent === undefined && now - run.lastEmit < 150) return;
  run.lastEmit = now;
  const progress = run.tracker ? run.tracker.snapshot(now) : {loadedBytes: 0, totalBytes: 0, fraction: 0, rateBps: 0, etaSeconds: null, complete: false};
  const phase = phaseEvent ? nextPreparePhase(run.snapshot.phase, phaseEvent) : run.snapshot.phase;
  run.snapshot = {
    model,
    phase,
    loadedBytes: progress.loadedBytes,
    totalBytes: progress.totalBytes,
    rateBps: progress.rateBps,
    etaSeconds: progress.etaSeconds,
    fraction: progress.fraction,
    slow: isSlowPrepare({startedAt: run.snapshot.startedAt, now, rateBps: progress.rateBps, complete: phase === 'ready'}),
    startedAt: run.snapshot.startedAt,
  };
  for (const listener of run.listeners) listener(run.snapshot);
}

const digestHex = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(n => n.toString(16).padStart(2, '0')).join('');
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Streams one file with real byte progress. Throws on network/HTTP problems
 * (retryable by the caller) and on size/integrity problems (final). */
async function downloadFile(run: PrepareRun, model: PoseModel, file: PrepareFileSpec): Promise<void> {
  const tracker = run.tracker!;
  if (file.kind === 'model') {
    const item = poseModelItem(model);
    const parts = (item as {parts?: string[]}).parts?.length ? (item as {parts?: string[]}).parts! : [item.src];
    const chunks: ArrayBuffer[] = [];
    tracker.setLoaded(file.key, 0, Date.now());
    for (const part of parts) {
      const response = await fetch(part);
      if (!response.ok) throw Error(`模型文件读取失败（${response.status}）`);
      if (!response.body) { chunks.push(await response.arrayBuffer()); tracker.addBytes(file.key, chunks[chunks.length - 1].byteLength, Date.now()); emit(run, model); continue; }
      const reader = response.body.getReader();
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        if (value) { chunks.push(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer); tracker.addBytes(file.key, value.byteLength, Date.now()); emit(run, model); }
      }
    }
    const bytes = new ArrayBuffer(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
    const view = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { view.set(new Uint8Array(chunk), offset); offset += chunk.byteLength; }
    if (bytes.byteLength !== item.bytes) throw Error('模型大小校验失败');
    if (await digestHex(bytes) !== item.sha256) throw Error('模型完整性校验失败');
    await writeCachedModelBytes(model, bytes);
    tracker.markDone(file.key, Date.now());
    return;
  }
  const response = await fetch(file.src);
  if (!response.ok) throw Error(`识别文件读取失败（${response.status}）`);
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > 0) tracker.setTotal(file.key, length);
  tracker.setLoaded(file.key, 0, Date.now());
  const chunks: ArrayBuffer[] = [];
  if (!response.body) chunks.push(await response.arrayBuffer());
  else {
    const reader = response.body.getReader();
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      if (value) { chunks.push(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer); tracker.addBytes(file.key, value.byteLength, Date.now()); emit(run, model); }
    }
  }
  const bytes = new ArrayBuffer(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  const view = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { view.set(new Uint8Array(chunk), offset); offset += chunk.byteLength; }
  if (bytes.byteLength === 0) throw Error('识别文件完整性校验失败');
  await writeCachedPoseAsset(file.src, bytes);
  if (!Number.isFinite(length) || length <= 0) tracker.setTotal(file.key, bytes.byteLength);
  tracker.markDone(file.key, Date.now());
}

/** Ensures the model + WASM set for `model` is in the pose-models cache. Deduped:
 * a background prefetch and an explicit training start share one run and one
 * progress stream. Resolves true when everything needed is cached. */
export function ensurePoseModels(model: PoseModel): Promise<boolean> {
  const run = runFor(model);
  if (run.promise && run.snapshot.phase !== 'failed') return run.promise;
  run.tracker = new ProgressTracker();
  run.snapshot = {...emptySnapshot(model), phase: 'checking', startedAt: Date.now()};
  run.promise = (async () => {
    const tracker = run.tracker!;
    try {
      const files = buildPrepareFileList(model);
      for (const file of files) tracker.register(file.key, file.totalBytes);
      emit(run, model, undefined, true);
      const missing: PrepareFileSpec[] = [];
      for (const file of files) {
        const cached = file.kind === 'model' ? await readCachedModelBytes(model) : await readCachedPoseAsset(file.src);
        if (cached) tracker.markCached(file.key, cached.byteLength, Date.now());
        else missing.push(file);
      }
      emit(run, model, undefined, true);
      if (!missing.length) {
        verifiedReady.add(model);
        emit(run, model, 'complete', true);
        return true;
      }
      emit(run, model, 'progress', true);
      for (const file of missing) {
        let attempts = 0;
        for (;;) {
          attempts++;
          try { await downloadFile(run, model, file); break; }
          catch (error) {
            if (!shouldRetryPrepare(error, attempts)) throw error;
            emit(run, model, 'error-retryable', true);
            await sleep(prepareBackoffMs(attempts));
          }
        }
        emit(run, model, undefined, true);
      }
      verifiedReady.add(model);
      emit(run, model, 'complete', true);
      return true;
    } catch {
      emit(run, model, 'error-final', true);
      return false;
    }
  })();
  return run.promise;
}

/** Fire-and-forget background prefetch for the planned start model (design D). */
export function prefetchPoseModels(): void {
  void ensurePoseModels(plannedPoseModel(false));
}

/** True when the full prepare set for `model` is already cached (model bytes are
 * sha-revalidated on read; WASM presence is checked in the same cache). */
export async function checkPoseModelsReady(model: PoseModel): Promise<boolean> {
  if (verifiedReady.has(model)) return true;
  const run = runs.get(model);
  if (run?.snapshot.phase === 'ready') { verifiedReady.add(model); return true; }
  const cached = await readCachedModelBytes(model);
  if (!cached) return false;
  for (const file of buildPrepareFileList(model)) {
    if (file.kind === 'wasm' && !(await readCachedPoseAsset(file.src))) return false;
  }
  verifiedReady.add(model);
  return true;
}
