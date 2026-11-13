/**
 * 形象展示摘要：给组局成员列表 / 结束页列队 / 打怪快照用。
 * 只做「展示口径」的组装——解锁规则本体在 utils/avatar-shared.ts，
 * 与 motion.service 的 trainingState 共用同一份判定，不另起炉灶。
 * 稀有度框按「已拥有的套装」取最高档：装备目录里人人默认拥有一枚 SSR 勋章，
 * 若把装备也算进来人人都是金框，框就失去区分度（此口径在方案报告中已注明）。
 */
import { pool } from '../db/pool';
import {
  OUTFIT_RARITY,
  RARITY_NAME,
  highestRarity,
  isTier1Movement,
  unlockedOutfitsMap,
  type AvatarCounts,
} from '../utils/avatar-shared';

// 与 motion.service 的 progress() 同一条等级曲线（该函数是训练域的，不在此反向引用以免循环）
function levelOf(totalXp: number): number {
  let level = 1;
  let xp = totalXp;
  while (xp >= 300 + (level - 1) * 100) {
    xp -= 300 + (level - 1) * 100;
    level++;
  }
  return level;
}

interface SettledSessionRow {
  sport_type: string;
  source: string;
  metrics: string;
}

function formScore(metrics: string): number {
  try {
    return Number(JSON.parse(metrics || '{}').formScore || 0);
  } catch {
    return 0;
  }
}

export async function avatarCounts(userId: number): Promise<AvatarCounts> {
  const profile = (await pool.query<{ total_xp: number }>(
    'SELECT total_xp FROM motion_profiles WHERE user_id = $1',
    [userId],
  )).rows[0];
  const rows = (await pool.query<SettledSessionRow>(
    `SELECT sport_type, source, metrics FROM sport_sessions
     WHERE user_id = $1 AND settled = 1 AND source <> 'demo' AND xp > 0`,
    [userId],
  )).rows;
  return {
    real: rows.length,
    high: rows.filter((row) => formScore(row.metrics) >= 90).length,
    tier1: rows.filter((row) => row.source === 'camera' && isTier1Movement(row.sport_type)).length,
    totalXp: profile?.total_xp || 0,
    level: levelOf(profile?.total_xp || 0),
  };
}

export interface AvatarDisplay {
  gender: string;
  outfit: string;
  outfit_rarity: string;
  highest_rarity: string;
  highest_rarity_name: string;
  level: number;
}

export async function avatarDisplay(userId: number): Promise<AvatarDisplay> {
  const profile = (await pool.query<{ avatar_gender: string; active_outfit: string; total_xp: number }>(
    'SELECT avatar_gender, active_outfit, total_xp FROM motion_profiles WHERE user_id = $1',
    [userId],
  )).rows[0];
  const counts = await avatarCounts(userId);
  const unlocked = unlockedOutfitsMap(counts);
  const owned = Object.keys(unlocked).filter((outfit) => unlocked[outfit]);
  const highest = highestRarity(owned.map((outfit) => OUTFIT_RARITY[outfit] || 'N'));
  const outfit = profile?.active_outfit && unlocked[profile.active_outfit] ? profile.active_outfit : 'default';
  return {
    gender: profile?.avatar_gender || 'male',
    outfit,
    outfit_rarity: OUTFIT_RARITY[outfit] || 'N',
    highest_rarity: highest,
    highest_rarity_name: RARITY_NAME[highest] || RARITY_NAME.N,
    level: counts.level,
  };
}
