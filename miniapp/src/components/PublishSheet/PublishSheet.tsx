/**
 * 发布底部 sheet —— 遮罩 + 面板常驻挂载，切换 class 触发 translateY 弹出/收起动画
 * 样例阶段纯 mock：不接后端，提交时 showToast 模拟
 */
import { useState } from 'react'
import { Input, Picker, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { COMMON_SPORT_TYPES, SPORT_LABELS } from '../../types'
import type { SportType } from '../../types'
import SportIcon from '../SportIcon/SportIcon'
import { formatFilterDateLabel, getDateText } from '../../utils/date'
import './PublishSheet.scss'

interface Props {
  visible: boolean
  onClose: () => void
}

const PublishSheet: React.FC<Props> = ({ visible, onClose }) => {
  const [sport, setSport] = useState<SportType>('basketball')
  const [date, setDate] = useState(getDateText(0))
  const [time, setTime] = useState('19:00')
  const [location, setLocation] = useState('')
  const [max, setMax] = useState(6)
  const [note, setNote] = useState('')

  const submit = () => {
    Taro.showToast({ title: '示例：已模拟发布', icon: 'success' })
    // 重置表单
    setSport('basketball')
    setDate(getDateText(0))
    setTime('19:00')
    setLocation('')
    setMax(6)
    setNote('')
    onClose()
  }

  return (
    <View className={`publish-sheet ${visible ? 'publish-sheet--show' : ''}`}>
      {/* 遮罩：catchMove 阻止打开时背景滚动 */}
      <View className="publish-sheet__mask" catchMove onClick={onClose} />

      <View className="publish-sheet__panel">
        <View className="publish-sheet__handle" />
        <Text className="publish-sheet__title">发布运动局</Text>

        {/* 运动类型 */}
        <View className="publish-sheet__section">
          <Text className="publish-sheet__label">选运动</Text>
          <View className="publish-sheet__sports">
            {COMMON_SPORT_TYPES.slice(0, 8).map((s) => (
              <View
                key={s}
                className={`chip ${sport === s ? 'chip--active' : ''}`}
                hoverClass="hover-press"
                onClick={() => setSport(s)}
              >
                <SportIcon sport={s} size={24} />
                <Text>{SPORT_LABELS[s]}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 日期 / 时间 / 人数 */}
        <View className="publish-sheet__row">
          <Picker mode="date" value={date} onChange={(e: any) => setDate(e.detail.value)}>
            <View className="publish-sheet__field">
              <Text className="publish-sheet__field-label">日期</Text>
              <Text className="publish-sheet__field-value">{formatFilterDateLabel(date)}</Text>
            </View>
          </Picker>
          <Picker mode="time" value={time} onChange={(e: any) => setTime(e.detail.value)}>
            <View className="publish-sheet__field">
              <Text className="publish-sheet__field-label">时间</Text>
              <Text className="publish-sheet__field-value">{time}</Text>
            </View>
          </Picker>
          <View className="publish-sheet__field">
            <Text className="publish-sheet__field-label">人数</Text>
            <View className="publish-sheet__stepper">
              <View
                className="publish-sheet__step-btn"
                hoverClass="hover-press"
                onClick={() => setMax((m) => Math.max(2, m - 1))}
              >
                <Text>−</Text>
              </View>
              <Text className="publish-sheet__step-num">{max}</Text>
              <View
                className="publish-sheet__step-btn"
                hoverClass="hover-press"
                onClick={() => setMax((m) => Math.min(20, m + 1))}
              >
                <Text>＋</Text>
              </View>
            </View>
          </View>
        </View>

        {/* 地点 */}
        <View className="publish-sheet__section">
          <Text className="publish-sheet__label">地点</Text>
          <Input
            className="publish-sheet__input"
            placeholder="选择或输入场地"
            placeholderClass="publish-sheet__placeholder"
            value={location}
            onInput={(e: any) => setLocation(e.detail.value)}
          />
        </View>

        {/* 备注 */}
        <View className="publish-sheet__section">
          <Text className="publish-sheet__label">备注</Text>
          <Input
            className="publish-sheet__input"
            placeholder="集合点 / 装备要求（选填）"
            placeholderClass="publish-sheet__placeholder"
            value={note}
            onInput={(e: any) => setNote(e.detail.value)}
          />
        </View>

        <View className="btn btn--primary btn--lg publish-sheet__submit" hoverClass="hover-press" onClick={submit}>
          <Text>发布这个局</Text>
        </View>
      </View>
    </View>
  )
}

export default PublishSheet
