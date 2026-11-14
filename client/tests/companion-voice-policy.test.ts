import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACOUSTIC_TAIL_MS, createEchoGate, echoGateDrained, echoGateRequeued, echoGateReset,
  echoGateResumed, echoGateShouldResume, echoGateTtsStart, echoGateTtsStop,
} from '../src/features/motion/lib/echoGate'
import {
  FOLLOWUP_WINDOW_MS, REST_WINDOW_MS, THINKING_RECOVERY_MS, THINKING_TIMEOUT_MS,
  conversationWindowExpired, extendConversationWindow, openConversationWindow, thinkingTimedOut,
} from '../src/features/motion/lib/companionWindow'
import { EVERY_REP_VOICED, milestoneForRep } from '../src/features/motion/lib/milestones'
import { admitSpeech, pendingSpeechExpired, type SpeechEvent } from '../src/features/motion/lib/speechAdmission'
import {
  createTrackingLossState, pushTrackingSample, resetTrackingLoss,
  TRACKING_REPEAT_MS, TRACKING_SUSTAIN_MS,
} from '../src/features/motion/lib/trackingLoss'

// ── echoGate：server stop 不等于本地放完 ─────────────────────────────

test('echo gate: resume waits for local drain plus the acoustic tail', () => {
  const gate = createEchoGate()
  echoGateTtsStart(gate)
  echoGateTtsStop(gate, 1_000)
  assert.equal(echoGateShouldResume(gate, 9_999), false, '本地还没排空，绝不放行')
  echoGateDrained(gate, 2_000)
  assert.equal(echoGateShouldResume(gate, 2_000 + ACOUSTIC_TAIL_MS - 1), false, '尾巴没过完也不行')
  assert.equal(echoGateShouldResume(gate, 2_000 + ACOUSTIC_TAIL_MS), true)
  echoGateResumed(gate)
  assert.equal(gate.phase, 'open')
})

test('echo gate: late audio after drain restarts the wait', () => {
  const gate = createEchoGate()
  echoGateTtsStart(gate)
  echoGateTtsStop(gate, 1_000)
  echoGateDrained(gate, 1_500)
  echoGateRequeued(gate)
  assert.equal(echoGateShouldResume(gate, 1_500 + ACOUSTIC_TAIL_MS + 1), false, '迟到音频排进来，排空作废')
  echoGateDrained(gate, 3_000)
  assert.equal(echoGateShouldResume(gate, 3_000 + ACOUSTIC_TAIL_MS), true)
})

test('echo gate: stop without start is a no-op; reset opens immediately', () => {
  const gate = createEchoGate()
  echoGateTtsStop(gate, 1_000)
  assert.equal(gate.phase, 'open')
  echoGateTtsStart(gate)
  echoGateTtsStop(gate, 2_000)
  echoGateReset(gate)
  assert.equal(gate.phase, 'open')
  assert.equal(gate.drainedAt, 0)
})

// ── companionWindow：窗口有边界，thinking 不吃沉默超时 ────────────────

test('windows: followup is 25s, rest is 75s, activity extends but never shortens', () => {
  const follow = openConversationWindow('followup', 0)
  assert.equal(follow.deadline, FOLLOWUP_WINDOW_MS)
  const rest = openConversationWindow('rest', 0)
  assert.equal(rest.deadline, REST_WINDOW_MS)
  extendConversationWindow(rest, 10_000)
  assert.equal(rest.deadline, REST_WINDOW_MS, '顺延只往后，不往前缩')
  extendConversationWindow(rest, 60_000)
  assert.equal(rest.deadline, 60_000 + FOLLOWUP_WINDOW_MS)
  assert.equal(conversationWindowExpired(rest, 84_999), false)
  assert.equal(conversationWindowExpired(rest, 85_000), true)
  assert.equal(conversationWindowExpired(null, 0), true)
})

test('windows: thinking has its own timeout, separate from silence', () => {
  assert.equal(thinkingTimedOut(1_000, 1_000 + THINKING_TIMEOUT_MS - 1), false)
  assert.equal(thinkingTimedOut(1_000, 1_000 + THINKING_TIMEOUT_MS), true)
  assert.equal(thinkingTimedOut(0, 999_999), false, '没在 thinking 就不触发')
  assert.ok(THINKING_RECOVERY_MS < FOLLOWUP_WINDOW_MS)
})

// ── milestones：只在关键节点，一 reps 只出一个 ────────────────────────

test('milestones: the approved node set for a 20-rep target', () => {
  const at = (reps: number) => milestoneForRep(reps, 20, '次')
  assert.equal(at(1)?.kind, 'first')
  assert.equal(at(2), null)
  assert.equal(at(5)?.kind, 'every5')
  assert.equal(at(10)?.kind, 'halfway', '第 10 个同时是每 5 个，只出过半这一个')
  assert.equal(at(15)?.kind, 'every5')
  assert.equal(at(17)?.kind, 'remaining3')
  assert.equal(at(20)?.kind, 'target')
  assert.equal(at(21), null, '超目标不补报')
  assert.match(at(10)?.text || '', /10/)
})

test('milestones: overlaps merge by priority; personal best crosses once', () => {
  assert.equal(milestoneForRep(3, 6, '次')?.kind, 'remaining3', '6 个目标时第 3 个既是过半也是还剩 3，只出一个')
  assert.equal(milestoneForRep(6, 20, '次', 5)?.kind, 'personalBest')
  assert.equal(milestoneForRep(7, 20, '次', 5), null, '纪录只在跨越那一下报')
  assert.equal(milestoneForRep(21, 20, '次', 20)?.kind, 'personalBest', '超目标后跨越纪录仍可报')
  assert.equal(milestoneForRep(5, 0, '次')?.kind, 'every5', '无目标时每 5 个照常')
  assert.equal(EVERY_REP_VOICED, false, 'Phase 1 不做每次出声数')
})

// ── speechAdmission：忙时只攒一个最要紧的，过期作废 ──────────────────

const ev = (kind: SpeechEvent['kind']): SpeechEvent => ({ kind, text: `${kind} 文本`, prompt: `${kind} 触发` })

test('admission: idle/listening admit now, offline drops everything', () => {
  for (const kind of ['tracking', 'formCue', 'milestone', 'encouragement'] as const) {
    assert.equal(admitSpeech(ev(kind), 'idle', 0, null).action, 'now')
    assert.equal(admitSpeech(ev(kind), 'listening', 0, null).action, 'now')
    assert.equal(admitSpeech(ev(kind), 'offline', 0, null).action, 'drop')
  }
})

test('admission: busy channel holds only the most important, freshest event', () => {
  const held = admitSpeech(ev('milestone'), 'speaking', 1_000, null)
  assert.equal(held.action, 'hold')
  if (held.action !== 'hold') return
  assert.equal(held.pending.expiresAt, 6_000)
  assert.equal(pendingSpeechExpired(held.pending, 5_999), false)
  assert.equal(pendingSpeechExpired(held.pending, 6_000), true, '过期作废，不补播旧数字')

  const upgraded = admitSpeech(ev('formCue'), 'speaking', 2_000, held.pending)
  assert.equal(upgraded.action, 'hold', '动作提示比里程碑要紧，替换攒着的')
  if (upgraded.action === 'hold') assert.equal(upgraded.pending.kind, 'formCue')

  if (upgraded.action !== 'hold') return
  const weaker = admitSpeech(ev('milestone'), 'speaking', 2_000, upgraded.pending)
  assert.equal(weaker.action, 'drop', '更弱的事件不抢攒着的位置')
  const fresher = admitSpeech(ev('formCue'), 'speaking', 3_000, upgraded.pending)
  assert.equal(fresher.action, 'hold', '同级事件更新鲜的可以替换')
  assert.equal(admitSpeech(ev('encouragement'), 'speaking', 2_000, null).action, 'drop', '鼓励忙时直接丢')
  assert.equal(admitSpeech(ev('milestone'), 'thinking', 2_000, null).action, 'hold', '用户刚说完在等回复，也先攒着')
})

test('admission: tracking interrupts only automatic speech, never the user’s answer', () => {
  const auto = admitSpeech(ev('tracking'), 'speaking', 0, null, true)
  assert.deepEqual(auto, { action: 'now', interrupt: true })
  const userAnswer = admitSpeech(ev('tracking'), 'speaking', 0, null, false)
  assert.equal(userAnswer.action, 'hold', '用户问来的回复不抢，到空隙再说')
})

// ── trackingLoss：900ms 才算真丢，6 秒最多喊一次 ─────────────────────

test('tracking loss: sustain 900ms before active, repeat at most every 6s', () => {
  const state = createTrackingLossState()
  assert.deepEqual(pushTrackingSample(state, true, 0), { active: false, cue: false })
  assert.equal(pushTrackingSample(state, false, 1_000).active, false)
  assert.equal(pushTrackingSample(state, false, 1_000 + TRACKING_SUSTAIN_MS - 1).active, false)
  const first = pushTrackingSample(state, false, 1_000 + TRACKING_SUSTAIN_MS)
  assert.deepEqual(first, { active: true, cue: true })
  assert.equal(pushTrackingSample(state, false, 2_500).cue, false, '6 秒内不重复喊')
  const again = pushTrackingSample(state, false, 1_900 + TRACKING_REPEAT_MS)
  assert.equal(again.cue, true)
  assert.deepEqual(pushTrackingSample(state, true, 9_000), { active: false, cue: false }, '人回来立刻解除')
  resetTrackingLoss(state)
  assert.equal(state.lastCueAt, 0)
})
