/**
 * 通过 automator.launch 拉起微信开发者工具 auto 模式实例 → 连接 → 当前页截图
 * 用法：node scripts/launch.cjs
 */
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')

const SHOTS = path.join(__dirname, '..', 'shots')
fs.mkdirSync(SHOTS, { recursive: true })

async function main() {
  console.log('[..] launching wechat devtools (auto mode)...')
  const miniProgram = await automator.launch({
    projectPath: 'D:/搭个局/miniapp',
    cliPath: 'C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat',
    timeout: 180000,
  })
  console.log('[ok] launched & connected')

  const page = await miniProgram.currentPage()
  console.log('[ok] current page:', page.path)

  const shot = await miniProgram.screenshot()
  const out = path.join(SHOTS, 'launch.png')
  fs.writeFileSync(out, shot)
  console.log('[ok] screenshot ->', out)

  await miniProgram.disconnect()
  console.log('[ok] disconnected')
}

main().catch((e) => {
  console.error('[fail]', e.message || e)
  process.exit(1)
})
