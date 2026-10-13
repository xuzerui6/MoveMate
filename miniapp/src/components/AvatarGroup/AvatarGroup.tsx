/**
 * 参与者头像叠放组件 —— 最多展示 max 个头像，超出显示 +N
 * 无真实头像时用昵称色块 + 首字（utils/avatar）
 */
import { Image, Text, View } from '@tarojs/components'
import { getAvatarColor, getAvatarText } from '../../utils/avatar'
import './AvatarGroup.scss'

interface Participant {
  id?: string
  user_id?: string
  nickname: string
  avatar?: string
}

interface Props {
  participants: Participant[]
  max?: number
}

const AvatarGroup: React.FC<Props> = ({ participants, max = 4 }) => {
  if (!participants || participants.length === 0) {
    return null
  }

  const visible = participants.slice(0, max)
  const remaining = participants.length - max

  return (
    <View className="avatar-group">
      {visible.map((p, i) => (
        <View
          key={p.id || p.user_id || i}
          className="avatar-group__item"
          style={{
            backgroundColor: getAvatarColor(p.nickname),
            // 字符串避免被 Taro 当长度单位转换
            zIndex: String(max - i),
          }}
        >
          {p.avatar ? (
            <Image src={p.avatar} className="avatar-group__img" mode="aspectFill" />
          ) : (
            <Text className="avatar-group__text">{getAvatarText(p.nickname)}</Text>
          )}
        </View>
      ))}
      {remaining > 0 && (
        <View className="avatar-group__more" style={{ zIndex: '0' }}>
          +{remaining}
        </View>
      )}
    </View>
  )
}

export default AvatarGroup
