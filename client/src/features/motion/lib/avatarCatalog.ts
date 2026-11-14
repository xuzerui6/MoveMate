/**
 * 分身部件目录（纯数据/逻辑，不碰素材解析，可被测试直接 import）。
 * 与 server/src/utils/avatar-parts.ts 镜像：id/槽位/组别/解锁档位必须一致，
 * 服务端是校验权威，这里负责展示名与搭配派生。素材解析在 avatarParts.ts。
 */
import type { AvatarCustomCore, AvatarGender, AvatarLook, AvatarPartGroup, AvatarSlotKey, OutfitPreset, Rarity } from '../types'

export type PartRarity = Rarity | 'firstwin'

export interface AvatarPartInfo {
  id: string
  slot: AvatarSlotKey
  group: AvatarPartGroup
  rarity: PartRarity
  name: string
  nameFemale?: string
}

type Row = [string, PartRarity, string] | [string, PartRarity, string, string]
const rows = (slot: AvatarSlotKey, group: AvatarPartGroup, list: Row[]): AvatarPartInfo[] =>
  list.map(([id, rarity, name, nameFemale]) => ({ id, slot, group, rarity, name, ...(nameFemale ? { nameFemale } : {}) }))

export const AVATAR_PARTS: AvatarPartInfo[] = [
  ...rows('hair', 'A', [
    ['hair-default', 'N', '利落碎发', '高马尾'],
    ['hair-brown', 'N', '清爽侧分'],
    ['hair-dye', 'R', '挑染碎发'],
    ['hair-silver', 'SR', '银灰渐变'],
    ['hair-pink', 'SR', '樱粉碎发', '樱粉长发'],
    ['hair-violet', 'SR', '紫电挑染'],
    ['hair-platinum', 'SSR', '日光白金'],
  ]),
  ...rows('hair', 'B', [
    ['hair-sakuraB', 'SR', '樱花束发'],
    ['hair-goldB', 'SSR', '落日金渐变'],
  ]),
  ...rows('eyes', 'A', [
    ['eyes-black', 'N', '元气圆眼'],
    ['eyes-calm', 'N', '沉稳细眼'],
    ['eyes-green', 'N', '翠绿眼'],
    ['eyes-blue', 'R', '海蓝眼'],
    ['eyes-violet', 'SR', '紫电眼'],
    ['eyes-amber', 'SR', '琥珀眼'],
    ['eyes-star', 'SSR', '星瞳'],
    ['eyes-moon', 'firstwin', '月牙瞳'],
  ]),
  ...rows('glasses', 'A', [
    ['glasses-black', 'N', '黑框眼镜'],
    ['glasses-round', 'R', '圆框眼镜'],
    ['glasses-goggles', 'R', '运动护目镜'],
    ['glasses-silver', 'SR', '银丝半框'],
    ['glasses-shades', 'SSR', '星尘墨镜'],
  ]),
  ...rows('face', 'A', [
    ['face-bandaid', 'N', '创可贴'],
    ['face-bandana', 'N', '落日头巾'],
    ['face-star', 'R', '星星贴纸'],
    ['face-sakura', 'R', '樱花面贴'],
    ['face-blush', 'R', '活力腮红'],
    ['face-hood', 'R', '企鹅兜帽'],
    ['face-moonprint', 'firstwin', '月牙面印'],
    ['face-stardust', 'SSR', '金粉星尘妆'],
  ]),
  ...rows('face', 'B', [
    ['face-bandanaB', 'N', '落日头巾'],
    ['face-hoodB', 'R', '企鹅兜帽'],
  ]),
  ...rows('top', 'A', [
    ['top-default', 'N', '黑绿训练背心'],
    ['top-wave', 'R', '海浪上衣'],
    ['top-sea', 'R', '海风上衣'],
    ['top-violet', 'SR', '紫电球衣'],
    ['top-sunlight', 'SSR', '日光探索上衣'],
    ['top-sunset', 'SSR', '落日樱花上衣'],
  ]),
  ...rows('top', 'B', [
    ['top-penguinB', 'R', '企鹅伙伴上衣'],
    ['top-sakuraB', 'SR', '樱花训练上衣'],
    ['top-sunsetB', 'SSR', '落日樱花上衣'],
  ]),
  ...rows('pants', 'A', [
    ['pants-default', 'N', '黑绿训练短裤'],
    ['pants-purple', 'R', '紫星短裤'],
    ['pants-sea', 'R', '海风短裤'],
    ['pants-violet', 'SR', '紫电球裤'],
    ['pants-sunlight', 'SSR', '日光探索长裤'],
    ['pants-sunset', 'SSR', '落日樱花短裤'],
  ]),
  ...rows('pants', 'B', [
    ['pants-penguinB', 'R', '企鹅短裤'],
    ['pants-sakuraB', 'SR', '樱花短裤'],
    ['pants-sunsetB', 'SSR', '落日樱花短裤'],
  ]),
  ...rows('shoes', 'A', [
    ['shoes-default', 'N', '黑绿训练鞋'],
    ['shoes-sea', 'R', '海风跑鞋'],
    ['shoes-comet', 'SR', '彗星跑鞋'],
    ['shoes-violet', 'SR', '紫电跑鞋'],
    ['shoes-sunlight', 'SSR', '日光跑鞋'],
    ['shoes-sunset', 'SSR', '落日跑鞋'],
  ]),
  ...rows('shoes', 'B', [
    ['shoes-penguinB', 'R', '企鹅伙伴鞋'],
    ['shoes-sakuraB', 'SR', '樱花跑鞋'],
    ['shoes-sunsetB', 'SSR', '落日跑鞋'],
  ]),
]

export const AVATAR_PART_BY_ID: Record<string, AvatarPartInfo> = Object.fromEntries(AVATAR_PARTS.map((p) => [p.id, p]))

export const partName = (part: AvatarPartInfo, gender: AvatarGender) =>
  gender === 'female' && part.nameFemale ? part.nameFemale : part.name

export const partRarityName: Record<PartRarity, string> = {
  N: '日常',
  R: '稀有',
  SR: '珍稀',
  SSR: '绝稀有',
  firstwin: '首胜专属',
}

export const partUnlockCopy: Record<PartRarity, string> = {
  N: '默认拥有',
  R: '完成 3 次训练解锁',
  SR: '累计 3 次评分 90+ 的训练，或一级动作摄像头训练 10 次解锁',
  SSR: '完成 5 次训练且累计 1000 XP，或达到 Lv.5',
  firstwin: '打怪首胜熬夜魇狮解锁',
}

export const AVATAR_SLOT_LABELS: Record<AvatarSlotKey, string> = {
  hair: '发型',
  eyes: '眼睛',
  glasses: '眼镜',
  face: '面饰',
  top: '上衣',
  pants: '裤子',
  shoes: '鞋',
}

export const AVATAR_SLOT_ORDER: AvatarSlotKey[] = ['hair', 'eyes', 'glasses', 'face', 'top', 'pants', 'shoes']

/** 戴上后隐藏发型层的面饰（兜帽/头巾） */
export const HAIR_HIDING_FACE_PARTS = new Set(['face-hood', 'face-hoodB', 'face-bandana', 'face-bandanaB'])

export const partsForSlot = (slot: AvatarSlotKey, group: AvatarPartGroup) =>
  AVATAR_PARTS.filter((p) => p.slot === slot && p.group === group)

/* ---------- 造型派生 ---------- */

export const defaultCore = (group: AvatarPartGroup): AvatarCustomCore =>
  group === 'B'
    ? {
        group, face: 'genki', skin: 'natural',
        parts: { hair: 'hair-sakuraB', eyes: null, glasses: null, face: null, top: 'top-sakuraB', pants: 'pants-sakuraB', shoes: 'shoes-sakuraB' },
      }
    : {
        group, face: 'genki', skin: 'natural',
        parts: { hair: 'hair-default', eyes: 'eyes-green', glasses: null, face: null, top: 'top-default', pants: 'pants-default', shoes: 'shoes-default' },
      }

/** 套装拆件：把整套造型拆成等价的部件搭配（开始自定义时预填，不跳变） */
export function decomposeOutfit(outfit: OutfitPreset): AvatarCustomCore {
  const a = (parts: AvatarCustomCore['parts']): AvatarCustomCore => ({ group: 'A', face: 'genki', skin: 'natural', parts })
  const b = (parts: AvatarCustomCore['parts']): AvatarCustomCore => ({ group: 'B', face: 'genki', skin: 'natural', parts })
  switch (outfit) {
    case 'sea_runner':
      return a({ hair: 'hair-default', eyes: 'eyes-green', glasses: null, face: null, top: 'top-sea', pants: 'pants-sea', shoes: 'shoes-sea' })
    case 'violet_court':
      return a({ hair: 'hair-violet', eyes: 'eyes-violet', glasses: null, face: null, top: 'top-violet', pants: 'pants-violet', shoes: 'shoes-violet' })
    case 'sunlight_explorer':
      return a({ hair: 'hair-brown', eyes: 'eyes-green', glasses: null, face: null, top: 'top-sunlight', pants: 'pants-sunlight', shoes: 'shoes-sunlight' })
    case 'sakura':
      return b({ hair: 'hair-sakuraB', eyes: null, glasses: null, face: null, top: 'top-sakuraB', pants: 'pants-sakuraB', shoes: 'shoes-sakuraB' })
    case 'sunset_sakura':
      return b({ hair: 'hair-goldB', eyes: null, glasses: null, face: null, top: 'top-sunsetB', pants: 'pants-sunsetB', shoes: 'shoes-sunsetB' })
    case 'penguin':
      return b({ hair: 'hair-sakuraB', eyes: null, glasses: null, face: 'face-hoodB', top: 'top-penguinB', pants: 'pants-penguinB', shoes: 'shoes-penguinB' })
    default:
      return a({ hair: 'hair-default', eyes: 'eyes-green', glasses: null, face: null, top: 'top-default', pants: 'pants-default', shoes: 'shoes-default' })
  }
}

export const outfitLook = (outfit: OutfitPreset): AvatarLook => ({ v: 1, mode: 'outfit', outfit })

/**
 * 搭配核心深比较：组别/脸型/肤色 + 每个槽位的部件 id。
 * 逐字段比，不用 JSON.stringify——部件记录的键序随构造路径不同
 * （本地拼装、存档套用、服务端回读），键序不同不算改动。
 * 编辑器用它判草稿是否已回到已保存的搭配（回到原样就不算未保存修改）。
 */
export function avatarCoresEqual(a: AvatarCustomCore, b: AvatarCustomCore): boolean {
  if (a.group !== b.group || a.face !== b.face || a.skin !== b.skin) return false
  const keys = new Set([...Object.keys(a.parts), ...Object.keys(b.parts)]) as Set<AvatarSlotKey>
  for (const key of keys) {
    if ((a.parts[key] ?? null) !== (b.parts[key] ?? null)) return false
  }
  return true
}

/**
 * 拼图计划：返回基底标识与自下而上的部件 id 顺序
 * （身体 → 鞋 → 裤子 → 上衣 → 发型 → 眼睛 → 眼镜 → 面饰，与量产 TEMPLATE 的叠放顺序一致）。
 * outfit 口径返回 null（走整套图）。兜帽/头巾戴上时发型层不出现。
 */
export function layerPlan(look: AvatarLook): { group: AvatarPartGroup; skin: string; partIds: string[] } | null {
  if (look.mode !== 'custom' || !look.custom) return null
  const { group, skin, parts } = look.custom
  const partIds: string[] = []
  const push = (partId: string | null) => { if (partId) partIds.push(partId) }
  push(parts.shoes)
  push(parts.pants)
  push(parts.top)
  const hairHidden = parts.face !== null && HAIR_HIDING_FACE_PARTS.has(parts.face)
  if (!hairHidden) push(parts.hair)
  push(parts.eyes)
  push(parts.glasses)
  push(parts.face)
  return { group, skin, partIds }
}
