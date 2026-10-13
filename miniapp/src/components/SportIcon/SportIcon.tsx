/**
 * 运动图标 —— emoji 图标（从 Web 端 SportIcon 搬运）
 * 尺寸用数字 style（Taro 运行时按 designWidth 转 rpx，与 SCSS 的 px→rpx 单位体系一致）
 */
import { Text, View } from '@tarojs/components'
import type { SportType } from '../../types'

interface Props {
  sport: SportType
  size?: number
  className?: string
}

const ICONS: Record<string, string> = {
  basketball: '🏀',
  badminton: '🏸',
  running: '🏃',
  fitness: '🏋️',
  soccer: '⚽',
  volleyball: '🏐',
  tennis: '🎾',
  table_tennis: '🏓',
  swimming: '🏊',
  roller_skating: '🛼',
  skateboarding: '🛹',
}

const SportIcon: React.FC<Props> = ({ sport, size = 24, className = '' }) => {
  const icon = ICONS[sport] || '🏅'

  return (
    <View
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        fontSize: size,
        lineHeight: 1,
      }}
    >
      <Text style={{ lineHeight: 1 }}>{icon}</Text>
    </View>
  )
}

export default SportIcon
