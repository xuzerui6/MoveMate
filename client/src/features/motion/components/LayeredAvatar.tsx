import { lookLayers } from '../lib/avatarParts'
import { getOutfitAvatar, outfitLabels } from '../lib/outfits'
import type { AvatarGender, AvatarLook, OutfitPreset } from '../types'
import './layered-avatar.css'

/**
 * 分身拼图渲染：custom 形象按层叠加部件图层；outfit 口径（或缺图兜底）回退整套图。
 * 所有图层同画布同原点，绝对定位叠放即对位，不需要任何偏移计算。
 */
export function LayeredAvatar({
  look,
  gender,
  outfit,
  className = '',
}: {
  look?: AvatarLook | null
  gender: AvatarGender
  /** 显式指定套装时优先于 look（旧调用点兼容） */
  outfit?: OutfitPreset
  className?: string
}) {
  const resolved: AvatarLook = outfit
    ? { v: 1, mode: 'outfit', outfit }
    : look && (look.mode === 'custom' || look.mode === 'outfit')
      ? look
      : { v: 1, mode: 'outfit', outfit: 'default' }
  const genderLabel = gender === 'female' ? '女性' : '男性'

  if (resolved.mode === 'custom' && resolved.custom) {
    const layers = lookLayers(resolved, gender)
    if (layers.length >= 5) {
      return (
        <span className={`layered-avatar ${className}`} role="img" aria-label={`${genderLabel}自定义形象`}>
          {layers.map((src, index) => (
            <img key={index} className="pixel-art layered-avatar-img" src={src} alt="" draggable={false} />
          ))}
        </span>
      )
    }
    // 拼图缺图时回退默认套装整图，绝不显示半个身子
    return <img className="pixel-art avatar-character" src={getOutfitAvatar(gender, 'default', 'front')} alt={`${genderLabel}${outfitLabels.default}角色`} draggable={false} />
  }

  const outfitId = (resolved.outfit || 'default') as OutfitPreset
  return (
    <img
      className="pixel-art avatar-character"
      src={getOutfitAvatar(gender, outfitId, 'front')}
      alt={`${genderLabel}${outfitLabels[outfitId] || ''}角色`}
      draggable={false}
    />
  )
}
