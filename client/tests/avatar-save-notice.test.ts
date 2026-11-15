import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const avatar = fs.readFileSync(path.join(root, 'src/features/motion/pages/Avatar.tsx'), 'utf8');

/*
 * 回归（2026-11-15 审计 V1）：saveDraft / gender 曾把成功提示写在 if 之外——
 * setAvatarLook / setAvatarGender 返回 false（保存失败）时也照样弹「已保存」，
 * 用户以为存下了、刷新后形象消失。成功提示必须被成功分支的花括号包住，
 * 失败时必须给失败提示。storePreset / wear / clearPreset 本来就是对的。
 */
test('avatar save: success notice only fires inside the success branch (saveDraft)', () => {
  assert.match(
    avatar,
    /if\(await setAvatarLook\(\{v:1,mode:'custom',custom:draft,presets\}\)\)\{setLockNotice\(false\);setNotice\('形象已保存'\);\}/,
    'saveDraft 的「形象已保存」必须在 setAvatarLook 成功分支内',
  );
  assert.doesNotMatch(
    avatar,
    /setAvatarLook\(\{v:1,mode:'custom',custom:draft,presets\}\)\)setLockNotice\(false\);setNotice\('形象已保存'\)/,
    '无括号的旧写法（失败也弹已保存）不许回来',
  );
});

test('avatar save: success notice only fires inside the success branch (gender)', () => {
  assert.match(
    avatar,
    /if\(await setAvatarGender\(value\)\)\{setLockNotice\(false\);setNotice\('角色形象已保存'\);\}/,
    'gender 的「角色形象已保存」必须在 setAvatarGender 成功分支内',
  );
  assert.doesNotMatch(
    avatar,
    /setAvatarGender\(value\)\)setLockNotice\(false\);setNotice\('角色形象已保存'\)/,
    '无括号的旧写法（失败也弹已保存）不许回来',
  );
});

test('avatar save: a failed save surfaces a failure notice instead of silence or success', () => {
  const failures = avatar.match(/保存失败，请检查网络后重试/g) || [];
  assert.ok(failures.length >= 2, 'saveDraft 与 gender 失败时都要给失败提示');
});
