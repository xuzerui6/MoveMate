import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizePasswordForSubmit,
  passwordVisibilityToggleLabel,
} from '../src/pages/Login/password.ts';

const loginTsx = readFileSync(new URL('../src/pages/Login/Login.tsx', import.meta.url), 'utf8');
const loginCss = readFileSync(new URL('../src/pages/Login/Login.css', import.meta.url), 'utf8');

// 2026-11-13 真机事故：分发的同学密码从文件里复制粘贴进登录框，首/尾多带一个
// 看不见的空格，20 个字符变成 21 个，服务端逐字比对直接拒绝，页面只报
// 「邮箱或密码错误」。提交前必须裁掉首尾空白（只裁首尾，中间的空格是密码的一部分）。

test('a pasted password with a stray edge space normalizes back to the real password', () => {
  const real = 'Xk29dmQp48ZwNrT7sH1a'; // 20 个字符的分发密码
  assert.equal(normalizePasswordForSubmit(real + ' '), real);
  assert.equal(normalizePasswordForSubmit(' ' + real), real);
  assert.equal(normalizePasswordForSubmit('  ' + real + ' \n'), real);
  assert.equal(normalizePasswordForSubmit('\t' + real + '\t'), real);
  assert.equal(normalizePasswordForSubmit(real + '\r\n'), real);
});

test('normalization keeps inner spaces and leaves clean passwords untouched', () => {
  assert.equal(normalizePasswordForSubmit('my pass phrase'), 'my pass phrase');
  assert.equal(normalizePasswordForSubmit('abc 123 '), 'abc 123');
  assert.equal(normalizePasswordForSubmit('abc123'), 'abc123');
  assert.equal(normalizePasswordForSubmit(''), '');
  assert.equal(normalizePasswordForSubmit('   '), '');
});

test('registration and login normalize identically, so a password set one way enters the other way', () => {
  const setAtRegistration = normalizePasswordForSubmit(' hunter2x ');
  const typedAtLogin = normalizePasswordForSubmit('hunter2x');
  const pastedAtLogin = normalizePasswordForSubmit(' hunter2x\n');
  assert.equal(setAtRegistration, typedAtLogin);
  assert.equal(pastedAtLogin, typedAtLogin);
});

test('login and register both submit the normalized password, never the raw field value', () => {
  assert.match(loginTsx, /login\(\{ email: email\.trim\(\), password: submittedPassword \}\)/);
  assert.match(loginTsx, /password: submittedPassword,\n\s+nickname/);
  assert.doesNotMatch(loginTsx, /login\(\{ email: email\.trim\(\), password \}\)/);
  const declarations = loginTsx.match(/const submittedPassword = normalizePasswordForSubmit\(password\)/g) ?? [];
  assert.ok(declarations.length >= 2, 'validate() 与 handleSubmit() 都要先规范化密码');
});

test('validation judges the normalized password (empty check and register length)', () => {
  assert.match(loginTsx, /if \(!submittedPassword\)/);
  assert.match(loginTsx, /submittedPassword\.length < 6/);
});

test('password field has a working visibility toggle wired to the input type', () => {
  // 点眼睛在 password / text 之间切换，只改呈现不改内容（受控组件，值由 state 保留）
  assert.match(loginTsx, /type=\{passwordVisible \? 'text' : 'password'\}/);
  assert.match(loginTsx, /onClick=\{\(\) => setPasswordVisible\(\(v\) => !v\)\}/);
  assert.match(loginTsx, /aria-label=\{passwordVisibilityToggleLabel\(passwordVisible\)\}/);
  assert.match(loginTsx, /aria-pressed=\{passwordVisible\}/);
  assert.match(loginTsx, /from '@phosphor-icons\/react\/dist\/csr\/Eye'/);
  assert.match(loginTsx, /from '@phosphor-icons\/react\/dist\/csr\/EyeSlash'/);
  // 切换登录/注册时回到遮住状态，不把明文带进另一个模式
  assert.match(loginTsx, /setPasswordVisible\(false\)/);
  assert.equal(passwordVisibilityToggleLabel(false), '显示密码');
  assert.equal(passwordVisibilityToggleLabel(true), '隐藏密码');
});

test('toggle meets the 48px touch-target rule and the field reserves room for it', () => {
  assert.match(loginCss, /\.login-password-toggle\{[^}]*width:48px/);
  assert.match(loginCss, /\.login-password-toggle\{[^}]*min-height:48px/);
  assert.match(loginCss, /\.login-password-wrap \.form-input\{padding-right:52px\}/);
});
