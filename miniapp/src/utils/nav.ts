/**
 * 自定义导航栏布局计算 —— 胶囊按钮避让
 *
 * ⚠ Taro pxTransform 陷阱：style 里的数字值会被按 designWidth 自动换算成 rpx，
 * 而 statusBarHeight / 胶囊坐标是物理 px，必须用带 'px' 的字符串传入
 * （如 height: `${navBarHeight}px`）才能原样透传到 wxss。
 */
import Taro from '@tarojs/taro'

export interface NavMetrics {
  statusBarHeight: number
  navBarHeight: number
  menuHeight: number
  menuWidth: number
  menuRight: number
  /** 胶囊右侧到屏幕右沿的距离，用作左右对称 padding */
  sidePad: number
  /** 状态栏与胶囊间距 */
  gap: number
}

export function getNavMetrics(): NavMetrics {
  const win = Taro.getWindowInfo()
  const menu = Taro.getMenuButtonBoundingClientRect()
  const statusBarHeight = win.statusBarHeight ?? 44
  const gap = menu.top - statusBarHeight
  const navBarHeight = gap * 2 + menu.height + statusBarHeight
  return {
    statusBarHeight,
    navBarHeight,
    menuHeight: menu.height,
    menuWidth: menu.width,
    menuRight: menu.right,
    sidePad: win.screenWidth - menu.right,
    gap,
  }
}
