# Vercel 单项目、多服务部署

仓库根目录 `vercel.json` 是部署入口，Vercel Root Directory 选择 `./`，Application Preset 选择 Services。

| 服务 | 目录 / 构建 | 公开路径 |
|---|---|---|
| client | `client`，`npm ci` → `npm run build:vercel`，输出 `dist` | 其余所有页面和静态资源 |
| server | `server`，`npm ci` → `npm run build`，入口 `src/app.ts` | `/api/*`、`/ai/*`、`/socket.io/*`、`/uploads/*`、`/health` |

没有内部服务调用和 bindings。client 是静态 Vite 应用，不运行服务端函数。浏览器使用同域 `/api/v1`、`/api/xiaozhi/socket`、`/ai/*` 和 `/socket.io`；无需设置 API 域名或手动设置绑定变量。localhost:3001 只用于本机开发代理及启动提示。

服务路由保留原请求路径，后端继续挂载 `/api/v1`。client 的 `vercel.json` 提供 React 路由的 index.html fallback。后端默认导出 HTTP Server，保留聊天及小智的 upgrade 监听；Vercel 运行时不自行 listen、不创建本机上传目录、不运行常驻 node-cron。

## 云端环境变量

使用 Vercel Marketplace 的免费 Turso 数据库及支持 Redis Pub/Sub 的免费 Redis 资源。每个部署环境使用独立数据库及频道前缀；避免预览部署写入正式数据。

必填：

- `TURSO_DATABASE_URL`、`TURSO_AUTH_TOKEN`：Turso 连接信息，仅服务端使用。
- `REDIS_URL`（或 Marketplace 提供的 `KV_URL`）：TLS Redis 连接 URL，用于跨实例 Socket.IO 广播。REST URL 无法替代此项。
- `JWT_SECRET`、`STUDENT_ID_SALT`：分别生成至少 32 字符的随机密钥。
- `CRON_SECRET`：每日维护接口使用的随机 Bearer 密钥。

可选：

- `SEED_DEMO_ACCOUNTS=true`、`CLOUD_DEMO_PASSWORD`（至少 12 字符）：首次请求创建 host/player1/player2@dajju.local 三个普通已认证账号。不会删除活动、修改已有密码或导入本机数据。
- `SOCKET_CHANNEL_PREFIX`：例如 `movemate-production` / `movemate-preview`。
- `BASE_URL`、`CORS_ORIGIN`、`XIAOZHI_ALLOWED_ORIGINS`：自定义域名时填精确 HTTPS 来源。Vercel 提供的生产域名及当前部署域名自动加入语音来源白名单。
- `XIAOZHI_IDENTITY_MODE=personal`：开启小智个人绑定；线上域名需要自己的浏览器设备绑定。默认 disabled。
- `AI_BASE_URL`、`AI_API_KEY`：HTTP 陪练。不配置时继续使用本地文字陪练。
- `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`：正式注册的邮件验证码。没有 SMTP 时可登录已创建的演示账号，不能完成普通注册。

所有私密配置通过 Vercel 环境变量保存，不能提交 .env 或放入 VITE_*。本机 SQLite、用户上传和既有账号不会上传。

Turso 保存账号、活动、消息、训练、XP、验证码哈希和头像。已有本机 SQLite 继续使用原路径。首次云端请求增量创建云数据库表与公开校园场地元数据；启动失败返回错误，不假报服务正常。

## 实时与状态维护

云端 Socket.IO 使用 WebSocket-only，Redis adapter 负责跨实例消息、通知及活动广播。连接到达 Vercel 的 300 秒上限后客户端重连、重新加入活动房间并拉取状态。小智与聊天保持不同的协议路径；同域 cookie 鉴权，不额外建立跨域票据接口。

Hobby 定时任务仅每天一次。根配置安排 `0 0 * * *`（UTC 每日 00:00，平台执行可能在该小时内），访问 `/api/cron`，校验 CRON_SECRET。在线活动详情每分钟及回到前台时静默刷新，相关 API 请求按一分钟节流推进既有状态机。没有在线请求时，状态通知可能延迟到每日维护；此免费部署不保证后台每分钟调度。

## 本地验证

```powershell
npx vercel@63.1.2 dev -L --listen 4011
```

`-L` 不拉取 Vercel 环境变量，使用现有本地配置；如需隔离数据，设置临时 `SQLITE_PATH`。云端凭据在完成资源配置后通过正式预览部署验收。旧 CLI 54 不认识 Services 的对象形式 destination，需要升级。

2026-10-13：前后端构建及 51 项测试通过，另有 21 项原业务回归通过 libSQL 文件连接执行，覆盖注册、并发加入、聊天重连、签到和 XP 结算。云适配测试覆盖实例切换、验证码过期/重放、头像保存、普通演示账号幂等创建及维护接口鉴权。CLI 63.1.2 的 `vercel dev -L` 已识别两个服务：页面、健康检查和校园 bootstrap 返回 200；未登录的个人资料、陪练状态与无密钥维护请求返回 401；不存在的头像返回 404。390px 登录页无横向溢出或 JavaScript 控制台异常，截图位于项目外。

CLI 本地 Node runner 通过拦截 listen() 发现 HTTP Server；入口仅在该 runner 提供 VERCEL_DEV_PORT 时同步登记服务器，云端仍使用默认导出。文件连接和本地 HTTP 路由验证不等于远程数据库、云端 WebSocket 或 Vercel 上线验收；免费资源、云部署和跨实例 Redis 实测仍需完成。

## 配置确认

服务名称 client/server；两者按上表公开，没有仅供内部访问的第三项服务，没有 bindings。发布前需按用户要求确认这些名称、公开路径和调用关系；确认后推送配置并在 Vercel 导入整个仓库。

参考：[Services](https://vercel.com/docs/services)、[服务路由](https://vercel.com/docs/services/routing)、[WebSocket](https://vercel.com/docs/functions/websockets)、[Hobby 定时任务](https://vercel.com/docs/cron-jobs/usage-and-pricing)。
