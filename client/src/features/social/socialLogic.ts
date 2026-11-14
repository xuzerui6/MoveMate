/**
 * 组局社交化一期 —— 纯逻辑层（无 DOM、无请求，单测覆盖）。
 * 页面/组件只负责取数和渲染，状态派生都收在这里，保证口径一致。
 */
import { SPORT_LABELS } from '../../types';
import type { EndSummary, FriendEntry, FriendshipStatus, Game } from '../../types';

/* ---------- 好友关系 → 按钮状态 ---------- */

export type FriendActionKind = 'self' | 'friends' | 'add' | 'pending' | 'respond' | 'blocked';

/** 把服务端关系状态翻成页面上的按钮形态 */
export function friendActionKind(status: FriendshipStatus | string | undefined): FriendActionKind {
  switch (status) {
    case 'self': return 'self';
    case 'friends': return 'friends';
    case 'pending':
    case 'pending_out': return 'pending';
    case 'pending_in': return 'respond';
    case 'blocked':
    case 'blocked_by_me':
    case 'blocked_me': return 'blocked';
    default: return 'add';
  }
}

/* ---------- 展示文案 ---------- */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** 最近一次运动的相对说法：今天 18:20 刚练过 / 昨天练过 / 3 天前练过 / 10月2日练过 */
export function lastSportText(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '最近没练';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '最近没练';
  if (sameDay(d, now)) return `今天 ${pad2(d.getHours())}:${pad2(d.getMinutes())} 刚练过`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(d, yesterday)) return '昨天练过';
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (days > 0 && days < 30) return `${days} 天前练过`;
  return `${d.getMonth() + 1}月${d.getDate()}日练过`;
}

/** 好友行第二行：连续运动 X 天 · 最近一次的说法（连续天数为 0 时只说最近一次） */
export function friendMetaLine(input: { streak?: number; last_sport_at?: string | null }, now: Date = new Date()): string {
  const recent = lastSportText(input.last_sport_at, now);
  return input.streak && input.streak > 0 ? `连续运动 ${input.streak} 天 · ${recent}` : recent;
}

/** 常练项目：常练羽毛球 / 常练羽毛球、跑步（最多两个） */
export function commonSportsLabel(prefs: string[] | undefined, max = 2): string {
  const labels = (prefs || []).map((p) => SPORT_LABELS[p] || p).filter(Boolean).slice(0, max);
  return labels.length ? `常练${labels.join('、')}` : '';
}

/** 毫秒 → 人话时长：1 小时 40 分钟 / 45 分钟 / 不到 1 分钟 */
export function formatDurationMs(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60000);
  if (minutes < 1) return '不到 1 分钟';
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

/* ---------- 好友局 / 开放补位 ---------- */

type FillGame = Pick<Game, 'visibility' | 'fill_open' | 'auto_fill' | 'member_count' | 'max_players' | 'start_time'>;

/** 与服务端 game.service.isFillOpenNow 同口径：好友局此刻是否对大厅开放 */
export function isFillOpenNow(game: FillGame, now: Date = new Date()): boolean {
  if (game.visibility !== 'friends') return true;
  if (game.fill_open) return true;
  if (game.auto_fill && game.member_count < game.max_players) {
    return new Date(game.start_time).getTime() - now.getTime() <= 24 * 60 * 60 * 1000;
  }
  return false;
}

export type FillMode = 'public' | 'closed' | 'open-manual' | 'open-auto';

/** 发起人补位控件的状态：关着 / 手动开着 / 自动开着（自动开着时没有手动关闭按钮） */
export function fillMode(game: FillGame, now: Date = new Date()): FillMode {
  if (game.visibility !== 'friends') return 'public';
  if (game.fill_open) return 'open-manual';
  if (game.auto_fill && game.member_count < game.max_players
    && new Date(game.start_time).getTime() - now.getTime() <= 24 * 60 * 60 * 1000) return 'open-auto';
  return 'closed';
}

/** 建局提交参数：公开局永远不带自动补位，好友局才带开关值 */
export function createVisibilityPayload(visibility: 'public' | 'friends', autoFill: boolean): { visibility: 'public' | 'friends'; auto_fill: boolean } {
  return { visibility, auto_fill: visibility === 'friends' ? Boolean(autoFill) : false };
}

/* ---------- 请人离局 ---------- */

/** 开局前 30 分钟内不能请人离局（与服务端 removeMember 同口径） */
export function removalLock(startTime: string, now: Date = new Date()): { locked: boolean; minutesToStart: number } {
  const minutesToStart = Math.floor((new Date(startTime).getTime() - now.getTime()) / 60000);
  return { locked: minutesToStart < 30, minutesToStart };
}

/* ---------- 邀请好友 ---------- */

export type InviteGate = 'can-invite' | 'ready-blocked' | 'hidden';

/**
 * 邀请入口的形态（与服务端 inviteToGame 同口径）：只有发起人能邀请人进局，
 * 且只在招募中/已满员时能邀；到了「即将开始」（ready）谁都不能再邀。
 * 页面据此决定按钮长什么样，别让人点开对话框、选完人再吃一个必然失败的提交：
 * - can-invite：发起人且还在招募/满员阶段，按钮可点；
 * - ready-blocked：发起人但已到 ready，按钮置灰并给一句说明；
 * - hidden：其他所有情况（普通成员、已开始/已结束等），不显示邀请按钮。
 */
export function inviteGate(input: { isCreator: boolean; status: string }): InviteGate {
  if (!input.isCreator) return 'hidden';
  if (input.status === 'ready') return 'ready-blocked';
  if (input.status === 'recruiting' || input.status === 'full') return 'can-invite';
  return 'hidden';
}

/** 邀请名单：好友里排除已经在局里的人 */
export function inviteCandidates(friends: FriendEntry[], memberIds: Iterable<number>): FriendEntry[] {
  const members = new Set(memberIds);
  return friends.filter((f) => !members.has(Number(f.user_id)));
}

/* ---------- 结束页 ---------- */

/** 约下周再练的确认情况：原班人马里谁已经加入下周局 */
export function rebookConfirmations(
  attendees: { user_id: number; nickname: string }[],
  rebookedMemberIds: Iterable<number> | null,
  myUserId: number,
): { confirmedNames: string[]; confirmedCount: number; pendingCount: number; line: string } {
  const others = attendees.filter((a) => Number(a.user_id) !== myUserId);
  if (!rebookedMemberIds) {
    return { confirmedNames: [], confirmedCount: 0, pendingCount: others.length, line: '' };
  }
  const joined = new Set(rebookedMemberIds);
  const confirmed = others.filter((a) => joined.has(Number(a.user_id)));
  const pendingCount = others.length - confirmed.length;
  const confirmedNames = confirmed.map((a) => a.nickname);
  const line = confirmed.length === 0
    ? '约好了，等大家确认'
    : pendingCount === 0
      ? `${confirmedNames.join('、')} 都确认啦`
      : `${confirmedNames.join('、')} 已确认 · 还差 ${pendingCount} 人`;
  return { confirmedNames, confirmedCount: confirmed.length, pendingCount, line };
}

/** 纪念卡字段（只有自己的数据，不带队友头像和成绩） */
export function memorialCardFields(summary: EndSummary): { label: string; value: string }[] {
  const game = summary.game as Game;
  const sport = SPORT_LABELS[game.sport_type] || game.sport_type;
  const start = new Date(game.start_time);
  const end = game.end_time ? new Date(game.end_time) : null;
  const timeText = Number.isNaN(start.getTime())
    ? ''
    : `${start.getMonth() + 1}月${start.getDate()}日 ${pad2(start.getHours())}:${pad2(start.getMinutes())}${end && !Number.isNaN(end.getTime()) ? ` – ${pad2(end.getHours())}:${pad2(end.getMinutes())}` : ''}`;
  return [
    { label: '项目', value: sport },
    { label: '时间', value: timeText },
    { label: '场地', value: game.venue_name || game.location || '' },
    { label: '一起运动的人', value: `${summary.attendees.length} 人` },
    { label: '我运动了多久', value: formatDurationMs(summary.my_stats.effective_ms) },
    { label: '我得到的经验值', value: `+${summary.my_stats.xp}` },
  ];
}

/** 举报原因（举报用户时的大白话选项，设计稿第六组） */
export const REPORT_REASONS_USER = [
  '说话不文明，老是骂人',
  '发广告、拉人去别的地方',
  '冒充别人',
  '其他让我不舒服的行为',
] as const;

export const REPORT_REASONS_MESSAGE = [
  '说话不文明，老是骂人',
  '发广告、拉人去别的地方',
  '骚扰别人',
  '其他让我不舒服的内容',
] as const;

export const REPORT_REASONS_GAME = [
  '场地或集合信息不对劲',
  '标题或说明里有不合适的内容',
  '其他让我不舒服的行为',
] as const;
