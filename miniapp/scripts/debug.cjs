/** 调试：拉起 auto 实例 → connect → 打印完整错误栈 */
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

function checkPort(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1')
    s.once('connect', () => { s.destroy(); resolve(true) })
    s.once('error', () => { s.destroy(); resolve(false) })
  })
}
async function waitPort(port, ms) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    if (await checkPort(port)) return true
    await new Promise((r) => setTimeout(r, 1500))
  }
  return false
}
function withTimeout(p, ms, label) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout: ${label}`)), ms))])
}

async function main() {
  if (!(await checkPort(PORT))) {
    console.log('[..] spawning auto mode...')
    const child = spawn(NODE, [CLI, 'auto', '--project', PROJECT, '--auto-port', String(PORT)], { stdio: 'ignore' })
    child.on('error', (e) => console.log('[spawn err]', e.message))
    child.on('exit', (c) => console.log('[cli exit]', c))
    const up = await waitPort(PORT, 150000)
    console.log('[..] port up:', up)
    if (!up) { console.error('port never came up'); process.exit(1) }
  } else {
    console.log('[..] port already up')
  }

  try {
    const mp = await withTimeout(automator.connect({ wsEndpoint: `ws://127.0.0.1:${PORT}` }), 30000, 'connect')
    console.log('[ok] connected!')
    const page = await withTimeout(mp.currentPage(), 30000, 'currentPage')
    console.log('[ok] page:', page.path)
    const shot = await withTimeout(mp.screenshot(), 30000, 'screenshot')
    fs.mkdirSync(path.join(__dirname, '..', 'shots'), { recursive: true })
    fs.writeFileSync(path.join(__dirname, '..', 'shots', 'debug.png'), shot)
    console.log('[ok] shot saved')
    await mp.disconnect()
  } catch (e) {
    console.error('FULL ERROR:')
    console.error(e.stack || e)
  }
  process.exit(0)
}

main()
