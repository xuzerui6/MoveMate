# MoveMate Cloudflare 部署与迁移

正式域名：`https://dongban.xyz`。`www.dongban.xyz` 以 308 跳转至主域名。

## 架构与免费边界

- `cloudflare/` 是 Cloudflare 部署包；React Static Assets、API、原生实时 WebSocket 和小智桥接共用一个 Worker `movemate`。
- SQLite-backed Durable Object `MoveMateBackend` 使用命名实例 `production`；独立 Worker `movemate-preview` 使用命名实例 `preview`。首次创建带 `apac` 位置提示，提示不保证某一指定机房。
- 保留 Workers Free。没有 Containers、R2、Redis、Turso 运行时绑定，也没有新增付费资源。
- API 复用 Express 路由。`cloudflare:node` 仅桥接 HTTP；聊天与小智使用原生 WebSocket，不使用 Node HTTP upgrade。
- 云端密码比较使用兼容原 bcrypt 哈希的 bcryptjs，放在 Durable Object 内执行。没有重置账号密码或升级演示账号权限。
- 头像使用 `avatar_files` 与 `avatar_chunks`，每块 1 MiB，云端上传上限保持 4 MiB，URL 仍为 `/uploads/*`。
- 数据库作用域、操作队列和嵌套事务上下文按实例隔离；原生 `storage.transaction()` 提交或回滚。通知写入与业务变更同事务，SQL trigger 生成持久化 outbox，提交后投递。
- WebSocket `/api/realtime/socket` 首帧提交 JWT，不把令牌放 URL。序列化身份和房间支持休眠恢复；广播前再校验成员权限，退出后撤销所有连接订阅。
- 后台使用 Durable Object Alarm。有待推进活动或 outbox 时按分钟唤醒，没有任务时不保留周期任务；另处理未认证连接超时。重试依赖条件更新和 XP 唯一流水。
- 小智云端采用管理员集中配置的设备池（同一个专用智能体可绑定多设备），使用独立租约 Cookie、30 秒激活轮询和逐用户视觉授权；默认关闭公开服务。详见 [统一语音配置与验证](shared-voice.md)。本机个人模式保留。桥接不保存原始图片、音频或完整对话。
- 构建在本机被忽略的 `.wrangler/asset-history` 保留前两次脚本资源，减少发布影响已打开页面；跨机器部署需带上这份非敏感资源缓存才能保留同样的历史资源。HTML 不缓存，成功的哈希资源长期缓存，缺失脚本不回退成可缓存 HTML。

Cloudflare 免费额度存在每日请求、CPU、数据库读写与存储限制。到达免费上限可能请求失败；本项目不自动升级套餐。

## 安装、检查与部署

保留本机 Node 24 与 `start-demo.bat`。云端开发还需要 Cloudflare 账号授权：

```powershell
npm ci --prefix server
npm ci --prefix client
npm ci --prefix cloudflare
node cloudflare/node_modules/wrangler/bin/wrangler.js login
$env:MOVEMATE_MEDIA_DIR='D:/movemate-licensed-media'
npm test --prefix server
npm test --prefix client
npm test --prefix cloudflare
node server/node_modules/typescript/bin/tsc -p cloudflare/tsconfig.json

# 先按素材清单准备外部目录；构建不自动下载站内专用素材
npm run build:web --prefix cloudflare
npm run bundle --prefix cloudflare
npm run deploy:preview --prefix cloudflare
# 预览验收通过后再发布
npm run deploy --prefix cloudflare
```

`build:web` 自动选择 Cloudflare 传输并输出至 `client/dist`，不依赖 Vercel 服务。普通 `npm run build --prefix client` 输出至本机 `server/public`，默认 Socket.IO。站内专用素材须在运行前端完整测试及构建前配置，详见[开发指南](development.md#动作示范素材)；公开源码 CI 使用 `npm run test:repository --prefix client`，不代表完整部署素材已验收。

Fork 后部署到自己的账号，须修改 `wrangler.jsonc` 中的 account_id、Worker 名称、域名、BASE_URL 和来源白名单，使用自己的 Secrets 与独立数据库实例；不要沿用本项目账号或改写现有 production 实例。

部署脚本生成纯 schema 与公共校区元数据，再打包 Worker；检查不包含 `node:sqlite` 适配器、Turso、Redis、Socket.IO server 和 node-cron。测试专用 `TestBackend` 与测试时钟不进入生产 bundle。

必须配置 `JWT_SECRET`、`STUDENT_ID_SALT`、`XIAOZHI_COOKIE_SECRET`、`MIGRATION_SECRET`，统一语音另需 `XIAOZHI_POOL_SECRET`，均至少 32 字符。通过 Wrangler `secret bulk` 输入被 Git 和 Vercel 部署排除的本机 JSON；不可写进 wrangler vars、日志、客户端或 Git。生产与预览使用各自的密钥文件。

```powershell
cd cloudflare
node node_modules/wrangler/bin/wrangler.js secret bulk ../server/data/cloudflare-preview-secrets.json --env preview
node node_modules/wrangler/bin/wrangler.js secret bulk ../server/data/cloudflare-secrets.json
```

## 数据切换

迁移源是线上 Vercel/Turso，不读取或合并 `server/data/demo.db`。生产实例未导入并通过校验前，接口返回维护状态。

1. 在独立预览实例导入合成账号，完成业务回归。
2. 将源站维护适配部署到 Vercel。`/api/source-migration/*` 仅接受既有 `CRON_SECRET`；普通用户无权限。
3. `source-freeze` 设置持久化冻结标记，并给全部业务表加写入拒绝 trigger。即使请求落在旧的不可变部署或旧长连接，也无法继续修改源数据库。后台推进同时停止。
4. 等待至少 **305 秒** 排空旧连接。导出接口在时间不足时拒绝导出。
5. 在源库事务内生成一致快照；备份在内存中用 AES-256-GCM 加密后保存至项目外。解密密钥单独保存在被排除的 `server/data/cloudflare-backup-key.json`，不能丢失，也不能和备份一起公开。
6. 逐块导入，检查点包含快照 ID、序号与 SHA-256。重复发送相同块不会重复插入；内容变化或乱序会拒绝。已有生产数据不得覆盖。
7. 核对逐表记录数及完整数据摘要、外键、XP 流水与成长一致性，以及头像完整字节摘要。
8. 验证通过后绑定域名，调用 `open` 开放新库，再 seal 源站。Turso、Upstash 保留为备份，Cloudflare 不再访问它们。

```powershell
node cloudflare/scripts/migrate.mjs source-status https://movemate-phi.vercel.app
node cloudflare/scripts/migrate.mjs source-freeze https://movemate-phi.vercel.app
# 等待 305 秒，再指定项目外、尚不存在的加密备份路径
node cloudflare/scripts/migrate.mjs export https://movemate-phi.vercel.app C:/private-backups/movemate.enc
node cloudflare/scripts/migrate.mjs import https://movemate.xuzerui6.workers.dev C:/private-backups/movemate.enc
node cloudflare/scripts/migrate.mjs status https://movemate.xuzerui6.workers.dev
node cloudflare/scripts/migrate.mjs open https://movemate.xuzerui6.workers.dev
node cloudflare/scripts/migrate.mjs source-seal https://movemate-phi.vercel.app
```

原账号 ID、密码哈希和业务数据保留。日期在既有 API 的 UTC ISO 格式下导出，保留同一时间含义；不补发 XP。新域名需要重新登录，此前个人模式的小智设备身份按浏览器和域名重新绑定；当前云端共享模式由管理员集中绑定，演示用户无需个人绑定，许可与隔离限制见 [统一语音陪练](shared-voice.md)。

## 回滚与运维

开放 Cloudflare 写入后，仅回滚 Worker 代码，继续绑定**原 Durable Object namespace 与 production 实例**。禁止删除 namespace、改变命名实例、重新创建数据库或用 Turso 旧快照覆盖新库。

```powershell
cd cloudflare
node node_modules/wrangler/bin/wrangler.js versions list
node node_modules/wrangler/bin/wrangler.js rollback <已验证版本ID>
```

若新代码包含 schema 变化，应先检查向后兼容性。2026-10-17 的计划训练更新增量增加 `gym_*` 表，原账号、活动、聊天与 XP 表保留。只回滚 Worker 代码，新增训练数据仍保留；PITR 书签用于灾难恢复，开放新写入后不要用旧快照覆盖数据库。计划训练备份与数据说明见 [plan-training.md](plan-training.md)。

Vercel 当前部署必须保留 `.vercelignore`。验收已发现 CLI 不自动采用 Git 的运行数据排除规则，因此显式排除 `.env*`、数据目录、上传、数据库、构建输出和 Cloudflare 本机配置。此次误上传的部署已删除；替换部署文件清单已核对没有敏感目录。Cloudflare 迁移密钥已轮换。

实际验收与性能结果见 [cloudflare-acceptance.md](cloudflare-acceptance.md)。截图、临时浏览器脚本、日志与加密备份均存放在项目外。
