/**
 * 微信开发者工具自动化连接验证 —— 连接 → 当前页 → 截图
 * 用法：node scripts/verify.mjs
 * 前置：微信开发者工具已导入 miniapp 项目，且设置→安全设置→服务端口已开启（端口见工具显示）
 */
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')

const PORT = process.env.DT_PORT || '31623'
const SHOTS = path.join(__dirname, '..', 'shots')
fs.mkdirSync(SHOTS, { recursive: true })

async function main() {
  const miniProgram = await automator.connect({ wsEndpoint: `http://127.0.0.1:${PORT}` })
  console.log(`[ok] connected (port ${PORT})`)

  const page = await miniProgram.currentPage()
  console.log('[ok] current page:', page.path)

  const shot = await miniProgram.screenshot()
  fs.writeFileSync(path.join(SHOTS, 'current.png'), shot)
  console.log('[ok] screenshot -> shots/current.png')

  await miniProgram.disconnect()
  console.log('[ok] disconnected')
}

main().catch((e) => {
  console.error('[fail]', e.message || e)
  process.exit(1)
})
