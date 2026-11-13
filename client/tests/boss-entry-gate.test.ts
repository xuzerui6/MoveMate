import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { bossFightEntryVisible, bossFightTeaserVisible } from '../src/features/motion/lib/bossFightState';

/* Boss entry/teaser gate tests, extracted from main's page-residuals.test.ts
 * (882eea7 + 828d5d2). The app-shell residual blocks of that file
 * (lazyWithRetry / RouteErrorBoundary / lobby CSS) are not part of the
 * production candidate, so the boss blocks live here on this lineage. */

const root = path.resolve(import.meta.dirname, '..');
const gameDetail = fs.readFileSync(
  path.join(root, 'src/pages/GameDetail/GameDetail.tsx'),
  'utf8',
);

/* ---------- Boss-fight entry gating truth table ---------- */

test('entry is visible only for a checked-in member while the game is in progress', () => {
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

test('the detail page derives the entry from the shared predicate, not an inline condition', () => {
  assert.match(gameDetail, /bossFightEntryVisible\(\{isMember,checkedInAt:member\?\.checked_in_at,gameStatus:game\.status\}\)/);
});

/* ---------- Boss-fight teaser card before the gate opens ---------- */

test('teaser shows only to members in pre-fight states, and never together with the entry', () => {
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

test('the detail page renders the muted teaser from the shared predicate, with the unlock condition spelled out', () => {
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
