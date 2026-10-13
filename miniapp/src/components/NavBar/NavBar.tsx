/**
 * 自定义导航栏 —— 处理微信右上角胶囊按钮避让
 *
 * 布局：固定顶部，内容区 paddingTop = 状态栏高度，
 * 内层一行 = 胶囊高度，三栏：左(sidePad 放返回键) / 绝对居中标题 / 右(sidePad 放扩展内容)
 *
 * ⚠ 高度必须用带 'px' 的字符串传入（getWindowInfo / getMenuButtonBoundingClientRect
 * 返回物理 px，若传数字会被 Taro pxTransform 按 designWidth 自动换算成 rpx 导致错乱）
 */
import { useMemo, type ReactNode } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { getNavMetrics } from '../../utils/nav'
import './NavBar.scss'

interface Props {
  title: string
  showBack?: boolean
  backgroundColor?: string
  /** 右侧扩展内容（放在胶囊左侧） */
  rightSlot?: ReactNode
}

const NavBar: React.FC<Props> = ({
  title,
  showBack = false,
  backgroundColor = '#F8FAFC',
  rightSlot,
}) => {
  const metrics = useMemo(() => getNavMetrics(), [])
  const { statusBarHeight, navBarHeight, menuHeight, sidePad } = metrics

  const handleBack = () => {
    if (Taro.getCurrentPages().length > 1) {
      Taro.navigateBack({ delta: 1 })
    } else {
      // 无上级页面（如从分享进入），退回大厅
      Taro.reLaunch({ url: '/pages/lobby/index' })
    }
  }

  return (
    <View className="navbar" style={{ height: `${navBarHeight}px`, backgroundColor }}>
      <View style={{ paddingTop: `${statusBarHeight}px`, height: '100%', boxSizing: 'border-box' }}>
        <View className="navbar__bar" style={{ height: `${menuHeight}px` }}>
          <View className="navbar__side" style={{ width: `${sidePad}px` }}>
            {showBack && (
              <View className="navbar__back" hoverClass="hover-press" onClick={handleBack}>
                <Text className="navbar__back-icon">‹</Text>
              </View>
            )}
          </View>
          <Text
            className="navbar__title"
            style={{ left: `${sidePad + 12}px`, right: `${sidePad + 12}px` }}
            numberOfLines={1}
          >
            {title}
          </Text>
          <View className="navbar__side" style={{ width: `${sidePad}px`, justifyContent: 'flex-end' }}>
            {rightSlot}
          </View>
        </View>
      </View>
    </View>
  )
}

export default NavBar
