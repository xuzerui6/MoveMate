/**
 * 驱动小程序读取页面内容（代替截图验证）
 * 用法：node scripts/inspect.cjs
 */
const automator = require('miniprogram-automator')
const net = require('net')

const PORT = 9420

function checkPort(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1')
    s.once('connect', () => { s.destroy(); resolve(true) })
    s.once('error', () => { s.destroy(); resolve(false) })
  })
}

async function textOf(page, sel) {
  try {
    const el = await page.$(sel)
    return el ? (await el.text()) : `[not found: ${sel}]`
  } catch (e) {
    return `[err: ${sel} -> ${e.message}]`
  }
}

async function main() {
  if (!(await checkPort(PORT))) {
    console.error('[fail] auto instance not running, run scripts/debug.cjs first')
    process.exit(1)
  }
  const mp = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${PORT}` })
  console.log('[ok] connected')

  const page = await mp.currentPage()
  console.log('[ok] page:', page.path)

  // 大厅页内容
  console.log('\n=== 大厅页 ===')
  console.log('导航栏标题:', await textOf(page, '.navbar__title'))
  console.log('定位行:', await textOf(page, '.lobby__loc-text'))
  console.log('范围 chips:', await textOf(page, '.lobby__scope'))
  console.log('运动筛选提示:', await textOf(page, '.filter-bar__hint'))

  const chips = await page.$$('.filter-bar .chip')
  console.log('运动筛选 chip 数:', chips.length)
  const chipTexts = []
  for (const c of chips.slice(0, 6)) chipTexts.push(await c.text())
  console.log('前 6 个:', chipTexts.join(' / '))

  const dateBar = await page.$$('.lobby__date-bar .chip')
  console.log('日期筛选 chip:', dateBar.length, '个')

  const cards = await page.$$('.game-card')
  console.log('局卡片数:', cards.length)
  if (cards.length > 0) {
    const t = await cards[0].text()
    console.log('第 1 张卡片内容:\n', t.replace(/\n/g, ' | ').slice(0, 200))
  }

  const fab = await page.$('.fab')
  console.log('发布 FAB:', fab ? await fab.text() : '[not found]')

  await mp.disconnect()
  console.log('[ok] disconnected')
}

main().catch((e) => {
  console.error('[fail]', e.stack || e)
  process.exit(1)
})
