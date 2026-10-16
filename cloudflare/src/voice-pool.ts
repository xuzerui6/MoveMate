import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { pool, withTransaction } from '../../server/src/db/pool';
import { createDeviceIdentity, cookieValue, type VirtualDeviceIdentity } from '../../server/src/xiaozhi/identity';
import { fetchOta, pollActivation } from '../../server/src/xiaozhi/ota';
import { verifyToken } from '../../server/src/utils/jwt';

export const LEASE_COOKIE = 'motion_buddy_voice_lease';
export const LEASE_MS = 45000;
export const IDLE_MS = 120000;
type Settings = { enabled: boolean; quotaConfirmed: boolean; validationUsers: number[] };
export class VoiceError extends Error { constructor(message: string, readonly status = 409) { super(message); } }
export type VoiceLease = { id: string; user_id: number; slot: number; client_id: string; connection_id?: string; phase: string; expires_at: number; last_activity: number; generation: string; is_test: number };
export type VoiceActor = { id: number; admin: boolean; token: string; exp: number };

export class VoicePool {
  constructor(private secret: string | undefined, private generation: string) {}
  private key() {
    if (!this.secret || this.secret.length < 32) throw new VoiceError('统一语音尚未配置，请联系管理员', 503);
    return createHash('sha256').update(this.secret).digest();
  }
  private seal(identity: VirtualDeviceIdentity, slot: number) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAAD(Buffer.from('voice-device:' + slot));
    const bytes = Buffer.concat([cipher.update(JSON.stringify(identity), 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), bytes].map(b => b.toString('base64url')).join('.');
  }
  private unseal(value: string, slot: number): VirtualDeviceIdentity {
    const [iv, tag, bytes] = value.split('.').map(b => Buffer.from(b, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', this.key(), iv); decipher.setAAD(Buffer.from('voice-device:' + slot)); decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(bytes), decipher.final()]).toString());
  }
  async actor(request: Request, cookie = false): Promise<VoiceActor> {
    const raw = cookie ? cookieValue({ headers: { cookie: request.headers.get('cookie') || '' } } as any, 'motion_account') : request.headers.get('Authorization')?.replace(/^Bearer /, '');
    let claims; try { claims = verifyToken(raw || ''); } catch { throw new VoiceError('请先登录动伴', 401); }
    const user = (await pool.query('SELECT id,is_admin FROM users WHERE id=$1', [claims.sub])).rows[0];
    if (!user) throw new VoiceError('登录已失效', 401);
    return { id: Number(user.id), admin: !!user.is_admin, token: raw!, exp: claims.exp! };
  }
  async settings(): Promise<Settings> {
    const row = (await pool.query("SELECT value FROM actor_meta WHERE key='voice_settings'")).rows[0];
    return row ? JSON.parse(row.value) : { enabled: false, quotaConfirmed: false, validationUsers: [] };
  }
  async restart() {
    // Ordinary voice sockets cannot hibernate. A new actor generation means their
    // old outgoing sockets were lost. Quarantine before reassigning the device.
    await pool.query("UPDATE voice_leases SET phase='closing',expires_at=$1 WHERE generation!=$2", [Date.now() + LEASE_MS, this.generation]);
  }
  async snapshot() {
    const settings = await this.settings();
    const rows = (await pool.query('SELECT d.*,l.user_id,l.is_test FROM voice_devices d LEFT JOIN voice_leases l ON l.slot=d.slot ORDER BY d.slot')).rows;
    return { ...settings, maxConnections: 5, configured: !!this.secret && this.secret.length >= 32, devices: rows.map(row => {
      let activation: VirtualDeviceIdentity['activation'];
      try { if (row.identity && row.state === 'activating') activation = this.unseal(row.identity, row.slot).activation; } catch {}
      return { slot: row.slot, state: row.user_id ? 'busy' : row.state === 'bound' ? !row.verified ? 'unverified' : row.enabled ? 'ready' : 'disabled' : row.state, enabled: !!row.enabled, verified: !!row.verified, bound: row.state === 'bound', occupiedBy: row.user_id || null, lastError: row.last_error, activation: activation ? { code: activation.code, expiresAt: activation.expiresAt } : null };
    }) };
  }
  async configure(input: any) {
    return withTransaction(async () => {
      const settings = await this.settings();
      if (typeof input.quotaConfirmed === 'boolean') settings.quotaConfirmed = input.quotaConfirmed;
      if (input.validationUsers !== undefined) {
        if (!Array.isArray(input.validationUsers) || input.validationUsers.length > 5 || input.validationUsers.some((id: unknown) => !Number.isSafeInteger(id) || Number(id) <= 0)) throw new VoiceError('验证账号须为最多五个有效用户 ID');
        for (const id of input.validationUsers) if (!(await pool.query('SELECT id FROM users WHERE id=$1', [id])).rows.length) throw new VoiceError('验证账号不存在');
        settings.validationUsers = [...new Set(input.validationUsers)] as number[];
      }
      if (typeof input.enabled === 'boolean') settings.enabled = input.enabled;
      if (settings.enabled) {
        this.key();
        if (!settings.quotaConfirmed) throw new VoiceError('请先确认当前小智免费额度允许所需设备和并发');
        if (!(await pool.query("SELECT slot FROM voice_devices WHERE state='bound' AND enabled=1 AND verified=1 LIMIT 1")).rowCount) throw new VoiceError('没有通过隔离验证的可用设备');
      }
      await pool.query("INSERT INTO actor_meta(key,value) VALUES('voice_settings',$1) ON CONFLICT(key) DO UPDATE SET value=$1", [JSON.stringify(settings)]);
      return settings;
    });
  }
  async bind(slot: number, create: boolean) {
    this.key();
    const row = await withTransaction(async () => {
      const existing = (await pool.query('SELECT * FROM voice_devices WHERE slot=$1', [slot])).rows[0];
      if (!existing) throw new VoiceError('设备位置不存在', 404);
      if ((await pool.query('SELECT id FROM voice_leases WHERE slot=$1', [slot])).rowCount) throw new VoiceError('设备仍被占用，请先停用并等待释放');
      if (create) {
        if (existing.identity) throw new VoiceError('该位置已有设备，请先重置');
        existing.identity = this.seal(createDeviceIdentity(), slot); existing.revision++;
        await pool.query("UPDATE voice_devices SET identity=$1,state='activating',revision=$2,last_error='',updated_at=$3 WHERE slot=$4", [existing.identity, existing.revision, Date.now(), slot]);
      }
      if (!existing.identity) throw new VoiceError('请先生成激活码');
      return existing;
    });
    const identity = this.unseal(row.identity, slot);
    try {
      if (!create && identity.activation && identity.activation.expiresAt > Date.now()) await pollActivation(identity);
      const ota = await fetchOta(identity);
      if (ota.activation?.code && ota.activation.challenge) {
        identity.activated = false;
        identity.activation = { code: ota.activation.code, challenge: ota.activation.challenge, message: ota.activation.message || '', expiresAt: Date.now() + Math.min(300000, ota.activation.timeout_ms || 300000) };
      } else {
        if (!ota.websocket?.url || !ota.websocket.token) throw new Error('小智未返回可用语音配置');
        identity.activated = true; delete identity.activation;
      }
      await withTransaction(async () => {
        const updated = await pool.query("UPDATE voice_devices SET identity=$1,state=$2,verified=CASE WHEN $2='activating' THEN 0 ELSE verified END,last_error='',updated_at=$3 WHERE slot=$4 AND revision=$5", [this.seal(identity, slot), identity.activated ? 'bound' : 'activating', Date.now(), slot, row.revision]);
        if (!updated.rowCount) throw new VoiceError('设备配置已改变，请刷新');
      });
    } catch (error) {
      await pool.query("UPDATE voice_devices SET last_error=$1,updated_at=$2 WHERE slot=$3 AND revision=$4", ['上游绑定检查失败，请稍后重试', Date.now(), slot, row.revision]);
      throw new VoiceError(error instanceof VoiceError ? error.message : '上游绑定检查失败，请稍后重试', 502);
    }
  }
  async changeDevice(slot: number, input: any, reset = false): Promise<string[]> {
    return withTransaction(async () => {
      const row = (await pool.query('SELECT * FROM voice_devices WHERE slot=$1', [slot])).rows[0];
      if (!row) throw new VoiceError('设备位置不存在', 404);
      const leases = (await pool.query('SELECT id FROM voice_leases WHERE slot=$1', [slot])).rows;
      if (reset) {
        if (leases.length) throw new VoiceError('请先停用设备，等待现有连接释放后重置');
        await pool.query("UPDATE voice_devices SET identity=NULL,state='empty',enabled=0,verified=0,last_error='',revision=revision+1,updated_at=$1 WHERE slot=$2", [Date.now(), slot]);
        return [];
      }
      const verified = typeof input.verified === 'boolean' ? input.verified : !!row.verified;
      const enabled = typeof input.enabled === 'boolean' ? input.enabled : !!row.enabled;
      if ((verified || enabled) && row.state !== 'bound') throw new VoiceError('设备尚未绑定');
      await pool.query('UPDATE voice_devices SET enabled=$1,verified=$2,updated_at=$3 WHERE slot=$4', [enabled ? 1 : 0, verified ? 1 : 0, Date.now(), slot]);
      return !enabled || !verified ? leases.map(row => String(row.id)) : [];
    });
  }
  private credential(lease: VoiceLease) {
    const payload = Buffer.from(JSON.stringify({ id: lease.id, userId: lease.user_id })).toString('base64url');
    return payload + '.' + createHmac('sha256', this.key()).update(payload).digest('base64url');
  }
  private credentialId(request: Request, userId: number) {
    try {
      const value = cookieValue({ headers: { cookie: request.headers.get('cookie') || '' } } as any, LEASE_COOKIE) || '';
      const [payload, signature] = value.split('.');
      const expected = createHmac('sha256', this.key()).update(payload).digest(), received = Buffer.from(signature, 'base64url');
      if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString());
      return parsed.userId === userId && typeof parsed.id === 'string' ? parsed.id : null;
    } catch { return null; }
  }
  async acquire(actor: VoiceActor, clientId: unknown, testSlot?: unknown) {
    this.key();
    if (typeof clientId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(clientId)) throw new VoiceError('语音页面标识无效', 400);
    const isTest = testSlot !== undefined;
    if (isTest && (!actor.admin || !Number.isInteger(testSlot) || Number(testSlot) < 1 || Number(testSlot) > 5)) throw new VoiceError('无设备测试权限', 403);
    return withTransaction(async () => {
      const settings = await this.settings(), validation = settings.validationUsers.includes(actor.id);
      if (!isTest && (!settings.quotaConfirmed || (!settings.enabled && !validation))) throw new VoiceError('统一语音尚未开放，当前可继续使用本地陪练', 503);
      const existing = (await pool.query('SELECT * FROM voice_leases WHERE user_id=$1', [actor.id])).rows[0] as VoiceLease | undefined;
      if (existing) {
        if (existing.phase === 'pending' && existing.client_id === clientId && existing.expires_at > Date.now() && existing.is_test === Number(isTest)) return existing;
        throw new VoiceError('你的语音已在另一页面开启，请先关闭原页面的语音');
      }
      const device = (await pool.query(`SELECT d.* FROM voice_devices d LEFT JOIN voice_leases l ON l.slot=d.slot
        WHERE d.state='bound' AND l.id IS NULL AND ${isTest ? 'd.slot=$1' : validation && !settings.enabled ? 'd.enabled=1' : 'd.enabled=1 AND d.verified=1'} ORDER BY d.slot LIMIT 1`, isTest ? [testSlot] : [])).rows[0];
      if (!device) {
        const ready = (await pool.query(`SELECT slot FROM voice_devices WHERE state='bound' AND ${isTest ? 'slot=$1' : validation && !settings.enabled ? 'enabled=1' : 'enabled=1 AND verified=1'} LIMIT 1`, isTest ? [testSlot] : [])).rowCount;
        throw new VoiceError(ready ? '语音陪练繁忙，请稍后重试' : '语音服务暂无可用设备，请联系管理员检查绑定和启用状态', ready ? 409 : 503);
      }
      const lease: VoiceLease = { id: randomUUID(), user_id: actor.id, slot: device.slot, client_id: clientId, phase: 'pending', expires_at: Date.now() + LEASE_MS, last_activity: Date.now(), generation: this.generation, is_test: Number(isTest) };
      await pool.query('INSERT INTO voice_leases(id,user_id,slot,client_id,phase,expires_at,last_activity,generation,is_test) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [lease.id, lease.user_id, lease.slot, lease.client_id, lease.phase, lease.expires_at, lease.last_activity, lease.generation, lease.is_test]);
      return lease;
    });
  }
  cookies(lease: VoiceLease, actor: VoiceActor): string[] {
    const secure = process.env.NODE_ENV === 'production' ? 'Secure; ' : '';
    return [`${LEASE_COOKIE}=${this.credential(lease)}; Path=/api/xiaozhi; Max-Age=3600; HttpOnly; ${secure}SameSite=Lax`, `motion_account=${actor.token}; Path=/api/xiaozhi; Max-Age=3600; HttpOnly; ${secure}SameSite=Lax`];
  }
  async claim(request: Request, actor: VoiceActor) {
    const id = this.credentialId(request, actor.id);
    return withTransaction(async () => {
      const lease = (await pool.query('SELECT * FROM voice_leases WHERE id=$1 AND user_id=$2', [id, actor.id])).rows[0] as VoiceLease | undefined;
      if (!lease || lease.phase !== 'pending' || lease.expires_at <= Date.now()) throw new VoiceError('语音会话已失效，请重新开启', 401);
      if (!(await this.allowed(lease, actor))) throw new VoiceError('该语音设备已停用', 403);
      const device = (await pool.query('SELECT identity FROM voice_devices WHERE slot=$1', [lease.slot])).rows[0];
      const connectionId = randomUUID();
      await pool.query("UPDATE voice_leases SET phase='connected',connection_id=$1,expires_at=$2 WHERE id=$3", [connectionId, Date.now() + LEASE_MS, lease.id]);
      return { lease, connectionId, identity: this.unseal(device.identity, lease.slot) };
    });
  }
  private async allowed(lease: VoiceLease, actor: VoiceActor) {
    const device = (await pool.query('SELECT * FROM voice_devices WHERE slot=$1', [lease.slot])).rows[0];
    if (!device || device.state !== 'bound') return false;
    if (lease.is_test) return actor.admin;
    const settings = await this.settings();
    return settings.quotaConfirmed && !!device.enabled && (settings.enabled ? !!device.verified : settings.validationUsers.includes(actor.id));
  }
  async heartbeat(id: string, connectionId: string, actor: VoiceActor, activity: number) {
    return withTransaction(async () => {
      const lease = (await pool.query('SELECT * FROM voice_leases WHERE id=$1 AND connection_id=$2', [id, connectionId])).rows[0] as VoiceLease | undefined;
      const current = (await pool.query('SELECT id,is_admin FROM users WHERE id=$1', [actor.id])).rows[0];
      if (!lease || !current || lease.phase !== 'connected' || lease.expires_at <= Date.now() || actor.exp * 1000 <= Date.now() || Date.now() - activity >= IDLE_MS || !(await this.allowed(lease, { ...actor, admin: !!current.is_admin }))) return false;
      await pool.query('UPDATE voice_leases SET expires_at=$1,last_activity=$2 WHERE id=$3 AND connection_id=$4', [Date.now() + LEASE_MS, activity, id, connectionId]);
      return true;
    });
  }
  async release(id: string, connectionId?: string) {
    if (connectionId) await pool.query('DELETE FROM voice_leases WHERE id=$1 AND connection_id=$2', [id, connectionId]);
    else await pool.query("DELETE FROM voice_leases WHERE id=$1 AND phase='pending'", [id]);
  }
  async releaseRequest(request: Request, actor: VoiceActor, leaseId: unknown) {
    const id = this.credentialId(request, actor.id);
    return id && id === leaseId ? id : null;
  }
  async deadlines() {
    const rows = (await pool.query('SELECT expires_at,last_activity FROM voice_leases')).rows;
    return rows.flatMap(row => [Number(row.expires_at), Number(row.last_activity) + IDLE_MS]);
  }
  async expired(): Promise<VoiceLease[]> {
    return (await pool.query('SELECT * FROM voice_leases WHERE expires_at<=$1 OR last_activity<=$2', [Date.now(), Date.now() - IDLE_MS])).rows;
  }
}
