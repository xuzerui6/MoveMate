import { test } from 'node:test';
import assert from 'node:assert/strict';
import client from '../src/api/client';
import * as bossApi from '../src/api/bossFight';

/* Envelope regression for the boss-fight API layer.
 * The axios response interceptor returns the response BODY, so api functions
 * receive the {code,message,data} envelope and must resolve to the inner
 * payload exactly once. The mock below mimics the interceptor output.
 * (Same failure class as fetchGameMeta: API-level checks read body.data by
 * hand and pass, while the real UI consumer gets the envelope and breaks.) */

const snapshot = {
  id: 'fight-1',
  game_id: 6,
  boss_id: 'aoye_yanshi',
  boss_name: '熬夜魇狮',
  movement: 'squat',
  status: 'gathering',
  max_hp: 160,
  hp: 160,
  version: 1,
  duration_sec: 600,
  created_by: 7,
  created_at: '2026-11-13T15:00:00.000Z',
  started_at: null,
  ends_at: null,
  ended_at: null,
  server_ts: 1760000000000,
  participants: [],
  my_reward: null,
};

function stubClient(resolved: unknown) {
  const originalGet = client.get;
  const originalPost = client.post;
  (client as any).get = async () => resolved;
  (client as any).post = async () => resolved;
  return () => {
    (client as any).get = originalGet;
    (client as any).post = originalPost;
  };
}

test('boss api resolves to the inner payload, not the envelope', async () => {
  const restore = stubClient({ code: 0, message: 'ok', data: snapshot });
  try {
    for (const call of [
      () => bossApi.createFight(6, { movement: 'squat', bossId: 'aoye_yanshi', durationSec: 600 }),
      () => bossApi.fetchFight(6),
      () => bossApi.joinFight(6),
      () => bossApi.linkSession(6, 'sess-1'),
      () => bossApi.setReady(6, true),
      () => bossApi.startFight(6),
      () => bossApi.leaveFight(6),
    ]) {
      const result: any = await call();
      assert.equal(result, snapshot, 'result must be the payload object itself');
      assert.equal(result.status, 'gathering');
      assert.equal(result.code, undefined, 'envelope field leaked into the result');
    }
    const latency: any = await bossApi.fetchFightLatency(6);
    assert.equal(latency, snapshot, 'latency call shares the same unwrap path');
  } finally {
    restore();
  }
});

test('fetchFight resolves to null when the envelope data is null (no fight yet)', async () => {
  const restore = stubClient({ code: 0, message: 'ok', data: null });
  try {
    const result = await bossApi.fetchFight(6);
    assert.equal(result, null, 'must be null, not the envelope object');
  } finally {
    restore();
  }
});

test('a payload that carries its own data field is not descended into twice', async () => {
  const payload = { fight_id: 'fight-1', samples: 3, processing_ms: null, data: 'inner-marker' };
  const restore = stubClient({ code: 0, message: 'ok', data: payload });
  try {
    const result: any = await bossApi.fetchFightLatency(6);
    assert.equal(result, payload, 'only the envelope layer may be stripped');
    assert.equal(result.samples, 3);
  } finally {
    restore();
  }
});
