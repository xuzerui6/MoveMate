/**
 * 组队打怪 API（附四一期）：挂在 /api/v1/games/:id/boss-fight 下，
 * 规则全在服务端 boss-fight.service，这里只做请求与解包。
 */
import client from './client';
import type { BossFightSnapshot } from '../features/motion/lib/bossFightState';

function unwrap<T>(res: any): T {
  // client 的响应拦截器已剥掉 axios 外壳，这里拿到的是 {code,message,data} 信封，
  // 只准剥这一层：data 为 null 时必须原样返回 null（还没有打怪时 fetchFight 的
  // 契约），绝不能回退成信封本体；payload 自身也不再下探第二层 data。
  // （fetchGameMeta 式教训：少剥/多剥都会让界面拿到信封或空数据而全线检查照样过。）
  if (res && typeof res === 'object' && 'data' in res) return res.data as T;
  return res as T;
}

export async function createFight(
  gameId: string | number,
  input: { movement: string; bossId: string; durationSec: number },
): Promise<BossFightSnapshot> {
  return unwrap(await client.post(`/games/${gameId}/boss-fight`, input));
}

export async function fetchFight(gameId: string | number): Promise<BossFightSnapshot | null> {
  return unwrap(await client.get(`/games/${gameId}/boss-fight`));
}

export async function joinFight(gameId: string | number, sessionId?: string): Promise<BossFightSnapshot> {
  return unwrap(await client.post(`/games/${gameId}/boss-fight/join`, sessionId ? { sessionId } : {}));
}

export async function linkSession(gameId: string | number, sessionId: string): Promise<BossFightSnapshot> {
  return unwrap(await client.post(`/games/${gameId}/boss-fight/link-session`, { sessionId }));
}

export async function setReady(gameId: string | number, ready: boolean): Promise<BossFightSnapshot> {
  return unwrap(await client.post(`/games/${gameId}/boss-fight/ready`, { ready }));
}

export async function startFight(gameId: string | number): Promise<BossFightSnapshot> {
  return unwrap(await client.post(`/games/${gameId}/boss-fight/start`, {}));
}

export async function leaveFight(gameId: string | number): Promise<BossFightSnapshot> {
  return unwrap(await client.post(`/games/${gameId}/boss-fight/leave`, {}));
}

export async function fetchFightLatency(gameId: string | number): Promise<{
  fight_id: string | null;
  samples: number;
  processing_ms: { p50: number; p95: number; max: number } | null;
}> {
  return unwrap(await client.get(`/games/${gameId}/boss-fight/latency`));
}
