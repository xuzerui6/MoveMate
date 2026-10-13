export default defineAppConfig({
  pages: [
    'pages/lobby/index',
    'pages/game-detail/index',
  ],
  window: {
    // 全局自定义导航栏：隐藏默认导航栏，右上角胶囊无法隐藏，由 NavBar 组件手动避让
    navigationStyle: 'custom',
    backgroundColor: '#F8FAFC',
    backgroundTextStyle: 'light',
  },
})
