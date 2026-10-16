# MoveMate

整合「动伴」与「搭个局」的运动陪练和校园运动社区项目。

在一个网页中使用个人训练、数字分身、装备背包及搭个局。一次登录，共用个人资料、通知和 SQLite 数据库。底部导航为「首页、训练、组局、通知、我的」；形象、背包、运动记录、活动记录及 XP 榜单从「我的」进入。

动伴素材和前端逻辑引自 [xuzerui6/dongban](https://github.com/xuzerui6/dongban) 的 main，版本 `0d03c94170f6154a0c1d42618e841729ad8baf00`。保留 React 18，整合现有 Express 后端；没有第二套登录或独立站点。小程序目录为原有样例，本次没有修改或部署。

## 本机启动

正式地址：[https://dongban.xyz](https://dongban.xyz)，`www` 跳转至主域名。网页、接口、SQLite、实时聊天、通知和小智桥接运行在 Cloudflare Workers Free 与 SQLite-backed Durable Object；没有新增 R2、Containers 或付费套餐。原 Vercel 站点维护，Turso／Upstash 仅保留为备份。部署、迁移和只回滚代码的说明见 [Cloudflare 部署说明](docs/cloudflare-deployment.md)，实际验证见 [迁移验收](docs/cloudflare-acceptance.md)。本机启动方式继续使用下列脚本。

需要 Node.js **22.13+，推荐 24**（实际验证 24.16.0）、npm 和内置 `node:sqlite`；不需要 PostgreSQL、Redis 或外部 SQLite 驱动。运行时可能出现 Node 的 SQLite 实验性提示，属于当前运行时提示。

双击根目录 **start-demo.bat**。脚本检查环境及锁定依赖、安装缺失或版本不匹配的依赖、初始化独立演示配置、构建前后端并启动；任意一步失败都会停止并显示错误。访问 [http://localhost:3001](http://localhost:3001)。本机演示只监听 127.0.0.1，不修改防火墙。

| 演示账号 | 用途 |
|---|---|
| host@dajju.local | 发起活动 |
| player1@dajju.local | 参加活动 |
| player2@dajju.local | 独立训练／另一个成员 |

三个普通账号共用密码，随机生成并保存在 `server/.env.demo` 的 `DEMO_PASSWORD`，启动时显示。现有密码继续有效，重复执行不重建账号、不删除记录，也不改变密码。演示启动强制关闭 SMTP，使用 `server/data/demo.db`，不覆盖正式 `.env` 或 `dajju.db`。

手动启动，在项目根目录依次执行：

```powershell
cd server
npm ci
npm run build
npm run seed:demo
cd ../client
npm ci
npm run build
cd ../server
npm run start:demo
```

停止服务后可用相同脚本重新启动。当前端或后端代码发生变化，启动脚本会重新构建。若 3001 已被占用，先关闭原服务；脚本不会擅自终止占用端口的进程。

## 本轮界面更新

已按用户上传的首页图和确认的完整设计稿统一全产品界面：纯白底、粗黑标题、绿色操作、灰色说明和像素分身。手机使用五项底部导航，平板使用紧凑导航，电脑使用侧边导航和宽屏内容。登录、注册、认证、首页、训练、组局、聊天、通知、个人资料、形象、背包、记录、榜单、反馈与后台共用设计变量和交互组件。

正文和粗标题使用本地 Noto Sans SC Variable 字体，运行时不依赖字体 CDN。原旧样式已整合到共享基础与设计系统，许可保存在 `client/public/licenses/`。2026-10-13 的页面对照、真实闭环及重启结果见下方验收文件。

新增「海风跑者」「紫电球手」「日光探索者」三套男女像素造型，原角色保留；在「我的 → 我的形象」切换。分别沿用原企鹅套、樱花套、落日樱花套的解锁条件，服务端检查后才保存；演示训练不会解锁。背包仍使用原装备素材。

资料保存验收发现旧数据库缺少 `sport_preferences`。经用户批准，启动初始化会先用 `VACUUM INTO` 备份到 `server/data/backups/*-pre-profile-*.db`，再补齐这一字段；重复启动不会重复修改。没有改动 XP、签到、活动状态机或演示账号权限。

本轮视觉对照见 [design-qa.md](design-qa.md)，页面覆盖和浏览器验收见 [UI_ACCEPTANCE.md](UI_ACCEPTANCE.md)。截图与临时浏览器脚本放在项目外。现有 `start-demo.bat` 已验证可检查本轮锁定依赖并构建新版界面。

## 使用与成长规则

AI 动作训练：进入「训练」，选择深蹲、开合跳、高抬腿或俯卧撑，再选择本地识别／智能复核。按页面说明摆放摄像头，保持起始姿势两秒完成校准。完整动作才计数；高抬腿左右各抬一次并落下算一组。暂停、遮挡或刷新会丢弃未完成动作，保留已经同步的次数与评分。俯卧撑需侧面拍摄。评分和纠错是本地关键点估算，实际摄像头动作质量仍需后续校准。

四种动作均可使用演示体验，演示次数与评分明确标注，XP 始终为零，不解锁装备。训练历史显示动作名称和对应的次／组；旧深蹲总数和任务只统计深蹲。详见 [多动作验收记录](CAMERA_TRAINING_ACCEPTANCE.md)。

个人计时：进入「训练」，选择运动，依次操作开始、暂停、继续、结束。服务器记录有效时段，休息时必须暂停；刷新和锁屏不会清零。结束后以后端返回的 XP 为准，失败可恢复或重试。

短暂断网、超时或服务暂不可用时保留当前登录，页面显示「重试连接」，网络恢复后也会自动尝试刷新。失效凭据仍会退出登录。结束计时请求失败时，确认弹窗保留错误及「重试结束」入口，只有服务器确认成功后才显示已保存；弹窗开启期间背景不可操作，键盘焦点保留在弹窗内。

| 运动 | XP |
|---|---|
| 摄像头深蹲、开合跳、俯卧撑 | 每次 2 XP |
| 摄像头高抬腿（左右各一次为一组） | 每组 2 XP |
| 跑步、游泳 | 每有效分钟 3 XP |
| 篮球、羽毛球、足球、排球、网球、乒乓球 | 每有效分钟 2 XP |
| 普通健身、轮滑、滑板、自定义运动 | 每有效分钟 1 XP |

时长类使用 `floor(累计有效秒数 × 系数 / 60)`；暂停前后的秒数一起累计后取整。取消固定基础奖励、动作评分奖励、任务 XP 和发起人加成。等级门槛继续为 300、400、500…… XP，装备和套装沿用原动伴解锁条件；演示动作不增加真实 XP、不推进装备解锁。

组局验收可用两个独立浏览器会话：从「组局」发布约 10 分钟后开始的活动，在变为「即将开始」前加入。定时任务通常一分钟内开放签到。发起人与成员分别签到，发起人确认成员到场并确认开始；之后每个人独立点击「开始运动」。成员可提前结束自己的运动，活动结束时统一结算已确认到场者的记录，并关闭仍在运行的计时。至少两人正常签到的规则仍保留，发起人使用同一公式。一个账号同时只能有一项运行或暂停的运动。

新活动不再产生旧的 5／3 积分奖励或退局积分扣减。旧积分与通知保留为历史数据，不兑换 XP；当前成长及榜单读取新 XP。结束活动、结束运动和定时任务重试均不会重复发 XP。

## 数据、设备与陪练

- 数据库增量增加 `motion_profiles`、`sport_sessions`、`sport_intervals`、`xp_ledger`。对缺少新表的已有数据库，迁移前自动用 `VACUUM INTO` 保存一致备份到同目录 `backups/`；备份失败即停止启动。账号、活动、聊天和通知保留。
- 计时、结算和装备修改使用同一事务队列及 `BEGIN IMMEDIATE`；通知和广播在提交后执行。所有个人记录按登录账号归属；切换账号清理内存和当前账号缓存、关闭 Socket 及设备。原动伴匿名浏览器数据不自动导入账号，也不补发 XP。
- MediaPipe 模型及 WASM 已放在 `client/public/pose/`，不需要从 CDN 加载。训练、识别及语音代码按需加载。离开训练释放摄像头、音频和识别循环，退出账号断开 BLE。
- 原始图片、音频、完整对话不写入数据库。关键帧复核须用户选择允许；云端服务可能有其自身数据政策。
- 未配置云端陪练时，使用本地文字陪练，不阻塞训练。2026-10-13 已在电脑 Chrome 完成小智个人设备绑定、真实麦克风对话，用户确认能听到官方语音回复。真实 BLE、真实摄像头识别质量和云端关键帧复核质量仍属于后续专项验收。
- 计时依据用户的开始、暂停和结束操作，不表示自动识别球类运动量。

## API 与开发

认证保护的运动接口：

- `POST /api/v1/sport-sessions`、`GET /api/v1/sport-sessions/active`
- `POST /api/v1/sport-sessions/:id/pause|resume|finish`
- `POST /api/v1/sport-sessions/:id/progress`：识别次数检查点
- `GET /api/v1/training/state`、`PATCH /api/v1/training/avatar`

用户归属、有效时间、XP 和结算状态由后端确定。摄像头动作次数来自浏览器实际识别；演示来源固定为零 XP。装备部位及解锁条件后端再次校验。

聊天使用 Socket.IO；小智单独使用 `/api/xiaozhi/socket` WebSocket，在同一个 HTTP 服务上处理并校验账号。可选 HTTP 陪练使用 `/ai/chat/completions`。开发模式在 `server` 执行 `npm run dev`（或构建后 `npm start`），在 `client` 执行 `npm run dev`；Vite 将 API、聊天及语音代理到 3001。

正式运行先复制 `server/.env.example` 为 `.env`，生成随机 JWT_SECRET、STUDENT_ID_SALT，配置 SMTP。普通注册要求吉林大学校园邮箱和真实验证码；已有账号可在个人中心补做认证。演示账号由本地种子脚本生成，没有免验证码注册接口。

可选 AI 配置：`AI_BASE_URL`（含 `/v1`）、`AI_API_KEY`；本机小智默认 `XIAOZHI_IDENTITY_MODE=disabled`，个人绑定设为 `personal`。Cloudflare 使用 `shared` 与独立 `XIAOZHI_POOL_SECRET`，管理员在「语音服务」集中绑定同一个专用智能体下的设备，最多五个位置，普通用户按需开启，无须个人绑定。服务默认未公开，须完成免费额度及隔离、有声验证后开启，详见 [统一语音配置](docs/shared-voice.md)。本机旧单设备共享模式仍读取 `XIAOZHI_SHARED_IDENTITY_B64`。`XIAOZHI_COOKIE_SECRET` 默认复用 JWT 密钥。未配置 SMTP 或云端服务不影响本机演示。

语音排查：本机演示配置读取 `server/.env.demo`。未设置小智模式时服务关闭，陪练只显示文字，不播放声音；HTTP AI 模型配置也不等于启用小智音频。要使用小智官方语音，在该配置文件设置 `XIAOZHI_IDENTITY_MODE=personal` 并重启服务，开始训练后按页面激活码在自己的小智账号完成绑定。开发环境允许 `http://localhost:3001` 和 `http://127.0.0.1:3001`；生产环境必须在 `XIAOZHI_ALLOWED_ORIGINS` 中明确配置访问网址。浏览器支持语音识别才可使用唤醒词，语音识别网络错误或麦克风拒绝会在陪练面板显示，允许权限后可以重试。小智连接成功后也可点击开启对话。未完成真实账号绑定与麦克风／音频验证前，不算有声对话验收通过。

## 验证与目录

```powershell
cd server
npm test
npm run build
cd ../client
npm test
npm run build
```

客户端 `npm test` 使用 Node 内置测试运行器与 tsx，覆盖四种动作状态机、画面比例、遮挡、半程动作、暂停、刷新恢复、评分及左右配对。实际测试环境为 Node 24.16.0。

后端测试使用独立临时数据库，不发送邮件、不修改演示数据。覆盖注册认证、并发加入、事务回滚、聊天重连、通知、运动系数、暂停恢复、重复结算、活动结束竞争、账号隔离、装备越权和备份迁移。

`client/src/features/motion/` 为动伴模块；原组局页面在 `client/src/pages/`。后端运动逻辑在 `server/src/services/motion.service.ts`，语音桥接在 `server/src/xiaozhi/`。运行记录见 [DEMO_ACCEPTANCE.md](DEMO_ACCEPTANCE.md)。历史 PRD、架构文档中的 PostgreSQL／Redis 与积分规则为旧方案，以当前实现及本说明为准。

原 `start.bat` 为旧局域网脚本，可能申请防火墙规则；本机请使用 `start-demo.bat`。网页端现已提供 Vercel 访问地址，小程序仍未合并或部署；源码按用户要求推送到 [MoveMate](https://github.com/xuzerui6/MoveMate)。

许可证见 [LICENSE](LICENSE)，动伴第三方声明见 [DONGBAN_THIRD_PARTY_NOTICES.md](DONGBAN_THIRD_PARTY_NOTICES.md)。不要提交 `.env*`、数据库、备份或服务日志。

