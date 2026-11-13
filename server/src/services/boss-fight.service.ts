/**
 * 组队打怪（附四一期）服务端权威实现。
 *
 * 关键口径（与方案一致，偏离处在交付报告中单独标注）：
 * - 一场打怪挂在一个组局（game）上，一期一只怪、一个动作（限一级可信名单）。
 * - 队员用的是独立摄像头计数（sport_sessions 中 game_id 为空的那种）：
 *   现有组局内运动被强制为个人计时（source='timer'、次数恒为 0），
 *   所以打怪通过 boss_fight_participants.session_id 把独立计数挂到本场打怪上，
 *   训练 XP 仍走独立训练的原有结算，一行不改。
 * - 伤害只来自服务端接受的次数增量（delta），永不来自评分。
 *   客户端上报的是累计次数；服务端按「物理速率上限」接受增量，
 *   未接受的部分留在差额里后续继续入账——不丢弃、不倒扣、不重复计。
 * - 胜负/发奖全部幂等：终局迁移用状态守卫 UPDATE，纪念物用发放账本 + 唯一键。
 * - 个人伤害数字只出现在本人视角的快照里（my_damage），广播快照不带任何人的伤害。
 */
import { randomUUID } from 'node:crypto';
import { pool, withTransaction, afterCommit } from '../db/pool';
import { NotFoundError, ForbiddenError, InvalidStateError, ValidationError } from '../utils/errors';
import { broadcastToGame } from '../websocket/notification.handler';
import {
  BOSS_CATALOG,
  MOVEMENT_TUNING,
  bossById,
  isTier1Movement,
  type Tier1Movement,
} from '../utils/avatar-shared';
import { avatarDisplay } from './avatar.service';

export const DEFAULT_BOSS_ID = BOSS_CATALOG[0].boss_id;
export const FIGHT_DURATION_SEC = 600;
export const MIN_FIGHTERS = 2;
export const MAX_FIGHTERS = 6;
/** 附四定标原则的落地系数：按「少算一个人」的人数再打八折，含一名低输出成员也能赢 */
export const HP_KINDNESS_FACTOR = 0.8;
/** 速率上限的突发宽容：断线/停顿超过 2 秒后的首笔上报额外放行这么多下 */
export const RATE_BURST_ALLOWANCE = 3;
/** 单笔上报最多回放 30 秒的积压（防「先挂机再一次性灌入」的跳变灌伤） */
export const RATE_WINDOW_CAP_MS = 30_000;
/** 胜局已定后，队员的计数在怪被打倒后 24 小时内正常结束仍可领纪念物（崩溃/断网恢复不背锅） */
export const SETTLE_GRACE_MS = 24 * 60 * 60 * 1000;

export function computeMaxHp(movement: string, teamSize: number, durationSec: number): number {
  const tuning = MOVEMENT_TUNING[movement as Tier1Movement];
  const contributors = Math.max(1, teamSize - 1);
  return Math.max(10, Math.round(tuning.baseRepsPerMin * (durationSec / 60) * contributors * HP_KINDNESS_FACTOR));
}

type Db = Pick<typeof pool, 'query'>;

interface FightRow {
  id: string;
  game_id: number;
  boss_id: string;
  movement: string;
  status: string;
  max_hp: number;
  hp: number;
  version: number;
  duration_sec: number;
  created_by: number;
  created_at: string;
  started_at: string | null;
  ends_at: string | null;
  ended_at: string | null;
  settle_key: string | null;
  settled_at: string | null;
}

interface ParticipantRow {
  fight_id: string;
  user_id: number;
  ready: number;
  status: string;
  session_id: string | null;
  baseline_reps: number;
  accepted_reps: number;
  last_report_at: string | null;
  joined_at: string;
}

const TERMINAL_GAME_STATUSES = ['completed', 'cancelled', 'archived'];
const iso = (ms: number) => new Date(ms).toISOString();

async function loadGame(db: Db, gameId: number) {
  const game = (await db.query<any>('SELECT * FROM games WHERE id = $1', [gameId])).rows[0];
  if (!game) throw new NotFoundError('运动局不存在');
  return game;
}

async function requireMember(db: Db, gameId: number, userId: number, needCheckIn: boolean) {
  const member = (await db.query<{ checked_in_at: string | null }>(
    'SELECT checked_in_at FROM game_members WHERE game_id = $1 AND user_id = $2 AND left_at IS NULL',
    [gameId, userId],
  )).rows[0];
  if (!member) throw new ForbiddenError('只有本局成员可以参加打怪');
  if (needCheckIn && !member.checked_in_at) throw new InvalidStateError('先签到才能参加打怪');
  return member;
}

async function loadOpenFight(db: Db, gameId: number): Promise<FightRow | null> {
  const fight = (await db.query<FightRow>(
    `SELECT * FROM boss_fights WHERE game_id = $1 AND status IN ('gathering', 'fighting') ORDER BY created_at DESC LIMIT 1`,
    [gameId],
  )).rows[0];
  return fight || null;
}

async function loadLatestFight(db: Db, gameId: number): Promise<FightRow | null> {
  const fight = (await db.query<FightRow>(
    'SELECT * FROM boss_fights WHERE game_id = $1 ORDER BY created_at DESC LIMIT 1',
    [gameId],
  )).rows[0];
  return fight || null;
}

async function loadParticipant(db: Db, fightId: string, userId: number): Promise<ParticipantRow | null> {
  const part = (await db.query<ParticipantRow>(
    'SELECT * FROM boss_fight_participants WHERE fight_id = $1 AND user_id = $2',
    [fightId, userId],
  )).rows[0];
  return part || null;
}

/** 终局迁移：状态守卫保证并发/重试下只有第一个调用者真正迁移（幂等结算的地基） */
async function transitionFight(
  db: Db,
  fight: FightRow,
  to: 'won' | 'escaped' | 'aborted',
  endedAtIso: string,
): Promise<FightRow | null> {
  const updated = (await db.query<FightRow>(
    `UPDATE boss_fights
     SET status = $2, ended_at = $3, settle_key = $4, settled_at = $3, version = version + 1
     WHERE id = $1 AND status IN ('gathering', 'fighting') RETURNING *`,
    // 参数顺序必须与占位符一一对应：$3 是结束时间、$4 才是结算键。
    // 曾经写反过：ended_at 里存了 "won:<uuid>"、settle_key 里存了时间戳，
    // 导致 Date.parse(ended_at)=NaN、24 小时领奖宽限永不触发（有回归测试盯着）。
    [fight.id, to, endedAtIso, `${to}:${fight.id}`],
  )).rows[0];
  return updated || null;
}

/** 胜局结算：建发放账本（没挂计数的队员直接过期——没有证据链就不发奖，房主也不能手动补发） */
async function settleWin(db: Db, fight: FightRow, endedAtIso: string): Promise<FightRow | null> {
  const won = await transitionFight(db, fight, 'won', endedAtIso);
  if (!won) return null;
  const boss = bossById(won.boss_id) || BOSS_CATALOG[0];
  const participants = (await db.query<ParticipantRow>(
    'SELECT * FROM boss_fight_participants WHERE fight_id = $1',
    [won.id],
  )).rows;
  for (const part of participants) {
    await db.query(
      `INSERT INTO boss_fight_rewards (fight_id, user_id, item_id, status, created_at)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (fight_id, user_id, item_id) DO NOTHING`,
      [won.id, part.user_id, boss.souvenir_item_id, part.session_id ? 'pending' : 'expired', endedAtIso],
    );
  }
  return won;
}

/**
 * 纪念物实际发放：胜局队员的计数在宽限期内「正常结束并结算」才落袋。
 * 可重复调用（胜局瞬间、队员结束计数时、读状态时都会调），靠账本状态 + 收藏唯一键保证只发一次。
 */
export async function tryGrantRewards(fight: FightRow): Promise<number> {
  if (fight.status !== 'won' || !fight.ended_at) return 0;
  const pending = (await pool.query<any>(
    `SELECT * FROM boss_fight_rewards WHERE fight_id = $1 AND status = 'pending'`,
    [fight.id],
  )).rows;
  let granted = 0;
  for (const reward of pending) {
    const part = await loadParticipant(pool, fight.id, reward.user_id);
    if (!part?.session_id) continue;
    const session = (await pool.query<{ status: string; settled: number; ended_at: string | null }>(
      'SELECT status, settled, ended_at FROM sport_sessions WHERE id = $1',
      [part.session_id],
    )).rows[0];
    if (!session || session.status !== 'finished' || !session.settled || !session.ended_at) continue;
    if (Date.parse(session.ended_at) > Date.parse(fight.ended_at) + SETTLE_GRACE_MS) {
      await pool.query(
        `UPDATE boss_fight_rewards SET status = 'expired' WHERE id = $1 AND status = 'pending'`,
        [reward.id],
      );
      continue;
    }
    await pool.query(
      `INSERT INTO avatar_souvenirs (user_id, item_id, source, source_id, granted_at)
       VALUES ($1, $2, 'boss_fight', $3, $4) ON CONFLICT (user_id, item_id) DO NOTHING`,
      [reward.user_id, reward.item_id, fight.id, iso(Date.now())],
    );
    const marked = await pool.query(
      `UPDATE boss_fight_rewards SET status = 'granted', granted_at = $2 WHERE id = $1 AND status = 'pending' RETURNING id`,
      [reward.id, iso(Date.now())],
    );
    if (marked.rows.length) granted++;
  }
  if (granted > 0) afterCommit(() => { void broadcastFightSnapshot(fight.id); });
  return granted;
}

/** 懒迁移：没有服务端 tick，超时/局结束都在下一次读或写时顺手落定 */
async function refreshFight(db: Db, fight: FightRow): Promise<FightRow> {
  if (fight.status !== 'gathering' && fight.status !== 'fighting') return fight;
  const game = (await db.query<{ status: string }>('SELECT status FROM games WHERE id = $1', [fight.game_id])).rows[0];
  if (!game || TERMINAL_GAME_STATUSES.includes(game.status)) {
    const aborted = await transitionFight(db, fight, 'aborted', iso(Date.now()));
    if (aborted) afterCommit(() => { void broadcastFightSnapshot(fight.id); });
    return aborted || fight;
  }
  if (fight.status === 'fighting' && fight.ends_at && Date.now() > Date.parse(fight.ends_at)) {
    const escaped = await transitionFight(db, fight, 'escaped', fight.ends_at);
    if (escaped) afterCommit(() => { void broadcastFightSnapshot(fight.id); });
    return escaped || fight;
  }
  return fight;
}

async function buildSnapshot(fight: FightRow, viewerId: number | null) {
  const parts = (await pool.query<ParticipantRow & { nickname: string }>(
    `SELECT p.*, u.nickname FROM boss_fight_participants p
     JOIN users u ON u.id = p.user_id
     WHERE p.fight_id = $1 ORDER BY p.joined_at ASC`,
    [fight.id],
  )).rows;
  const participants = [];
  for (const part of parts) {
    const entry: Record<string, unknown> = {
      user_id: part.user_id,
      nickname: part.nickname,
      ready: Boolean(part.ready),
      status: part.status,
      has_session: Boolean(part.session_id),
      avatar: await avatarDisplay(part.user_id),
    };
    // 个人伤害只给自己看：广播快照 viewerId 为空，谁的伤害都不带
    if (viewerId != null && Number(part.user_id) === viewerId) entry.my_damage = part.accepted_reps;
    participants.push(entry);
  }
  let myReward: Record<string, unknown> | null = null;
  if (viewerId != null) {
    const reward = (await pool.query<{ item_id: string; status: string }>(
      'SELECT item_id, status FROM boss_fight_rewards WHERE fight_id = $1 AND user_id = $2',
      [fight.id, viewerId],
    )).rows[0];
    if (reward) myReward = { item_id: reward.item_id, status: reward.status };
  }
  const boss = bossById(fight.boss_id);
  return {
    id: fight.id,
    game_id: fight.game_id,
    boss_id: fight.boss_id,
    boss_name: boss?.name || fight.boss_id,
    movement: fight.movement,
    status: fight.status,
    max_hp: fight.max_hp,
    hp: fight.hp,
    version: fight.version,
    duration_sec: fight.duration_sec,
    created_by: fight.created_by,
    created_at: fight.created_at,
    started_at: fight.started_at,
    ends_at: fight.ends_at,
    ended_at: fight.ended_at,
    server_ts: Date.now(),
    participants,
    my_reward: myReward,
  };
}

export async function broadcastFightSnapshot(fightId: string): Promise<void> {
  try {
    const fight = (await pool.query<FightRow>('SELECT * FROM boss_fights WHERE id = $1', [fightId])).rows[0];
    if (!fight) return;
    const snapshot = await buildSnapshot(fight, null);
    broadcastToGame(fight.game_id, 'boss_fight_update', snapshot);
  } catch (error) {
    console.error('[boss-fight] broadcast failed', error);
  }
}

function scheduleBroadcast(fightId: string) {
  afterCommit(() => { void broadcastFightSnapshot(fightId); });
}

async function validateSessionLink(db: Db, fight: FightRow, userId: number, sessionId: string) {
  const session = (await db.query<any>('SELECT * FROM sport_sessions WHERE id = $1', [sessionId])).rows[0];
  if (!session || Number(session.user_id) !== userId) throw new NotFoundError('没找到这次计数');
  if (session.source !== 'camera') throw new ValidationError('打怪要用摄像头计数，不能用计时或演示');
  if (session.sport_type !== fight.movement) throw new ValidationError('这次计数的动作和本场打怪的动作对不上');
  if (!['running', 'paused'].includes(session.status)) throw new ValidationError('这次计数已经结束了，重新开始一次再挂上来');
  const clash = (await db.query<{ fight_id: string }>(
    'SELECT fight_id FROM boss_fight_participants WHERE session_id = $1',
    [sessionId],
  )).rows[0];
  if (clash && clash.fight_id !== fight.id) throw new ValidationError('这次计数已经挂在另一场打怪上了');
  return session;
}

// ---------------------------------------------------------------
// 对外操作（HTTP 路由调用）
// ---------------------------------------------------------------

export async function createFight(
  gameId: number,
  creatorId: number,
  input: { movement?: string; bossId?: string; durationSec?: number },
) {
  const movement = String(input.movement || '');
  if (!isTier1Movement(movement)) {
    throw new ValidationError('这个动作暂时不能用来打怪，先用深蹲、开合跳、俯卧撑或高抬腿');
  }
  // 开放门禁（老板 2026-11-13 拍板）：只有目录里标了 availability='fight' 的怪能建场；
  // 图鉴/周怪/活动怪绕过客户端直接调接口也建不出来，纪念章不会被提前刷走。
  // 未知 bossId 沿用旧口径回落到默认怪；默认怪 kunkun 在目录里显式标了 fight，不受影响。
  const boss = (input.bossId && bossById(input.bossId)) || bossById(DEFAULT_BOSS_ID)!;
  if (boss.availability !== 'fight') {
    throw new ValidationError(`「${boss.name}」还没开放，暂时不能发起挑战`);
  }
  const bossId = boss.boss_id;
  const durationSec = Math.min(1800, Math.max(60, Math.floor(Number(input.durationSec) || FIGHT_DURATION_SEC)));
  return withTransaction(async (client) => {
    const game = await loadGame(client, gameId);
    if (Number(game.host_id) !== creatorId) throw new ForbiddenError('只有本局发起人可以发起打怪');
    if (game.status !== 'in_progress') throw new InvalidStateError('活动开始后才能发起打怪');
    await requireMember(client, gameId, creatorId, true);
    const existing = await loadOpenFight(client, gameId);
    if (existing) {
      const refreshed = await refreshFight(client, existing);
      if (refreshed.status === 'gathering' || refreshed.status === 'fighting') {
        throw new InvalidStateError('本局已经有一场打怪了');
      }
    }
    const now = iso(Date.now());
    const fight = (await client.query<FightRow>(
      `INSERT INTO boss_fights (id, game_id, boss_id, movement, status, duration_sec, created_by, created_at)
       VALUES ($1, $2, $3, $4, 'gathering', $5, $6, $7) RETURNING *`,
      [randomUUID(), gameId, bossId, movement, durationSec, creatorId, now],
    )).rows[0];
    await client.query(
      `INSERT INTO boss_fight_participants (fight_id, user_id, ready, status, joined_at)
       VALUES ($1, $2, 0, 'joined', $3)`,
      [fight.id, creatorId, now],
    );
    scheduleBroadcast(fight.id);
    return buildSnapshot(fight, creatorId);
  });
}

export async function joinFight(gameId: number, userId: number, input: { sessionId?: string }) {
  return withTransaction(async (client) => {
    await loadGame(client, gameId);
    let fight = await loadOpenFight(client, gameId);
    if (!fight) throw new NotFoundError('本局还没有打怪');
    fight = await refreshFight(client, fight);
    if (fight.status !== 'gathering') throw new InvalidStateError('已经开打了，没法中途加入');
    await requireMember(client, gameId, userId, true);
    const existing = await loadParticipant(client, fight.id, userId);
    if (!existing) {
      const count = (await client.query<{ n: number }>(
        `SELECT COUNT(*) AS n FROM boss_fight_participants WHERE fight_id = $1 AND status = 'joined'`,
        [fight.id],
      )).rows[0];
      if (Number(count?.n || 0) >= MAX_FIGHTERS) throw new InvalidStateError('队伍满了，最多 6 个人一起打');
      await client.query(
        `INSERT INTO boss_fight_participants (fight_id, user_id, ready, status, joined_at)
         VALUES ($1, $2, 0, 'joined', $3)`,
        [fight.id, userId, iso(Date.now())],
      );
      await client.query('UPDATE boss_fights SET version = version + 1 WHERE id = $1', [fight.id]);
    }
    if (input.sessionId) await linkSessionInternal(client, fight, userId, input.sessionId);
    scheduleBroadcast(fight.id);
    const fresh = (await client.query<FightRow>('SELECT * FROM boss_fights WHERE id = $1', [fight.id])).rows[0];
    return buildSnapshot(fresh, userId);
  });
}

async function linkSessionInternal(db: Db, fight: FightRow, userId: number, sessionId: string) {
  const part = await loadParticipant(db, fight.id, userId);
  if (!part || part.status !== 'joined') throw new ForbiddenError('先加入队伍才能挂上计数');
  const session = await validateSessionLink(db, fight, userId, sessionId);
  let baseline = 0;
  if (fight.status === 'fighting') {
    if (part.session_id) {
      // 战斗中换绑/重绑：accepted_reps 是整场累计伤害（也是 my_damage 的口径），
      // delta 公式是「本场相对进度 − 已入账」。若只把基准换成新计数的当前值、
      // 却保留整场累计的 accepted，旧计数贡献的部分会被再扣一遍（增量变负、伤害被吞，
      // 反复重绑还能不断抬高基准抹掉待入账积压）。正确做法：把旧计数已经贡献的
      // 相对进度整体折进新基准——同一本账继续往下记，积压保留、已入账不重复。
      const prev = part.session_id === sessionId
        ? session
        : (await db.query<{ reps: number }>('SELECT reps FROM sport_sessions WHERE id = $1', [part.session_id])).rows[0];
      const prevContribution = Number(prev?.reps || 0) - Number(part.baseline_reps || 0);
      baseline = Number(session.reps || 0) - prevContribution;
    } else {
      baseline = Number(session.reps || 0);
    }
  }
  await db.query(
    'UPDATE boss_fight_participants SET session_id = $3, baseline_reps = $4 WHERE fight_id = $1 AND user_id = $2',
    [fight.id, userId, sessionId, baseline],
  );
}

export async function linkSession(gameId: number, userId: number, sessionId: string) {
  return withTransaction(async (client) => {
    await loadGame(client, gameId);
    let fight = await loadOpenFight(client, gameId);
    if (!fight) throw new NotFoundError('本局还没有打怪');
    fight = await refreshFight(client, fight);
    if (fight.status !== 'gathering' && fight.status !== 'fighting') throw new InvalidStateError('这场打怪已经结束了');
    await linkSessionInternal(client, fight, userId, sessionId);
    scheduleBroadcast(fight.id);
    return buildSnapshot(fight, userId);
  });
}

export async function setReady(gameId: number, userId: number, ready: boolean) {
  return withTransaction(async (client) => {
    await loadGame(client, gameId);
    let fight = await loadOpenFight(client, gameId);
    if (!fight) throw new NotFoundError('本局还没有打怪');
    fight = await refreshFight(client, fight);
    if (fight.status !== 'gathering') throw new InvalidStateError('已经开打了，不能再改准备状态');
    const part = await loadParticipant(client, fight.id, userId);
    if (!part || part.status !== 'joined') throw new ForbiddenError('先加入队伍才能准备');
    await client.query(
      'UPDATE boss_fight_participants SET ready = $3 WHERE fight_id = $1 AND user_id = $2',
      [fight.id, userId, ready ? 1 : 0],
    );
    const fresh = (await client.query<FightRow>(
      'UPDATE boss_fights SET version = version + 1 WHERE id = $1 RETURNING *',
      [fight.id],
    )).rows[0];
    scheduleBroadcast(fight.id);
    return buildSnapshot(fresh, userId);
  });
}

export async function startFight(gameId: number, userId: number) {
  return withTransaction(async (client) => {
    await loadGame(client, gameId);
    let fight = await loadOpenFight(client, gameId);
    if (!fight) throw new NotFoundError('本局还没有打怪');
    fight = await refreshFight(client, fight);
    if (fight.status !== 'gathering') throw new InvalidStateError('这场打怪已经开始或结束了');
    const me = await loadParticipant(client, fight.id, userId);
    if (!me || me.status !== 'joined') throw new ForbiddenError('先加入队伍才能开打');
    const parts = (await client.query<ParticipantRow>(
      `SELECT * FROM boss_fight_participants WHERE fight_id = $1 AND status = 'joined'`,
      [fight.id],
    )).rows;
    if (parts.length < MIN_FIGHTERS) throw new InvalidStateError('至少 2 个人组队才能开打');
    if (parts.length > MAX_FIGHTERS) throw new InvalidStateError('队伍最多 6 个人');
    if (parts.some((part) => !part.ready)) throw new InvalidStateError('还有队员没点准备好');
    const nowMs = Date.now();
    const maxHp = computeMaxHp(fight.movement, parts.length, fight.duration_sec);
    // 开打瞬间给每个人的计数拍一张基准照：只算开打之后新增的次数
    for (const part of parts) {
      if (!part.session_id) continue;
      const session = (await client.query<{ reps: number }>(
        'SELECT reps FROM sport_sessions WHERE id = $1',
        [part.session_id],
      )).rows[0];
      await client.query(
        'UPDATE boss_fight_participants SET baseline_reps = $3, last_report_at = NULL WHERE fight_id = $1 AND user_id = $2',
        [fight.id, part.user_id, Number(session?.reps || 0)],
      );
    }
    const started = (await client.query<FightRow>(
      `UPDATE boss_fights
       SET status = 'fighting', max_hp = $2, hp = $2, started_at = $3, ends_at = $4, version = version + 1
       WHERE id = $1 AND status = 'gathering' RETURNING *`,
      [fight.id, maxHp, iso(nowMs), iso(nowMs + fight.duration_sec * 1000)],
    )).rows[0];
    if (!started) throw new InvalidStateError('这场打怪已经开始或结束了');
    scheduleBroadcast(fight.id);
    return buildSnapshot(started, userId);
  });
}

export async function leaveFight(gameId: number, userId: number) {
  return withTransaction(async (client) => {
    await loadGame(client, gameId);
    let fight = await loadOpenFight(client, gameId);
    if (!fight) throw new NotFoundError('本局还没有打怪');
    fight = await refreshFight(client, fight);
    const part = await loadParticipant(client, fight.id, userId);
    if (part && part.status === 'joined') {
      if (fight.status === 'gathering') {
        await client.query('DELETE FROM boss_fight_participants WHERE fight_id = $1 AND user_id = $2', [fight.id, userId]);
      } else if (fight.status === 'fighting') {
        // 中途退出无惩罚：伤害就此停住，血量不重算；胜局纪念物资格保留（见发放账本）
        await client.query(
          `UPDATE boss_fight_participants SET status = 'left', ready = 0 WHERE fight_id = $1 AND user_id = $2`,
          [fight.id, userId],
        );
      }
      await client.query('UPDATE boss_fights SET version = version + 1 WHERE id = $1', [fight.id]);
      scheduleBroadcast(fight.id);
    }
    const fresh = (await client.query<FightRow>('SELECT * FROM boss_fights WHERE id = $1', [fight.id])).rows[0];
    return buildSnapshot(fresh, userId);
  });
}

export async function getFightForGame(gameId: number, userId: number) {
  await loadGame(pool, gameId);
  await requireMember(pool, gameId, userId, false);
  return withTransaction(async (client) => {
    let fight = (await loadOpenFight(client, gameId)) || (await loadLatestFight(client, gameId));
    if (!fight) return null;
    fight = await refreshFight(client, fight);
    if (fight.status === 'won') await tryGrantRewards(fight);
    return buildSnapshot(fight, userId);
  });
}

/** 延迟自检：返回本场被接受上报的服务器处理耗时分布（不含网络往返，端到端口径待前端配合） */
export async function latencySummary(gameId: number, userId: number) {
  await loadGame(pool, gameId);
  await requireMember(pool, gameId, userId, false);
  const fight = await loadLatestFight(pool, gameId);
  if (!fight) return { fight_id: null, samples: 0, processing_ms: null };
  const rows = (await pool.query<{ processing_ms: number }>(
    'SELECT processing_ms FROM boss_fight_latency WHERE fight_id = $1 ORDER BY processing_ms ASC',
    [fight.id],
  )).rows;
  if (!rows.length) return { fight_id: fight.id, samples: 0, processing_ms: null };
  const values = rows.map((row) => Number(row.processing_ms));
  const pick = (q: number) => values[Math.min(values.length - 1, Math.floor(q * values.length))];
  return {
    fight_id: fight.id,
    samples: values.length,
    processing_ms: {
      p50: pick(0.5),
      p95: pick(0.95),
      max: values[values.length - 1],
    },
    note: 'processing_ms 是服务端从收到上报到算出伤害的处理耗时，不含网络往返；端到端 P95 需前端用 server_ts / client_ts 配合再测',
  };
}

// ---------------------------------------------------------------
// 运动计数钩子（motion.service 调用；任何异常只记日志，绝不拖垮训练本身）
// ---------------------------------------------------------------

interface SessionLike {
  id: string;
  user_id: number;
  sport_type: string;
  source: string;
  status: string;
  reps: number;
}

/** 遥测时间戳只接受有限数值；其余一律当作没传——绝不能让它绑进 SQL 时抛错 */
function coerceClientTs(clientTs: unknown): number | undefined {
  return typeof clientTs === 'number' && Number.isFinite(clientTs) ? clientTs : undefined;
}

/**
 * 把一段已接受的增量真正入账：推进队员累计、扣血、（打倒时）先结算胜局发奖，
 * 最后才写延迟遥测。顺序是硬要求：遥测写入失败只能丢一条采样，
 * 绝不能让它挡在胜负结算前面把已经打赢的战斗偷走。
 */
async function creditAcceptedDamage(
  fight: FightRow,
  part: ParticipantRow,
  acceptedDelta: number,
  reported: number,
  nowMs: number,
  perfStart: number,
  clientTs: number | undefined,
): Promise<void> {
  await pool.query(
    'UPDATE boss_fight_participants SET accepted_reps = $3, last_report_at = $4 WHERE fight_id = $1 AND user_id = $2',
    [fight.id, part.user_id, Number(part.accepted_reps) + acceptedDelta, iso(nowMs)],
  );
  const updated = (await pool.query<FightRow>(
    `UPDATE boss_fights SET hp = max(0, hp - $2), version = version + 1
     WHERE id = $1 AND status = 'fighting' RETURNING *`,
    [fight.id, acceptedDelta],
  )).rows[0];
  if (!updated) return;
  if (updated.hp <= 0) {
    const won = await settleWin(pool, updated, iso(nowMs));
    if (won) await tryGrantRewards(won);
  }
  try {
    await pool.query(
      `INSERT INTO boss_fight_latency (fight_id, user_id, reported_total, accepted_delta, received_at, processing_ms, client_ts)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [fight.id, part.user_id, reported, acceptedDelta, iso(nowMs), performance.now() - perfStart, clientTs ?? null],
    );
  } catch (error) {
    console.error('[boss-fight] latency insert failed', error);
  }
  scheduleBroadcast(fight.id);
}

/** 计数上报 → 伤害入账。运行在 sessionAction 的事务里（pool 自动加入该事务）。 */
export async function applySessionProgress(session: SessionLike, clientTs?: number): Promise<void> {
  try {
    if (session.source !== 'camera') return;
    const safeClientTs = coerceClientTs(clientTs);
    const startedAt = performance.now();
    const part = (await pool.query<ParticipantRow>(
      'SELECT * FROM boss_fight_participants WHERE session_id = $1',
      [session.id],
    )).rows[0];
    if (!part || part.status !== 'joined' || Number(part.user_id) !== Number(session.user_id)) return;
    const fight = (await pool.query<FightRow>('SELECT * FROM boss_fights WHERE id = $1', [part.fight_id])).rows[0];
    if (!fight || fight.status !== 'fighting' || !fight.started_at || !fight.ends_at) return;
    const nowMs = Date.now();
    const game = (await pool.query<{ status: string }>('SELECT status FROM games WHERE id = $1', [fight.game_id])).rows[0];
    if (!game || TERMINAL_GAME_STATUSES.includes(game.status)) {
      const aborted = await transitionFight(pool, fight, 'aborted', iso(nowMs));
      if (aborted) scheduleBroadcast(fight.id);
      return;
    }
    if (nowMs > Date.parse(fight.ends_at)) {
      const escaped = await transitionFight(pool, fight, 'escaped', fight.ends_at);
      if (escaped) scheduleBroadcast(fight.id);
      return;
    }
    const reported = Math.max(0, Number(session.reps || 0) - Number(part.baseline_reps || 0));
    const delta = reported - Number(part.accepted_reps || 0);
    if (delta <= 0) {
      await pool.query(
        'UPDATE boss_fight_participants SET last_report_at = $3 WHERE fight_id = $1 AND user_id = $2',
        [fight.id, part.user_id, iso(nowMs)],
      );
      return;
    }
    const tuning = MOVEMENT_TUNING[fight.movement as Tier1Movement];
    const windowStart = part.last_report_at ? Date.parse(part.last_report_at) : Date.parse(fight.started_at);
    const elapsedMs = Math.min(RATE_WINDOW_CAP_MS, Math.max(0, nowMs - windowStart));
    const allowance = Math.floor((elapsedMs / 1000) * tuning.maxRepsPerSec)
      + (elapsedMs >= 2000 ? RATE_BURST_ALLOWANCE : 0);
    const acceptedDelta = Math.min(delta, allowance);
    if (acceptedDelta <= 0) return; // 窗口还没攒够，先不推进 last_report_at，让额度继续累计
    await creditAcceptedDamage(fight, part, acceptedDelta, reported, nowMs, startedAt, safeClientTs);
  } catch (error) {
    console.error('[boss-fight] applySessionProgress failed', error);
  }
}

/**
 * 计数结束时的积压结清。账本口径是「未接受的差额留在账上后续入账、不丢弃」，
 * 但计数一旦结束就再没有「后续」了：结束后的 progress 会被拒、重复 finish 直接返回、
 * 读状态也不排空——积压若不在此刻结清就会被永久锁死，还可能把胜负翻盘
 * （打怪还活着时，本该到账的最后几下永远到不了）。
 * 结清仍走同一套前提与入账路径：战斗必须还活着（未超时、局未终局）、队员仍在队内，
 * 结清量以这次计数的最终累计为界——速率上限管的是「活着的时候入账多快」，
 * 一次已结束的计数，其最终总数就是它全部的贡献，不再有节奏可管。
 */
async function drainBacklogOnFinish(session: SessionLike): Promise<void> {
  const perfStart = performance.now();
  const part = (await pool.query<ParticipantRow>(
    'SELECT * FROM boss_fight_participants WHERE session_id = $1',
    [session.id],
  )).rows[0];
  if (!part || part.status !== 'joined' || Number(part.user_id) !== Number(session.user_id)) return;
  const fight = (await pool.query<FightRow>('SELECT * FROM boss_fights WHERE id = $1', [part.fight_id])).rows[0];
  if (!fight || fight.status !== 'fighting' || !fight.started_at || !fight.ends_at) return;
  const nowMs = Date.now();
  const game = (await pool.query<{ status: string }>('SELECT status FROM games WHERE id = $1', [fight.game_id])).rows[0];
  if (!game || TERMINAL_GAME_STATUSES.includes(game.status)) {
    const aborted = await transitionFight(pool, fight, 'aborted', iso(nowMs));
    if (aborted) scheduleBroadcast(fight.id);
    return;
  }
  if (nowMs > Date.parse(fight.ends_at)) {
    const escaped = await transitionFight(pool, fight, 'escaped', fight.ends_at);
    if (escaped) scheduleBroadcast(fight.id);
    return;
  }
  const reported = Math.max(0, Number(session.reps || 0) - Number(part.baseline_reps || 0));
  const delta = reported - Number(part.accepted_reps || 0);
  if (delta <= 0) return;
  await creditAcceptedDamage(fight, part, delta, reported, nowMs, perfStart, undefined);
}

/** 计数正常结束 → 先结清积压（可能正好打倒怪），再若所属打怪已胜，顺手把纪念物落袋 */
export async function onSessionFinished(session: SessionLike): Promise<void> {
  try {
    if (session.source !== 'camera') return;
    await drainBacklogOnFinish(session);
    const part = (await pool.query<ParticipantRow>(
      'SELECT * FROM boss_fight_participants WHERE session_id = $1',
      [session.id],
    )).rows[0];
    if (!part) return;
    const fight = (await pool.query<FightRow>('SELECT * FROM boss_fights WHERE id = $1', [part.fight_id])).rows[0];
    if (!fight || fight.status !== 'won') return;
    await tryGrantRewards(fight);
  } catch (error) {
    console.error('[boss-fight] onSessionFinished failed', error);
  }
}
