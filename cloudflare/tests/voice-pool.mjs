import assert from 'node:assert/strict';

export async function voicePoolTests(t, { mf, call, tokens, adminToken, sockets, password }) {
  const ns = await mf.getDurableObjectNamespace('BACKEND');
  const actor = ns.get(ns.idFromName('test'));
  await actor.voiceMode('shared');
  const admin = (path = '', body, method = body ? 'PATCH' : 'GET') => call('/api/v1/admin/voice' + path, { token: adminToken, method, body, headers: { Connection: 'close' } });
  const acquire = (token, extra = {}) => call('/api/xiaozhi/device', { token, method: 'POST', body: { clientId: crypto.randomUUID(), ...extra }, headers: { Connection: 'close' } });
  const cookie = r => r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const open = async (r, extra = {}) => {
    const response = await mf.dispatchFetch('http://localhost/api/xiaozhi/socket', { headers: { Upgrade: 'websocket', Origin: 'http://localhost', Cookie: cookie(r), ...extra } });
    if (response.status !== 101) return { response, error: await response.text() };
    const ws = response.webSocket; ws.binaryType = 'arraybuffer'; ws.accept(); sockets.push(ws);
    const messages = []; let closed = false;
    ws.addEventListener('message', e => messages.push(e.data)); ws.addEventListener('close', () => { closed = true; try { ws.close(); } catch {} });
    const wait = async predicate => { for (let i = 0; i < 200; i++) { const ix = messages.findIndex(predicate); if (ix >= 0) return messages.splice(ix, 1)[0]; await new Promise(r => setTimeout(r, 10)); } throw new Error('pooled voice message timeout'); };
    await wait(m => typeof m === 'string' && JSON.parse(m).bridge === 'ready');
    ws.send(JSON.stringify({ type: 'hello' }));
    const hello = JSON.parse(await wait(m => typeof m === 'string' && JSON.parse(m).type === 'hello'));
    return { ws, wait, messages, hello, closed: () => closed, response };
  };
  const settle = async predicate => { for (let i = 0; i < 100; i++) { if (await predicate()) return; await new Promise(r => setTimeout(r, 10)); } assert.fail('lease recovery timed out'); };
  const release = (r, token, id = r.data.leaseId) => call('/api/xiaozhi/release', { token, method: 'POST', body: { leaseId: id }, headers: { Cookie: cookie(r), Connection: 'close' } });
  let leases = [], channels = [];

  await t.test('voice administration enforces current DB role and starts closed', async () => {
    assert.equal((await call('/api/v1/admin/voice')).status, 401);
    assert.equal((await call('/api/v1/admin/voice', { token: tokens[0] })).status, 403);
    const initial = await admin(); assert.equal(initial.status, 200); assert.equal(initial.data.data.enabled, false); assert.equal(initial.data.data.devices.length, 5);
    assert.equal((await acquire(tokens[0])).status, 503);
    assert.equal((await acquire(tokens[0], { testSlot: 1 })).status, 403);
    assert.equal((await admin('', { enabled: true })).status, 409);
  });
  await t.test('five encrypted devices bind without exposing identities or upstream tokens', async () => {
    for (let slot = 1; slot <= 5; slot++) {
      const bound = await admin(`/devices/${slot}/create`, {}, 'POST'); assert.equal(bound.status, 200, JSON.stringify(bound.data)); assert.equal(bound.data.data.devices[slot - 1].bound, true);
      assert.equal((await admin(`/devices/${slot}`, { enabled: true, verified: true })).status, 200);
    }
    assert.equal(await actor.encryptedDevices(), true);
    const raw = JSON.stringify((await admin()).data); for (const key of ['deviceId', 'clientId', 'synthetic-test-token', 'challenge', 'identity']) assert(!raw.includes(key), key);
    assert.equal((await admin('', { quotaConfirmed: true, enabled: true })).status, 200);
  });
  await t.test('five concurrent allocations are exclusive; sixth and second tab are busy', async () => {
    await actor.seedVoiceUsers();
    const extra = [];
    for (const id of [5, 6]) { const login = await call('/api/v1/auth/login', { method: 'POST', body: { email: `voice${id}@dajju.local`, password } }); assert.equal(login.status, 200); extra.push(login.data.data.token); }
    const all = [...tokens, ...extra];
    leases = await Promise.all(all.map(token => acquire(token)));
    assert(leases.every(r => r.status === 200), JSON.stringify(leases.map(r => r.data)));
    assert.equal(new Set((await actor.voiceLeaseRows()).map(r => r.slot)).size, 5);
    assert.equal((await acquire(adminToken)).status, 409);
    assert.equal((await acquire(tokens[0])).status, 409);
    assert.equal(leases[0].headers.getSetCookie().filter(c => /HttpOnly/.test(c)).length, 2);
    channels = await Promise.all(leases.map(r => open(r)));
    assert(channels.every(c => c.response.status === 101));
    assert.equal(new Set(channels.map(c => c.hello.session_id)).size, 5);
    channels[0].ws.send(JSON.stringify({ type: 'context-test', text: 'PRIVATE_ACCOUNT_ONE' }));
    await channels[0].wait(m => typeof m === 'string' && JSON.parse(m).text === 'PRIVATE_ACCOUNT_ONE');
    await new Promise(r => setTimeout(r, 40)); assert(channels.slice(1).every(c => !c.messages.some(m => String(m).includes('PRIVATE_ACCOUNT_ONE'))));
    for (const channel of channels) { channel.ws.send(new Uint8Array([3, 11, 99])); assert.deepEqual(new Uint8Array(await channel.wait(m => m instanceof ArrayBuffer)), new Uint8Array([3, 11, 99])); channel.ws.send(JSON.stringify({ bridge: 'ping' })); await channel.wait(m => typeof m === 'string' && JSON.parse(m).bridge === 'pong'); }
  });
  await t.test('WebSocket rejects foreign or missing credentials, origins and duplicate claims', async () => {
    for (const headers of [{ Origin: 'https://evil.invalid' }, { Cookie: '' }, { Cookie: cookie(leases[0]).replace(/motion_account=[^;]+/, 'motion_account=' + tokens[1]) }, { Cookie: cookie(leases[0]).replace('motion_buddy_voice_lease=', 'motion_buddy_voice_lease=invalid') }]) {
      // Miniflare's Node upgrade proxy resets rejected upgrade sockets. Exercise
      // the same pre-upgrade authentication gates through ordinary HTTP here.
      const result = await open(leases[0], { Upgrade: '', ...headers }); assert([401, 403].includes(result.response.status));
    }
    assert.equal((await open(leases[0], { Upgrade: '' })).response.status, 401);
    assert.equal((await call('/api/xiaozhi/activate', { token: tokens[0], method: 'POST', body: {}, headers: { Connection: 'close' } })).status, 409);
  });
  await t.test('release and delayed closes cannot release a new user lease', async () => {
    const old = (await actor.voiceLeaseRows()).find(r => r.id === leases[0].data.leaseId);
    assert.equal((await release(leases[0], tokens[0])).status, 200);
    await settle(async () => !(await actor.voiceLeaseRows()).some(r => r.id === old.id));
    const next = await acquire(tokens[0]); assert.equal(next.status, 200);
    await release(next, tokens[0], old.id); await actor.staleRelease(old.id, old.connection_id);
    assert((await actor.voiceLeaseRows()).some(r => r.id === next.data.leaseId));
    const resumed = await open(next); assert.equal(resumed.response.status, 101);
    await actor.staleRelease(next.data.leaseId, 'wrong-connection'); assert((await actor.voiceLeaseRows()).some(r => r.id === next.data.leaseId));
    leases[0] = next; channels[0] = resumed;
  });
  await t.test('disabled device closes both directions and reclaims its own lease', async () => {
    const current = (await actor.voiceLeaseRows()).find(r => r.id === leases[1].data.leaseId);
    assert.equal((await admin(`/devices/${current.slot}`, { enabled: false })).status, 200);
    await settle(async () => !(await actor.voiceLeaseRows()).some(r => r.id === current.id));
    assert(channels[1].closed()); assert.equal((await admin(`/devices/${current.slot}`, { enabled: true })).status, 200);
  });
  await t.test('45-second expiry, idle rejection and restart quarantine recover safely', async () => {
    const live = (await actor.voiceLeaseRows()).find(r => r.id === leases[0].data.leaseId);
    assert.equal(await actor.testIdle(live.id, live.connection_id, { id: 1, admin: false, exp: Math.floor(Date.now() / 1000) + 3600 }), false);
    await actor.ageVoiceLease(live.id); await actor.forceAlarm();
    await settle(async () => !(await actor.voiceLeaseRows()).some(r => r.id === live.id));
    for (const channel of channels) { try { channel.ws.close(); } catch {} }
    await settle(async () => (await actor.voiceLeaseRows()).length === 0);
    const pending = await acquire(tokens[0]); assert.equal(pending.status, 200);
    await actor.simulateVoiceRestart(); assert.equal((await acquire(tokens[0])).status, 409);
    await actor.ageVoiceLease(pending.data.leaseId); await actor.forceAlarm(); assert.equal((await actor.voiceLeaseRows()).length, 0);
    const after = await acquire(tokens[0]); assert.equal(after.status, 200); await release(after, tokens[0]);
  });
  await t.test('public-off validation is allowlisted and unverified devices never serve the public', async () => {
    assert.equal((await admin('', { enabled: false, validationUsers: [1] })).status, 200);
    for (let slot = 1; slot <= 5; slot++) await admin(`/devices/${slot}`, { verified: false });
    assert.equal((await acquire(tokens[1])).status, 503);
    const allowed = await acquire(tokens[0]); assert.equal(allowed.status, 200); await release(allowed, tokens[0]);
    assert.equal((await admin('', { enabled: true })).status, 409);
    assert.equal((await admin('', { validationUsers: [] })).status, 200);
    assert.equal((await acquire(tokens[0])).status, 503);
    const operator = await acquire(adminToken, { testSlot: 1 }); assert.equal(operator.status, 200); await release(operator, adminToken);
  });
}
