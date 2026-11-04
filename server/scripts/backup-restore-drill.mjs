#!/usr/bin/env node
/**
 * 本地服务端备份 / 恢复演练（WS6，2026-11-05）。
 *
 * 只演练本地 SQLite 数据层，不接触生产数据：
 * - 默认在系统临时目录新建演练目录，源库、备份、恢复目标全部在里面；
 * - 绝不默认读写 server/data/dajju.db；想对真实库做同样操作时，先停服、
 *   手工复制 data/dajju.db（连同 -wal / -shm，如有），再按 docs/server-backup-restore.md 恢复；
 * - 云端 Turso 库不是本地文件，本脚本在 TURSO_DATABASE_URL 已设置时直接拒绝，
 *   避免把文件拷贝误当成云库备份。
 *
 * 流程：建演练库（走服务端真实建库路径）→ 写标记行 → 检查点并备份 →
 * 清空恢复目标 → 从备份恢复 → 文件层校验（integrity_check + 行数 + 标记行）→
 * 应用层校验（再走服务端 pool 读恢复后的库）。
 *
 * 用法（在 server/ 目录下）：
 *   node scripts/backup-restore-drill.mjs            # 演练后清理临时目录
 *   node scripts/backup-restore-drill.mjs --keep     # 保留临时目录以便检查
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const keep = process.argv.includes('--keep');
const serverDir = path.resolve(import.meta.dirname, '..');

if (process.env.TURSO_DATABASE_URL) {
  console.error('[drill] 拒绝：已设置 TURSO_DATABASE_URL，当前是云端 Turso 库，不是本地 SQLite 文件。');
  console.error('[drill] 云库备份请走 Turso 侧的备份/时间点恢复，见 docs/server-backup-restore.md。');
  process.exit(2);
}

const fail = (message) => {
  console.error(`[drill] FAIL: ${message}`);
  process.exit(1);
};

const workdir = mkdtempSync(path.join(tmpdir(), 'dajju-backup-drill-'));
const source = path.join(workdir, 'source.db');
const backupDir = path.join(workdir, 'backups');
const restored = path.join(workdir, 'restored.db');
mkdirSync(backupDir, { recursive: true });

const bootEnv = (dbPath) => {
  const env = { ...process.env };
  delete env.TURSO_DATABASE_URL;
  delete env.TURSO_AUTH_TOKEN;
  return {
    ...env,
    SQLITE_PATH: dbPath,
    JWT_SECRET: 'backup-drill-secret-at-least-32-characters',
    STUDENT_ID_SALT: 'backup-drill-salt-at-least-32-characters',
    SMTP_USER: '',
    SMTP_PASS: '',
    ADMIN_EMAIL: '',
    ENV_FILE: path.join(workdir, 'absent.env'),
    NODE_ENV: 'test',
  };
};

/** 走服务端真实建库路径（initSQLite + 建表 + 吉林大学元数据种子）。 */
function bootDatabase(dbPath, label) {
  const run = spawnSync(
    process.execPath,
    ['--import', 'tsx', '-e',
      "require('./src/db').pool.query('SELECT 1').then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); })"],
    { cwd: serverDir, encoding: 'utf8', timeout: 60000, env: bootEnv(dbPath) },
  );
  if (run.status !== 0) fail(`${label} 建库/启动失败：${run.stderr || run.stdout}`);
  console.log(`[drill] ${label}：服务端建库路径已跑通（${dbPath}）`);
}

/** 通过应用层 pool 读标记行，证明恢复后的库能被服务端正常打开。 */
function readMarkerThroughApp(dbPath) {
  const run = spawnSync(
    process.execPath,
    ['--import', 'tsx', '-e',
      "require('./src/db').pool.query(\"SELECT COUNT(*) AS n FROM schools WHERE code='drill'\").then((r) => { console.log(JSON.stringify(r.rows[0])); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); })"],
    { cwd: serverDir, encoding: 'utf8', timeout: 60000, env: bootEnv(dbPath) },
  );
  if (run.status !== 0) fail(`应用层读取恢复库失败：${run.stderr || run.stdout}`);
  return JSON.parse(run.stdout.trim().split('\n').at(-1));
}

function snapshot(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').get();
    if (integrity?.integrity_check !== 'ok') fail(`integrity_check 未通过：${JSON.stringify(integrity)}`);
    const counts = {};
    for (const table of ['schools', 'users', 'games']) {
      counts[table] = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    }
    const marker = db.prepare("SELECT code, name FROM schools WHERE code = 'drill'").get();
    return { counts, marker };
  } finally {
    db.close();
  }
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

try {
  // 1. 建演练源库并写标记行。
  bootDatabase(source, '源库');
  const seed = new DatabaseSync(source);
  seed.prepare("INSERT INTO schools (code, name) VALUES ('drill', '备份演练学校')").run();
  seed.close();
  const before = snapshot(source);
  console.log(`[drill] 源库快照：${JSON.stringify(before.counts)}，标记行=${JSON.stringify(before.marker)}`);

  // 2. 检查点（把 WAL 落回主文件）后再拷贝，避免只拷主文件丢 WAL 里的新写。
  const checkpoint = new DatabaseSync(source);
  checkpoint.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  checkpoint.close();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(backupDir, `dajju-${stamp}.db`);
  copyFileSync(source, backup);
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = source + suffix;
    if (existsSync(sidecar)) copyFileSync(sidecar, backup + suffix);
  }
  const backupHash = sha256(backup);
  console.log(`[drill] 备份完成：${backup}（sha256 ${backupHash}）`);

  // 3. 清空恢复目标，再从备份恢复。
  if (existsSync(restored)) rmSync(restored, { force: true });
  console.log('[drill] 恢复目标已清空（模拟丢库）');
  copyFileSync(backup, restored);
  if (sha256(restored) !== backupHash) fail('恢复后文件哈希与备份不一致');
  console.log('[drill] 已从备份恢复到恢复目标');

  // 4. 文件层 + 应用层双重校验。
  const after = snapshot(restored);
  if (JSON.stringify(after.counts) !== JSON.stringify(before.counts)) {
    fail(`行数不一致：恢复前 ${JSON.stringify(before.counts)}，恢复后 ${JSON.stringify(after.counts)}`);
  }
  if (!after.marker || after.marker.name !== '备份演练学校') fail(`标记行丢失：${JSON.stringify(after.marker)}`);
  console.log(`[drill] 文件层校验通过：integrity_check ok，行数一致，标记行在位`);
  const appMarker = readMarkerThroughApp(restored);
  if (Number(appMarker.n) !== 1) fail(`应用层标记行计数异常：${JSON.stringify(appMarker)}`);
  console.log(`[drill] 应用层校验通过：服务端 pool 在恢复库上读到标记行 ${JSON.stringify(appMarker)}`);

  console.log('[drill] PASS：备份 → 清空 → 恢复 → 双重校验全部通过');
  console.log(`[drill] 演练目录：${workdir}`);
} finally {
  if (!keep) {
    rmSync(workdir, { recursive: true, force: true });
    console.log('[drill] 演练临时目录已清理（用 --keep 可保留检查）');
  }
}
