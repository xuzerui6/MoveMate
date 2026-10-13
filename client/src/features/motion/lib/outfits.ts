import femaleDefaultFront from '../assets/avatars/outfits/female/default/front.png'
import maleDefaultFront from '../assets/avatars/outfits/male/default/front.png'
import type { AvatarGender, AvatarView, OutfitPreset, Rarity } from '../types'

export const outfitPresets: OutfitPreset[] = ['default', 'sea_runner', 'violet_court', 'sunlight_explorer', 'penguin', 'sakura', 'sunset_sakura']

export const outfitLabels: Record<OutfitPreset, string> = {
  default: '默认训练套',
  penguin: '企鹅伙伴套',
  sakura: '樱花训练套',
  sunset_sakura: '落日樱花套',
  sea_runner: '海风跑者',
  violet_court: '紫电球手',
  sunlight_explorer: '日光探索者',
}

export const outfitRarities: Record<OutfitPreset, Rarity> = {
  default: 'N',
  penguin: 'R',
  sakura: 'SR',
  sunset_sakura: 'SSR',
  sea_runner: 'R',
  violet_court: 'SR',
  sunlight_explorer: 'SSR',
}

export const outfitUnlockCopy: Record<OutfitPreset, string> = {
  default: '默认拥有',
  penguin: '完成 3 次训练解锁',
  sakura: '累计 3 次评分 90+ 的训练解锁',
  sunset_sakura: '完成 5 次训练且累计 1000 XP，或达到 Lv.5',
  sea_runner: '完成 3 次有效训练解锁，与企鹅伙伴套条件相同',
  violet_court: '累计 3 次评分 90+ 的有效训练，与樱花训练套条件相同',
  sunlight_explorer: '完成 5 次有效训练且累计 1000 XP，或达到 Lv.5',
}

const outfitImages = import.meta.glob<string>('../assets/avatars/outfits/*/*/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
})

const assetKey = (gender: AvatarGender, outfit: OutfitPreset, view: AvatarView) =>
  `../assets/avatars/outfits/${gender}/${outfit}/${view}.png`

/** Returns a bundled full-character image and never points at a missing asset. */
export function getOutfitAvatar(gender: AvatarGender, outfit: OutfitPreset, view: AvatarView): string {
  const alternateView: AvatarView = view === 'front' ? 'side' : 'front'
  return outfitImages[assetKey(gender, outfit, view)]
    || outfitImages[assetKey(gender, outfit, alternateView)]
    || outfitImages[assetKey(gender, 'default', 'front')]
    || (gender === 'female' ? femaleDefaultFront : maleDefaultFront)
}

export const hasOutfitAsset = (gender: AvatarGender, outfit: OutfitPreset, view: AvatarView) =>
  Boolean(outfitImages[assetKey(gender, outfit, view)])
