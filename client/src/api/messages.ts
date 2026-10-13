/**
 * 聊天消息 API: 拉取历史消息
 */
import client from './client';
import type { Message } from '../types';

/** 拉取运动局的聊天记录 */
export async function fetchMessages(
  gameId: string,
  before?: string
): Promise<Message[]> {
  return client.get(`/games/${gameId}/messages`, {
    params: before ? { before_id: before } : undefined,
  });
}
