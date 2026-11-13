/**
 * 组队打怪与形象稀有度共用的纯常量/纯函数（无 DB、无服务依赖，避免循环引用）。
 *
 * 一级可信动作名单（tier-1）：证据来自 docs/acceptance-runbook.md ——
 * 基础四种（深蹲 / 开合跳 / 高抬腿 / 俯卧撑）2026-11-04 真人对照实测
 * （iPhone Lite + Windows Full）。与 server/src/gym/camera.ts 的白名单同源；
 * 附四一期只允许这四个动作组队打怪，名单冻结，不要随手扩。
 */
export const TIER1_MOVEMENTS = ['squat', 'jumping_jack', 'push_up', 'high_knees'] as const;
export type Tier1Movement = (typeof TIER1_MOVEMENTS)[number];

export function isTier1Movement(movement: string): movement is Tier1Movement {
  return (TIER1_MOVEMENTS as readonly string[]).includes(movement);
}

/**
 * 动作调参（调参常量，前端数值策划可调）：
 * - baseRepsPerMin：新手可持续输出的保守基线（次/分钟），用于按附四规则定血量；
 * - maxRepsPerSec：服务端接受伤害的速率上限（次/秒），超过人体极限的上报只按上限入账，
 *   未入账的部分留在客户端累计值里，后续上报会继续被接受（不丢弃、不倒扣）。
 */
export const MOVEMENT_TUNING: Record<Tier1Movement, { baseRepsPerMin: number; maxRepsPerSec: number }> = {
  squat: { baseRepsPerMin: 20, maxRepsPerSec: 2 },
  push_up: { baseRepsPerMin: 15, maxRepsPerSec: 2 },
  jumping_jack: { baseRepsPerMin: 40, maxRepsPerSec: 3 },
  high_knees: { baseRepsPerMin: 60, maxRepsPerSec: 4 },
};

/** 套装稀有度（与 client/src/features/motion/lib/outfits.ts 的 RARITY 对齐；N/R/SR/SSR 只留在代码里） */
export const OUTFIT_RARITY: Record<string, string> = {
  default: 'N',
  penguin: 'R',
  sea_runner: 'R',
  sakura: 'SR',
  violet_court: 'SR',
  sunset_sakura: 'SSR',
  sunlight_explorer: 'SSR',
};

/** 稀有度中文名（用户可见文案只用中文名） */
export const RARITY_NAME: Record<string, string> = {
  N: '日常',
  R: '稀有',
  SR: '珍稀',
  SSR: '绝稀有',
};

export const RARITY_RANK: Record<string, number> = { N: 0, R: 1, SR: 2, SSR: 3 };

export function highestRarity(rarities: string[]): string {
  let best = 'N';
  for (const rarity of rarities) {
    if ((RARITY_RANK[rarity] ?? 0) > (RARITY_RANK[best] ?? 0)) best = rarity;
  }
  return best;
}

/**
 * SR 替代解锁路径（附四一期小改）：SR 套装原本只认「3 次评分 90+」，
 * 但部分动作的评分处于暂停状态，那些用户永远凑不齐。新路径并行：
 * 一级可信动作的摄像头训练累计达到 SR_ALT_TIER1_SESSIONS 次同样解锁 SR。
 */
export const SR_ALT_TIER1_SESSIONS = 10;

export interface AvatarCounts {
  real: number; // 已结算、非演示、xp>0 的训练次数（与 trainingState 的 real 口径一致）
  high: number; // 其中评分 >= 90 的次数
  tier1: number; // 其中一级可信动作的摄像头训练次数
  totalXp: number;
  level: number;
}

/** 套装解锁判定（trainingState 与 avatar 展示共用同一份规则，避免两处漂移） */
export function unlockedOutfitsMap(counts: AvatarCounts): Record<string, boolean> {
  const runningUnlocked = counts.real >= 3;
  const courtUnlocked = counts.high >= 3 || counts.tier1 >= SR_ALT_TIER1_SESSIONS;
  const outdoorUnlocked = (counts.real >= 5 && counts.totalXp >= 1000) || counts.level >= 5;
  return {
    default: true,
    penguin: runningUnlocked,
    sakura: courtUnlocked,
    sunset_sakura: outdoorUnlocked,
    sea_runner: runningUnlocked,
    violet_court: courtUnlocked,
    sunlight_explorer: outdoorUnlocked,
  };
}

/**
 * 怪兽目录（数据驱动：怪兽图鉴/主题/纪念物都在这里扩展，
 * fight 表只存 boss_id，换怪、加怪都不动表结构）。
 * 一期只有一只占位怪；形象与命名由怪兽设计线另行定稿后替换 name 即可。
 */
export const BOSS_CATALOG: Array<{ boss_id: string; name: string; souvenir_item_id: string }> = [
  { boss_id: 'kunkun', name: '困困兽', souvenir_item_id: 'kunkun_medal' },
];

export function bossById(bossId: string) {
  return BOSS_CATALOG.find((boss) => boss.boss_id === bossId);
}

/** 纪念物目录：item_id → 展示名与来源怪兽 */
export const SOUVENIR_CATALOG: Record<string, { name: string; boss_id: string }> = {
  kunkun_medal: { name: '困困兽首胜纪念章', boss_id: 'kunkun' },
};
