import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  enqueueRecognitionDiagnostics,
  flushRecognitionDiagnostics,
  readDiagnosticsOutbox,
  DIAGNOSTICS_ENDPOINT,
  type DiagnosticsOutboxDeps,
  type RecognitionDiagnosticsBody,
} from '../src/features/motion/lib/diagnosticsOutbox.ts';
import { emptyGateCounters } from '../src/features/motion/lib/gateCounters.ts';
import type { GateTracePayload } from '../src/features/motion/lib/gateTrace.ts';

// 2026-11-15 16:52 预览版锤式弯举一组（实际 10 个、App 数 1 个、俯身
// 追踪丢失收尾）：训练本身存上了（+2 XP），但计数+轨迹的诊断 POST 没
// 落到服务器、也从未重试——服务器里还留着上一组的记录。旧发送是一次性
// fire-and-forget：上报闩在结果未知时先翻、响应从不检查（HTTP 400 对
// fetch 也是 resolved）、载荷只在内存里。本套测试锁住发件箱的保证：
// 先落盘、只有 2xx 才出箱、失败退避重试、下次启动补发、同组替换、
// 只替本人发送。Workout 各收尾路径的接线由末尾的源码钉子锁住。

type Outcome = 'ok' | 'http500' | 'http400' | 'throw';

function harness(outcomes: Outcome[] = [], sharedStore?: Map<string, string>, startAt = 1_700_000_000_000) {
  const store = sharedStore ?? new Map<string, string>();
  const storage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  };
  let now = startAt;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchFn = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const outcome = outcomes.length ? outcomes.shift()! : 'ok';
    if (outcome === 'throw') throw new Error('network down');
    if (outcome === 'http500') return { ok: false, status: 500 };
    if (outcome === 'http400') return { ok: false, status: 400 };
    return { ok: true, status: 200 };
  };
  const deps: DiagnosticsOutboxDeps = { storage, fetchFn, now: () => now, token: () => 'tok-1', userId: () => 4 };
  return {
    store, calls, deps,
    advance: (ms: number) => { now += ms; },
  };
}

const body = (framingRejects: number, withTrace = false): RecognitionDiagnosticsBody => {
  const base: RecognitionDiagnosticsBody = {
    exerciseType: 'hammer_curl',
    counters: { ...emptyGateCounters(), framingRejects, peaksConfirmed: [8, 9] },
  };
  if (withTrace) {
    const trace: GateTracePayload = {
      v: 1, type: 'hammer_curl', t0: 1000, dropped: 0,
      samples: [[1000, 158.2, 172.5, 1, 0, 0, 0, 0], [1033, 76.5, 80.1, 1, 2, 0, 2, 0]],
      events: [{ k: 'end', t: 2000, side: 0, counted: true, peakElbow: 72.3, qualMs: 150, retMax: 151 }],
    };
    base.trace = trace;
  }
  return base;
};

test('outbox: set-end capture (done path) persists, sends once with auth, and clears on 2xx', async () => {
  const h = harness(['ok']);
  enqueueRecognitionDiagnostics('recognition:s1', body(3, true), h.deps);
  // Persisted synchronously, before any send outcome is known.
  assert.equal(readDiagnosticsOutbox(h.deps).length, 1);
  await flushRecognitionDiagnostics(h.deps);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, DIAGNOSTICS_ENDPOINT);
  assert.equal((h.calls[0].init.headers as Record<string, string>).Authorization, 'Bearer tok-1');
  const sent = JSON.parse(h.calls[0].init.body as string);
  assert.equal(sent.exerciseType, 'hammer_curl');
  assert.equal(sent.counters.framingRejects, 3);
  assert.equal(sent.trace.samples.length, 2);
  assert.equal(readDiagnosticsOutbox(h.deps).length, 0, 'delivered entry must leave the box');
});

test('outbox: live-snapshot capture (leave/unmount/tracking-loss endings) delivers the same way', async () => {
  const h = harness(['ok']);
  // Exit captures carry the non-finalized snapshot — counters, trace may
  // be absent for exercises without one. Shape is identical on the wire.
  enqueueRecognitionDiagnostics('recognition:s2', body(1, false), h.deps);
  await flushRecognitionDiagnostics(h.deps);
  assert.equal(h.calls.length, 1);
  const sent = JSON.parse(h.calls[0].init.body as string);
  assert.equal(sent.counters.framingRejects, 1);
  assert.equal('trace' in sent, false);
  assert.equal(readDiagnosticsOutbox(h.deps).length, 0);
});

test('outbox: network failure keeps the entry and retries only after backoff', async () => {
  const h = harness(['throw', 'ok']);
  enqueueRecognitionDiagnostics('recognition:s3', body(2), h.deps);
  await flushRecognitionDiagnostics(h.deps);
  const queued = readDiagnosticsOutbox(h.deps);
  assert.equal(queued.length, 1, 'failed send must stay queued');
  assert.equal(queued[0].attempts, 1);
  assert.ok(queued[0].nextAttemptAt > 1_700_000_000_000, 'backoff must be scheduled');
  await flushRecognitionDiagnostics(h.deps);
  assert.equal(h.calls.length, 1, 'not yet due — no early retry');
  h.advance(5_000);
  await flushRecognitionDiagnostics(h.deps);
  assert.equal(h.calls.length, 2, 'due entry retries');
  assert.equal(readDiagnosticsOutbox(h.deps).length, 0);
});

test('outbox: an HTTP error is a failure, not a send (the set-2 regression)', async () => {
  const h = harness(['http400', 'http500', 'ok']);
  enqueueRecognitionDiagnostics('recognition:s4', body(4, true), h.deps);
  await flushRecognitionDiagnostics(h.deps);
  assert.equal(readDiagnosticsOutbox(h.deps).length, 1, 'HTTP 400 must NOT clear the entry');
  h.advance(5_000);
  await flushRecognitionDiagnostics(h.deps);
  assert.equal(readDiagnosticsOutbox(h.deps).length, 1, 'HTTP 500 must NOT clear the entry');
  h.advance(30_000);
  await flushRecognitionDiagnostics(h.deps);
  assert.equal(readDiagnosticsOutbox(h.deps).length, 0);
  assert.equal(h.calls.length, 3);
});

test('outbox: a payload left by a dead session is flushed on next app start, exactly once', async () => {
  const store = new Map<string, string>();
  const first = harness(['throw'], store);
  enqueueRecognitionDiagnostics('recognition:s5', body(5, true), first.deps);
  await flushRecognitionDiagnostics(first.deps);
  assert.equal(readDiagnosticsOutbox(first.deps).length, 1, 'session ends with the payload still queued');
  // Next app start: fresh deps over the same storage, clock past backoff.
  const second = harness(['ok'], store, 1_700_000_000_000 + 60_000);
  await flushRecognitionDiagnostics(second.deps);
  assert.equal(second.calls.length, 1);
  assert.equal(JSON.parse(second.calls[0].init.body as string).counters.framingRejects, 5);
  assert.equal(readDiagnosticsOutbox(second.deps).length, 0);
  await flushRecognitionDiagnostics(second.deps);
  assert.equal(second.calls.length, 1, 'no duplicate send after success');
});

test('outbox: re-capturing the same set replaces the body (finalized supersedes snapshot)', async () => {
  const h = harness(['throw', 'ok']);
  enqueueRecognitionDiagnostics('recognition:s6', body(1), h.deps);
  await flushRecognitionDiagnostics(h.deps);
  assert.equal(readDiagnosticsOutbox(h.deps).length, 1);
  enqueueRecognitionDiagnostics('recognition:s6', body(9, true), h.deps);
  const queued = readDiagnosticsOutbox(h.deps);
  assert.equal(queued.length, 1, 'one entry per set');
  assert.equal(queued[0].body.counters.framingRejects, 9, 'latest capture wins locally too');
  await flushRecognitionDiagnostics(h.deps);
  const sent = JSON.parse(h.calls[h.calls.length - 1].init.body as string);
  assert.equal(sent.counters.framingRejects, 9);
  assert.equal(readDiagnosticsOutbox(h.deps).length, 0);
});

test('outbox: an entry is only sent under its owner\u2019s account', async () => {
  const h = harness(['throw']);
  enqueueRecognitionDiagnostics('recognition:s7', body(7), h.deps);
  await flushRecognitionDiagnostics(h.deps);
  assert.equal(readDiagnosticsOutbox(h.deps).length, 1);
  const otherUser: DiagnosticsOutboxDeps = { ...h.deps, userId: () => 7 };
  h.advance(60_000);
  await flushRecognitionDiagnostics(otherUser);
  assert.equal(h.calls.length, 1, 'another account must not carry this payload (server keys the row by token)');
  assert.equal(readDiagnosticsOutbox(h.deps).length, 1);
  await flushRecognitionDiagnostics(h.deps);
  assert.equal(h.calls.length, 2, 'the owner\u2019s next flush delivers it');
  assert.equal(readDiagnosticsOutbox(h.deps).length, 0);
});

test('outbox: no token keeps the entry queued without attempting', async () => {
  const h = harness(['ok']);
  const loggedOut: DiagnosticsOutboxDeps = { ...h.deps, token: () => null };
  enqueueRecognitionDiagnostics('recognition:s8', body(8), loggedOut);
  await flushRecognitionDiagnostics(loggedOut);
  assert.equal(h.calls.length, 0);
  assert.equal(readDiagnosticsOutbox(h.deps).length, 1);
});

test('outbox: entries older than 7 days are dropped unsent; the box is capped at 4', async () => {
  const h = harness(['throw', 'throw', 'throw', 'throw', 'throw', 'throw']);
  enqueueRecognitionDiagnostics('recognition:old', body(1), h.deps);
  await flushRecognitionDiagnostics(h.deps);
  h.advance(8 * 24 * 60 * 60 * 1000);
  await flushRecognitionDiagnostics(h.deps);
  assert.equal(readDiagnosticsOutbox(h.deps).length, 0, 'stale entry expires');
  assert.equal(h.calls.length, 1, 'expired entry is never sent');
  for (const id of ['a', 'b', 'c', 'd', 'e']) enqueueRecognitionDiagnostics('recognition:' + id, body(1), h.deps);
  await flushRecognitionDiagnostics(h.deps);
  const queued = readDiagnosticsOutbox(h.deps);
  assert.equal(queued.length, 4, 'box capped');
  assert.equal(queued.some(entry => entry.id === 'recognition:a'), false, 'oldest dropped first');
});

test('outbox: pagehide flush uses keepalive only under the browser keepalive budget', async () => {
  const small = harness(['throw', 'ok']);
  enqueueRecognitionDiagnostics('recognition:small', body(1), small.deps);
  await flushRecognitionDiagnostics(small.deps);
  small.advance(5_000);
  await flushRecognitionDiagnostics(small.deps, { pageHide: true });
  assert.equal(small.calls[1].init.keepalive, true, 'small payload rides keepalive at pagehide');

  const bigTrace: GateTracePayload = {
    v: 1, type: 'hammer_curl', t0: 0, dropped: 0,
    samples: Array.from({ length: 2400 }, (_, i) => [i * 33, 150.1, 160.2, 1, 0, 0, 0, 0]),
    events: [],
  };
  const bigBody: RecognitionDiagnosticsBody = { exerciseType: 'hammer_curl', counters: emptyGateCounters(), trace: bigTrace };
  assert.ok(JSON.stringify(bigBody).length > 60_000, 'fixture must exceed the keepalive budget');
  const big = harness(['throw', 'ok']);
  enqueueRecognitionDiagnostics('recognition:big', bigBody, big.deps);
  await flushRecognitionDiagnostics(big.deps);
  big.advance(5_000);
  await flushRecognitionDiagnostics(big.deps, { pageHide: true });
  assert.equal(big.calls[1].init.keepalive, undefined, 'oversized body must not attempt keepalive — it waits for next start');
  assert.equal(readDiagnosticsOutbox(big.deps).length, 0, 'the in-page attempt still delivered it here');
});

test('diagnostics wiring: Workout captures via the outbox on every end path; no raw fire-and-forget remains', () => {
  const workout = readFileSync(new URL('../src/features/motion/pages/Workout.tsx', import.meta.url), 'utf8');
  assert.ok(workout.includes("from '../lib/diagnosticsOutbox'"), 'Workout must import the outbox');
  assert.ok(workout.includes('enqueueRecognitionDiagnostics(diagnosticsEntryId()'), 'done() must enqueue the finalized payload');
  assert.ok(workout.includes('exitCaptureRef'), 'leave/unmount/pagehide must capture the live snapshot');
  assert.ok(workout.includes('exitCaptureRef.current({ pageHide: true })'), 'pagehide must capture with the pageHide hint');
  assert.ok(!workout.includes("fetch('/api/v1/diagnostics/recognition'"), 'the old one-shot fetch must be gone');
  assert.ok(!workout.includes('gateReported'), 'the pre-latched reported flag must be gone');
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  assert.ok(main.includes('startRecognitionDiagnosticsOutbox()'), 'app start must start the outbox (next-start flush)');
});
