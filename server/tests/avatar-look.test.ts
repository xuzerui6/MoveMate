import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';

const temporary = mkdtempSync(path.join(tmpdir(), 'dajju-look-tests-'));
Object.assign(process.env, {
  SQLITE_PATH: path.join(temporary, 'test.db'), JWT_SECRET: 'isolated-test-secret-at-least-32-characters',
  STUDENT_ID_SALT: 'isolated-test-salt-at-least-32-characters', SMTP_USER: '', SMTP_PASS: '', ADMIN_EMAIL: '',
  ENV_FILE: path.join(temporary, 'absent.env'), NODE_ENV: 'test',
  AI_BASE_URL: '', AI_API_KEY: '', XIAOZHI_IDENTITY_MODE: 'disabled',
});
const { pool } = require('../src/db');
const { AuthService } = require('../src/services/auth.service');
const { createCode } = require('../src/services/verify-code.service');
const motion = require('../src/services/motion.service');
const { avatarDisplay } = require('../src/services/avatar.service');
const { server, io } = require('../src/app');
let base: string;

before(async () => {
  await pool.query('SELECT 1');
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = 'http://127.0.0.1:' + (server.address() as any).port;
});
after(async () => { await new Promise<void>((resolve) => io.close(() => resolve())); });

async function request(route: string, data?: any, token?: string, method = data ? 'POST' : 'GET') {
  const response = await fetch(base + '/api/v1' + route, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  return { status: response.status, body: await response.json() as any };
}
async function account(name: string) {
  const email = name + '@mails.jlu.edu.cn';
  return AuthService.register({ email, nickname: name, password: 'TestPass123', campus_id: 1, verify_code: await createCode(email) });
}
async function finishSessions(userId: number, count: number, score = 100) {
  for (let i = 0; i < count; i += 1) {
    const row = await motion.createSession(userId, { sportType: 'squat', source: 'camera' });
    await motion.sessionAction(row.id, userId, 'finish', { reps: 3, formScore: score });
  }
}
const coreA = (patch: Record<string, any> = {}) => ({
  group: 'A', face: 'genki', skin: 'natural',
  parts: { hair: 'hair-default', eyes: 'eyes-green', glasses: null, face: null, top: 'top-default', pants: 'pants-default', shoes: 'shoes-default', ...patch },
});
const coreB = (patch: Record<string, any> = {}) => ({
  group: 'B', face: 'genki', skin: 'natural',
  parts: { hair: 'hair-sakuraB', eyes: null, glasses: null, face: null, top: 'top-sakuraB', pants: 'pants-sakuraB', shoes: 'shoes-sakuraB', ...patch },
});

test('legacy accounts derive an outfit look and own only the free parts', async () => {
  const owner = await account('look-legacy');
  const state = await motion.trainingState(owner.user.id);
  assert.deepEqual(state.avatarLook, { v: 1, mode: 'outfit', outfit: 'default' });
  assert.equal(state.unlockedParts['hair-default'], true);
  assert.equal(state.unlockedParts['glasses-black'], true);
  assert.equal(state.unlockedParts['face-bandana'], true);
  assert.equal(state.unlockedParts['hair-dye'], false);
  assert.equal(state.unlockedParts['hair-silver'], false);
  assert.equal(state.unlockedParts['eyes-moon'], false);
  assert.equal(state.unlockedParts['top-penguinB'], false);
});

test('custom look saves, persists per account and rides the real HTTP envelope', async () => {
  const owner = await account('look-save'), other = await account('look-save-other');
  const look = { v: 1, mode: 'custom', custom: coreA({ glasses: 'glasses-black', face: 'face-bandaid', hair: null }) };
  // 头巾/创可贴不藏头发？face-bandaid 不是藏发件，hair 为空应被拒绝 —— 先验证这条，再用头巾版保存
  await assert.rejects(motion.updateAvatar(owner.user.id, { avatarLook: look }), /发型/);
  look.custom.parts.face = 'face-bandana';
  const response = await request('/training/avatar', { avatarLook: look }, owner.token, 'PATCH');
  assert.equal(response.status, 200);
  assert.equal(response.body.code, 0);
  assert.equal(response.body.message, 'success');
  // 服务端归一化后会带上（可能为空的）预设位数组
  const stored = { ...look, presets: [] };
  assert.deepEqual(response.body.data.avatarLook, stored);
  assert.deepEqual((await motion.trainingState(owner.user.id)).avatarLook, stored);
  // 另一个账号不受影响
  assert.deepEqual((await motion.trainingState(other.user.id)).avatarLook, { v: 1, mode: 'outfit', outfit: 'default' });
  // 展示口径（打怪成员列表用）带上 look
  const display = await avatarDisplay(owner.user.id);
  assert.deepEqual(display.look, stored);
  assert.equal(display.outfit, 'default');
});

test('look validation rejects locked parts, wrong slots, wrong groups and missing layers', async () => {
  const owner = await account('look-validate');
  // 新账号：绝稀有与首胜专属部件都没解锁
  await assert.rejects(motion.updateAvatar(owner.user.id, { avatarLook: { v: 1, mode: 'custom', custom: coreA({ hair: 'hair-platinum' }) } }), /未解锁/);
  await assert.rejects(motion.updateAvatar(owner.user.id, { avatarLook: { v: 1, mode: 'custom', custom: coreA({ eyes: 'eyes-moon' }) } }), /未解锁/);
  // 解锁稀有+珍稀档后做结构校验（B 组部件此时已拥有，不会被所有权检查抢先拦下）
  await finishSessions(owner.user.id, 3, 100);
  await assert.rejects(motion.updateAvatar(owner.user.id, { avatarLook: { v: 1, mode: 'custom', custom: coreA({ hair: 'top-default' }) } }), /不匹配/);
  await assert.rejects(motion.updateAvatar(owner.user.id, { avatarLook: { v: 1, mode: 'custom', custom: coreA({ top: 'top-sakuraB' }) } }), /同一套模板/);
  // B 组没有任何眼睛部件可选：塞 A 组的眼睛进来先撞组别校验（B 眼睛自带规则在校验器里兜底）
  await assert.rejects(motion.updateAvatar(owner.user.id, { avatarLook: { v: 1, mode: 'custom', custom: coreB({ eyes: 'eyes-green' }) } }), /同一套模板/);
  await assert.rejects(motion.updateAvatar(owner.user.id, { avatarLook: { v: 1, mode: 'custom', custom: coreA({ top: null }) } }), /上衣/);
  await assert.rejects(motion.updateAvatar(owner.user.id, { avatarLook: { v: 1, mode: 'custom', custom: coreA({ eyes: null }) } }), /眼睛/);
  await assert.rejects(motion.updateAvatar(owner.user.id, { avatarLook: { v: 1, mode: 'custom', custom: coreA({ hair: 'hair-nope' }) } }), /不存在/);
  await assert.rejects(motion.updateAvatar(owner.user.id, { avatarLook: { v: 1, mode: 'sideways', custom: coreA() } }), /形象数据/);
  // B 组基底只有自然肤色：传别的肤色被服务端收口成自然色而不是拼出不存在的图；版本号也被归一化
  const coerced = await motion.updateAvatar(owner.user.id, { avatarLook: { v: 2, mode: 'custom', custom: coreB({ skin: 'fair' }) } });
  assert.equal(coerced.avatarLook.v, 1);
  assert.equal(coerced.avatarLook.custom.skin, 'natural');
});

test('unlocked outfits decompose into owned parts; first-win parts need the souvenir', async () => {
  const owner = await account('look-unlock');
  await finishSessions(owner.user.id, 3, 100);
  const state = await motion.trainingState(owner.user.id);
  assert.equal(state.unlockedOutfits.penguin, true);
  assert.equal(state.unlockedOutfits.sakura, true);
  // 企鹅/樱花整套拆出的部件全部归本人所有
  for (const id of ['top-penguinB', 'pants-penguinB', 'shoes-penguinB', 'face-hoodB', 'top-sakuraB', 'pants-sakuraB', 'shoes-sakuraB', 'hair-sakuraB', 'face-hood', 'top-wave']) {
    assert.equal(state.unlockedParts[id], true, id);
  }
  assert.equal(state.unlockedParts['eyes-moon'], false);
  const saved = await motion.updateAvatar(owner.user.id, { avatarLook: { v: 1, mode: 'custom', custom: coreB({ face: 'face-hoodB', hair: null }) } });
  assert.equal(saved.avatarLook.custom.parts.face, 'face-hoodB');
  assert.equal(saved.avatarLook.custom.parts.hair, null);
  // 首胜部件：先拒绝，发纪念品后放行
  await assert.rejects(motion.updateAvatar(owner.user.id, { avatarLook: { v: 1, mode: 'custom', custom: coreA({ eyes: 'eyes-moon' }) } }), /未解锁/);
  await pool.query('INSERT INTO avatar_souvenirs(user_id,item_id,source,source_id,granted_at) VALUES($1,$2,$3,NULL,$4)', [owner.user.id, 'aoye_yanshi_medal', 'boss_fight', new Date().toISOString()]);
  const after = await motion.trainingState(owner.user.id);
  assert.equal(after.unlockedParts['eyes-moon'], true);
  assert.equal(after.unlockedParts['face-moonprint'], true);
  await motion.updateAvatar(owner.user.id, { avatarLook: { v: 1, mode: 'custom', custom: coreA({ eyes: 'eyes-moon', face: 'face-moonprint' }) } });
});

test('a penguin-only owner can save the penguin decomposition despite its hidden sakura hair', async () => {
  const owner = await account('look-penguin-only');
  await finishSessions(owner.user.id, 3, 80);
  const state = await motion.trainingState(owner.user.id);
  assert.equal(state.unlockedOutfits.penguin, true);
  assert.equal(state.unlockedOutfits.sakura, false);
  assert.equal(state.unlockedParts['hair-sakuraB'], false);
  // 兜帽盖住发型时不渲染，不要求拥有这件发型（企鹅拆件口径；衣裤鞋用已拥有的企鹅件）
  const saved = await motion.updateAvatar(owner.user.id, { avatarLook: { v: 1, mode: 'custom', custom: coreB({ face: 'face-hoodB', top: 'top-penguinB', pants: 'pants-penguinB', shoes: 'shoes-penguinB' }) } });
  assert.equal(saved.avatarLook.custom.parts.face, 'face-hoodB');
  assert.equal(saved.avatarLook.custom.parts.hair, 'hair-sakuraB');
  // 摘下兜帽后同一件发型恢复所有权校验（衣裤鞋都换成已拥有的企鹅件，只剩发型一件未解锁）
  await assert.rejects(motion.updateAvatar(owner.user.id, { avatarLook: { v: 1, mode: 'custom', custom: coreB({ top: 'top-penguinB', pants: 'pants-penguinB', shoes: 'shoes-penguinB' }) } }), /未解锁/);
});

test('outfit-mode look syncs the legacy outfit column and presets survive, bad presets drop', async () => {
  const owner = await account('look-presets');
  await finishSessions(owner.user.id, 3, 100);
  const withPreset = await motion.updateAvatar(owner.user.id, {
    avatarLook: { v: 1, mode: 'outfit', outfit: 'sakura', presets: [coreB(), { group: 'A', face: 'genki', skin: 'fair', parts: { hair: 'hair-platinum', eyes: 'eyes-green', glasses: null, face: null, top: 'top-default', pants: 'pants-default', shoes: 'shoes-default' } }, null] },
  });
  assert.equal(withPreset.activeOutfit, 'sakura');
  assert.equal(withPreset.avatarLook.mode, 'outfit');
  assert.equal(withPreset.avatarLook.outfit, 'sakura');
  assert.deepEqual(withPreset.avatarLook.presets[0], coreB());
  // 第二格预设里有未解锁的绝稀有部件 → 整格作废，不连累保存本身
  assert.equal(withPreset.avatarLook.presets[1], null);
  assert.equal(withPreset.avatarLook.presets[2], null);
  // 只改套装（旧客户端口径）时，已有预设不丢
  const outfitOnly = await motion.updateAvatar(owner.user.id, { activeOutfit: 'penguin' });
  assert.equal(outfitOnly.avatarLook.mode, 'outfit');
  assert.equal(outfitOnly.avatarLook.outfit, 'penguin');
  assert.deepEqual(outfitOnly.avatarLook.presets[0], coreB());
});

test('missing avatar_look column is repaired on existing databases with rows preserved', async () => {
  const owner = await account('look-repair');
  await motion.updateAvatar(owner.user.id, { avatarLook: { v: 1, mode: 'custom', custom: coreA() } });
  const copy = path.join(temporary, 'look-legacy.db');
  await pool.query('VACUUM INTO $1', [copy]);
  const legacy = new DatabaseSync(copy);
  legacy.exec('ALTER TABLE motion_profiles DROP COLUMN avatar_look');
  const profilesBefore = legacy.prepare('SELECT user_id,active_outfit FROM motion_profiles ORDER BY user_id').all();
  legacy.close();
  const repair = spawnSync(process.execPath, ['--import', 'tsx', '-e', "require('./src/db').pool.query('SELECT 1').then(()=>process.exit(0)).catch(()=>process.exit(1))"], { cwd: process.cwd(), encoding: 'utf8', timeout: 15000, env: { ...process.env, SQLITE_PATH: copy } });
  assert.equal(repair.status, 0, repair.stderr);
  const repaired = new DatabaseSync(copy, { readOnly: true });
  assert.ok((repaired.prepare('PRAGMA table_info(motion_profiles)').all() as any[]).some((c) => c.name === 'avatar_look'));
  assert.deepEqual(repaired.prepare('SELECT user_id,active_outfit FROM motion_profiles ORDER BY user_id').all(), profilesBefore);
  const restored = repaired.prepare('SELECT avatar_look FROM motion_profiles WHERE user_id=?').get(owner.user.id) as any;
  assert.equal(restored.avatar_look, '');
  repaired.close();
});
