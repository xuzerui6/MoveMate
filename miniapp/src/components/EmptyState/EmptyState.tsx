/**
 * 空状态提示 —— 大厅没有局时展示
 */
import { Text, View } from '@tarojs/components'
import './EmptyState.scss'

interface Props {
  onAction?: () => void
}

const EmptyState: React.FC<Props> = ({ onAction }) => {
  return (
    <View className="empty-state">
      <View className="empty-state__icon">🏟️</View>
      <Text className="empty-state__title">还没有运动局</Text>
      <Text className="empty-state__desc">
        成为第一个发起运动局的人吧！{'\n'}篮球、羽毛球、跑步... 找搭子一起运动
      </Text>
      {onAction && (
        <View className="btn btn--primary btn--lg empty-state__action" hoverClass="hover-press" onClick={onAction}>
          发起第一个局
        </View>
      )}
    </View>
  )
}

export default EmptyState
