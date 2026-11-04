# 服务端备份与恢复（本地 SQLite / 云端 Turso）

演练脚本：`server/scripts/backup-restore-drill.mjs`（2026-11-05 WS6 实测通过，
见文末）。本文件只写已验证的路径与未验证项，不承诺未测过的恢复能力。

## 数据层现状（已读代码核实）

- 本地模式：SQLite，文件位置由 `SQLITE_PATH` 决定，未设置时为
  `server/data/dajju.db`（`server/src/db/sqlite-adapter.ts`），WAL 模式。
  备份时除主文件外，如有 `dajju.db-wal` / `dajju.db-shm` 也要一并处理；
  最稳妥是先停服或先做 `PRAGMA wal_checkpoint(TRUNCATE)` 再拷贝，
  否则只拷主文件可能丢 WAL 里尚未落盘的写。
- 云端模式：设置 `TURSO_DATABASE_URL` 后走 Turso（`server/src/db/runtime.ts`），
  此时本地没有可拷贝的数据库文件；云库备份与时间点恢复只能走 Turso 侧，
  不可用文件拷贝代替。
- 文件上传：本地模式下 `server/uploads/` 是磁盘目录（`server/src/app.ts`），
  不在数据库文件里；数据库备份不包含它，需要另外同步/拷贝该目录。
  头像有两种存放：本地模式存数据库 `uploaded_avatars` 表，Cloudflare 模式
  存 `avatar_files` / `avatar_chunks` 表——恢复数据库即恢复头像行，但
  `uploads/` 目录仍需单独处理。
- 已有自动备份（仅迁移触发）：`ensureSchema` 在检测到旧库缺表/缺列时，
  会先 `VACUUM INTO data/backups/<库名>-pre-<阶段>-<时间戳>.db`
  再改表（`server/src/db/sqlite-adapter.ts`）。这是迁移前保险，不是通用备份，
  不能替代定期备份。

## 本地备份（手动，停服后操作）

```sh
# 1. 停服（确保没有进程持有该库），再拷贝主文件与 WAL 伴生文件（如有）
cp server/data/dajju.db backups/dajju-YYYY-MM-DD.db
cp server/data/dajju.db-wal backups/dajju-YYYY-MM-DD.db-wal 2>/dev/null || true
cp server/data/dajju.db-shm backups/dajju-YYYY-MM-DD.db-shm 2>/dev/null || true
# 2. 另外备份上传目录
cp -r server/uploads backups/uploads-YYYY-MM-DD
# 3. 校验备份可读（不要只看文件大小）
sqlite3 backups/dajju-YYYY-MM-DD.db "PRAGMA integrity_check;"
```

不停服的替代做法：对运行中的库执行 `VACUUM INTO <备份路径>`（测试里已有
此用法），它生成一致性快照；但本文件未把该路径作为生产流程验证，
生产恢复前务必先在演练库上走一遍。

## 本地恢复（手动）

```sh
# 1. 停服；2. 把当前库移走（不要直接覆盖，便于回滚）
mv server/data/dajju.db server/data/dajju.db.broken
mv server/data/dajju.db-wal server/data/dajju.db-wal.broken 2>/dev/null || true
mv server/data/dajju.db-shm server/data/dajju.db-shm.broken 2>/dev/null || true
# 3. 拷回备份（含伴生文件，如有）与上传目录
cp backups/dajju-YYYY-MM-DD.db server/data/dajju.db
# 4. 启动后核对：integrity_check 为 ok，关键表行数与备份前快照一致
sqlite3 server/data/dajju.db "PRAGMA integrity_check; SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM games;"
```

## 演练脚本（已实测）

```sh
cd server
node scripts/backup-restore-drill.mjs            # 通过后清理临时目录
node scripts/backup-restore-drill.mjs --keep     # 保留临时目录以便检查
```

脚本流程：临时目录建演练库（走服务端真实 `initSQLite` 建库路径）→
写入 `schools(code='drill')` 标记行 → `wal_checkpoint(TRUNCATE)` 后备份
（含 sha256）→ 清空恢复目标 → 从备份恢复并比对哈希 → 文件层校验
（`integrity_check` + 三表行数 + 标记行）→ 应用层校验（再走服务端
`pool` 在恢复库上读标记行）。`TURSO_DATABASE_URL` 已设置时直接拒绝
（退出码 2），避免误把文件拷贝当成云库备份。

2026-11-05 实测结果：PASS，源库快照 schools 2 / users 0 / games 0，
恢复后行数一致、标记行在位、应用层读到标记行 1 条；
Turso 拒绝分支实测退出码 2。

## 未验证项（不要对外承诺）

- 生产库（dongban.xyz / Turso 云库）的备份与恢复均未演练；本脚本与本文
  只覆盖本地 SQLite 演练路径。
- 不停服热备份（`VACUUM INTO` 对运行中库）未作为生产流程验证。
- `uploads/` 目录的恢复未进演练脚本，只在上文列为手动步骤。
- 备份保留周期、异地存放、加密均未定，需要 Edward 定后再补。
