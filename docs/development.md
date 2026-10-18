# 开发指南

[项目首页](../README.md) · [文档中心](README.md)

## 环境与安装

推荐 Node.js 24（当前验证 24.16.0）与 npm；本机最低 Node.js 22.13，要求内置 `node:sqlite`。Windows 可使用一键脚本，macOS／Linux 使用手动命令。三个子项目各自有锁文件，没有根目录 package.json。

```bash
git clone https://github.com/xuzerui6/MoveMate.git
cd MoveMate
npm ci --prefix server
npm ci --prefix client
npm ci --prefix cloudflare
```

仅开发本机前后端时可暂不安装 cloudflare；运行 Workers 测试或部署时再安装。

## 动作示范素材

公开图片和部分 CC BY-SA 视频随仓库分发；标记 `site-only` 的 Pexels 原片及衍生文件不随源码分发，也不会在构建时下载。须取得对应素材使用权限并提供清单中审核过的文件。没有这些文件可以运行公开源码测试、后端和类型检查，不能完成当前完整前端构建。

目录结构：

```text
外部素材根目录/
└─ exercise-media/
   ├─ site-pexels-<id>.<hash>.mp4
   ├─ site-pexels-<id>-poster.<hash>.webp
   └─ site-pexels-<id>-phase-<n>.<hash>.webp
```

PowerShell：

```powershell
$env:MOVEMATE_MEDIA_DIR = 'D:/movemate-licensed-media'
```

macOS／Linux：

```bash
export MOVEMATE_MEDIA_DIR="$HOME/movemate-licensed-media"
```

也可在被忽略的 `server/data/media-config.json` 保存 `MOVEMATE_MEDIA_DIR` 的绝对路径，环境变量优先。外部目录必须在仓库之外，文件名、大小、SHA-256 必须匹配[发布清单](../client/public/exercise-media/attribution.json)。缺文件、校验失败或误提交站内专用文件时停止构建。不要从其他动作复制文件来凑校验，不要将此目录上传 GitHub。

原片 SHA、采用片段、分解帧时间和处理方式见[素材审核清单](../scripts/exercise-media-approved.json)与[第三批说明](exercise-media-batch3.md)。生成工具是维护者使用的 Python／Pillow／FFmpeg 脚本，不属于普通启动必需依赖。

## 本机演示

完成素材配置后，Windows 双击根目录 `start-demo.bat`。脚本会检查锁定依赖、生成配置、种入三个普通账号、构建并启动。只监听本机，不修改防火墙。

手动启动（所有平台，在仓库根目录执行）：

```bash
node server/scripts/prepare-demo.cjs
npm run build --prefix server
npm run seed:demo --prefix server
npm run build --prefix client
npm run start:demo --prefix server
```

访问 <http://localhost:3001>。账号为 `host@dajju.local`、`player1@dajju.local`、`player2@dajju.local`，共用首次随机生成的密码，启动时显示，保存在 `server/.env.demo`。重复种子不会清空活动或重置密码；数据库为 `server/data/demo.db`。演示模式禁用 SMTP，不开放免验证码注册。

不要公开 `.env.demo`、数据库、上传目录、备份或运行日志；也不要把本机管理员身份或数据复制到公开演示。

## 前后端开发

先按上述步骤初始化演示配置与账号，保持 API 在 3001 运行。另开终端：

```bash
npm run dev --prefix client
```

默认访问 <http://localhost:5173>，Vite 把 API、Socket.IO 和语音代理到 3001，并从配置的外部目录提供站内专用媒体。修改后端后重新构建并重启演示 API。前端热更新不需要重复执行种子脚本。

使用独立开发／正式环境时，可复制 `server/.env.example` 为 `server/.env`，设置随机 `JWT_SECRET`、`STUDENT_ID_SALT` 与实际监听地址，再执行 `npm run dev --prefix server`。不要让示例占位密钥用于真实账号；不要混用 `.env` 与演示配置。

## 配置概要

| 配置 | 作用 |
| --- | --- |
| `PORT`、`HOST`、`BASE_URL`、`CORS_ORIGIN` | API 监听和浏览器来源 |
| `SQLITE_PATH` | 本机数据库文件；演示脚本固定使用独立 demo.db |
| `JWT_SECRET`、`STUDENT_ID_SALT` | 登录与学号脱敏；保留私密且不要随意轮换 |
| `SMTP_*` | 普通注册验证码邮件；演示种子账号不依赖它 |
| `AI_BASE_URL`、`AI_API_KEY` | 可选 HTTP 陪练，未配置时文字降级 |
| `XIAOZHI_IDENTITY_MODE` | disabled / personal / shared；详见[语音说明](shared-voice.md) |
| `MOVEMATE_MEDIA_DIR` | 构建／Vite 使用的外部媒体根目录，不是浏览器 VITE 变量 |

不向 `VITE_*` 放密钥。云端使用 Cloudflare Secrets，不能把本机数据库路径套用到 Durable Object。Turso／Redis 环境变量只用于保留的历史部署适配，不是当前 Cloudflare 运行要求。

## 检查与构建

公开源码环境：

```bash
npm test --prefix server
npm run test:repository --prefix client
npm run build --prefix server
npm exec --prefix client -- tsc --project client/tsconfig.json --noEmit
npm run typecheck --prefix cloudflare
npm test --prefix cloudflare
npm run bundle --prefix cloudflare
```

`test:repository` 仍运行所有前端测试，检查全量媒体元数据、公开媒体真实字节、私有文件误提交保护的临时夹具，以及识别／训练等逻辑；仅不读取未分发的真实 `site-only` 文件。它只设置测试范围，**不改变生产构建的严格素材要求**。

已配置素材的电脑还必须执行：

```bash
npm test --prefix client
npm run build --prefix client
```

普通前端构建输出 `server/public`。Cloudflare 构建使用独立传输并输出 `client/dist`：

```bash
npm run build:web --prefix cloudflare
npm run bundle --prefix cloudflare
```

Workers 测试运行 Miniflare 的隔离实例，后端测试使用临时数据库，不需要线上登录或部署密钥。GitHub CI 只做源码检查，完整媒体、浏览器和实际设备验收在部署电脑执行；CI 不自动部署。

## 常见问题

| 现象 | 排查 |
| --- | --- |
| `Missing MOVEMATE_MEDIA_DIR` | 先配置外部素材目录；刚克隆的公开仓库不带站内专用视频 |
| `checksum/size mismatch` | 文件必须与审核清单完全匹配；不要通过改清单掩盖损坏 |
| 3001 已占用 | 关闭自己的旧服务或调整专用配置，不终止未知进程 |
| 页面 Network Error | 先确认 API 已启动、端口及 CORS 一致，再检查对应请求 |
| 语音只有文字 | 默认 disabled；HTTP AI 配置不等于语音配置，见统一语音文档 |
| 动作不计数 | 看动作形式、两秒校准、入镜关节与[识别诊断](plan-camera.md)，勿仅靠降低阈值 |
| `.db` 或 `.env` 出现在暂存区 | 停止推送，移出暂存；真实凭据泄露后按安全说明处理 |

## 云端部署

先在自己的账号配置 Worker、Durable Object、域名与 Secrets，避免直接把仓库中的既有 account_id／域名当作可用配置。预览验收通过后再部署生产，见[Cloudflare 指南](cloudflare-deployment.md)。任何新数据库迁移前先备份，回滚代码时保留已经产生的数据。
