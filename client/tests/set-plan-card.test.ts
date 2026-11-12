import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {setPlanRows} from '../src/features/gym/trainingPresentation';
import {SetPlanCard} from '../src/features/gym/SetPlanCard';

// 方案 B「安排上移」：准备页左栏的「本组安排」卡必须直接来自训练安排
// 数据（row.sets，与「调整本次训练安排」编辑器同一份），当前组高亮，
// 不能另存一份状态。
const squat = {id: 'squat', nameZh: '徒手深蹲'};
const rowEx = {id: 'row', nameZh: '单臂划船'};
const mkSet = (id: string, exercise: any, over: any = {}) => ({
  id,
  exercise,
  status: 'pending',
  targetReps: 10,
  targetSeconds: 0,
  loadKg: 0,
  targetLoadKg: 0,
  kind: 'work',
  side: 'both',
  ...over,
});
const freeSquat = () => [mkSet('a', squat), mkSet('b', squat), mkSet('c', squat)];
const html = (sets: any[], cursor: number, unit?: string) =>
  renderToStaticMarkup(createElement(SetPlanCard, {sets, cursor, unit, onAdjust: () => {}})).replace(/<!-- -->/g, '');

test('rows derive from the arrangement data with the cursor set highlighted', () => {
  const rows = setPlanRows(freeSquat(), 0);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(r => r.position), [1, 2, 3]);
  assert.deepEqual(rows.map(r => r.isCurrent), [true, false, false]);
  assert.deepEqual(rows.map(r => r.stateText), ['当前组', '未开始', '未开始']);
});

test('rows only cover the current exercise and drop removed sets', () => {
  const sets = [
    mkSet('a', squat, {status: 'completed'}),
    mkSet('b', squat),
    mkSet('c', rowEx),
    mkSet('d', squat, {status: 'removed'}),
    mkSet('e', squat),
  ];
  const rows = setPlanRows(sets, 1);
  assert.deepEqual(rows.map(r => r.set.id), ['a', 'b', 'e']);
  assert.deepEqual(rows.map(r => r.position), [1, 2, 3]);
  assert.deepEqual(rows.map(r => r.stateText), ['已完成', '当前组', '未开始']);
});

test('no current set means no rows', () => {
  assert.deepEqual(setPlanRows(freeSquat(), 9), []);
  assert.deepEqual(setPlanRows([], 0), []);
});

test('card renders the mockup structure from live arrangement data', () => {
  const out = html(freeSquat(), 0);
  assert.match(out, /本组安排/);
  assert.match(out, /调整 ›/);
  assert.match(out, /第 1 组/);
  assert.match(out, /第 3 组/);
  assert.match(out, /10 次/);
  assert.match(out, /当前组/);
  assert.match(out, /未开始/);
  assert.equal((out.match(/is-current/g) || []).length, 1);
  // 徒手（0 kg）不显示重量
  assert.doesNotMatch(out, /kg/);
});

test('card shows the target weight in the display unit when loaded', () => {
  const sets = [mkSet('a', squat, {loadKg: 20, targetLoadKg: 20}), mkSet('b', squat, {loadKg: 20, targetLoadKg: 20})];
  assert.match(html(sets, 0), /20 kg/);
  assert.match(html(sets, 0, 'lb'), /44\.092 lb/);
});

test('card renders nothing without rows', () => {
  assert.equal(html([], 0), '');
});
