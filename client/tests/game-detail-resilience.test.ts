import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AxiosError } from 'axios';
import { getErrorMessage, toUserMessage } from '../src/api/client.ts';
import {
  REFRESH_NOTICE,
  applyLocalAttendance,
  applyLocalCheckIn,
  applyLocalJoin,
  applyLocalLeave,
  applyLocalStatus,
  resolveDetailFailure,
} from '../src/pages/GameDetail/gameDetailLocal.ts';
import type { Game } from '../src/types.ts';

// 2026-11-14 线上事故：成员签到在服务端已成功，但随后详情重读超时，
// 旧页面把已加载的局整页换成「暂时无法读取活动 / timeout of 10000ms
// exceeded」（原始 axios 英文串）。修复分三层，本测试锁住其中的纯逻辑层
// （套件没有组件渲染脚手架，不假装测渲染）：
//  1) 错误文案映射：超时/断网翻成大白话，原始报错永不透传；
//  2) 写操作结果先落本地：签到成功后本地立即显示已签到；
//  3) 读取失败去向决策：已有详情时只给小提示、不产生整页错误。

function timeoutError(): AxiosError {
  const err = new AxiosError('timeout of 10000ms exceeded', 'ECONNABORTED', {} as never, {});
  return err;
}

test('error copy: timeout maps to plain language, raw axios text never leaks', () => {
  const message = getErrorMessage(timeoutError());
  assert.equal(message, '网络有点慢，请稍后再试');
  assert.ok(!message.includes('timeout of'));
  assert.ok(!message.includes('10000ms'));
  assert.equal(toUserMessage(timeoutError()), '网络有点慢，请稍后再试');
});

test('error copy: network failure maps to plain language; server wording is preserved', () => {
  const network = new AxiosError('Network Error', 'ERR_NETWORK', {} as never, {});
  assert.equal(getErrorMessage(network), '网络连接不稳定，请检查网络后再试');

  const server = new AxiosError('Request failed with status code 409', 'ERR_BAD_REQUEST', {} as never, {}, {
    status: 409,
    data: { error: '当前状态不可签到' },
  } as never);
  assert.equal(getErrorMessage(server), '当前状态不可签到');
  assert.equal(toUserMessage(server), '当前状态不可签到');
});

test('error copy: local plain-language errors pass through, technical ones are translated', () => {
  assert.equal(getErrorMessage(new Error('账号已切换，请重新进入训练')), '账号已切换，请重新进入训练');
  const raw = getErrorMessage(new Error('timeout of 5000ms exceeded'));
  assert.equal(raw, '网络有点慢，请稍后再试');
  assert.ok(!raw.includes('timeout of'));
});

const baseGame = (): Game => ({
  id: 42,
  host_id: 7,
  sport_type: 'fitness',
  title: '健身局',
  location: '健身房',
  max_players: 2,
  member_count: 2,
  start_time: new Date(Date.now() + 3600000).toISOString(),
  end_time: null,
  completed_at: null,
  status: 'in_progress',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  participants: [
    { id: '7', game_id: '42', user_id: '7', nickname: '发起人', avatar: '', role: 'creator', joined_at: '', checked_in_at: null, attendance_confirmed_at: null },
    { id: '8', game_id: '42', user_id: '8', nickname: '队友', avatar: '', role: 'member', joined_at: '', checked_in_at: null, attendance_confirmed_at: null },
  ],
} as Game);

test('check-in success + reload failure keeps the page and shows checked-in', () => {
  const loaded = baseGame();
  // 1) 签到接口成功 → 结果先落本地（用服务端返回的时间）
  const checkedInAt = '2026-11-14T09:49:00.000Z';
  const afterCheckIn = applyLocalCheckIn(loaded, 8, checkedInAt);
  assert.equal(afterCheckIn.participants?.find((p) => p.user_id === '8')?.checked_in_at, checkedInAt);
  assert.equal(afterCheckIn.participants?.find((p) => p.user_id === '7')?.checked_in_at, null);
  assert.equal(loaded.participants?.find((p) => p.user_id === '8')?.checked_in_at, null); // 原对象不被改动

  // 2) 随后的详情重读超时 → 决策层：不产生整页错误，只给小提示
  const failure = resolveDetailFailure(true, getErrorMessage(timeoutError()));
  assert.equal(failure.pageError, null);
  assert.equal(failure.notice, REFRESH_NOTICE);
  // 页面保留的正是已落本地签到的那份详情
  assert.equal(afterCheckIn.participants?.find((p) => p.user_id === '8')?.checked_in_at, checkedInAt);
});

test('detail failure with nothing loaded still yields the full-page error (mapped copy)', () => {
  const failure = resolveDetailFailure(false, getErrorMessage(timeoutError()));
  assert.equal(failure.pageError, '网络有点慢，请稍后再试');
  assert.equal(failure.notice, null);
});

test('local apply: attendance, status, join and leave mirror the server outcomes', () => {
  const game = baseGame();
  const confirmed = applyLocalAttendance(game, 8, '2026-11-14T09:50:00.000Z');
  assert.equal(confirmed.participants?.find((p) => p.user_id === '8')?.attendance_confirmed_at, '2026-11-14T09:50:00.000Z');
  assert.equal(applyLocalStatus(game, 'in_progress').status, 'in_progress');
  assert.equal(applyLocalStatus(game, 'cancelled').status, 'cancelled');

  const recruiting = { ...baseGame(), status: 'recruiting' as Game['status'], member_count: 1, participants: [baseGame().participants![0]] };
  const joined = applyLocalJoin(recruiting, { user_id: 8, nickname: '队友', avatar: '' });
  assert.equal(joined.member_count, 2);
  assert.equal(joined.status, 'full');
  assert.equal(applyLocalJoin(joined, { user_id: 8, nickname: '队友', avatar: '' }), joined); // 重复加入不新增

  const left = applyLocalLeave(joined, 8);
  assert.equal(left.member_count, 1);
  assert.equal(left.status, 'recruiting');
  assert.equal(left.participants?.length, 1);
});
