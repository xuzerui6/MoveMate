/**
 * 组队打怪二期 · 约定段模式客户端纯逻辑回归。
 * 模板镜像必须与服务端 server/src/utils/boss-segments.ts 逐条一致；
 * 状态图档位必须与一期 hpStateKey 同一条 60%/30% 线。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GENERIC_SEGMENT_TEMPLATE,
  SEGMENT_TEMPLATES,
  segmentTemplateFor,
} from '../src/features/motion/lib/segmentTemplates.ts';
import {
  isSegmentFight,
  remainingSegments,
  segmentStateKey,
  type BossFightSnapshot,
} from '../src/features/motion/lib/bossFightState.ts';

function segSnapshot(patch: Partial<BossFightSnapshot> = {}): BossFightSnapshot {
  return {
    id: 'fight-seg',
    game_id: 9,
    boss_id: 'aoye_yanshi',
    boss_name: '熬夜魇狮',
    movement: '',
    status: 'fighting',
    max_hp: 4,
    hp: 4,
    version: 1,
    duration_sec: 0,
    created_by: 1,
    created_at: '2026-11-14T00:00:00.000Z',
    started_at: '2026-11-14T00:05:00.000Z',
    ends_at: null,
    ended_at: null,
    server_ts: 1000,
    participants: [],
    my_reward: null,
    mode: 'segments',
    template_id: 'basketball',
    segment_format: 'minutes10',
    segment_label: '打完一轮 10 分钟的比赛，算一段',
    total_label: '本场共 4 段，打满 4 段就是打赢',
    segments_total: 4,
    segments_done: 0,
    segments: [],
    ...patch,
  };
}

test('segment templates mirror the approved server table', () => {
  const expected: Record<string, number> = {
    basketball: 4, soccer: 3, badminton: 4, volleyball: 4, tennis: 6,
    table_tennis: 6, swimming: 4, running: 4, roller_skating: 4, skateboarding: 4, fitness: 4,
  };
  for (const [sport, total] of Object.entries(expected)) {
    assert.equal(segmentTemplateFor(sport).segmentsTotal, total, sport);
  }
  assert.equal(segmentTemplateFor('dance').templateId, 'generic');
  assert.equal(segmentTemplateFor('taekwondo').templateId, 'generic');
  assert.equal(segmentTemplateFor(undefined).templateId, 'generic');
  assert.equal(GENERIC_SEGMENT_TEMPLATE.segmentsTotal, 4);
  assert.match(GENERIC_SEGMENT_TEMPLATE.segmentLabel, /15 分钟/);
  // 篮球二选一打法、健身固定动作清单都在镜像里
  assert.deepEqual(SEGMENT_TEMPLATES.basketball.formats?.map((f) => f.value), ['minutes10', 'points21']);
  assert.match(SEGMENT_TEMPLATES.basketball.formats![1].segmentLabel, /21 分/);
  // 篮球总述是两种打法共用的：只能按「段」说，不能用「轮」（21 分一局没有轮）
  assert.equal(SEGMENT_TEMPLATES.basketball.totalLabel, '本场共 4 段，打满 4 段就是打赢');
  assert.doesNotMatch(SEGMENT_TEMPLATES.basketball.totalLabel, /轮/);
  assert.equal(SEGMENT_TEMPLATES.fitness.movements?.length, 5);
  assert.match(SEGMENT_TEMPLATES.swimming.totalLabel, /800 米/);
  assert.match(SEGMENT_TEMPLATES.running.totalLabel, /4 公里/);
});

test('segment state image switches on the same 60%/30% lines as camera hp', () => {
  // 总格 4：剩 4/3 格 = 100%/75% 精神抖擞；剩 2 格 = 50% 有点喘了；剩 1 格 = 25% 快撑不住了
  assert.equal(segmentStateKey(segSnapshot({ hp: 4, max_hp: 4 })), 'full');
  assert.equal(segmentStateKey(segSnapshot({ hp: 3, max_hp: 4 })), 'full');
  assert.equal(segmentStateKey(segSnapshot({ hp: 2, max_hp: 4 })), 'mid');
  assert.equal(segmentStateKey(segSnapshot({ hp: 1, max_hp: 4 })), 'low');
  // 总格 10 的边界：剩 6 格 = 60% 整 → 有点喘了（与 hpStateKey 的 >0.6 full 口径一致）
  assert.equal(segmentStateKey(segSnapshot({ hp: 7, max_hp: 10 })), 'full');
  assert.equal(segmentStateKey(segSnapshot({ hp: 6, max_hp: 10 })), 'mid');
  assert.equal(segmentStateKey(segSnapshot({ hp: 3, max_hp: 10 })), 'mid');
  assert.equal(segmentStateKey(segSnapshot({ hp: 2, max_hp: 10 })), 'low');
});

test('remaining segments and mode detection read the authoritative snapshot fields', () => {
  assert.equal(remainingSegments(segSnapshot({ segments_total: 4, segments_done: 1 })), 3);
  assert.equal(remainingSegments(segSnapshot({ segments_total: 4, segments_done: 4 })), 0);
  assert.equal(remainingSegments(segSnapshot({ segments_total: 4, segments_done: 9 })), 0);
  assert.equal(isSegmentFight(segSnapshot()), true);
  assert.equal(isSegmentFight(segSnapshot({ mode: 'camera' })), false);
  assert.equal(isSegmentFight(segSnapshot({ mode: undefined })), false);
  assert.equal(isSegmentFight(null), false);
});
