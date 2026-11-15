import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The Workers voice bridge surfaces an upstream HTTP failure verbatim
// (pass-through) only when the thrown message matches the pairing regex in
// cloudflare/src/xiaozhi.ts; anything else degrades to a generic message.
// The two throw sites live in different files — the bridge itself and the
// shared OTA client (server/src/xiaozhi/ota.ts) — so a one-sided wording edit
// would silently break the pass-through. This guard reconstructs both
// messages from the actual throw templates in source and evaluates the
// actual matcher against them, so the pair can only move in lockstep.
export async function bridgeErrorPairingTests(t) {
  const bridge = await readFile(new URL('../src/xiaozhi.ts', import.meta.url), 'utf8');
  const ota = await readFile(new URL('../../server/src/xiaozhi/ota.ts', import.meta.url), 'utf8');

  const construct = (source, marker) => {
    const line = source.split('\n').find(l => l.includes(marker) && l.includes('throw new Error'));
    assert.ok(line, `throw site carrying "${marker}" must exist`);
    const template = line.match(/`([^`]*)`/)?.[1];
    assert.ok(template, 'throw site must use a template literal');
    return template.replace(/\$\{[^}]+\}/, '503');
  };

  const upstreamMessage = construct(bridge, '上游返回 HTTP');
  const otaMessage = construct(ota, 'OTA 返回 HTTP');

  const matcherLine = bridge.split('\n').find(l => l.includes('.test(error.message)'));
  assert.ok(matcherLine, 'bridge pass-through matcher must exist');
  const regexSource = matcherLine.match(/\/(.+)\/\.test\(error\.message\)/)?.[1];
  assert.ok(regexSource, 'matcher regex literal must be extractable');
  const matcher = new RegExp(regexSource);

  await t.test('bridge error pass-through pairing: both upstream throws match the matcher', () => {
    assert.ok(matcher.test(upstreamMessage), `matcher must pass through: ${upstreamMessage}`);
    assert.ok(matcher.test(otaMessage), `matcher must pass through: ${otaMessage}`);
    // The generic fallback and unrelated errors must NOT pass through.
    assert.ok(!matcher.test('上游语音连接失败，请稍后重试'), 'generic fallback must not pass through');
    assert.ok(!matcher.test('boom'), 'unrelated errors must not pass through');
    // Both throws share the neutral prefix and carry no vendor name.
    for (const message of [upstreamMessage, otaMessage]) {
      assert.ok(message.startsWith('语音服务'), `neutral prefix expected: ${message}`);
      assert.ok(!message.includes('小智'), `vendor name must not reach users: ${message}`);
    }
    assert.ok(!matcherLine.includes('小智'), 'matcher must not key on the vendor name');
    // The standalone socket-error message on the same bridge surface is neutral too.
    const socketErrorLine = bridge.split('\n').find(l => l.includes("bridge: 'error'"));
    assert.ok(socketErrorLine?.includes('语音服务上游连接失败'), 'socket error message must use the neutral wording');
    assert.ok(!socketErrorLine.includes('小智'), 'socket error message must not name the vendor');
  });
}
