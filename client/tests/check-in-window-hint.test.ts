import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkInOpensHint } from '../src/pages/GameDetail/gameDetailLocal.ts';

// 2026-11-15 线上实测：20:00 的健身局，19:00 时详情页没有任何签到/开始
// 入口，用户以为坏了——其实签到窗口要到开始前 30 分钟（19:30）随状态机
// 进入 ready 才开放，页面却从没说过几点开放。本测试锁住提示逻辑：
// 窗口未开时把开放时刻（北京时间）说清；窗口已开/状态推进后不显示。

const START_20 = '2026-11-15T20:00:00+08:00';
const at = (iso: string) => new Date(iso);

test('check-in hint: full game starting 20:00 tells members check-in opens at 19:30', () => {
  const hint = checkInOpensHint({
    status: 'full',
    isMemberOrCreator: true,
    startTime: START_20,
    now: at('2026-11-15T19:00:00+08:00'),
  });
  assert.equal(hint, '签到将在 19:30 开放');
});

test('check-in hint: recruiting member sees the same hint', () => {
  const hint = checkInOpensHint({
    status: 'recruiting',
    isMemberOrCreator: true,
    startTime: START_20,
    now: at('2026-11-15T18:00:00+08:00'),
  });
  assert.equal(hint, '签到将在 19:30 开放');
});

test('check-in hint: ready state shows no hint', () => {
  assert.equal(
    checkInOpensHint({
      status: 'ready',
      isMemberOrCreator: true,
      startTime: START_20,
      now: at('2026-11-15T19:35:00+08:00'),
    }),
    null,
  );
});

test('check-in hint: window already open (start within 30 min) shows no hint', () => {
  assert.equal(
    checkInOpensHint({
      status: 'full',
      isMemberOrCreator: true,
      startTime: START_20,
      now: at('2026-11-15T19:45:00+08:00'),
    }),
    null,
  );
});

test('check-in hint: non-members never see it', () => {
  assert.equal(
    checkInOpensHint({
      status: 'full',
      isMemberOrCreator: false,
      startTime: START_20,
      now: at('2026-11-15T19:00:00+08:00'),
    }),
    null,
  );
});

test('check-in hint: opens on another day → date included', () => {
  const hint = checkInOpensHint({
    status: 'full',
    isMemberOrCreator: true,
    startTime: '2026-11-16T20:00:00+08:00',
    now: at('2026-11-15T19:00:00+08:00'),
  });
  assert.equal(hint, '签到将在 11月16日 19:30 开放');
});

test('check-in hint: page wiring — stage note and host actions both consume the hint', () => {
  const detail = readFileSync(new URL('../src/pages/GameDetail/GameDetail.tsx', import.meta.url), 'utf8');
  const actions = readFileSync(new URL('../src/pages/GameDetail/HostActions.tsx', import.meta.url), 'utf8');
  assert.ok(detail.includes('checkInOpensHint'), 'GameDetail must compute the hint');
  assert.ok(detail.includes('checkInOpensHint={checkInHint}'), 'GameDetail must pass the hint to HostActions');
  assert.ok(detail.includes('stageSmall'), 'stage note must render the hint-augmented copy');
  assert.ok(actions.includes('checkInOpensHint'), 'HostActions must render the hint in the management area');
});
