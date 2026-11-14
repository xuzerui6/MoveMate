/**
 * 组队打怪二期 · 约定段模式客户端纯逻辑回归。
 * 模板镜像的唯一源头是服务端 server/src/utils/boss-segments.ts：本文件用
 * scripts/segment-templates-data.ts（直接读服务端模块）逐字段比对生成物，
 * 服务端改了任何文案没重新生成，镜像测试就会红，漂移进不了主干。
 * 状态图档位必须与一期 hpStateKey 同一条 60%/30% 线。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSegmentTemplateData } from '../scripts/segment-templates-data.ts';
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
    segment_label: '打满 10 分钟比赛（暂停、场边休息不计入）',
    total_label: '本场共 4 段：每段打满 10 分钟，一共 40 分钟比赛，休息另算。',
    segments_total: 4,
    segments_done: 0,
    segments: [],
    ...patch,
  };
}

test('segment templates mirror the server source of truth field-by-field', () => {
  // 逐字段比对：templateId / 格数 / segmentLabel / totalLabel /
  // 篮球两种打法的 id、名字与两条文案 / 健身每个动作的两条文案，全都要一致
  const expected = buildSegmentTemplateData();
  assert.deepEqual(SEGMENT_TEMPLATES, expected.templates);
  assert.deepEqual(GENERIC_SEGMENT_TEMPLATE, expected.generic);

  const counts: Record<string, number> = {
    basketball: 4, soccer: 3, badminton: 4, volleyball: 4, tennis: 6,
    table_tennis: 6, swimming: 4, running: 4, roller_skating: 4, skateboarding: 4, fitness: 4,
  };
  for (const [sport, total] of Object.entries(counts)) {
    assert.equal(segmentTemplateFor(sport).segmentsTotal, total, sport);
  }
  assert.equal(segmentTemplateFor('dance').templateId, 'generic');
  assert.equal(segmentTemplateFor('taekwondo').templateId, 'generic');
  assert.equal(segmentTemplateFor(undefined).templateId, 'generic');
  assert.equal(GENERIC_SEGMENT_TEMPLATE.segmentsTotal, 4);
  assert.match(GENERIC_SEGMENT_TEMPLATE.segmentLabel, /15 分钟/);
  assert.deepEqual(SEGMENT_TEMPLATES.basketball.formats?.map((f) => f.value), ['minutes10', 'points21']);
  // 篮球总述只能按「段」说，不能用「轮」（21 分一局没有轮）
  assert.doesNotMatch(SEGMENT_TEMPLATES.basketball.totalLabel, /轮/);
  for (const f of SEGMENT_TEMPLATES.basketball.formats!) assert.doesNotMatch(f.totalLabel, /轮/);
  // 冻结口径的几个关键说法逐字钉住（服务端是权威，客户端预览必须一字不差地承诺）
  assert.equal(SEGMENT_TEMPLATES.tennis.totalLabel, '本场共 6 段：一共打完 6 个发球局。');
  assert.match(SEGMENT_TEMPLATES.swimming.segmentLabel, /全员都完成才算一段/);
  assert.equal(SEGMENT_TEMPLATES.fitness.templateId, 'fitness');
  assert.equal(SEGMENT_TEMPLATES.fitness.movements?.length, 5);
  const pushUp = SEGMENT_TEMPLATES.fitness.movements!.find((m) => m.value === 'seg_push_up')!;
  assert.match(pushUp.segmentLabel, /俯卧撑（15 次）/);
  assert.match(pushUp.totalLabel, /4 大组俯卧撑/);
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
