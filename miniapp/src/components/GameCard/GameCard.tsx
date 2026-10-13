/**
 * 运动局卡片 —— 大厅列表单项（从 Web 端 GameCard 搬运，View/Text + navigateTo）
 */
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { Game } from '../../types'
import { SPORT_LABELS, TAG_LABELS } from '../../types'
import { formatTimeRange } from '../../utils/date'
import StateBadge from '../StateBadge/StateBadge'
import AvatarGroup from '../AvatarGroup/AvatarGroup'
import SportIcon from '../SportIcon/SportIcon'
import './GameCard.scss'

interface Props {
  game: Game
}

/** 计算剩余人数 */
function getRemaining(game: Game): number {
  return Math.max(0, game.max_players - game.member_count)
}

const GameCard: React.FC<Props> = ({ game }) => {
  const remaining = getRemaining(game)
  const sportLabel = SPORT_LABELS[game.sport_type] || game.sport_type
  const isHost = Boolean(game.is_host)
  const isMember = Boolean(game.is_member)
  const canJoin = !isHost && !isMember && game.status === 'recruiting'

  const relationLabel = isHost ? '我的局' : isMember ? '已加入' : ''
  const actionLabel = isHost ? '管理' : isMember ? '查看' : canJoin ? '加入' : '查看'

  const goDetail = () => {
    Taro.navigateTo({ url: `/pages/game-detail/index?id=${game.id}` })
  }

  return (
    <View className="game-card card" hoverClass="hover-press" onClick={goDetail}>
      {/* 顶部：运动信息 + 状态 */}
      <View className="game-card__top">
        <View className="game-card__sport">
          <View className="game-card__icon">
            <SportIcon sport={game.sport_type} size={30} />
          </View>
          <View className="game-card__title-block">
            <View className="game-card__title-row">
              <Text className="game-card__name">{sportLabel}</Text>
              {relationLabel && (
                <Text
                  className={`game-card__relation ${
                    isHost ? 'game-card__relation--host' : 'game-card__relation--member'
                  }`}
                >
                  {relationLabel}
                </Text>
              )}
            </View>
            {game.tag && <Text className="game-card__tag">{TAG_LABELS[game.tag]}</Text>}
            <View className="game-card__host-row">
              <Text className="game-card__host-name">发起人 {game.creator_name || '匿名用户'}</Text>
              <Text className="game-card__host-level">
                Lv.{game.host_reward_level || 1} · {game.host_reward_points || 0}分
              </Text>
            </View>
          </View>
        </View>
        <StateBadge state={game.status} />
      </View>

      {/* 中部：信息区 */}
      <View className="game-card__info">
        <View className="game-card__info-row">
          <Text className="game-card__info-label">时间</Text>
          <Text className="game-card__info-value">{formatTimeRange(game.start_time, game.end_time)}</Text>
        </View>
        <View className="game-card__info-row">
          <Text className="game-card__info-label">地点</Text>
          <Text className="game-card__info-value">
            {game.school_name || '吉林大学'} {game.campus_name ? `· ${game.campus_name}` : ''}{' '}
            {game.venue_name || game.location}
          </Text>
        </View>
        {game.meeting_note && (
          <View className="game-card__info-row">
            <Text className="game-card__info-label">备注</Text>
            <Text className="game-card__info-value">{game.meeting_note}</Text>
          </View>
        )}
      </View>

      {/* 底部：参与者 + 操作 */}
      <View className="game-card__bottom">
        <View className="game-card__participants">
          {game.participants && game.participants.length > 0 && (
            <AvatarGroup participants={game.participants} max={4} />
          )}
          <View className="game-card__count">
            <Text className="game-card__count-text">{game.member_count}/{game.max_players} 人</Text>
            {remaining > 0 && <Text className="game-card__remaining">缺 {remaining} 人</Text>}
          </View>
        </View>
        <View className={`game-card__action ${canJoin ? 'game-card__action--join' : ''}`}>
          <Text>{actionLabel}</Text>
        </View>
      </View>
    </View>
  )
}

export default GameCard
