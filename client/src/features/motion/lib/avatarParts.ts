/**
 * 分身部件素材解析（目录与搭配逻辑在 avatarCatalog.ts，这里只做图片 glob 与拼图 URL 拼装）。
 * 素材为同画布透明图层，按模板锚点同原点叠加，不需要偏移。
 */
import { AVATAR_PART_BY_ID, layerPlan } from './avatarCatalog'
import type { AvatarGender, AvatarLook, AvatarPartGroup } from '../types'

export * from './avatarCatalog'

const partImages = import.meta.glob<string>('../assets/avatars/parts/*/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
})
const baseImages = import.meta.glob<string>('../assets/avatars/bases/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
})

export function getPartImage(partId: string, gender: AvatarGender): string | undefined {
  const part = AVATAR_PART_BY_ID[partId]
  if (!part) return undefined
  return partImages[`../assets/avatars/parts/${part.slot}/${partId}-${gender}.png`]
}

export function getBaseImage(group: AvatarPartGroup, gender: AvatarGender, skin: string): string | undefined {
  const name = group === 'B' ? `bodyB-${gender}-natural.png` : `body-${gender}-${skin}.png`
  return baseImages[`../assets/avatars/bases/${name}`]
}

/** 拼图层 URL 序（自下而上）：基底身体 → 鞋 → 裤子 → 上衣 → 发型 → 眼睛 → 眼镜 → 面饰 */
export function lookLayers(look: AvatarLook, gender: AvatarGender): string[] {
  const plan = layerPlan(look)
  if (!plan) return []
  const urls: string[] = []
  const base = getBaseImage(plan.group, gender, plan.skin)
  if (base) urls.push(base)
  for (const partId of plan.partIds) {
    const url = getPartImage(partId, gender)
    if (url) urls.push(url)
  }
  return urls
}

/** 一份 look 在当前性别下是否能完整拼出（素材齐全校验，给兜底用） */
export function lookRendersFully(look: AvatarLook, gender: AvatarGender): boolean {
  if (look.mode !== 'custom' || !look.custom) return true
  return lookLayers(look, gender).length >= 5
}
