import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  cameraErrorCopy,
  classifyCameraError,
  poseFailureCopy,
  type CameraErrorKind,
} from '../src/features/motion/lib/cameraStream.ts';

// 2026-11-14 打怪页摄像头事故：iOS Safari 上点「开启摄像头计数」永远
// 只回一句「检查一下权限」。根因在开启顺序（先等模型下载、后申请摄像
// 头，手势窗口已过期）与失败文案塌缩（识别层明明给出了具体原因，页面
// 却一律怪权限）。开启顺序在 BossFight.startCamera 里，靠手势时序、无
// 法在无渲染脚手架的套件里假装测；本测试锁住其中纯逻辑的失败分类与
// 文案映射：每一类失败都有自己的大白话，且绝不塌缩成同一句。

test('classifyCameraError separates denial, busy, missing device and the rest', () => {
  const named = (name: string) => { const e = new Error('x'); e.name = name; return e; };
  assert.equal(classifyCameraError(named('NotAllowedError')), 'denied');
  assert.equal(classifyCameraError(named('NotReadableError')), 'busy');
  assert.equal(classifyCameraError(named('NotFoundError')), 'no-device');
  assert.equal(classifyCameraError(named('OverconstrainedError')), 'no-device');
  assert.equal(classifyCameraError(new Error('camera-unsupported')), 'unsupported');
  assert.equal(classifyCameraError(named('AbortError')), 'other');
  assert.equal(classifyCameraError(null), 'other');
  assert.equal(classifyCameraError(undefined), 'other');
});

test('every failure kind has its own plain-language, actionable copy', () => {
  const kinds: CameraErrorKind[] = ['denied', 'busy', 'no-device', 'unsupported', 'other'];
  const copies = kinds.map((k) => cameraErrorCopy(k));
  // 五类五句，互不相同——不再塌缩成同一句「检查一下权限」
  assert.equal(new Set(copies).size, kinds.length);
  for (const copy of copies) {
    assert.match(copy, /[一-鿿]/);
    assert.ok(!/NotAllowedError|getUserMedia|permission denied/i.test(copy));
  }
  assert.match(cameraErrorCopy('denied'), /允许/);
  assert.match(cameraErrorCopy('busy'), /占/);
  assert.match(cameraErrorCopy('no-device'), /没找到/);
});

test('boss fight page keeps the camera surface mounted before the camera is on (source guard)', () => {
  // 双平台事故的根因不在任何异步时序里，而在渲染条件：camSurface 里藏着
  // 全页唯一的 <video>（PoseCanvas 内部），旧代码把它按 camOn 条件渲染，
  // 而 camOn 只有在开启成功之后才为真——于是每次开启时 videoRef 必为空，
  // 双引擎都在拿到流之后静默 return false，重试多少次都一样。套件没有
  // 渲染脚手架，这里按仓库既有 source-guard 惯例锁住这条挂载不变量。
  const src = readFileSync(new URL('../src/pages/BossFight/BossFight.tsx', import.meta.url), 'utf8');
  const surfaceDef = src.match(/const camSurface = ([\s\S]*?)\n  const header/);
  assert.ok(surfaceDef, 'camSurface definition found');
  assert.ok(!surfaceDef[1].trimStart().startsWith('camOn'), 'camSurface must not be gated on camOn');
  assert.ok(surfaceDef[1].includes('<PoseCanvas'), 'camSurface carries the PoseCanvas (and its <video>)');
  // 画面层在 idle 时走 standby 常驻，而不是不渲染
  assert.ok(src.includes('bf-cam-live--standby'), 'standby always-mounted layer is used');
  const css = readFileSync(new URL('../src/pages/BossFight/BossFight.css', import.meta.url), 'utf8');
  assert.ok(css.includes('.bf-cam-live--standby'), 'standby layer has offscreen styling');
});

test('poseFailureCopy prefers the pose layer’s specific reason, falls back by phase', () => {
  // 识别层给出的具体原因原样采用（它已经按权限/占用/模型写好了大白话）
  assert.equal(
    poseFailureCopy('camera', '摄像头无法读取，可能被其他应用占用，请关闭占用后重试。'),
    '摄像头无法读取，可能被其他应用占用，请关闭占用后重试。',
  );
  assert.equal(
    poseFailureCopy('model', '识别没能启动起来，歇一下再试一次。'),
    '识别没能启动起来，歇一下再试一次。',
  );
  // 没有具体原因时按阶段兜底：模型阶段不再怪到摄像头权限头上
  assert.match(poseFailureCopy('model', ''), /识别没能准备好/);
  assert.match(poseFailureCopy('model', null), /网络/);
  assert.match(poseFailureCopy('camera', undefined), /摄像头没能打开/);
  assert.match(poseFailureCopy(null, null), /摄像头没能打开/);
});
