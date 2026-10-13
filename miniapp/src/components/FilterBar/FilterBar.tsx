/**
 * 运动类型筛选栏 —— ScrollView 横向滚动 chips（小程序原生 scroll-x）
 * 相比 Web 版：去掉自定义滚动条指示器（移动端滚动手感自带），保留"可滑动"提示 + 右侧渐隐
 */
import { useCallback, useState } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import { COMMON_SPORT_TYPES, SPORT_LABELS } from '../../types'
import type { SportType } from '../../types'
import SportIcon from '../SportIcon/SportIcon'
import './FilterBar.scss'

interface Props {
  value?: SportType
  onChange: (sport?: SportType) => void
}

const FilterBar: React.FC<Props> = ({ value, onChange }) => {
  const [scrolled, setScrolled] = useState(false)

  const handleScroll = useCallback(
    (e: any) => {
      if (!scrolled && e.detail.scrollLeft > 8) {
        setScrolled(true)
      }
    },
    [scrolled]
  )

  return (
    <View className="filter-bar">
      <Text className="filter-bar__hint">
        {scrolled ? '按运动类型筛选' : '左右滑动查看更多运动'}
      </Text>
      <View className="filter-bar__wrap">
        <ScrollView
          className="filter-bar__scroll"
          scrollX
          enableFlex
          scrollWithAnimation
          onScroll={handleScroll}
        >
          <View className="filter-bar__inner">
            <View
              className={`chip ${!value ? 'chip--active' : ''}`}
              hoverClass="hover-press"
              onClick={() => onChange(undefined)}
            >
              <Text>全部</Text>
            </View>
            {COMMON_SPORT_TYPES.map((sport) => {
              const active = value === sport
              return (
                <View
                  key={sport}
                  className={`chip ${active ? 'chip--active' : ''}`}
                  hoverClass="hover-press"
                  onClick={() => onChange(active ? undefined : sport)}
                >
                  <SportIcon sport={sport} size={26} />
                  <Text>{SPORT_LABELS[sport]}</Text>
                </View>
              )
            })}
          </View>
        </ScrollView>
        {!scrolled && <View className="filter-bar__fade" />}
      </View>
    </View>
  )
}

export default FilterBar
