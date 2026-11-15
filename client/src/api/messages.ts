/**
 * 聊天消息 API: 拉取历史消息
 */
import client from './client';
import type { ApiEnvelope, Message } from '../types';

/**
 * 拉取运动局的聊天记录。
 * 与 games.ts 的透传家族同款约定：原样返回服务端信封
 * {code, message, data}，消费方（useChat）自行取 .data.messages。
 */
export async function fetchMessages(
  gameId: string,
  before?: string
): Promise<ApiEnvelope<{ messages: Message[] }>> {
  return client.get(`/games/${gameId}/messages`, {
    params: before ? { before_id: before } : undefined,
  });
}
