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

## 生产侧（Cloudflare Durable Object）：现状与演练结论（2026-11-07）

生产站点 dongban.xyz 的数据不在上文的本地/Turso 路径上：它运行于
Cloudflare Worker + SQLite-backed Durable Object（见
[Cloudflare 部署](cloudflare-deployment.md)），头像也存于 DO 库内
（`avatar_files` / `avatar_chunks` 表）。已核实的事实：

- 代码回滚走 `wrangler versions` / `wrangler rollback`，只回滚 Worker
  代码，继续绑定原 DO namespace 与 production 实例；部署文档明文禁止
  删除 namespace、重建数据库或用 Turso 旧快照覆盖生产库。
- 灾难恢复的既定路径是 Durable Object 的 PITR（时间点恢复）书签；
  开放新写入后不要用旧快照覆盖数据库。
- 迁移期建有 AES-256-GCM 加密导出/导入工具
  （`cloudflare/scripts/migrate.mjs`），解密密钥在
  `server/data/cloudflare-backup-key.json`（被 Git 排除，不得与备份
  同处存放）；但该工具的导出源是当年的迁移源站，**未验证**能直接导出
  当前 DO 生产库，不得当作现成的生产备份手段引用。

**PITR 的硬约束（先于一切操作单）**：PITR 书签与单个 DO 对象绑定、
只能在该对象上**原地**恢复；平台没有把 A 对象的书签恢复到 B 对象、
跨 namespace 克隆、或经 REST API / 控制台 / wrangler 触发恢复的通道。
因此「在预览/空白实例恢复一份生产快照」按平台机制**做不到**（2026-11-06
预检证实）：生产数据的隔离验证没有现成路径，生产恢复只能在生产对象
本身原地执行；机制验证改在与生产同类、同代码、同平台机制的**预览
对象**上完成（下文演练结论）。

**运维端点已上线（缺口 G-1 已补，2026-11-07）**：仓库已实现 PITR
运维端点 `/api/migration/pitr/`（`cloudflare/src/pitr.ts`，沿用
MIGRATION_SECRET 鉴权），含 `status`（当前书签 + databaseSize + 全表
计数 + 外键检查 + 上次 undo 记录，只读）、`bookmark-for-time`（按时间
取书签，只读）、`restore`（安排恢复并返回 undo 书签）三个动作。
`restore` 带硬守卫：仅当 `INSTANCE === 'preview'` 才执行，其余实例在
触碰存储前直接 403。端点已部署到预览并实测可用；生产侧随下一次生产
部署上线（届时只读动作可用、恢复动作仍被守卫禁止于生产，真灾难的
生产恢复属灾难处置流程，需另行处置守卫，不属发布动作）。

**恢复演练结论（2026-11-07，轨道 A：预览对象实操，全链路通过）**：
在预览对象上完整走通 取书签 → 写演练标记 → 按时间取目标书签 → 执行
恢复 + abort 重启 → 数据对账 → 用 undo 书签回滚到演练前状态 → 清理
标记终对账。数据对账结果：恢复后全部 36 表计数与演练前基线逐表一致、
零差异，databaseSize 与基线分毫不差（405,504），外键违规 0，演练标记
如预期消失；undo 后标记原样重现，证明撤销路径可用。业务回归：登录
（含管理员）、组局列表、管理端语音池快照均通过；完整训练结算流未用
裸 API 走通（客户端离线协议细节），记为部分验证。演练全程未触碰生产
对象。生产恢复信心（机制层面）：高；保留项见文末未验证项。

**演练实测语义（写进生产操作单，勿凭直觉假设）**：

- **F-1 按时间取书签返回离散的已封存快照点，不是连续时间轴。**
  `bookmark-for-time(ts)` 的落点 = ts 之前最近的一个已封存快照点，
  可以明显早于 ts 当时的实时尖端（演练中目标时刻的实时书签从未作为
  时间查询结果出现，返回的是更早的封存点）。因此真灾难时「恢复到
  某时刻」的实际数据落点由**快照封存节奏**决定（本次观测为分钟级
  跳变），RPO 不是任意时刻、而是最近封存点。
- **F-2 撤销（undo）书签必须以恢复接口的同步响应为准捕获。**
  `restore` 成功时会把 undo 书签写入本对象的 `actor_meta`，但那条记录
  位于「发起恢复的那条时间线」；从恢复后的时间线回看，该记录不可见
  （`lastUndoBookmark` 为 null）。执行恢复的人必须当场把响应里的 undo
  书签抄录到外部运维记录，绝不能指望事后从库里查——本次演练的 undo
  正是靠响应捕获的书签才得以执行。

**运维注意（实测）**：恢复执行后 `/health` 约 10 秒内恢复 200；
恢复后**首次** `pitr/status` 这类全表扫描调用耗时约 17–19 秒（冷
启动 + 全表计数），调用方超时须设 ≥60 秒，短超时（如 30 秒）会误判
为无响应。

## 未验证项（不要对外承诺）

- PITR 恢复机制已于 2026-11-07 在**预览对象**上演练通过（详见上一
  节），但**生产对象本身从未执行过恢复**；生产无写入冻结开关，真
  恢复时恢复窗口内的新写入会被覆盖，处置方式需当场决定。跨环境
  导出/异地备份仍不存在：现有恢复手段只有平台内 30 天 PITR 一条，
  超过保留窗口或账号级事故无库外副本兜底。
- 不停服热备份（`VACUUM INTO` 对运行中库）未作为生产流程验证。
- `uploads/` 目录的恢复未进演练脚本，只在上文列为手动步骤。
- 备份保留周期、异地存放、加密均未定，需要 Edward 定后再补。
