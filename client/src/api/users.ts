import client from './client';
import type { LeaderboardEntry, LeaderboardResponse } from '../types';

function normalizeEntry(raw: any): LeaderboardEntry {
  return {
    rank: Number(raw?.rank ?? 0),
    id: String(raw?.id ?? ''),
    nickname: raw?.nickname ?? '匿名同学',
    avatar: raw?.avatar ?? raw?.avatar_url ?? '',
    department: raw?.department ?? '',
    campus_name: raw?.campus_name ?? '',
    reward_points: Number(raw?.reward_points ?? 0),
    reward_level: Number(raw?.reward_level ?? 1),
    reward_streak: Number(raw?.reward_streak ?? 0),
    completed_games: Number(raw?.completed_games ?? 0),
    hosted_completed_games: Number(raw?.hosted_completed_games ?? 0),
  };
}

export async function fetchLeaderboard(): Promise<LeaderboardResponse> {
  const response: any = await client.get('/users/leaderboard');
  const payload = response?.data ?? response ?? {};

  return {
    rankings: Array.isArray(payload.rankings) ? payload.rankings.map(normalizeEntry) : [],
    current_user: payload.current_user ? normalizeEntry(payload.current_user) : null,
  };
}
