import cron from 'node-cron';
import { sourceMaintenance } from '../source-migration';
import { pool, withTransaction, afterCommit } from '../db';
import { completeGameBySystem, createNotification, notifyGameChanged } from '../services/game.service';
import { sendGameEmail } from '../services/email.service';

// ================================================================
// 定时任务模块 —— 运动局状态机自动推进
//
// 使用 node-cron，每分钟执行一次。
// 每个任务：SELECT 查询受影响行 → UPDATE 批量推进 → 发送通知
//
// SQLite 兼容：时间阈值在 JS 计算，julianday 统一比较两种时间格式
// ================================================================

/** 返回当前时间的 ISO 字符串（SQLite TEXT 比较用） */
function isoNow(): string {
  return new Date().toISOString();
}

/** 返回相对当前时间 offsetMs 毫秒的 ISO 字符串 */
function isoFromNow(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

/** 格式化时间为可读字符串 */
function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return iso; }
}

/** 给活动所有参与者发送邮件通知 */
async function notifyMembersByEmail(
  gameId: number,
  subject: string,
  title: string,
  content: string,
  gameTitle: string,
  timeStr: string,
  locationStr: string,
): Promise<void> {
  try {
    const { rows: members } = await pool.query(
      `SELECT u.email, u.qq_email, u.nickname FROM game_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.game_id = $1 AND gm.left_at IS NULL AND u.email IS NOT NULL`,
      [gameId],
    );
    for (const m of members) {
      const notifyEmail = (m as any).qq_email || m.email;
      await sendGameEmail(notifyEmail, subject, title, content, gameTitle, timeStr, locationStr);
    }
  } catch (err) {
    console.error(`[Cron] 邮件通知发送失败 (game=${gameId}): ${(err as Error).message}`);
  }
}

// ================================================================
// 定时任务 1：check_game_ready
// 扫描 recruiting/full 且距开始 ≤30min 的局 → ready
// ================================================================
async function checkGameReady(): Promise<void> {
  const now = isoNow();
  const thirtyMinLater = isoFromNow(30 * 60 * 1000);

  // Step 1: SELECT 受影响的局
  let { rows: affected } = await pool.query(
    `SELECT id, host_id, sport_type, title, start_time, location, venue_name_snapshot FROM games
     WHERE status IN ('recruiting', 'full')
       AND julianday(start_time) <= julianday($1)
       AND julianday(start_time) > julianday($2)`,
    [thirtyMinLater, now],
  );

  if (affected.length === 0) return;

  // Step 2: UPDATE 批量推进
  affected = await advanceCandidates(affected, 'ready', ['recruiting', 'full']);

  console.log(`[Cron:check_game_ready] ${affected.length} 个局推进到 ready`);

  // Step 3: 通知参与者
  for (const game of affected) {
    const { rows: members } = await pool.query(
      `SELECT user_id FROM game_members WHERE game_id = $1 AND left_at IS NULL`,
      [game.id],
    );
    for (const member of members) {
      await createNotification({
        user_id: member.user_id,
        type: 'check_in_reminder',
        title: '签到提醒',
        content: `你加入的「${game.title}」即将开始，记得点击"我已到场"完成签到`,
        game_id: game.id,
      });
    }
    // 同时发送邮件通知
    await notifyMembersByEmail(
      game.id,
      '搭个局 - 活动即将开始',
      '活动即将开始',
      `你加入的「${game.title}」即将开始，请打开动伴及时签到，并在活动开始后记录个人运动量。`,
      game.title,
      fmtTime(game.start_time),
      game.venue_name_snapshot || game.location,
    );
  }
}

// ================================================================
// 定时任务 2：start_in_progress
// 扫描 ready 且已到开始时间的局 → in_progress
// ================================================================
async function startInProgress(): Promise<void> {
  const now = isoNow();

  let { rows: affected } = await pool.query(
    `SELECT id, host_id, sport_type, title, start_time, member_count, location, venue_name_snapshot FROM games
     WHERE status = 'ready'
       AND julianday(start_time) <= julianday($1)`,
    [now],
  );

  if (affected.length === 0) return;

  let toStart: any[] = [];
  let toCancel: any[] = [];

  for (const g of affected) {
    if (Number(g.member_count) >= 2) {
      toStart.push(g);
    } else {
      toCancel.push(g);
    }
  }

  // 人数不足 → 自动取消
  if (toCancel.length > 0) {
    toCancel = await advanceCandidates(toCancel, 'cancelled', ['ready'], 'member_count < 2');
    for (const game of toCancel) {
      const { rows: members } = await pool.query(
        `SELECT user_id FROM game_members WHERE game_id = $1 AND left_at IS NULL`,
        [game.id],
      );
      for (const member of members) {
        await createNotification({
          user_id: member.user_id,
          type: 'game_cancelled',
          title: '局已取消',
          content: `「${game.title}」因参与人数不足（仅${game.member_count}人）已被系统自动取消`,
          game_id: game.id,
        });
      }
    }
    console.log(`[Cron:start_in_progress] ${toCancel.length} 个局因人数不足自动取消`);
  }

  // 人数达标 → 正常开始
  if (toStart.length > 0) {
    toStart = await advanceCandidates(toStart, 'in_progress', ['ready'], 'member_count >= 2');

    console.log(`[Cron:start_in_progress] ${toStart.length} 个局推进到 in_progress`);

    for (const game of toStart) {
      const timeStr = fmtTime(game.start_time);
      const { rows: members } = await pool.query(
        `SELECT user_id FROM game_members WHERE game_id = $1 AND left_at IS NULL`,
        [game.id],
      );
      for (const member of members) {
        await createNotification({
          user_id: member.user_id,
          type: 'game_ready',
          title: '活动已开始',
          content: `你加入的「${game.title}」已开始，祝玩得开心！`,
          game_id: game.id,
        });
      }
      await notifyMembersByEmail(
        game.id,
        '搭个局 - 活动已开始',
        '活动已开始',
        `你加入的「${game.title}」已经开始啦，祝玩得开心！`,
        game.title,
        timeStr,
        game.venue_name_snapshot || game.location,
      );
    }
  }
}

// ================================================================
// 定时任务 3：auto_cancel_expired
// 超过开始时间 30 分钟仍未开始 → cancelled
// SQLite 替代: start_time + INTERVAL '30 minutes' <= NOW
//          → start_time <= NOW - 30 minutes
// ================================================================
async function autoCancelExpired(): Promise<void> {
  const now = isoNow();
  const thirtyMinAgo = isoFromNow(-30 * 60 * 1000);

  let { rows: affected } = await pool.query(
    `SELECT id, host_id, sport_type, title, start_time, location, venue_name_snapshot FROM games
     WHERE status IN ('recruiting', 'full', 'ready')
       AND julianday(start_time) <= julianday($1)`,
    [thirtyMinAgo],
  );

  if (affected.length === 0) return;

  affected = await advanceCandidates(affected, 'cancelled', ['recruiting', 'full', 'ready']);

  console.log(`[Cron:auto_cancel_expired] ${affected.length} 个局超时自动取消`);

  for (const game of affected) {
    const timeStr = fmtTime(game.start_time);
    const { rows: members } = await pool.query(
      `SELECT user_id FROM game_members WHERE game_id = $1 AND left_at IS NULL`,
      [game.id],
    );
    for (const member of members) {
      await createNotification({
        user_id: member.user_id,
        type: 'game_cancelled',
        title: '局已取消',
        content: `你加入的「${game.title}」因超时未开始已自动取消`,
        game_id: game.id,
      });
    }
    await notifyMembersByEmail(
      game.id,
      '搭个局 - 活动已取消',
      '活动已取消',
      `很遗憾，你加入的「${game.title}」因超时未开始已被系统自动取消。`,
      game.title,
      timeStr,
      game.venue_name_snapshot || game.location,
    );
  }
}

// ================================================================
// 定时任务 4：auto_complete
// in_progress 到达 end_time → completed
// 老数据如果没有 end_time，仍回退为 start_time + 3 小时
// ================================================================
async function autoComplete(): Promise<void> {
  const now = isoNow();
  const threeHoursAgo = isoFromNow(-3 * 60 * 60 * 1000);

  let { rows: affected } = await pool.query(
    `SELECT id, host_id, sport_type, title FROM games
     WHERE status = 'in_progress'
       AND (
         (end_time IS NOT NULL AND julianday(end_time) <= julianday($1))
         OR (end_time IS NULL AND julianday(start_time) <= julianday($2))
       )`,
    [now, threeHoursAgo],
  );

  if (affected.length === 0) return;

  console.log(`[Cron:auto_complete] ${affected.length} 个局超时自动结束`);

  for (const game of affected) {
    try { await completeGameBySystem(Number(game.id)); } catch (error: any) {
      if (!error.message.includes('只能自动结束')) throw error;
    }
  }
}

// ================================================================
// 定时任务 5：archive_completed
// completed 超过 24 小时 → archived
// SQLite 替代: completed_at + INTERVAL '24 hours' <= NOW
//          → completed_at <= NOW - 24 hours
// ================================================================
async function archiveCompleted(): Promise<void> {
  const now = isoNow();
  const twentyFourHoursAgo = isoFromNow(-24 * 60 * 60 * 1000);

  let { rows: affected } = await pool.query(
    `SELECT id, host_id, sport_type, title FROM games
     WHERE status = 'completed'
       AND completed_at IS NOT NULL
       AND julianday(completed_at) <= julianday($1)`,
    [twentyFourHoursAgo],
  );

  if (affected.length === 0) return;

  affected = await advanceCandidates(affected, 'archived', ['completed']);

  console.log(`[Cron:archive_completed] ${affected.length} 个局归档`);
}

// ================================================================
// 启动 / 停止
// ================================================================

let tasks: cron.ScheduledTask[] = [];

export function startAllCronJobs(): void {
  console.log('[Cron] 启动定时任务...');

  const everyMinute = '* * * * *';

  tasks = [cron.schedule(everyMinute, () => { void runCronTick(); }, { name: 'game_lifecycle' })];

  console.log(`[Cron] 已注册 ${tasks.length} 个定时任务`);
}

export function stopAllCronJobs(): void {
  tasks.forEach((task) => task.stop());
  tasks = [];
  console.log('[Cron] 所有定时任务已停止');
}

async function advanceCandidates(candidates: any[], target: string, expected: string[], condition = '1=1'): Promise<any[]> {
  return withTransaction(async (client) => {
    const changed: any[] = [];
    for (const candidate of candidates) {
      const { rows } = await client.query(
        'UPDATE games SET status = $1, updated_at = NOW() WHERE id = $2 AND status IN (' + expected.map((_, i) => '$' + (i + 3)).join(',') + ') AND ' + condition + ' RETURNING *',
        [target, candidate.id, ...expected],
      );
      if (rows[0]) {
        changed.push(rows[0]);
        afterCommit(() => notifyGameChanged(Number(candidate.id)));
      }
    }
    return changed;
  });
}

let currentTick: Promise<void> | null = null;
export function runCronTick(): Promise<void> {
  if (currentTick) return currentTick;
  currentTick = (async () => {
    if (await sourceMaintenance()) return;
    for (const task of [checkGameReady, startInProgress, autoCancelExpired, autoComplete, archiveCompleted]) {
      try {
        // The cloud alarm persists transitions and their notification records together.
        if (process.env.CLOUDFLARE === '1') await withTransaction(() => task());
        else await task();
      } catch (error) {
        console.error('[Cron] Task failed:', error);
        if (process.env.CLOUDFLARE === '1') throw error;
      }
    }
  })().finally(() => { currentTick = null; });
  return currentTick;
}
