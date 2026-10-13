/**
 * 局详情页 —— NavBar(返回) + 局信息头 + 成员列表 + 留言板占位 + 底部操作栏
 * 纯 mock：useRouter 取 id → getMockGameById；动作全部 showToast 模拟
 */
import { useMemo } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import NavBar from '../../components/NavBar/NavBar'
import StateBadge from '../../components/StateBadge/StateBadge'
import SportIcon from '../../components/SportIcon/SportIcon'
import { getMockGameById } from '../../mock/games'
import { MOCK_USER } from '../../mock/user'
import { formatTimeRange } from '../../utils/date'
import { getAvatarColor, getAvatarText } from '../../utils/avatar'
import { getNavMetrics } from '../../utils/nav'
import { SPORT_LABELS, TAG_LABELS } from '../../types'
import type { GameState } from '../../types'
import './index.scss'

const GameDetail: React.FC = () => {
  const router = useRouter()
  const id = router.params?.id
  const game = useMemo(() => getMockGameById(id), [id])
  const navMetrics = useMemo(() => getNavMetrics(), [])
  const { navBarHeight } = navMetrics

  // 空态（hooks 在 return 之前，保持一致）
  if (!game) {
    return (
      <View className="detail">
        <NavBar title="组局详情" showBack />
        <View className="detail__empty" style={{ paddingTop: `${navBarHeight + 120}px` }}>
          <View className="detail__empty-icon">😵</View>
          <Text className="detail__empty-title">加载失败</Text>
          <Text className="detail__empty-desc">该局不存在或已被删除</Text>
          <View className="btn btn--primary" hoverClass="hover-press" onClick={() => Taro.navigateBack()}>
            <Text>返回探索</Text>
          </View>
        </View>
      </View>
    )
  }

  const isCreator = game.host_id === MOCK_USER.id
  const isMember = Boolean(game.is_member)
  const sportLabel = SPORT_LABELS[game.sport_type] || game.sport_type
  const hostParticipant = game.participants?.find((p) => Number(p.user_id) === game.host_id)
  const lockedState: GameState | '' = !isMember && !isCreator ? game.status : ''
  const canJoin = !isMember && !isCreator && game.status === 'recruiting'

  /* ---------- 底部操作：mock 动作 ---------- */
  const doJoin = () => Taro.showToast({ title: '示例：已加入这个局', icon: 'success' })
  const doCheckIn = () => Taro.showToast({ title: '示例：已签到', icon: 'success' })
  const doStart = () => Taro.showToast({ title: '示例：已确认活动开始', icon: 'success' })
  const doEnd = () => Taro.showToast({ title: '示例：已确认活动结束', icon: 'success' })

  const confirmDanger = (kind: 'leave' | 'cancel') => {
    Taro.showModal({
      title: kind === 'cancel' ? '取消这个局' : '退出这个局',
      content:
        kind === 'cancel'
          ? '确定要取消这个局吗？取消后无法恢复。'
          : '确定要退出这个局吗？',
      confirmText: kind === 'cancel' ? '确认取消' : '确认退出',
      confirmColor: '#EF4444',
      success: (res) => {
        if (res.confirm) {
          Taro.showToast({ title: kind === 'cancel' ? '示例：已取消该局' : '示例：已退出', icon: 'success' })
        }
      },
    })
  }

  const renderActionBar = () => {
    if (isCreator) {
      return (
        <View className="detail__actions">
          {(game.status === 'ready' || game.status === 'in_progress') && (
            <View className="btn btn--primary btn--block detail__action-gap" hoverClass="hover-press" onClick={doCheckIn}>
              <Text>发起人签到</Text>
            </View>
          )}
          {(game.status === 'recruiting' || game.status === 'full' || game.status === 'ready') && (
            <View className="btn btn--danger btn--block detail__action-gap" hoverClass="hover-press" onClick={() => confirmDanger('cancel')}>
              <Text>取消该局</Text>
            </View>
          )}
          {game.status === 'ready' && (
            <View className="btn btn--primary btn--block detail__action-gap" hoverClass="hover-press" onClick={doStart}>
              <Text>确认活动开始</Text>
            </View>
          )}
          {game.status === 'in_progress' && (
            <View className="btn btn--primary btn--block" hoverClass="hover-press" onClick={doEnd}>
              <Text>确认活动结束</Text>
            </View>
          )}
        </View>
      )
    }
    if (isMember) {
      return (
        <View className="detail__actions">
          {(game.status === 'ready' || game.status === 'in_progress') && (
            <View className="btn btn--primary btn--block detail__action-gap" hoverClass="hover-press" onClick={doCheckIn}>
              <Text>我已到场</Text>
            </View>
          )}
          <View className="btn btn--outline btn--block" hoverClass="hover-press" onClick={() => confirmDanger('leave')}>
            <Text>退出这个局</Text>
          </View>
        </View>
      )
    }
    if (canJoin) {
      return (
        <View className="detail__actions">
          <View className="btn btn--primary btn--lg btn--block" hoverClass="hover-press" onClick={doJoin}>
            <Text>加入这个局</Text>
          </View>
        </View>
      )
    }
    // 已满员/即将开始/进行中/已结束 等锁定态
    const lockText =
      lockedState === 'full'
        ? '该局已满员，暂时不能加入'
        : lockedState === 'ready'
          ? '该局即将开始，已停止加入'
          : lockedState === 'in_progress'
            ? '该局已开始，不能再加入'
            : '该局已结束'
    return (
      <View className="detail__actions">
        <Text className="detail__lock-hint">{lockText}</Text>
      </View>
    )
  }

  return (
    <View className="detail">
      <NavBar title="组局详情" showBack />

      <View className="detail__content" style={{ paddingTop: `${navBarHeight}px` }}>
        {/* 局信息头 */}
        <View className="detail-header card fade-slide-up">
          <View className="detail-header__top">
            <View className="detail-header__icon">
              <SportIcon sport={game.sport_type} size={36} />
            </View>
            <View className="detail-header__title-block">
              <View className="detail-header__title-row">
                <Text className="detail-header__name">{sportLabel}</Text>
                <StateBadge state={game.status} />
              </View>
              {game.tag && <Text className="detail-header__tag">{TAG_LABELS[game.tag]}</Text>}
            </View>
          </View>

          <View className="detail-header__box">
            <View className="detail-header__row">
              <Text className="detail-header__label">时间</Text>
              <Text className="detail-header__value">{formatTimeRange(game.start_time, game.end_time)}</Text>
            </View>
            <View className="detail-header__row">
              <Text className="detail-header__label">地点</Text>
              <Text className="detail-header__value">
                {game.school_name || '吉林大学'} {game.campus_name ? `· ${game.campus_name}` : ''} {game.venue_name || game.location}
              </Text>
            </View>
            {game.meeting_note && (
              <View className="detail-header__row">
                <Text className="detail-header__label">备注</Text>
                <Text className="detail-header__value">{game.meeting_note}</Text>
              </View>
            )}
            <View className="detail-header__row">
              <Text className="detail-header__label">人数</Text>
              <Text className="detail-header__value">
                {game.member_count}/{game.max_players}
                {game.member_count < game.max_players && (
                  <Text className="detail-header__remaining">（还差 {game.max_players - game.member_count} 人）</Text>
                )}
              </Text>
            </View>
            <View className="detail-header__row">
              <Text className="detail-header__label">发起人</Text>
              <Text className="detail-header__value">
                {hostParticipant?.nickname || game.creator_name || `用户${game.host_id}`}
              </Text>
            </View>
          </View>
        </View>

        {/* 成员列表 */}
        <View className="detail-members card">
          <Text className="detail-section-title">参与者（{game.participants?.length || 0}人）</Text>
          <View className="detail-members__list">
            {(game.participants || []).map((p) => {
              const isHostMember = Number(p.user_id) === game.host_id
              return (
                <View key={p.id || p.user_id} className="detail-members__item">
                  <View className="detail-members__avatar" style={{ backgroundColor: getAvatarColor(p.nickname) }}>
                    <Text className="detail-members__avatar-text">{getAvatarText(p.nickname)}</Text>
                  </View>
                  <View className="detail-members__info">
                    <View className="detail-members__name-row">
                      <Text className="detail-members__name">{p.nickname}</Text>
                      <Text className="detail-members__level">Lv.{p.reward_level || 1} · {p.total_reward_points || 0}分</Text>
                    </View>
                    {!isHostMember && <Text className="detail-members__status">未签到</Text>}
                  </View>
                  {isHostMember && <Text className="detail-members__creator">发起人</Text>}
                </View>
              )
            })}
          </View>
        </View>

        {/* 留言板占位 */}
        <View className="detail-chat card">
          <Text className="detail-section-title">交流板</Text>
          <View className="detail-chat__list">
            <View className="detail-chat__msg">
              <Text className="detail-chat__name">阿豪</Text>
              <Text className="detail-chat__body">晚上见，别忘了带水</Text>
            </View>
            <View className="detail-chat__msg">
              <Text className="detail-chat__name">小于</Text>
              <Text className="detail-chat__body">我 6:40 到球场👌</Text>
            </View>
            <View className="detail-chat__msg">
              <Text className="detail-chat__name">大熊</Text>
              <Text className="detail-chat__body">谁穿白色队服？</Text>
            </View>
          </View>
          <View className="detail-chat__placeholder">
            <Text className="detail-chat__placeholder-text">样例阶段留言待接入（正式版接 Socket 聊天室）</Text>
          </View>
        </View>

        {/* 底部操作栏占位高度 */}
        <View className="detail__bottom-space" />
      </View>

      {/* 底部操作栏（fixed） */}
      <View className="detail__action-bar">{renderActionBar()}</View>
    </View>
  )
}

export default GameDetail
