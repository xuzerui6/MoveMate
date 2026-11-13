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
 * 2026-11-13 怪兽设计定稿后补入正式阵容（老板拍板：三版方向全采纳）：
 * - aoye_yanshi 熬夜魇狮：一期主线怪，前端发起打怪时显式指定它；
 * - 夜幕兽群其余成员（wuya_shou / yeyi_fu / chenyuan_yingjiao / lieyue_manniu）先只进图鉴；
 * - ziye_yanlong 子夜魇龙、suiyue_shoumo 碎月睡魔：周怪槽位，未开放；
 * - ziye_zhong 子夜钟巨像：活动槽位，未开放。
 * availability 只是图鉴/前端展示口径；kunkun 保留在首位是历史默认
 * （boss-fight 测试冻结了「不指定 boss 时默认 kunkun」），不要调整顺序。
 */
export interface BossCatalogEntry {
  boss_id: string;
  name: string;
  souvenir_item_id: string;
  /** 图鉴档位（用户可见中文）：普通 / 精英 / 首领 / 周怪级 / 周怪 / 活动怪 */
  tier?: string;
  /** fight=一期可打；roster=图鉴成员未开放；weekly=周怪未开放；event=活动未开放 */
  availability?: 'fight' | 'roster' | 'weekly' | 'event';
}

export const BOSS_CATALOG: Array<BossCatalogEntry> = [
  { boss_id: 'kunkun', name: '困困兽', souvenir_item_id: 'kunkun_medal' },
  { boss_id: 'aoye_yanshi', name: '熬夜魇狮', souvenir_item_id: 'aoye_yanshi_medal', tier: '首领', availability: 'fight' },
  { boss_id: 'wuya_shou', name: '雾牙兽', souvenir_item_id: 'wuya_shou_medal', tier: '普通', availability: 'roster' },
  { boss_id: 'yeyi_fu', name: '夜翼蝠', souvenir_item_id: 'yeyi_fu_medal', tier: '普通', availability: 'roster' },
  { boss_id: 'chenyuan_yingjiao', name: '沉渊影蛟', souvenir_item_id: 'chenyuan_yingjiao_medal', tier: '精英', availability: 'roster' },
  { boss_id: 'lieyue_manniu', name: '裂月蛮牛', souvenir_item_id: 'lieyue_manniu_medal', tier: '精英', availability: 'roster' },
  { boss_id: 'ziye_yanlong', name: '子夜魇龙', souvenir_item_id: 'ziye_yanlong_medal', tier: '周怪级', availability: 'weekly' },
  { boss_id: 'suiyue_shoumo', name: '碎月睡魔', souvenir_item_id: 'suiyue_shoumo_medal', tier: '周怪', availability: 'weekly' },
  { boss_id: 'ziye_zhong', name: '子夜钟巨像', souvenir_item_id: 'ziye_zhong_medal', tier: '活动怪', availability: 'event' },
];

export function bossById(bossId: string) {
  return BOSS_CATALOG.find((boss) => boss.boss_id === bossId);
}

/** 纪念物目录：item_id → 展示名与来源怪兽 */
export const SOUVENIR_CATALOG: Record<string, { name: string; boss_id: string }> = {
  kunkun_medal: { name: '困困兽首胜纪念章', boss_id: 'kunkun' },
  aoye_yanshi_medal: { name: '魇狮月牙勋章', boss_id: 'aoye_yanshi' },
  wuya_shou_medal: { name: '雾牙兽首胜纪念章', boss_id: 'wuya_shou' },
  yeyi_fu_medal: { name: '夜翼蝠首胜纪念章', boss_id: 'yeyi_fu' },
  chenyuan_yingjiao_medal: { name: '沉渊影蛟首胜纪念章', boss_id: 'chenyuan_yingjiao' },
  lieyue_manniu_medal: { name: '裂月蛮牛首胜纪念章', boss_id: 'lieyue_manniu' },
  ziye_yanlong_medal: { name: '子夜魇龙首胜纪念章', boss_id: 'ziye_yanlong' },
  suiyue_shoumo_medal: { name: '碎月睡魔首胜纪念章', boss_id: 'suiyue_shoumo' },
  ziye_zhong_medal: { name: '子夜钟巨像首胜纪念章', boss_id: 'ziye_zhong' },
};
