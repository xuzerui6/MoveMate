import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  ProgressTracker,
  buildPrepareFileList,
  formatMB,
  isSlowPrepare,
  nextPreparePhase,
  prepareBackoffMs,
  shouldRetryPrepare,
} from '../src/features/motion/lib/posePrepareCore';

test('prepare file list: the start model (pinned size) plus the four WASM files', () => {
  const full = buildPrepareFileList('full');
  assert.equal(full.length, 5);
  assert.deepEqual(full[0], {key: 'model', src: '/pose/pose_landmarker_full.task', totalBytes: 9398198, kind: 'model'});
  assert.ok(full.slice(1).every(f => f.kind === 'wasm' && f.totalBytes === null));
  assert.deepEqual(full.slice(1).map(f => f.src), [
    '/pose/wasm/vision_wasm_internal.js',
    '/pose/wasm/vision_wasm_internal.wasm',
    '/pose/wasm/vision_wasm_nosimd_internal.js',
    '/pose/wasm/vision_wasm_nosimd_internal.wasm',
  ]);
  const lite = buildPrepareFileList('lite');
  assert.equal(lite[0].totalBytes, 5777746);
});

test('progress math aggregates real bytes and never invents a total', () => {
  const tracker = new ProgressTracker();
  tracker.register('model', 1000);
  tracker.register('wasm:a', null);
  tracker.addBytes('model', 250, 1000);
  let snap = tracker.snapshot(1000);
  assert.equal(snap.loadedBytes, 250);
  assert.equal(snap.totalBytes, 1000);
  assert.equal(snap.fraction, 0.25);
  // An unknown-total file contributes only the bytes actually measured.
  tracker.setTotal('wasm:a', 500);
  tracker.addBytes('wasm:a', 100, 1100);
  snap = tracker.snapshot(1100);
  assert.equal(snap.loadedBytes, 350);
  assert.equal(snap.totalBytes, 1500);
  // Loaded can never exceed the known total.
  tracker.addBytes('model', 5000, 1200);
  snap = tracker.snapshot(1200);
  assert.equal(snap.loadedBytes, 1100);
  assert.ok(snap.fraction <= 1);
});

test('cached files complete instantly with their real byte count', () => {
  const tracker = new ProgressTracker();
  tracker.register('model', 1000);
  tracker.register('wasm:a', null);
  tracker.markCached('model', 1000, 0);
  assert.equal(tracker.complete, false);
  tracker.markCached('wasm:a', 300, 0);
  assert.equal(tracker.complete, true);
  const snap = tracker.snapshot(0);
  assert.equal(snap.loadedBytes, 1300);
  assert.equal(snap.totalBytes, 1300);
  assert.equal(snap.fraction, 1);
});

test('rate and ETA come only from measured samples', () => {
  const tracker = new ProgressTracker();
  tracker.register('model', 10000);
  tracker.addBytes('model', 0, 0);
  assert.equal(tracker.snapshot(500).rateBps, 0);
  assert.equal(tracker.snapshot(500).etaSeconds, null);
  tracker.addBytes('model', 2000, 2000);
  const snap = tracker.snapshot(2000);
  assert.equal(snap.rateBps, 1000);
  assert.equal(snap.etaSeconds, 8);
  // While any pending file has an unknown total, no ETA is shown.
  tracker.register('wasm:a', null);
  assert.equal(tracker.snapshot(2000).etaSeconds, null);
});

test('slow predicate: 8 s elapsed or a measured rate under 0.5 MB/s', () => {
  assert.equal(isSlowPrepare({startedAt: 0, now: 8001, rateBps: 0, complete: false}), true);
  assert.equal(isSlowPrepare({startedAt: 0, now: 3000, rateBps: 400_000, complete: false}), true);
  assert.equal(isSlowPrepare({startedAt: 0, now: 3000, rateBps: 2_000_000, complete: false}), false);
  assert.equal(isSlowPrepare({startedAt: 0, now: 3000, rateBps: 0, complete: false}), false);
  assert.equal(isSlowPrepare({startedAt: 0, now: 60_000, rateBps: 1, complete: true}), false);
  assert.equal(isSlowPrepare({startedAt: null, now: 60_000, rateBps: 1, complete: false}), false);
});

test('prepare phase machine: start → checking → downloading → ready / failed', () => {
  assert.equal(nextPreparePhase('idle', 'start'), 'checking');
  assert.equal(nextPreparePhase('checking', 'progress'), 'downloading');
  assert.equal(nextPreparePhase('downloading', 'complete'), 'ready');
  assert.equal(nextPreparePhase('downloading', 'error-retryable'), 'downloading');
  assert.equal(nextPreparePhase('downloading', 'error-final'), 'failed');
  assert.equal(nextPreparePhase('ready', 'progress'), 'ready');
});

test('retry policy: network problems get 3 attempts, verification problems are final', () => {
  assert.equal(shouldRetryPrepare(new Error('网络中断'), 1), true);
  assert.equal(shouldRetryPrepare(new Error('网络中断'), 2), true);
  assert.equal(shouldRetryPrepare(new Error('网络中断'), 3), false);
  assert.equal(shouldRetryPrepare(new Error('模型完整性校验失败'), 1), false);
  assert.equal(shouldRetryPrepare(new Error('模型大小校验失败'), 1), false);
  assert.equal(prepareBackoffMs(1), 600);
  assert.equal(prepareBackoffMs(2), 1500);
});

test('MB formatting matches the design board figures', () => {
  assert.equal(formatMB(9398198), '9.4');
  assert.equal(formatMB(3100000), '3.1');
  assert.equal(formatMB(600000), '0.6');
});
