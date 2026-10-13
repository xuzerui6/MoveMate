/**
 * 大厅页 —— NavBar + 定位/范围 + 运动筛选 + 日期筛选 + 局卡片列表 + 发布 FAB + 发布 sheet
 * 纯 mock，无请求无登录
 */
import { useMemo, useState } from 'react'
import { Picker, Text, View } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import NavBar from '../../components/NavBar/NavBar'
import FilterBar from '../../components/FilterBar/FilterBar'
import GameCard from '../../components/GameCard/GameCard'
import EmptyState from '../../components/EmptyState/EmptyState'
import PublishSheet from '../../components/PublishSheet/PublishSheet'
import { MOCK_GAMES } from '../../mock/games'
import { MOCK_USER } from '../../mock/user'
import { formatFilterDateLabel, getDateText } from '../../utils/date'
import { getNavMetrics } from '../../utils/nav'
import type { SportType } from '../../types'
import './index.scss'

/** ISO 时间 → YYYY-MM-DD（本地日期键，用于日期筛选） */
function localDateKey(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const Lobby: React.FC = () => {
  const navMetrics = useMemo(() => getNavMetrics(), [])
  const { navBarHeight } = navMetrics

  const [sport, setSport] = useState<SportType | undefined>(undefined)
  const [date, setDate] = useState<string | undefined>(undefined)
  const [scope, setScope] = useState<'campus' | 'school'>('campus')
  const [publishVisible, setPublishVisible] = useState(false)

  const todayText = getDateText(0)
  const tomorrowText = getDateText(1)

  const onPickDate = (e: any) => {
    const raw = e.detail.value as string
    if (!raw) {
      setDate(undefined)
      return
    }
    if (raw < todayText) {
      Taro.showToast({ title: '不能选择过去的日期', icon: 'none' })
      return
    }
    setDate(raw)
  }

  // mock 列表过滤：运动类型 + 日期
  const filtered = MOCK_GAMES.filter((g) => {
    if (sport && g.sport_type !== sport) return false
    if (date && localDateKey(g.start_time) !== date) return false
    return true
  })

  // 下拉刷新（样例阶段 mock：数据不变，仅停止刷新动画）
  usePullDownRefresh(() => {
    setTimeout(() => {
      Taro.stopPullDownRefresh()
    }, 400)
  })

  return (
    <View className="lobby">
      <NavBar
        title="搭个局"
        rightSlot={
          <View className="lobby__avatar" onClick={() => Taro.showToast({ title: '样例：个人中心待接入', icon: 'none' })}>
            <Text className="lobby__avatar-text">{MOCK_USER.nickname.charAt(0)}</Text>
          </View>
        }
      />

      <View className="lobby__content" style={{ paddingTop: `${navBarHeight}px` }}>
        {/* 定位行 + 范围切换 */}
        <View className="lobby__loc-row">
          <View className="lobby__loc">
            <View className="lobby__dot" />
            <Text className="lobby__loc-text">
              {MOCK_USER.schoolName} · {MOCK_USER.campus}
            </Text>
          </View>
          <View className="lobby__scope">
            <View
              className={`chip ${scope !== 'school' ? 'chip--active' : ''}`}
              hoverClass="hover-press"
              onClick={() => setScope('campus')}
            >
              <Text>本校区</Text>
            </View>
            <View
              className={`chip ${scope === 'school' ? 'chip--active' : ''}`}
              hoverClass="hover-press"
              onClick={() => setScope('school')}
            >
              <Text>全校</Text>
            </View>
          </View>
        </View>

        {/* 运动类型筛选 */}
        <FilterBar value={sport} onChange={setSport} />

        {/* 日期筛选 */}
        <View className="lobby__date-bar">
          <View
            className={`chip ${date === todayText ? 'chip--active' : ''}`}
            hoverClass="hover-press"
            onClick={() => setDate(date === todayText ? undefined : todayText)}
          >
            <Text>今天</Text>
          </View>
          <View
            className={`chip ${date === tomorrowText ? 'chip--active' : ''}`}
            hoverClass="hover-press"
            onClick={() => setDate(date === tomorrowText ? undefined : tomorrowText)}
          >
            <Text>明天</Text>
          </View>
          <Picker mode="date" value={date || todayText} min={todayText} onChange={onPickDate}>
            <View className={`chip ${date && date !== todayText && date !== tomorrowText ? 'chip--active' : ''}`}>
              <Text>{date && date !== todayText && date !== tomorrowText ? formatFilterDateLabel(date) : '选日期'}</Text>
            </View>
          </Picker>
          {date && (
            <View className="chip" hoverClass="hover-press" onClick={() => setDate(undefined)}>
              <Text>清除</Text>
            </View>
          )}
        </View>

        {/* 局卡片列表 */}
        <View className="lobby__list">
          {filtered.length === 0 ? (
            <EmptyState onAction={() => setPublishVisible(true)} />
          ) : (
            <>
              {filtered.map((g) => (
                <GameCard key={g.id} game={g} />
              ))}
              <Text className="lobby__end-tip">已展示全部</Text>
            </>
          )}
        </View>
      </View>

      {/* 发布 FAB */}
      <View className="fab" hoverClass="hover-press" onClick={() => setPublishVisible(true)}>
        <Text className="fab__icon">＋</Text>
        <Text className="fab__text">发布</Text>
      </View>

      <PublishSheet visible={publishVisible} onClose={() => setPublishVisible(false)} />
    </View>
  )
}

export default Lobby
