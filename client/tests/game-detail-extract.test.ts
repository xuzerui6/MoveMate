import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractGameDetail } from '../src/api/games.ts';

// 2026-11-14 契约测试抓出的缺陷：GameSummary.loadRebooked 曾把
// fetchGameDetail 的返回值（完整信封 {code,message,data:{game,members}}）
// 直接当 Game 存下，rebooked.participants / .status 恒为 undefined——
// 「约下周再练」的成员确认名单永远为空、「我也来」按钮永远不渲染。
// 修复 = 提取规则收敛到 api 层的 extractGameDetail，useGameDetail 与
// GameSummary 共用。本测试只锁这条纯提取逻辑（套件没有组件渲染脚手架，
// 不假装测渲染）：喂完整信封，断言拿回的是 game 本体 + members 挂成
// participants。

const gameFixture = { id: 9, status: 'recruiting', sport_type: 'fitness', host_id: 7 };
const membersFixture = [
  { user_id: 7, nickname: '泽瑞' },
  { user_id: 8, nickname: '同学' },
];

test('extractGameDetail: full envelope → game itself, members become participants', () => {
  const envelope = { code: 0, message: 'ok', data: { game: { ...gameFixture }, members: membersFixture } };
  const game = extractGameDetail(envelope) as any;
  assert.equal(game.id, 9);
  assert.equal(game.status, 'recruiting');
  assert.deepEqual(game.participants, membersFixture);
  // 拿回的是 game 本体，不是信封
  assert.equal('code' in game, false);
  assert.equal('data' in game, false);
});

test('extractGameDetail: bare {game, members} payload (envelope already stripped) also works', () => {
  const payload = { game: { ...gameFixture }, members: membersFixture };
  const game = extractGameDetail(payload) as any;
  assert.equal(game.id, 9);
  assert.deepEqual(game.participants, membersFixture);
});

test('extractGameDetail: no members in payload → game keeps its own participants untouched', () => {
  const own = [{ user_id: 1, nickname: '老成员' }];
  const envelope = { code: 0, message: 'ok', data: { game: { ...gameFixture, participants: own } } };
  const game = extractGameDetail(envelope) as any;
  assert.equal(game.id, 9);
  assert.deepEqual(game.participants, own);
});

test('extractGameDetail: no members and no participants → participants stays undefined (no crash)', () => {
  const envelope = { code: 0, message: 'ok', data: { game: { ...gameFixture } } };
  const game = extractGameDetail(envelope) as any;
  assert.equal(game.id, 9);
  assert.equal(game.participants, undefined);
});
