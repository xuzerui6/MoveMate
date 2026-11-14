/**
 * 分身部件目录与形象（look）校验：与 client/src/features/motion/lib/avatarParts.ts 镜像，
 * 改一处必须同步另一处（目录一致性由两侧测试守住）。
 *
 * 稀有度/解锁沿用套装的既有门槛（utils/avatar-shared.ts 的 unlockedOutfitsMap）：
 * 部件按档位解锁——日常默认、稀有=任一 R 套装条件、珍稀=任一 SR 条件、
 * 绝稀有=任一 SSR 条件；首胜专属只认熬夜魇狮首胜纪念物（aoye_yanshi_medal）。
 * 套装拆出的部件按其来源套装的档位归档，所以「解锁过哪套、拆件全归你」自动成立。
 */
import { ForbiddenError, ValidationError } from './errors';
import { unlockedOutfitsMap, type AvatarCounts } from './avatar-shared';

export type AvatarSlotKey = 'hair' | 'eyes' | 'glasses' | 'face' | 'top' | 'pants' | 'shoes';
export type AvatarPartGroup = 'A' | 'B';
export type PartUnlock = 'N' | 'R' | 'SR' | 'SSR' | 'firstwin';

export interface AvatarPartDef {
  id: string;
  slot: AvatarSlotKey;
  group: AvatarPartGroup;
  unlock: PartUnlock;
}

const defs = (slot: AvatarSlotKey, group: AvatarPartGroup, rows: Array<[string, PartUnlock]>): AvatarPartDef[] =>
  rows.map(([id, unlock]) => ({ id, slot, group, unlock }));

/** 部件目录（id 与素材文件名 stem 一致，性别图共用同一 id） */
export const AVATAR_PART_DEFS: AvatarPartDef[] = [
  ...defs('hair', 'A', [
    ['hair-default', 'N'],
    ['hair-brown', 'N'],
    ['hair-dye', 'R'],
    ['hair-silver', 'SR'],
    ['hair-pink', 'SR'],
    ['hair-violet', 'SR'],
    ['hair-platinum', 'SSR'],
  ]),
  ...defs('hair', 'B', [
    ['hair-sakuraB', 'SR'],
    ['hair-goldB', 'SSR'],
  ]),
  ...defs('eyes', 'A', [
    ['eyes-black', 'N'],
    ['eyes-calm', 'N'],
    ['eyes-green', 'N'],
    ['eyes-blue', 'R'],
    ['eyes-violet', 'SR'],
    ['eyes-amber', 'SR'],
    ['eyes-star', 'SSR'],
    ['eyes-moon', 'firstwin'],
  ]),
  ...defs('glasses', 'A', [
    ['glasses-black', 'N'],
    ['glasses-round', 'R'],
    ['glasses-goggles', 'R'],
    ['glasses-silver', 'SR'],
    ['glasses-shades', 'SSR'],
  ]),
  ...defs('face', 'A', [
    ['face-bandaid', 'N'],
    ['face-bandana', 'N'],
    ['face-star', 'R'],
    ['face-sakura', 'R'],
    ['face-blush', 'R'],
    ['face-hood', 'R'],
    ['face-moonprint', 'firstwin'],
    ['face-stardust', 'SSR'],
  ]),
  ...defs('face', 'B', [
    ['face-bandanaB', 'N'],
    ['face-hoodB', 'R'],
  ]),
  ...defs('top', 'A', [
    ['top-default', 'N'],
    ['top-wave', 'R'],
    ['top-sea', 'R'],
    ['top-violet', 'SR'],
    ['top-sunlight', 'SSR'],
    ['top-sunset', 'SSR'],
  ]),
  ...defs('top', 'B', [
    ['top-penguinB', 'R'],
    ['top-sakuraB', 'SR'],
    ['top-sunsetB', 'SSR'],
  ]),
  ...defs('pants', 'A', [
    ['pants-default', 'N'],
    ['pants-purple', 'R'],
    ['pants-sea', 'R'],
    ['pants-violet', 'SR'],
    ['pants-sunlight', 'SSR'],
    ['pants-sunset', 'SSR'],
  ]),
  ...defs('pants', 'B', [
    ['pants-penguinB', 'R'],
    ['pants-sakuraB', 'SR'],
    ['pants-sunsetB', 'SSR'],
  ]),
  ...defs('shoes', 'A', [
    ['shoes-default', 'N'],
    ['shoes-sea', 'R'],
    ['shoes-comet', 'SR'],
    ['shoes-violet', 'SR'],
    ['shoes-sunlight', 'SSR'],
    ['shoes-sunset', 'SSR'],
  ]),
  ...defs('shoes', 'B', [
    ['shoes-penguinB', 'R'],
    ['shoes-sakuraB', 'SR'],
    ['shoes-sunsetB', 'SSR'],
  ]),
];

export const AVATAR_PART_BY_ID: Record<string, AvatarPartDef> = Object.fromEntries(
  AVATAR_PART_DEFS.map((part) => [part.id, part]),
);

/** 戴上后隐藏发型层的面饰（兜帽/头巾，已拍板规则） */
export const HAIR_HIDING_FACE_PARTS = new Set(['face-hood', 'face-hoodB', 'face-bandana', 'face-bandanaB']);

export const AVATAR_SKINS = ['fair', 'natural', 'wheat'] as const;
export const AVATAR_FACES = ['genki', 'calm'] as const;
export const AVATAR_SLOTS: AvatarSlotKey[] = ['hair', 'eyes', 'glasses', 'face', 'top', 'pants', 'shoes'];

/** 用户拥有的部件（partId → bool），与套装判定共用同一份 counts */
export function unlockedPartsMap(counts: AvatarCounts, souvenirItemIds: string[]): Record<string, boolean> {
  const outfits = unlockedOutfitsMap(counts);
  const tierOwned: Record<PartUnlock, boolean> = {
    N: true,
    R: Boolean(outfits.penguin),
    SR: Boolean(outfits.sakura),
    SSR: Boolean(outfits.sunset_sakura),
    firstwin: souvenirItemIds.includes('aoye_yanshi_medal'),
  };
  return Object.fromEntries(AVATAR_PART_DEFS.map((part) => [part.id, tierOwned[part.unlock]]));
}

export interface AvatarCustomCore {
  group: AvatarPartGroup;
  face: 'genki' | 'calm';
  skin: (typeof AVATAR_SKINS)[number];
  parts: Record<AvatarSlotKey, string | null>;
}

export interface AvatarLook {
  v: 1;
  mode: 'outfit' | 'custom';
  /** mode='outfit' 时的套装 id */
  outfit?: string;
  /** mode='custom' 时的搭配本体 */
  custom?: AvatarCustomCore;
  /** 自定义预设位（最多 3 个，只存 custom 本体） */
  presets?: Array<AvatarCustomCore | null>;
}

function cleanCore(raw: any, unlockedParts: Record<string, boolean>): AvatarCustomCore {
  if (!raw || typeof raw !== 'object') throw new ValidationError('形象数据无效');
  const group: AvatarPartGroup = raw.group === 'B' ? 'B' : 'A';
  const face = AVATAR_FACES.includes(raw.face) ? raw.face : 'genki';
  // B 组基底只有自然肤色，服务端强制收口，避免客户端漏挡后拼出不存在的图
  const skin = group === 'B' ? 'natural' : AVATAR_SKINS.includes(raw.skin) ? raw.skin : 'natural';
  const rawParts = raw.parts && typeof raw.parts === 'object' ? raw.parts : {};
  const parts = {} as Record<AvatarSlotKey, string | null>;
  for (const slot of AVATAR_SLOTS) {
    const value = rawParts[slot];
    if (value === null || value === undefined || value === '') {
      parts[slot] = null;
      continue;
    }
    const part = typeof value === 'string' ? AVATAR_PART_BY_ID[value] : undefined;
    if (!part || part.slot !== slot) throw new ValidationError('部件不存在或部位不匹配');
    if (part.group !== group) throw new ValidationError('部件与基础形象不是同一套模板');
    if (!unlockedParts[part.id]) {
      // 例外：发型被兜帽/头巾盖住时根本不渲染，不要求拥有——否则只解锁了企鹅套装的
      // 用户拆件后会被自己看不见的发型卡住保存（企鹅拆件的发型来自樱花档位）。
      const faceValue = rawParts.face;
      const hairCovered = slot === 'hair' && typeof faceValue === 'string' && HAIR_HIDING_FACE_PARTS.has(faceValue);
      if (!hairCovered) throw new ForbiddenError('部件尚未解锁');
    }
    parts[slot] = part.id;
  }
  // 必戴槽位：发型（被兜帽/头巾盖住时可空）、上衣、裤子、鞋；眼睛只在 A 组是独立层
  const facePart = parts.face;
  const hairHidden = facePart !== null && HAIR_HIDING_FACE_PARTS.has(facePart);
  if (!parts.top || !parts.pants || !parts.shoes) throw new ValidationError('上衣、裤子和鞋不能空着');
  if (!parts.hair && !hairHidden) throw new ValidationError('发型不能空着');
  if (group === 'A' && !parts.eyes) throw new ValidationError('眼睛不能空着');
  if (group === 'B' && parts.eyes) throw new ValidationError('正面经典形象的眼睛是自带的');
  return { group, face, skin, parts };
}

/**
 * 校验并归一化一份 look。非法结构 → ValidationError；未解锁的套装/部件 → ForbiddenError。
 * unlockedOutfits/unlockedParts 由调用方按当前用户算好传入。
 */
export function validateAvatarLook(
  raw: any,
  ctx: { unlockedOutfits: Record<string, boolean>; unlockedParts: Record<string, boolean> },
): AvatarLook {
  if (!raw || typeof raw !== 'object') throw new ValidationError('形象数据无效');
  if (raw.mode === 'outfit') {
    const outfit = typeof raw.outfit === 'string' ? raw.outfit : '';
    if (!Object.prototype.hasOwnProperty.call(ctx.unlockedOutfits, outfit)) throw new ValidationError('套装不存在');
    if (!ctx.unlockedOutfits[outfit]) throw new ForbiddenError('套装尚未解锁');
    return { v: 1, mode: 'outfit', outfit, presets: cleanPresets(raw.presets, ctx.unlockedParts) };
  }
  if (raw.mode === 'custom') {
    return {
      v: 1,
      mode: 'custom',
      custom: cleanCore(raw.custom ?? raw, ctx.unlockedParts),
      presets: cleanPresets(raw.presets, ctx.unlockedParts),
    };
  }
  throw new ValidationError('形象数据无效');
}

function cleanPresets(raw: any, unlockedParts: Record<string, boolean>): Array<AvatarCustomCore | null> {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 3).map((entry) => {
    if (!entry) return null;
    try {
      return cleanCore(entry, unlockedParts);
    } catch {
      return null; // 预设里混进脏数据时只丢这一格，不连坐整份形象
    }
  });
}

/** 旧数据（avatar_look 为空）派生：保持用户现在的套装原样显示 */
export function deriveLookFromOutfit(activeOutfit: string): AvatarLook {
  return { v: 1, mode: 'outfit', outfit: activeOutfit || 'default' };
}

export function parseStoredLook(raw: string | null | undefined, activeOutfit: string): AvatarLook {
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.mode === 'outfit' || parsed.mode === 'custom')) return parsed as AvatarLook;
    } catch {
      /* 存量脏数据回退到套装口径，不让形象页打不开 */
    }
  }
  return deriveLookFromOutfit(activeOutfit);
}
