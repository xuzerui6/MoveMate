/**
 * 运动局 API: CRUD + 加入/退出 + 确认开始/结束
 */
import client from './client';
import type { CreateGameData, Game, GameFilter, PaginatedResponse } from '../types';

/** 获取运动局列表（支持筛选） */
export async function fetchGames(
  filter: GameFilter = {}
): Promise<PaginatedResponse<Game>> {
  const params: Record<string, unknown> = { ...filter };
  if (filter.size !== undefined) {
    params.page_size = filter.size;
    delete params.size;
  }
  return client.get('/games', { params });
}

/** 获取单个运动局详情 */
export async function fetchGameDetail(id: string): Promise<Game> {
  return client.get(`/games/${id}`);
}

/** 创建运动局 */
export async function createGame(data: CreateGameData): Promise<Game> {
  return client.post('/games', data);
}

/** 加入运动局 */
export async function joinGame(gameId: string): Promise<Game> {
  return client.post(`/games/${gameId}/join`);
}

/** 退出运动局 */
export async function leaveGame(gameId: string): Promise<Game> {
  return client.post(`/games/${gameId}/leave`);
}

/** 签到 */
export async function checkInGame(gameId: string): Promise<{ checked_in_at: string }> {
  return client.post(`/games/${gameId}/check-in`);
}

/** 发起人确认成员到场 */
export async function confirmAttendance(gameId: string, userId: number | string): Promise<{ confirmed: boolean }> {
  return client.post(`/games/${gameId}/attendance/confirm`, { user_id: Number(userId) });
}

/** 取消运动局（仅发起人） */
export async function cancelGame(gameId: string): Promise<Game> {
  return client.post(`/games/${gameId}/cancel`);
}

/** 确认活动已开始（仅发起人） */
export async function confirmStart(gameId: string): Promise<any> {
  return client.post(`/games/${gameId}/start`);
}

/** 确认活动已结束（仅发起人） */
export async function confirmEnd(gameId: string): Promise<any> {
  return client.post(`/games/${gameId}/complete`);
}

/** 约下周再练（仅发起人）：按下局参数克隆一场 +7 天的新局，成员逐个确认 */
export async function rebookGame(gameId: string): Promise<Game> {
  return client.post(`/games/${gameId}/rebook`);
}

/** 好友局动态流（好友发起的好友局 + 我在里面的好友局） */
export async function fetchFriendsFeed(): Promise<Game[]> {
  const res = await client.get('/games/friends-feed') as unknown as { data: { games: Game[] } };
  return res.data?.games || [];
}

/** 邀请好友进局（仅发起人；邀请不占名额） */
export async function inviteToGame(
  gameId: string,
  userIds: number[]
): Promise<{ invited: number[]; skipped: { user_id: number; reason: string }[] }> {
  const res = await client.post(`/games/${gameId}/invites`, { userIds }) as unknown as {
    data: { invited: number[]; skipped: { user_id: number; reason: string }[] };
  };
  return res.data;
}

/** 开放/关闭补位（仅发起人、仅好友局） */
export async function setFillOpen(gameId: string, open: boolean): Promise<Game> {
  const res = await client.post(`/games/${gameId}/fill`, { open }) as unknown as { data: { game: Game } };
  return res.data?.game;
}

/** 局分享链接（服务端返回应用内路径） */
export async function fetchShareLink(gameId: string): Promise<{ game_id: number; path: string; title: string }> {
  const res = await client.get(`/games/${gameId}/share-link`) as unknown as {
    data: { game_id: number; path: string; title: string };
  };
  return res.data;
}

/** 结束页数据（成员墙 + 我自己的纪念卡数据） */
export async function fetchEndSummary(gameId: string): Promise<import('../types').EndSummary> {
  const res = await client.get(`/games/${gameId}/end-summary`) as unknown as { data: import('../types').EndSummary };
  return res.data;
}

/** 发起人请成员离局 */
export async function removeMember(gameId: string, userId: number): Promise<{ removed: boolean }> {
  const res = await client.post(`/games/${gameId}/members/${userId}/remove`, {}) as unknown as { data: { removed: boolean } };
  return res.data;
}

/** 获取当前用户发起/加入的局 */
export async function fetchMyGames(): Promise<Game[]> {
  return client.get('/users/me/games');
}

/** 从“我的局”移除已结束记录 */
export async function removeMyGame(gameId: string): Promise<{ game_id: number }> {
  return client.delete(`/users/me/games/${gameId}`);
}
