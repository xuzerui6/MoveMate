import assert from 'node:assert/strict';

export async function voicePoolTests(t, { mf, call, tokens, adminToken, sockets, password, migrate }) {
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
  await t.test('operator voice-settings action snapshots and configures behind the migration secret only', async () => {
    // 只有普通登录 token、没有迁移密钥：路由器先验密钥，进不来
    assert.equal((await call('/api/migration/voice-settings', { token: tokens[0], headers: { Connection: 'close' } })).status, 401);
    const before = await migrate('voice-settings');
    assert.equal(before.status, 200, JSON.stringify(before.data));
    assert.deepEqual(before.data.settings, { enabled: false, quotaConfirmed: true, validationUsers: [] });
    assert.equal(before.data.devices.length, 5);
    assert.ok(before.data.devices.every(d => d.state === 'bound' && d.enabled === true && d.verified === false), JSON.stringify(before.data.devices));
    assert.equal(before.data.leases, (await actor.voiceLeaseRows()).length);
    assert.ok(!JSON.stringify(before.data).includes('identity'), '快照不许带密封身份');
    // 与管理员 PATCH 完全同一条校验：账号不存在、超量、形状不对、设备未验证时开总开关，都必须被拒
    const ghost = await migrate('voice-settings', { validationUsers: [999999] });
    assert.equal(ghost.status, 409); assert.match(ghost.data.error, /验证账号不存在/);
    const tooMany = await migrate('voice-settings', { validationUsers: [1, 2, 3, 4, 5, 6] });
    assert.equal(tooMany.status, 409); assert.match(tooMany.data.error, /最多五个/);
    const badShape = await migrate('voice-settings', { enabled: 'yes' });
    assert.equal(badShape.status, 409); assert.match(badShape.data.error, /Invalid voice-settings input/);
    const premature = await migrate('voice-settings', { enabled: true });
    assert.equal(premature.status, 409); assert.match(premature.data.error, /没有通过隔离验证的可用设备/);
    assert.equal((await migrate('voice-settings')).data.settings.enabled, false, '被拒的开启不许留下半成品设置');
    // 正常路径：写入后回读一致；设备验证通过后总开关能开
    const set = await migrate('voice-settings', { validationUsers: [1] });
    assert.equal(set.status, 200, JSON.stringify(set.data));
    assert.deepEqual(set.data.settings.validationUsers, [1]);
    for (let slot = 1; slot <= 5; slot++) await admin(`/devices/${slot}`, { verified: true });
    const on = await migrate('voice-settings', { enabled: true });
    assert.equal(on.status, 200, JSON.stringify(on.data));
    assert.equal(on.data.settings.enabled, true);
    const after = await migrate('voice-settings');
    assert.equal(after.data.settings.enabled, true);
    assert.ok(after.data.devices.every(d => d.verified === true));
    // 收尾恢复关闭态
    assert.equal((await migrate('voice-settings', { enabled: false, validationUsers: [] })).status, 200);
  });
  await t.test('operator voice-device actions create and flag devices behind the migration secret only', async () => {
    // 路由器先验迁移密钥：只有登录 token、或错误的 Bearer，都进不来
    assert.equal((await call('/api/migration/voice-device-create', { token: tokens[0], method: 'POST', body: { slot: 5 }, headers: { Connection: 'close' } })).status, 401);
    assert.equal((await call('/api/migration/voice-device-flags', { token: tokens[0], method: 'POST', body: { slot: 5, enabled: true }, headers: { Connection: 'close' } })).status, 401);
    assert.equal((await call('/api/migration/voice-device-create', { method: 'POST', body: { slot: 5 }, headers: { Authorization: 'Bearer ' + 'w'.repeat(64), Connection: 'close' } })).status, 401);
    // 先用管理员 DELETE 把 5 号位重置成空位，运维通道才有空位可建
    assert.equal((await admin('/devices/5', undefined, 'DELETE')).status, 200);
    let snap = await migrate('voice-settings');
    assert.deepEqual(snap.data.devices[4], { slot: 5, state: 'empty', enabled: false, verified: false });
    // 空位上：轮询激活被拒（还没生成激活码）、启用未绑定设备被拒——与管理端同一句话、同一 409
    const earlyActivate = await migrate('voice-device-create', { slot: 5, activate: true });
    assert.equal(earlyActivate.status, 409); assert.match(earlyActivate.data.error, /请先生成激活码/);
    const earlyFlags = await migrate('voice-device-flags', { slot: 5, enabled: true });
    assert.equal(earlyFlags.status, 409); assert.match(earlyFlags.data.error, /设备尚未绑定/);
    const noSlot = await migrate('voice-device-flags', { slot: 9, enabled: true });
    assert.equal(noSlot.status, 409); assert.match(noSlot.data.error, /设备位置不存在/);
    // 创建：假上游直接下发连接配置，设备当场 bound；返回与管理端同一份快照形状（含 activation 字段）
    const created = await migrate('voice-device-create', { slot: 5 });
    assert.equal(created.status, 200, JSON.stringify(created.data));
    assert.equal(created.data.maxConnections, 5);
    const device = created.data.devices[4];
    assert.equal(device.slot, 5); assert.equal(device.bound, true); assert.equal(device.state, 'unverified');
    assert.ok('activation' in device, '创建响应须带 activation 字段（真上游未激活时为 {code, expiresAt}）');
    assert.equal(device.activation, null, '假上游即时激活时 activation 为 null');
    const rawCreated = JSON.stringify(created.data); for (const key of ['identity', 'deviceId', 'clientId', 'challenge', 'synthetic-test-token']) assert(!rawCreated.includes(key), key);
    snap = await migrate('voice-settings');
    assert.deepEqual(snap.data.devices[4], { slot: 5, state: 'bound', enabled: false, verified: false });
    // 同一位置重复创建：与管理端同一句拒绝；激活轮询在已 bound 设备上可重复调用（输码后的确认步骤）
    const duplicate = await migrate('voice-device-create', { slot: 5 });
    assert.equal(duplicate.status, 409); assert.match(duplicate.data.error, /该位置已有设备，请先重置/);
    const polled = await migrate('voice-device-create', { slot: 5, activate: true });
    assert.equal(polled.status, 200, JSON.stringify(polled.data)); assert.equal(polled.data.devices[4].bound, true);
    // 标记：启用 + 验证，响应为运维快照形状且回读一致
    const flagged = await migrate('voice-device-flags', { slot: 5, enabled: true, verified: true });
    assert.equal(flagged.status, 200, JSON.stringify(flagged.data));
    assert.deepEqual(flagged.data.devices[4], { slot: 5, state: 'bound', enabled: true, verified: true });
    assert.deepEqual(Object.keys(flagged.data).sort(), ['devices', 'leases', 'settings']);
    // 完整解锁演练：额度确认 + 验证名单就绪后，名单内账号能真的经 acquire() 租到设备
    assert.equal((await actor.voiceLeaseRows()).length, 0);
    const configured = await migrate('voice-settings', { quotaConfirmed: true, validationUsers: [1] });
    assert.equal(configured.status, 200, JSON.stringify(configured.data));
    const lease = await acquire(tokens[0]);
    assert.equal(lease.status, 200, JSON.stringify(lease.data));
    assert.equal((await migrate('voice-settings')).data.leases, 1);
    await release(lease, tokens[0]);
    await settle(async () => (await actor.voiceLeaseRows()).length === 0);
    // 收尾恢复关闭态
    assert.equal((await migrate('voice-settings', { enabled: false, validationUsers: [] })).status, 200);
  });
}
