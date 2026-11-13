import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 语音路由守卫（老板 2026-11-13「全都用小智」）：
 * 客户端不许再有任何非小智的发声通道。神经 TTS / 浏览器合成一旦在
 * 任何文件里复活，这个测试先红——和 boss-fight 的隐私守卫同款思路。
 */

const SRC_ROOT = new URL('../src/', import.meta.url)

function walk(dir: URL, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir)
    if (entry.isDirectory()) walk(child, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(child.pathname)
  }
  return out
}

const read = (relative: string) => fs.readFileSync(new URL(relative, SRC_ROOT), 'utf8')

test('全客户端无非小智发声残留：speakText / speechSynthesis.speak / 神经 TTS 端点全部清零', () => {
  const banned = ['speakText', 'speechSynthesis.speak', 'SpeechSynthesisUtterance', '/ai/audio/speech', "lib/tts'", "from './tts'"]
  const files = walk(SRC_ROOT)
  assert.ok(files.length > 50, '守卫应扫到整个 client/src')
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    for (const token of banned) {
      assert.equal(text.includes(token), false, `${path.basename(file)} 不该再出现 ${token}`)
    }
  }
})

test('事件播报全部经小智播报器：bossSounds 与 useCoachVoice 的接线在位', () => {
  const boss = read('features/motion/lib/bossSounds.ts')
  assert.ok(boss.includes("from './xiaozhiAnnounce'"))
  assert.ok(boss.includes('speakAnnouncement'))
  assert.ok(boss.includes('primeXiaozhiAnnouncer'))
  assert.ok(boss.includes('stopXiaozhiAnnouncer'), '关声音/离页要释放播报会话')

  const coach = read('features/motion/hooks/useCoachVoice.ts')
  assert.ok(coach.includes('speakWithLifecycle'), '兼容引擎的 say 必须改道小智播报器')
  assert.equal(coach.includes('speechSynthesis'), false, '兼容引擎不许再碰浏览器合成')

  const xiaozhiCoach = read('features/motion/hooks/useXiaozhiCoach.ts')
  assert.ok(xiaozhiCoach.includes('cancelAnnouncement'), '静音/打断只许停播报器，不许回旧通道')
})

test('播报器本体：逐字通道、播放门与唯一开关都在', () => {
  const announcer = read('features/motion/lib/xiaozhiAnnounce.ts')
  assert.ok(announcer.includes("XIAOZHI_ANNOUNCE_ROUTE: 'xiaozhi' | 'off'"), '必须留一个明显的总开关')
  assert.ok(announcer.includes('deviceCallMessage'), '主动逐字发声只能走 [device_call] 通道')
  assert.ok(announcer.includes('normalize(pending.text).startsWith(normalize(heard))'), '播放门必须逐句验文本')

  const protocol = read('features/motion/lib/xiaozhiProtocol.ts')
  assert.ok(protocol.includes("DEVICE_CALL_PREFIX = '[device_call]'"))
})

test('打怪页：播报会话的释放接线与出画节流（900ms 持续 + 6s 一句）保持不变', () => {
  const page = read('pages/BossFight/BossFight.tsx')
  assert.ok(page.includes('releaseBossAudio()'), '离页/关声/结算后要释放播报会话')
  assert.ok(page.includes('>= 900'), '出画持续确认约 900ms 才报')
  assert.ok(page.includes('>= 6000'), '出画语音 6 秒最多一句')
})
