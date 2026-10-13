/**
 * 状态标签 —— 招募中/已满员/即将开始...，配色沿用 Web 端
 */
import { Text } from '@tarojs/components'
import type { GameState } from '../../types'
import { STATE_LABELS } from '../../types'
import './StateBadge.scss'

interface Props {
  state: GameState
}

const StateBadge: React.FC<Props> = ({ state }) => {
  const label = STATE_LABELS[state] || state
  return <Text className={`state-badge state-badge--${state}`}>{label}</Text>
}

export default StateBadge
