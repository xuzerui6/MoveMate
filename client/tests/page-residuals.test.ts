import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { bossFightEntryVisible, bossFightTeaserVisible } from '../src/features/motion/lib/bossFightState';
import {
  chunkReloadAllowed,
  importWithChunkRecovery,
  CHUNK_RELOAD_KEY,
} from '../src/components/lazyWithRetry';

const root = path.resolve(import.meta.dirname, '..');
const designSystem = fs.readFileSync(path.join(root, 'src/design-system.css'), 'utf8');
const lobby = fs.readFileSync(path.join(root, 'src/pages/Lobby/Lobby.tsx'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
const gameDetail = fs.readFileSync(path.join(root, 'src/pages/GameDetail/GameDetail.tsx'), 'utf8');

/* ---------- Residual A: /groups top action row can never overlap ---------- */

test('A: no .group-create rule anywhere takes the buttons out of flow', () => {
  const blocks = [...designSystem.matchAll(/\.group-create\s*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(blocks.length > 0, 'expected at least one .group-create rule (sizing hook)');
  for (const block of blocks) {
    assert.doesNotMatch(block, /position\s*:\s*(absolute|fixed)/, `out-of-flow positioning leaked back: ${block}`);
    assert.doesNotMatch(block, /float\s*:\s*(left|right)/, `float leaked back: ${block}`);
  }
  // The lobby header must not reserve the old absolute button's space again.
  assert.doesNotMatch(designSystem, /\.ui-pages-lobby-lobby-header\{[^}]*padding-right:\s*1[58]0px/);
});

test('A: the three header buttons live in the in-flow .group-actions flex row', () => {
  const actions = designSystem.match(/\.groups-page \.group-actions\s*\{([^}]*)\}/);
  assert.ok(actions, '.group-actions rule missing');
  assert.match(actions[1], /display\s*:\s*flex/);
  const markup = lobby.match(/<div className="group-actions">([\s\S]*?)<\/div>/);
  assert.ok(markup, 'Lobby must render the .group-actions container');
  for (const label of ['发起运动局', '我的好友', '怪兽图鉴']) {
    assert.ok(markup[1].includes(label), `${label} must be inside .group-actions`);
  }
});

/* ---------- Residual B: chunk-load failure degrades, never nukes the app ---------- */

test('B: reload guard allows one reload, then blocks loops for 30s', () => {
  const now = 1_700_000_000_000;
  assert.equal(chunkReloadAllowed(now, null), true);
  assert.equal(chunkReloadAllowed(now, Number.NaN), true);
  assert.equal(chunkReloadAllowed(now, now - 29_999), false);
  assert.equal(chunkReloadAllowed(now, now - 30_000), true);
  assert.equal(chunkReloadAllowed(now, now - 120_000), true);
});

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    map,
  };
}
const noSleep = async () => {};

test('B: a chunk import that succeeds needs no recovery', async () => {
  let reloads = 0;
  const value = await importWithChunkRecovery(async () => ({ default: 42 }), {
    storage: fakeStorage(),
    reload: () => { reloads++; },
    sleep: noSleep,
  });
  assert.deepEqual(value, { default: 42 });
  assert.equal(reloads, 0);
});

test('B: a transient chunk failure is retried once and recovers silently', async () => {
  let calls = 0;
  let reloads = 0;
  const value = await importWithChunkRecovery(async () => {
    calls++;
    if (calls === 1) throw new Error('chunk 404');
    return { default: 'ok' };
  }, { storage: fakeStorage(), reload: () => { reloads++; }, sleep: noSleep });
  assert.deepEqual(value, { default: 'ok' });
  assert.equal(calls, 2);
  assert.equal(reloads, 0);
});

test('B: a persistent chunk failure triggers exactly one guarded full reload', async () => {
  const storage = fakeStorage();
  let reloads = 0;
  const pending = importWithChunkRecovery(async () => { throw new Error('chunk 404'); }, {
    storage,
    now: () => 1_700_000_000_000,
    reload: () => { reloads++; },
    sleep: noSleep,
  });
  const outcome = await Promise.race([
    pending.then(() => 'settled', () => 'rejected'),
    new Promise<string>((r) => setTimeout(() => r('still-pending'), 50)),
  ]);
  // Reloading: the import must NOT settle (no error flash while navigation restarts).
  assert.equal(outcome, 'still-pending');
  assert.equal(reloads, 1);
  assert.equal(storage.map.get(CHUNK_RELOAD_KEY), '1700000000000');
});

test('B: right after a chunk reload, a repeated failure surfaces instead of looping', async () => {
  const now = 1_700_000_000_000;
  const storage = fakeStorage({ [CHUNK_RELOAD_KEY]: String(now - 5_000) });
  let reloads = 0;
  await assert.rejects(
    importWithChunkRecovery(async () => { throw new Error('chunk 404'); }, {
      storage,
      now: () => now,
      reload: () => { reloads++; },
      sleep: noSleep,
    }),
    /chunk 404/,
  );
  assert.equal(reloads, 0);
});

test('B: App routes load pages through lazyWithRetry and the detail route has its own boundary', () => {
  assert.match(app, /const GameDetail=lazyWithRetry\(/);
  assert.doesNotMatch(app, /const \w+=lazy\(/);
  assert.match(app, /<RouteErrorBoundary resetKey=\{id\}/);
  assert.match(app, /path="game\/:id" element=\{<GameDetailRoute\/>\}/);
});

/* ---------- Residual C: boss-fight entry gating truth table ---------- */

test('C: entry is visible only for a checked-in member while the game is in progress', () => {
  const ts = '2026-11-13T10:00:00.000Z';
  const statuses = ['recruiting', 'full', 'ready', 'in_progress', 'completed', 'cancelled', 'archived'];
  for (const status of statuses) {
    for (const isMember of [true, false]) {
      for (const checkedInAt of [ts, null, undefined]) {
        const expected = isMember && checkedInAt === ts && status === 'in_progress';
        assert.equal(
          bossFightEntryVisible({ isMember, checkedInAt, gameStatus: status }),
          expected,
          `isMember=${isMember} checkedInAt=${checkedInAt} status=${status}`,
        );
      }
    }
  }
});

test('C: the detail page derives the entry from the shared predicate, not an inline condition', () => {
  assert.match(gameDetail, /bossFightEntryVisible\(\{isMember,checkedInAt:member\?\.checked_in_at,gameStatus:game\.status\}\)/);
});

/* ---------- Residual C2: boss-fight teaser card before the gate opens ---------- */

test('C2: teaser shows only to members in pre-fight states, and never together with the entry', () => {
  const ts = '2026-11-13T10:00:00.000Z';
  const statuses = ['recruiting', 'full', 'ready', 'in_progress', 'completed', 'cancelled', 'archived'];
  const preFight = ['recruiting', 'full', 'ready'];
  for (const status of statuses) {
    for (const isMember of [true, false]) {
      for (const checkedInAt of [ts, null, undefined]) {
        const input = { isMember, checkedInAt, gameStatus: status };
        const expectedTeaser = isMember && preFight.includes(status);
        assert.equal(
          bossFightTeaserVisible(input),
          expectedTeaser,
          `teaser isMember=${isMember} checkedInAt=${checkedInAt} status=${status}`,
        );
        assert.ok(
          !(bossFightEntryVisible(input) && bossFightTeaserVisible(input)),
          `entry and teaser both visible: isMember=${isMember} checkedInAt=${checkedInAt} status=${status}`,
        );
      }
    }
  }
});

test('C2: the detail page renders the muted teaser from the shared predicate, with the unlock condition spelled out', () => {
  assert.match(gameDetail, /bossFightTeaserVisible\(\{isMember,checkedInAt:member\?\.checked_in_at,gameStatus:game\.status\}\)/);
  assert.match(gameDetail, /boss-fight-teaser/);
  assert.match(gameDetail, /开局后开启/);
  // 未签到：开局 + 签到两个条件都写明；已签到：只差开局，文案不能再要求签到。
  assert.match(gameDetail, /活动开始、你签到之后/);
  assert.match(gameDetail, /你已经签到啦，活动一开始/);
  // 预告卡只能去图鉴看看，不能有直达打怪页的按钮冒充真入口。
  const teaser = gameDetail.match(/bossFightTeaserVisible\(\{[^}]*\}\)&&<section[\s\S]*?<\/section>/);
  assert.ok(teaser, 'teaser section missing');
  assert.match(teaser[0], /navigate\('\/boss-Atlas'\)/);
  assert.doesNotMatch(teaser[0], /boss-fight`/);
});
