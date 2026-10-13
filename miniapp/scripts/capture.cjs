/**
 * 连接已运行的 auto 实例 → 截图当前页（自动处理 base64/Buffer）→ 保存到 shots/
 * 用法：node scripts/capture.cjs <name>   （name 默认 current）
 */
const automator = require('miniprogram-automator')
const net = require('net')
const fs = require('fs')
const path = require('path')

const PORT = 9420
const SHOTS = path.join(__dirname, '..', 'shots')
fs.mkdirSync(SHOTS, { recursive: true })

function checkPort(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1')
    s.once('connect', () => { s.destroy(); resolve(true) })
    s.once('error', () => { s.destroy(); resolve(false) })
  })
}

function saveShot(shot, name) {
  const buf = Buffer.isBuffer(shot) ? shot : Buffer.from(shot, 'base64')
  const out = path.join(SHOTS, `${name}.png`)
  fs.writeFileSync(out, buf)
  return out
}

async function main() {
  const name = process.argv[2] || 'current'
  if (!(await checkPort(PORT))) {
    console.error('[fail] port not up, run scripts/debug.cjs first to launch auto instance')
    process.exit(1)
  }
  const mp = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${PORT}` })
  console.log('[ok] connected')
  const page = await mp.currentPage()
  console.log('[ok] page:', page.path)
  const out = saveShot(await mp.screenshot(), name)
  console.log('[ok] saved:', out)
  await mp.disconnect()
}

main().catch((e) => {
  console.error('[fail]', e.stack || e)
  process.exit(1)
})
