/**
 * 手动拉起微信开发者工具 auto 模式（绕过 .bat，直接 spawn node.exe cli.js）
 * → 等待端口就绪 → automator.connect → 截图
 * 用法：node scripts/launch2.cjs
 */
const automator = require('miniprogram-automator')
const { spawn } = require('child_process')
const net = require('net')
const fs = require('fs')
const path = require('path')

const TOOL_DIR = 'C:/Program Files (x86)/Tencent/微信web开发者工具'
const NODE = path.join(TOOL_DIR, 'node.exe')
const CLI = path.join(TOOL_DIR, 'cli.js')
const PROJECT = 'D:/搭个局/miniapp'
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

async function waitPort(port, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await checkPort(port)) return true
    await new Promise((r) => setTimeout(r, 1500))
  }
  return false
}

async function main() {
  console.log('[..] spawning devtools auto mode...')
  const child = spawn(NODE, [CLI, 'auto', '--project', PROJECT, '--auto-port', String(PORT)], { stdio: 'ignore' })
  child.on('error', (e) => console.error('[spawn err]', e.message))
  child.on('exit', (code) => console.log('[devtools exit]', code))

  console.log(`[..] waiting port ${PORT}...`)
  const up = await waitPort(PORT, 150000)
  if (!up) {
    throw new Error('port not up in time')
  }
  console.log('[ok] port up, connecting...')

  const miniProgram = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${PORT}` })
  console.log('[ok] connected')

  const page = await miniProgram.currentPage()
  console.log('[ok] current page:', page.path)

  const shot = await miniProgram.screenshot()
  const out = path.join(SHOTS, 'launch2.png')
  fs.writeFileSync(out, shot)
  console.log('[ok] screenshot ->', out)

  await miniProgram.disconnect()
  console.log('[ok] disconnected')
}

main().catch((e) => {
  console.error('[fail]', e.message || e)
  process.exit(1)
})
