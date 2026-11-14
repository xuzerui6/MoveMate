import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  commonSportsLabel,
  createVisibilityPayload,
  fillMode,
  formatDurationMs,
  friendActionKind,
  friendMetaLine,
  inviteCandidates,
  inviteGate,
  isFillOpenNow,
  lastSportText,
  memorialCardFields,
  rebookConfirmations,
  removalLock,
} from '../src/features/social/socialLogic.ts'

const NOW = new Date('2026-11-13T19:30:00')

test('friendActionKind maps every relationship state to a button kind', () => {
  assert.equal(friendActionKind('self'), 'self')
  assert.equal(friendActionKind('friends'), 'friends')
  assert.equal(friendActionKind('none'), 'add')
  assert.equal(friendActionKind('pending'), 'pending')
  assert.equal(friendActionKind('pending_out'), 'pending')
  assert.equal(friendActionKind('pending_in'), 'respond')
  assert.equal(friendActionKind('blocked'), 'blocked')
  assert.equal(friendActionKind('blocked_by_me'), 'blocked')
  assert.equal(friendActionKind('blocked_me'), 'blocked')
  assert.equal(friendActionKind(undefined), 'add')
  assert.equal(friendActionKind('something-else'), 'add')
})

test('lastSportText speaks in relative days', () => {
  assert.equal(lastSportText('2026-11-13T18:20:00', NOW), '今天 18:20 刚练过')
  assert.equal(lastSportText('2026-11-12T19:05:00', NOW), '昨天练过')
  assert.equal(lastSportText('2026-11-10T08:00:00', NOW), '3 天前练过')
  assert.equal(lastSportText('2026-10-02T08:00:00', NOW), '10月2日练过')
  assert.equal(lastSportText(null, NOW), '最近没练')
  assert.equal(lastSportText('not-a-date', NOW), '最近没练')
})

test('friendMetaLine combines streak and last sport time', () => {
  assert.equal(
    friendMetaLine({ streak: 12, last_sport_at: '2026-11-13T18:20:00' }, NOW),
    '连续运动 12 天 · 今天 18:20 刚练过',
  )
  assert.equal(friendMetaLine({ streak: 0, last_sport_at: '2026-11-12T10:00:00' }, NOW), '昨天练过')
  assert.equal(friendMetaLine({}, NOW), '最近没练')
})

test('commonSportsLabel prefixes up to two sports', () => {
  assert.equal(commonSportsLabel(['badminton']), '常练羽毛球')
  assert.equal(commonSportsLabel(['badminton', 'running', 'fitness']), '常练羽毛球、跑步')
  assert.equal(commonSportsLabel([]), '')
  assert.equal(commonSportsLabel(undefined), '')
})

test('formatDurationMs renders human durations', () => {
  assert.equal(formatDurationMs(100 * 60000), '1 小时 40 分钟')
  assert.equal(formatDurationMs(120 * 60000), '2 小时')
  assert.equal(formatDurationMs(45 * 60000), '45 分钟')
  assert.equal(formatDurationMs(30 * 1000), '不到 1 分钟')
  assert.equal(formatDurationMs(0), '不到 1 分钟')
})

const friendsGame = {
  visibility: 'friends' as const,
  fill_open: false,
  auto_fill: false,
  member_count: 4,
  max_players: 6,
  start_time: '2026-11-14T19:00:00',
}

test('isFillOpenNow mirrors the server rule', () => {
  assert.equal(isFillOpenNow({ ...friendsGame, visibility: 'public' }, NOW), true)
  assert.equal(isFillOpenNow(friendsGame, NOW), false)
  assert.equal(isFillOpenNow({ ...friendsGame, fill_open: true }, NOW), true)
  // 自动补位：开局在 24 小时内 + 没满员才生效（本局明晚 19:00，距现在 23.5 小时）
  assert.equal(isFillOpenNow({ ...friendsGame, auto_fill: true }, NOW), true)
  // 满员后自动补位不再开放
  assert.equal(isFillOpenNow({ ...friendsGame, auto_fill: true, member_count: 6 }, NOW), false)
  // 还差两天才开局：没到自动开放的时候
  assert.equal(isFillOpenNow({ ...friendsGame, auto_fill: true, start_time: '2026-11-15T19:00:00' }, NOW), false)
})

test('fillMode distinguishes manual and automatic opening', () => {
  assert.equal(fillMode({ ...friendsGame, visibility: 'public' }, NOW), 'public')
  assert.equal(fillMode(friendsGame, NOW), 'closed')
  assert.equal(fillMode({ ...friendsGame, fill_open: true }, NOW), 'open-manual')
  assert.equal(fillMode({ ...friendsGame, auto_fill: true }, NOW), 'open-auto')
  // 手动开着的优先于自动
  assert.equal(fillMode({ ...friendsGame, fill_open: true, auto_fill: true }, NOW), 'open-manual')
})

test('createVisibilityPayload never sends auto_fill for public games', () => {
  assert.deepEqual(createVisibilityPayload('public', true), { visibility: 'public', auto_fill: false })
  assert.deepEqual(createVisibilityPayload('public', false), { visibility: 'public', auto_fill: false })
  assert.deepEqual(createVisibilityPayload('friends', true), { visibility: 'friends', auto_fill: true })
  assert.deepEqual(createVisibilityPayload('friends', false), { visibility: 'friends', auto_fill: false })
})

test('removalLock locks inside 30 minutes before start', () => {
  const start = '2026-11-13T20:00:00'
  assert.deepEqual(removalLock(start, new Date('2026-11-13T19:00:00')), { locked: false, minutesToStart: 60 })
  assert.equal(removalLock(start, new Date('2026-11-13T19:29:00')).locked, false)
  assert.equal(removalLock(start, new Date('2026-11-13T19:31:00')).locked, true)
  assert.equal(removalLock(start, new Date('2026-11-13T19:45:00')).locked, true)
  assert.equal(removalLock(start, new Date('2026-11-13T20:05:00')).locked, true)
})

const friend = (user_id: number) => ({
  user_id,
  nickname: `好友${user_id}`,
  avatar_url: '',
  department: '',
  sport_preferences: [],
  streak: 0,
  last_sport_at: null,
  together_count: 0,
  last_played_at: null,
})

test('inviteGate matches the server invite rule across host/member and states', () => {
  // 服务端 inviteToGame：仅发起人、且只在 recruiting/full 能邀；ready 谁都不能邀
  for (const status of ['recruiting', 'full']) {
    assert.equal(inviteGate({ isCreator: true, status }), 'can-invite', `host in ${status}`)
    assert.equal(inviteGate({ isCreator: false, status }), 'hidden', `member in ${status}`)
  }
  assert.equal(inviteGate({ isCreator: true, status: 'ready' }), 'ready-blocked')
  assert.equal(inviteGate({ isCreator: false, status: 'ready' }), 'hidden')
  for (const status of ['in_progress', 'completed', 'cancelled', 'archived']) {
    assert.equal(inviteGate({ isCreator: true, status }), 'hidden', `host in ${status}`)
    assert.equal(inviteGate({ isCreator: false, status }), 'hidden', `member in ${status}`)
  }
})

test('inviteCandidates excludes people already in the game', () => {
  const friends = [friend(2), friend(3), friend(4)]
  assert.deepEqual(inviteCandidates(friends, [3]).map((f) => f.user_id), [2, 4])
  assert.deepEqual(inviteCandidates(friends, []).map((f) => f.user_id), [2, 3, 4])
  assert.deepEqual(inviteCandidates([], [1]), [])
})

const attendees = [
  { user_id: 1, nickname: '我' },
  { user_id: 2, nickname: '小明' },
  { user_id: 3, nickname: '阿花' },
  { user_id: 4, nickname: '凯哥' },
]

test('rebookConfirmations counts who joined the next game', () => {
  const none = rebookConfirmations(attendees, null, 1)
  assert.equal(none.line, '')
  assert.equal(none.pendingCount, 3)

  const partial = rebookConfirmations(attendees, [1, 2, 3], 1)
  assert.deepEqual(partial.confirmedNames, ['小明', '阿花'])
  assert.equal(partial.confirmedCount, 2)
  assert.equal(partial.pendingCount, 1)
  assert.equal(partial.line, '小明、阿花 已确认 · 还差 1 人')

  const all = rebookConfirmations(attendees, [2, 3, 4], 1)
  assert.equal(all.pendingCount, 0)
  assert.equal(all.line, '小明、阿花、凯哥 都确认啦')

  const nobody = rebookConfirmations(attendees, [1], 1)
  assert.equal(nobody.line, '约好了，等大家确认')
})

test('memorialCardFields carries only my own numbers', () => {
  const fields = memorialCardFields({
    game: {
      sport_type: 'badminton', start_time: '2026-11-13T19:00:00', end_time: '2026-11-13T21:00:00',
      venue_name: '校体育馆 3 号场', location: '',
    } as any,
    attendees: attendees.map((a) => ({ ...a, avatar_url: '', friendship_status: 'none' as const })),
    my_stats: { xp: 120, effective_ms: 100 * 60000, reps: 0 },
    rebooked_game_id: null,
  })
  assert.deepEqual(fields, [
    { label: '项目', value: '羽毛球' },
    { label: '时间', value: '11月13日 19:00 – 21:00' },
    { label: '场地', value: '校体育馆 3 号场' },
    { label: '一起运动的人', value: '4 人' },
    { label: '我运动了多久', value: '1 小时 40 分钟' },
    { label: '我得到的经验值', value: '+120' },
  ])
})
