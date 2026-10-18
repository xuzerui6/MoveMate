# 架构与目录

[项目首页](../README.md) · [文档中心](README.md)

## 两种运行方式

前端为 React 18 + TypeScript + Vite，按需加载姿态识别与语音。普通构建放入 `server/public`，Cloudflare 构建放入 `client/dist`；两者复用同一产品界面与 `/api/v1`。

| 能力 | 本机 | Cloudflare |
| --- | --- | --- |
| HTTP | Express，127.0.0.1:3001 | Worker 入口与 Express HTTP 适配 |
| 数据库 | node:sqlite，单进程操作队列 | SQLite-backed Durable Object，每实例隔离 |
| 事务 | BEGIN IMMEDIATE，复用事务上下文 | storage.transaction()，复用事务上下文 |
| 聊天、通知 | Socket.IO | 原生 WebSocket 与休眠恢复 |
| 小智 | 独立 WebSocket 桥接 | 原生桥接、设备池与会话租约 |
| 状态推进 | 本机顺序任务 | Durable Object Alarm 与 outbox |
| 静态文件 | Express 静态目录 | Static Assets，媒体 Range 处理 |

生产与预览使用不同 Durable Object 命名实例。当前云端不依赖 Redis、Turso、本机文件系统或 node:sqlite；历史 Vercel 适配仍在代码中保留用于理解迁移。

## 核心边界

- 账号归属、有效时长、结算状态和 XP 由服务器决定。暂停／休息不计入，唯一结算流水防止重试重复发奖。
- 一次计划训练只有一条 `fitness + timer` 主记录，逐动作、逐组明细与主记录关联；摄像头只记数，不再额外发 XP。
- 同账号只能有一项未结束运动；组局沿用签到、到场与统一结算规则。结构调整使用操作 ID、版本检查和事务队列。
- 摄像头关键点计算在浏览器执行。示范播放器与摄像头、麦克风和语音租约分离，训练开始后暂停示范，离开时释放设备。
- 媒体通过明确的 exerciseId 清单关联，不按名字猜变式。素材覆盖不授予识别权限，自定义动作不能自行声明权限。
- 公开素材随仓库保存，站内专用素材在仓库外，经完整校验进入部署产物；没有运行时第三方热链或自动构建下载。

## 目录导航

```text
client/                    React 网页、组件、识别器和客户端测试
  src/features/motion/     动作训练、形象、装备和语音
  src/features/gym/        动作库、计划、逐组训练和媒体展示
  public/pose/             本地姿态模型与 WASM
server/                    Express、认证、组局与业务服务
  src/gym/                 动作数据与计划训练服务
  src/xiaozhi/             语音协议和设备适配
  tests/                   隔离数据库回归测试
cloudflare/                Worker、Durable Object、部署与运行时测试
scripts/                   依赖检查、素材审核、生成与校验工具
docs/                      功能、开发、来源许可与实际验收
.github/                   CI、Issue 和 Pull Request 模板
miniapp/                   历史小程序样例，未纳入当前发布
```

运行数据、密钥、站内专用媒体、备份与临时浏览器脚本不属于源码。数据库变更、部署和回滚细节分别见计划训练与 Cloudflare 文档。
