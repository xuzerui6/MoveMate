/**
 * 局详情的本地状态应用（纯函数）。
 *
 * 背景（2026-11-14 线上事故）：签到在服务端已经成功，但紧随其后的详情
 * 重新读取超时，页面把已加载的局整页换成错误屏，用户以为签到失败。
 * 现在的约定：任何写操作成功后，先把结果落到本地这份详情上（本模块），
 * 再静默刷新对账；刷新失败只显示一行小提示，绝不再整页报错。
 */
import type { Game, Participant } from '../../types';

/** 已有详情时刷新失败的小提示文案（大白话） */
export const REFRESH_NOTICE = '网络有点慢，这个页面显示的是刚才的内容，正在重新读取…';

/**
 * 详情读取失败时的去向决策：
 * - 还没有加载出详情（首次进入）→ 整页错误（带重试入口）；
 * - 已有详情 → 只给小提示，页面内容原样保留。
 */
export function resolveDetailFailure(
  hasGame: boolean,
  message: string,
): { pageError: string | null; notice: string | null } {
  if (hasGame) return { pageError: null, notice: REFRESH_NOTICE };
  return { pageError: message, notice: null };
}

function mapParticipant(
  game: Game,
  userId: number | string,
  patch: Partial<Participant>,
): Game {
  const participants = (game.participants || []).map((p) =>
    Number(p.user_id) === Number(userId) ? { ...p, ...patch } : p,
  );
  return { ...game, participants };
}

/** 签到成功：把服务端返回的签到时间落到自己身上 */
export function applyLocalCheckIn(game: Game, userId: number | string, checkedInAt: string): Game {
  return mapParticipant(game, userId, { checked_in_at: checkedInAt });
}

/** 确认到场成功：把确认时间落到该成员身上 */
export function applyLocalAttendance(game: Game, userId: number | string, confirmedAt: string): Game {
  return mapParticipant(game, userId, { attendance_confirmed_at: confirmedAt });
}

/** 状态类操作成功（确认开始/取消/确认结束）：直接推进本地状态 */
export function applyLocalStatus(game: Game, status: Game['status']): Game {
  return { ...game, status };
}

/** 加入成功：把自己补进成员列表（用本地账号资料，刷新后会被服务端数据覆盖对账） */
export function applyLocalJoin(
  game: Game,
  self: { user_id: number | string; nickname: string; avatar: string },
): Game {
  const participants = game.participants || [];
  if (participants.some((p) => Number(p.user_id) === Number(self.user_id))) return game;
  const me: Participant = {
    id: String(self.user_id),
    game_id: String(game.id),
    user_id: String(self.user_id),
    nickname: self.nickname,
    avatar: self.avatar,
    role: 'member',
    joined_at: new Date().toISOString(),
    checked_in_at: null,
    attendance_confirmed_at: null,
  };
  const next = [...participants, me];
  return {
    ...game,
    participants: next,
    member_count: next.length,
    status: game.status === 'recruiting' && next.length >= game.max_players ? 'full' : game.status,
  };
}

/** 退出成功：把自己移出成员列表，并按服务端同样的规则回退满员状态 */
export function applyLocalLeave(game: Game, userId: number | string): Game {
  const participants = (game.participants || []).filter(
    (p) => Number(p.user_id) !== Number(userId),
  );
  let status = game.status;
  if (status === 'full' && participants.length < game.max_players) status = 'recruiting';
  if (status === 'ready') status = 'recruiting';
  return { ...game, participants, member_count: participants.length, status };
}
