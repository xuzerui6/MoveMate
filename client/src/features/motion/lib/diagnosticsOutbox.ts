/**
 * Recognition diagnostics outbox (2026-11-15) — durable delivery for the
 * per-set gate counters + gate trace posted to POST /api/v1/diagnostics/
 * recognition.
 *
 * Why this exists: the previous send was a single fire-and-forget fetch
 * inside Workout.done() — the "reported" latch flipped before the outcome
 * was known, the response was never inspected (an HTTP 400/500 resolves a
 * fetch promise just like a 200), and the payload lived only in memory.
 * Edward's 2026-11-15 16:52 preview set (10 reps, counted 1, ended via a
 * lean-in tracking loss) saved its workout but its diagnostics never
 * reached the store and were never retried — the previous set's record
 * was still the latest a day of analysis later. A payload now leaves the
 * outbox ONLY on a server 2xx; everything else keeps it queued.
 *
 * Mechanics:
 * — Capture persists FIRST (localStorage, the codebase's device-local
 *   store) and only then attempts a send, so page teardown, navigation
 *   and app kills cannot take an unsent payload with them.
 * — One entry per set (id = the server session id): re-capturing the
 *   same set replaces the body, mirroring the server's latest-set-wins
 *   row. A mid-set snapshot captured on leave/unmount is replaced by the
 *   finalized payload if the set is later finished — and if it never is,
 *   the snapshot is still delivered instead of nothing.
 * — Failed sends retry with backoff while the app lives (a periodic
 *   flush), on reconnect, and on the next app start. Entries expire
 *   after 7 days (stale diagnostics have no verdict value) and the box
 *   is capped at 4 entries, oldest dropped first.
 * — Sends always use the CURRENT account token and only for the entry's
 *   owner: the server scopes the row by the verified token, so sending
 *   another account's payload would misattribute it. An entry whose
 *   owner is not the signed-in user simply waits.
 * — The wire body is exactly the historical shape ({exerciseType,
 *   counters, trace?}): the worker rebuilds it field by field and drops
 *   unknown keys, so no client id/timestamp could be stored anyway —
 *   idempotency rests on latest-set-wins, and re-sending the same body
 *   is harmless.
 * — sendBeacon cannot carry the Authorization header this endpoint
 *   requires, so page-hide delivery uses a keepalive fetch — but only
 *   for bodies under the browsers' ~64 KB keepalive budget; a larger
 *   body would fail instantly with keepalive, so it waits for the
 *   next-start flush instead. That split is the explicit coverage:
 *   small payloads are pushed at pagehide, large ones are guaranteed
 *   by persistence + next-start flush.
 */
import type { GateCounters } from './gateCounters';
import type { GateTracePayload } from './gateTrace';

export interface RecognitionDiagnosticsBody {
  exerciseType: string;
  counters: GateCounters;
  trace?: GateTracePayload;
}

export interface DiagnosticsOutboxEntry {
  id: string;
  enqueuedAt: number;
  updatedAt: number;
  attempts: number;
  nextAttemptAt: number;
  userId: number | null;
  body: RecognitionDiagnosticsBody;
}

export interface DiagnosticsOutboxDeps {
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  fetchFn?: (input: string, init: RequestInit) => Promise<{ ok: boolean; status: number }>;
  now?: () => number;
  token?: () => string | null;
  userId?: () => number | null;
}

export const DIAGNOSTICS_OUTBOX_KEY = 'motion-buddy:diagnostics-outbox';
export const DIAGNOSTICS_ENDPOINT = '/api/v1/diagnostics/recognition';
const MAX_ENTRIES = 4;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const BACKOFF_MS = [5_000, 30_000, 120_000, 600_000, 3_600_000];
/** Browsers cap in-flight keepalive request bodies (~64 KB in Chrome);
 * above this a keepalive fetch fails outright, so don't attempt one. */
export const KEEPALIVE_MAX_BYTES = 60_000;

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  try { return localStorage; } catch { return null; }
}
function defaultToken(): string | null {
  try { return localStorage.getItem('token'); } catch { return null; }
}
function defaultUserId(): number | null {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return typeof user?.id === 'number' ? user.id : null;
  } catch { return null; }
}
function resolveDeps(deps: DiagnosticsOutboxDeps = {}): Required<DiagnosticsOutboxDeps> {
  return {
    storage: deps.storage ?? defaultStorage() ?? { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    fetchFn: deps.fetchFn ?? ((input, init) => fetch(input, init)),
    now: deps.now ?? (() => Date.now()),
    token: deps.token ?? defaultToken,
    userId: deps.userId ?? defaultUserId,
  };
}

function validEntry(value: any): value is DiagnosticsOutboxEntry {
  return !!value && typeof value.id === 'string' && typeof value.enqueuedAt === 'number' &&
    !!value.body && typeof value.body.exerciseType === 'string' &&
    !!value.body.counters && typeof value.body.counters === 'object';
}

export function readDiagnosticsOutbox(deps: DiagnosticsOutboxDeps = {}): DiagnosticsOutboxEntry[] {
  const { storage } = resolveDeps(deps);
  let raw: string | null;
  try { raw = storage.getItem(DIAGNOSTICS_OUTBOX_KEY); } catch { return []; }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(validEntry) : [];
  } catch { return []; }
}

function writeDiagnosticsOutbox(entries: DiagnosticsOutboxEntry[], deps: Required<DiagnosticsOutboxDeps>): void {
  const persist = (list: DiagnosticsOutboxEntry[]) => deps.storage.setItem(DIAGNOSTICS_OUTBOX_KEY, JSON.stringify(list));
  try { persist(entries); }
  catch {
    // Quota: shed the oldest OTHER entries and retry once; if it still
    // fails the in-flight send attempt below is the remaining chance.
    const trimmed = entries.slice(-Math.max(1, entries.length - 1));
    try { persist(trimmed); } catch { /* storage unavailable — send still attempted */ }
  }
}

const backoffFor = (attempts: number) => BACKOFF_MS[Math.min(Math.max(attempts - 1, 0), BACKOFF_MS.length - 1)];

/**
 * Persist a set's diagnostics payload and attempt delivery. The persist
 * happens synchronously before any send, so calling this at set
 * finalization (or with a live snapshot on leave/unmount/pagehide) makes
 * the payload survive the page. Same id re-captured replaces the body.
 */
export function enqueueRecognitionDiagnostics(
  id: string,
  body: RecognitionDiagnosticsBody,
  deps: DiagnosticsOutboxDeps = {},
  opts: { pageHide?: boolean } = {},
): void {
  const d = resolveDeps(deps);
  const now = d.now();
  const entries = readDiagnosticsOutbox(d).filter(entry => now - entry.enqueuedAt <= MAX_AGE_MS);
  const existing = entries.findIndex(entry => entry.id === id);
  const entry: DiagnosticsOutboxEntry = {
    id,
    enqueuedAt: existing >= 0 ? entries[existing].enqueuedAt : now,
    updatedAt: now,
    attempts: existing >= 0 ? entries[existing].attempts : 0,
    nextAttemptAt: now,
    userId: d.userId(),
    body,
  };
  if (existing >= 0) entries[existing] = entry; else entries.push(entry);
  entries.sort((a, b) => a.enqueuedAt - b.enqueuedAt);
  writeDiagnosticsOutbox(entries.slice(-MAX_ENTRIES), d);
  void flushRecognitionDiagnostics(d, opts);
}

let flushChain: Promise<void> = Promise.resolve();

async function doFlushRecognitionDiagnostics(d: Required<DiagnosticsOutboxDeps>, opts: { pageHide?: boolean }): Promise<void> {
  const raw = readDiagnosticsOutbox(d);
  const now = d.now();
  let entries = raw.filter(entry => now - entry.enqueuedAt <= MAX_AGE_MS);
  let changed = entries.length !== raw.length;
  const token = d.token();
  if (!token) { if (changed) writeDiagnosticsOutbox(entries, d); return; }
  const currentUser = d.userId();
  for (const entry of [...entries]) {
    if (entry.nextAttemptAt > d.now()) continue;
    // The row is keyed by the token's owner server-side: only the
    // owner's payload may ride the current token.
    if (entry.userId !== null && currentUser !== null && entry.userId !== currentUser) continue;
    const serialized = JSON.stringify(entry.body);
    const keepalive = !!opts.pageHide && serialized.length <= KEEPALIVE_MAX_BYTES;
    let delivered = false;
    try {
      const response = await d.fetchFn(DIAGNOSTICS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: serialized,
        ...(keepalive ? { keepalive: true } : {}),
      });
      delivered = response.ok;
    } catch { delivered = false; }
    if (delivered) {
      entries = entries.filter(candidate => candidate.id !== entry.id);
    } else {
      entry.attempts += 1;
      entry.nextAttemptAt = d.now() + backoffFor(entry.attempts);
    }
    changed = true;
  }
  if (changed) writeDiagnosticsOutbox(entries, d);
}

/**
 * Attempt every due entry. An entry leaves the box only on a 2xx; any
 * other outcome (network error, 4xx, 5xx) keeps it with backoff. Calls
 * are serialized through a chain, so an enqueue during an in-flight
 * flush still gets its own pass over the freshly persisted entries.
 */
export function flushRecognitionDiagnostics(
  deps: DiagnosticsOutboxDeps = {},
  opts: { pageHide?: boolean } = {},
): Promise<void> {
  const d = resolveDeps(deps);
  const run = flushChain.then(() => doFlushRecognitionDiagnostics(d, opts));
  flushChain = run.catch(() => undefined);
  return run;
}

let started = false;

/**
 * App-start wiring (called once from the entry point): flush whatever a
 * previous session left behind, keep retrying on a slow timer and on
 * reconnect, and take one keepalive shot at pagehide for small payloads.
 */
export function startRecognitionDiagnosticsOutbox(deps: DiagnosticsOutboxDeps = {}): void {
  if (started) return;
  started = true;
  void flushRecognitionDiagnostics(deps);
  window.setInterval(() => { void flushRecognitionDiagnostics(deps); }, 60_000);
  window.addEventListener('online', () => { void flushRecognitionDiagnostics(deps); });
  window.addEventListener('pagehide', () => { void flushRecognitionDiagnostics(deps, { pageHide: true }); });
}
