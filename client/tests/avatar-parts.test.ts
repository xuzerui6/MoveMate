import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AVATAR_PARTS, AVATAR_PART_BY_ID, HAIR_HIDING_FACE_PARTS,
  avatarCoresEqual, decomposeOutfit, defaultCore, layerPlan, outfitLook,
} from '../src/features/motion/lib/avatarCatalog'
import type { AvatarLook } from '../src/features/motion/types'

const here = path.dirname(fileURLToPath(import.meta.url))
const assetsRoot = path.join(here, '../src/features/motion/assets/avatars')

/** 解析服务端目录文本（defs('slot', 'GROUP', [[id, unlock], ...])），与客户端逐项对账 */
function parseServerCatalog() {
  const text = readFileSync(path.join(here, '../../server/src/utils/avatar-parts.ts'), 'utf8')
  const found = new Map<string, { slot: string; group: string; rarity: string }>()
  const blockRe = /defs\('(\w+)', '(\w)', \[([\s\S]*?)\]\)/g
  for (const block of text.matchAll(blockRe)) {
    const [, slot, group, body] = block
    for (const entry of body.matchAll(/\['([\w-]+)', '(\w+)'\]/g)) {
      found.set(entry[1], { slot, group, rarity: entry[2] })
    }
  }
  return found
}

test('client and server part catalogs are identical mirrors', () => {
  const server = parseServerCatalog()
  assert.equal(server.size, 59, 'server catalog should hold 59 parts')
  assert.equal(AVATAR_PARTS.length, 59, 'client catalog should hold 59 parts')
  for (const part of AVATAR_PARTS) {
    const mirror = server.get(part.id)
    assert.ok(mirror, `server catalog missing ${part.id}`)
    assert.equal(mirror.slot, part.slot, `${part.id} slot`)
    assert.equal(mirror.group, part.group, `${part.id} group`)
    assert.equal(mirror.rarity, part.rarity, `${part.id} rarity`)
  }
  for (const id of server.keys()) assert.ok(AVATAR_PART_BY_ID[id], `client catalog missing ${id}`)
})

test('every catalog part and base has both gender asset files', () => {
  for (const part of AVATAR_PARTS) {
    for (const gender of ['male', 'female']) {
      const file = path.join(assetsRoot, 'parts', part.slot, `${part.id}-${gender}.png`)
      assert.ok(existsSync(file), `missing asset ${file}`)
    }
  }
  for (const gender of ['male', 'female']) {
    for (const skin of ['fair', 'natural', 'wheat']) {
      assert.ok(existsSync(path.join(assetsRoot, 'bases', `body-${gender}-${skin}.png`)), `missing A base ${gender}/${skin}`)
    }
    assert.ok(existsSync(path.join(assetsRoot, 'bases', `bodyB-${gender}-natural.png`)), `missing B base ${gender}`)
    for (const face of ['genki', 'calm']) {
      assert.ok(existsSync(path.join(assetsRoot, 'bases', `base-${gender}-${face}.png`)), `missing flattened base ${gender}/${face}`)
    }
  }
})

test('decomposed outfits only use parts their unlockers necessarily own', () => {
  const outfitRarity: Record<string, string> = {
    default: 'N', sea_runner: 'R', penguin: 'R', violet_court: 'SR', sakura: 'SR', sunlight_explorer: 'SSR', sunset_sakura: 'SSR',
  }
  const tierRank: Record<string, number> = { N: 0, R: 1, SR: 2, SSR: 3, firstwin: 99 }
  for (const [outfit, rarity] of Object.entries(outfitRarity)) {
    const core = decomposeOutfit(outfit as any)
    for (const [slot, partId] of Object.entries(core.parts)) {
      if (!partId) continue
      const part = AVATAR_PART_BY_ID[partId]
      assert.ok(part, `${outfit} decomposes to unknown part ${partId}`)
      assert.equal(part.slot, slot, `${outfit}/${partId} slot`)
      assert.equal(part.group, core.group, `${outfit}/${partId} group`)
      // 衣裤鞋是套装的标志件，必须正好是套装档位；其余件只能更低档（人人可得），
      // 唯一例外是企鹅被兜帽盖住的发型（不渲染，服务端对藏发发型免所有权校验）
      if (slot === 'top' || slot === 'pants' || slot === 'shoes') {
        assert.equal(part.rarity, rarity, `${outfit}/${partId} should inherit the outfit tier`)
      } else if (!(outfit === 'penguin' && slot === 'hair')) {
        assert.ok(tierRank[part.rarity] <= tierRank[rarity], `${outfit}/${partId} must be owned by anyone who unlocked the outfit`)
      }
    }
    // 必戴槽位齐全（企鹅的发型被兜帽盖住也要有兜帽本身）
    assert.ok(core.parts.top && core.parts.pants && core.parts.shoes, `${outfit} must-wear layers`)
    assert.ok(core.parts.hair || (core.parts.face && HAIR_HIDING_FACE_PARTS.has(core.parts.face)), `${outfit} hair or hiding face part`)
    if (core.group === 'B') assert.equal(core.parts.eyes, null, `${outfit} B group has baked eyes`)
  }
})

test('layer plan follows the template stacking order and hides hair under hoods and bandanas', () => {
  const custom = (parts: Record<string, string | null>): AvatarLook => ({
    v: 1, mode: 'custom',
    custom: { group: 'A', face: 'genki', skin: 'wheat', parts: { hair: 'hair-default', eyes: 'eyes-green', glasses: 'glasses-black', face: null, top: 'top-default', pants: 'pants-default', shoes: 'shoes-default', ...parts } as any },
  })
  assert.equal(layerPlan(outfitLook('default')), null, 'outfit looks render as whole images')
  const full = layerPlan(custom({ face: 'face-star' }))
  assert.deepEqual(full?.partIds, ['shoes-default', 'pants-default', 'top-default', 'hair-default', 'eyes-green', 'glasses-black', 'face-star'])
  assert.equal(full?.skin, 'wheat')
  for (const hiding of ['face-hood', 'face-bandana']) {
    const plan = layerPlan(custom({ face: hiding }))
    assert.ok(plan && !plan.partIds.includes('hair-default'), `${hiding} must hide the hair layer`)
    assert.equal(plan?.partIds.at(-1), hiding)
  }
  const noExtras = layerPlan(custom({ glasses: null }))
  assert.deepEqual(noExtras?.partIds, ['shoes-default', 'pants-default', 'top-default', 'hair-default', 'eyes-green'])
  const bPlan = layerPlan({ v: 1, mode: 'custom', custom: defaultCore('B') })
  assert.deepEqual(bPlan?.partIds, ['shoes-sakuraB', 'pants-sakuraB', 'top-sakuraB', 'hair-sakuraB'])
})

test('default cores are valid starting points for both groups', () => {
  for (const group of ['A', 'B'] as const) {
    const core = defaultCore(group)
    const plan = layerPlan({ v: 1, mode: 'custom', custom: core })
    assert.ok(plan && plan.partIds.length >= 4)
    for (const partId of plan.partIds) assert.equal(AVATAR_PART_BY_ID[partId].group, group)
  }
})

test('avatarCoresEqual: returning to the saved combination reads as unchanged', () => {
  const saved = decomposeOutfit('violet_court')
  // 草稿换了发型再换回来（且部件记录的键序被重排过）——仍是同一套搭配
  const roundTrip = JSON.parse(JSON.stringify(saved))
  roundTrip.parts = Object.fromEntries(Object.entries(saved.parts).reverse())
  roundTrip.parts.hair = 'hair-default'
  assert.equal(avatarCoresEqual(roundTrip, saved), false, 'a different hairstyle is a change')
  roundTrip.parts.hair = saved.parts.hair
  assert.equal(avatarCoresEqual(roundTrip, saved), true, 'picking the original part back restores equality regardless of key order')
  assert.equal(avatarCoresEqual(saved, JSON.parse(JSON.stringify(saved))), true, 'a deep copy equals the original')
  assert.equal(avatarCoresEqual({ ...saved, skin: 'wheat' }, saved), false, 'skin change counts')
  assert.equal(avatarCoresEqual({ ...saved, face: 'calm' }, saved), false, 'face change counts')
  assert.equal(avatarCoresEqual(defaultCore('A'), defaultCore('B')), false, 'group change counts')
  assert.equal(
    avatarCoresEqual({ ...saved, parts: { ...saved.parts, glasses: null } }, { ...saved, parts: { ...saved.parts, glasses: 'glasses-black' } }),
    false, 'null vs a worn part counts',
  )
})
