import { useStore } from '../lib/store'
import { getOutfitAvatar, outfitLabels } from '../lib/outfits'
import { LayeredAvatar } from './LayeredAvatar'
import type { AvatarView, OutfitPreset } from '../types'

export function AvatarFigure({ size = 'large', view = 'front', outfit }: { size?: 'small' | 'large'; view?: AvatarView; outfit?: OutfitPreset }) {
  const { state } = useStore()
  const genderLabel = state.avatarGender === 'female' ? '女性' : '男性'

  // 侧面图一期只有整套图（部件侧面未量产，设计稿已知取舍）：沿用整套侧面渲染
  if (view === 'side' && !outfit) {
    const outfitId = state.avatarLook?.mode === 'outfit' && state.avatarLook.outfit ? state.avatarLook.outfit : state.activeOutfit
    return (
      <div className={`avatar-figure ${size}`} data-outfit={outfitId}>
        <img className="pixel-art avatar-character" src={getOutfitAvatar(state.avatarGender, outfitId, 'side')} alt={`${genderLabel}${outfitLabels[outfitId]}角色`} draggable={false} />
      </div>
    )
  }

  const displayedOutfit = outfit || state.activeOutfit
  return (
    <div className={`avatar-figure ${size}`} data-outfit={outfit ? displayedOutfit : undefined}>
      <LayeredAvatar look={outfit ? undefined : state.avatarLook} outfit={outfit} gender={state.avatarGender} />
    </div>
  )
}
