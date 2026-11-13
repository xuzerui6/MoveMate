import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  INITIAL_LAYOUT,
  acceptSnapshot,
  estimateMaxHp,
  estimateServerNow,
  formatClock,
  hpStateKey,
  latencySummary,
  nextLayout,
  publicParticipantView,
  readLatencySamples,
  recordLatencySample,
  remainingSeconds,
  teammateStatusLabel,
  type BossFightSnapshot,
  type BossParticipant,
} from '../src/features/motion/lib/bossFightState.ts'

function participant(patch: Partial<BossParticipant> = {}): BossParticipant {
  return {
    user_id: 2,
    nickname: '队友',
    ready: false,
    status: 'joined',
    has_session: false,
    avatar: null,
    ...patch,
  }
}

function snapshot(patch: Partial<BossFightSnapshot> = {}): BossFightSnapshot {
  return {
    id: 'fight-1',
    game_id: 9,
    boss_id: 'aoye_yanshi',
    boss_name: '熬夜魇狮',
    movement: 'squat',
    status: 'gathering',
    max_hp: 0,
    hp: 0,
    version: 1,
    duration_sec: 300,
    created_by: 1,
    created_at: '2026-11-13T00:00:00.000Z',
    started_at: null,
    ends_at: null,
    ended_at: null,
    server_ts: 1000,
    participants: [],
    my_reward: null,
    ...patch,
  }
}

test('血量三档按 60% / 30% 两条线切换（boss-a-states 规范）', () => {
  assert.equal(hpStateKey(100, 100), 'full')
  assert.equal(hpStateKey(61, 100), 'full')
  assert.equal(hpStateKey(60, 100), 'mid')
  assert.equal(hpStateKey(30, 100), 'mid')
  assert.equal(hpStateKey(29, 100), 'low')
  assert.equal(hpStateKey(0, 100), 'low')
  // 还没开打（max_hp=0）一律满血图
  assert.equal(hpStateKey(0, 0), 'full')
})

test('布局 E：默认看自己，开打自动看怪兽，手动换过就不再自动切', () => {
  let s = INITIAL_LAYOUT
  assert.equal(s.mode, 'self')
  s = nextLayout(s, { type: 'fight-started' })
  assert.equal(s.mode, 'boss')
  // 用户手动换回看自己
  s = nextLayout(s, { type: 'swap' })
  assert.equal(s.mode, 'self')
  assert.equal(s.touched, true)
  // 之后任何自动事件都不许再动他的选择
  s = nextLayout(s, { type: 'fight-started' })
  assert.equal(s.mode, 'self')
  s = nextLayout(s, { type: 'back-to-gathering' })
  assert.equal(s.mode, 'self')
  // 没手动换过的：回集结自动看自己
  let t = nextLayout(INITIAL_LAYOUT, { type: 'fight-started' })
  t = nextLayout(t, { type: 'back-to-gathering' })
  assert.equal(t.mode, 'self')
  assert.equal(t.touched, false)
})

test('快照版本守卫：旧版本迟到不覆盖新版本，换一场直接接受', () => {
  const v3 = snapshot({ version: 3, hp: 70, max_hp: 100 })
  const v2 = snapshot({ version: 2, hp: 90, max_hp: 100 })
  assert.equal(acceptSnapshot(v3, v2), v3)
  assert.equal(acceptSnapshot(v3, snapshot({ version: 3, hp: 1 })), v3)
  const v4 = snapshot({ version: 4, hp: 60, max_hp: 100 })
  assert.equal(acceptSnapshot(v3, v4), v4)
  const other = snapshot({ id: 'fight-2', version: 1 })
  assert.equal(acceptSnapshot(v3, other), other)
  assert.equal(acceptSnapshot(null, v2), v2)
})

test('队友公开视图：就算原条目带着伤害字段，公开视图也绝不透出', () => {
  const dirty = participant({ my_damage: 123 } as any)
  const pub = publicParticipantView(dirty)
  assert.equal('my_damage' in pub, false)
  assert.deepEqual(
    Object.keys(pub).sort(),
    ['avatar', 'has_session', 'nickname', 'ready', 'status', 'user_id'],
  )
})

test('队友状态说法：集结看准备，开打只有在练/暂时休息', () => {
  assert.equal(teammateStatusLabel(publicParticipantView(participant({ ready: true })), 'gathering'), '已准备')
  assert.equal(teammateStatusLabel(publicParticipantView(participant({ ready: false })), 'gathering'), '还没准备')
  assert.equal(teammateStatusLabel(publicParticipantView(participant({ has_session: true })), 'fighting'), '在练')
  assert.equal(teammateStatusLabel(publicParticipantView(participant({ has_session: false })), 'fighting'), '暂时休息')
  assert.equal(teammateStatusLabel(publicParticipantView(participant({ status: 'left', has_session: true })), 'fighting'), '暂时休息')
})

test('页面源码红线：打怪页不许出现别人的伤害字段与负面状态词', () => {
  const page = fs.readFileSync(new URL('../src/pages/BossFight/BossFight.tsx', import.meta.url), 'utf8')
  assert.equal(page.includes('accepted_reps'), false)
  assert.equal(page.includes('my_damage'), false, '页面只能经 hook 的 myDamage 拿自己的伤害')
  for (const banned of ['跟丢', '掉线', '拖后腿', '拖累']) {
    assert.equal(page.includes(banned), false, `不许出现「${banned}」`)
  }
  // 队友渲染必须先过公开视图裁剪
  assert.ok(page.includes('publicParticipantView'))
})

test('延迟采样：存本机、能算 P95、上限截断', () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
  }
  for (let i = 1; i <= 100; i++) recordLatencySample(i * 10, storage)
  const summary = latencySummary(storage)
  assert.equal(summary.count, 100)
  assert.equal(summary.p50, 510)
  assert.equal(summary.p95, 960)
  assert.equal(summary.max, 1000)
  assert.equal(readLatencySamples(storage).length, 100)
  recordLatencySample(-5, storage) // 非法样本不收
  assert.equal(readLatencySamples(storage).length, 100)
})

test('服务端时钟推算与倒计时', () => {
  assert.equal(estimateServerNow(10_000, 5_000, 6_500), 11_500)
  const endsAt = new Date(60_000).toISOString()
  assert.equal(remainingSeconds(endsAt, 45_000), 15)
  assert.equal(remainingSeconds(endsAt, 61_000), 0)
  assert.equal(remainingSeconds(null, 0), 0)
  assert.equal(formatClock(187), '03:07')
  assert.equal(formatClock(0), '00:00')
})

test('血量估算与服务端公式一致（定标原则：少算一人再打八折）', () => {
  // 深蹲 基线 20 次/分：2 人 10 分钟 = 20*10*1*0.8
  assert.equal(estimateMaxHp('squat', 2, 600), 160)
  // 4 人 5 分钟 = 20*5*3*0.8
  assert.equal(estimateMaxHp('squat', 4, 300), 240)
  // 高抬腿 基线 60：3 人 3 分钟 = 60*3*2*0.8
  assert.equal(estimateMaxHp('high_knees', 3, 180), 288)
  // 1 人也至少按 1 个出力人算：俯卧撑 15*1*1*0.8
  assert.equal(estimateMaxHp('push_up', 1, 60), 12)
})
