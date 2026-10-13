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

/** 获取当前用户发起/加入的局 */
export async function fetchMyGames(): Promise<Game[]> {
  return client.get('/users/me/games');
}

/** 从“我的局”移除已结束记录 */
export async function removeMyGame(gameId: string): Promise<{ game_id: number }> {
  return client.delete(`/users/me/games/${gameId}`);
}
