# 动伴全产品 UI 落地验收

日期：2026-10-13。访问 [http://localhost:3001](http://localhost:3001)，双击项目根目录 `start-demo.bat` 构建并启动。Node 24.16.0、React 18、Express／单进程 SQLite。

本轮基于用户上传的白底、粗黑标题、绿色操作、像素角色首页，以及已确认的 49 个页面/状态设计稿。原来的第三方向版验收已由本记录替代；不是另起一套登录或静态页面。

## 页面覆盖

| 页面组 | 实现与检查 |
|---|---|
| 首页 | 忠实实现品牌、问候、标题、人物比例、等级/XP、双入口与今日运动；真实计时恢复入口；手机底栏、平板紧凑栏、电脑侧栏。 |
| 账号 | 登录/注册/验证码/邮箱认证、协议、错误与提交状态；焦点、Escape、正常登录。注册和认证权限逻辑继续由后端回归验证，本机不发送真实邮件。 |
| 训练 | 运动选择、个人计时、暂停/继续/结束确认、刷新恢复、摄像头准备/真实识别显示/演示/结算；演示为 0 XP，本地陪练降级。 |
| 组局 | 大厅筛选、加载更多、空/错误/重试，发局、阶段与下一步、成员/签到/到场/管理、个人计时、独立聊天滚动和重连。 |
| 通知 | 类型、未读/已读、关联活动、全部已读、删除确认、错误重试。 |
| 我的 | 像素造型及真实账号资料、等级/XP/训练/连续运动统计、六个入口、运动偏好/活动记录；资料编辑与保存、反馈及退出。 |
| 形象/背包 | 原角色、三套男女造型与原装备；已装备/可使用/锁定/保存/失败状态、条件说明；按真实接口保存，不扩大解锁。 |
| 历史/榜单 | 个人/组局、有效运动量、实际 XP、历史积分说明。 |
| 反馈/后台 | 反馈表单和确认；概览、用户、活动、场地、反馈五面板三尺寸模拟 GET 响应验收；普通演示账号仍无管理员权限。 |

主要页面检查 390×844、768×1024、1440×1024。49 是设计稿的页面/内部状态数量，不等于新增 49 条路由；应用保留原路由与业务 hooks。主要按钮不少于 44px，辅助字体不少于 12px，加载失败不展示虚构成长。

## 功能证据

- 后端 `npm test` 20 项通过；前后端生产构建成功；一键启动检查新锁定字体依赖并重新构建成功。
- `page-audit.json`：12 个主页面 × 3 尺寸，无横向溢出、坏图或小于 12px 的可见文字。`interaction-panels-result.json`：后台五面板 × 3 尺寸；正常账号无权限。
- `browser-result.json`：最终真实活动 ID 10，三独立登录会话。发局/加局、双向聊天/历史/离线重连、正常定时任务开放签到、签到/到场确认/开始；成员先开始计时，发起人晚 35 秒开始，暂停并继续后结束。发起人 36 秒得 1 XP，成员 73 秒得 2 XP，采用相同篮球公式；未结束个人计时随活动关闭。
- 单人跑步计时、暂停扣除、刷新恢复和结算通过；演示动作、本地陪练 0 XP，不增加装备解锁。幂等、并发与系数/隔离边界继续由现有后端测试覆盖。
- `interaction-result.json`、`profile-error-result.json`、`recovery-result.json`：形象/装备实际保存与失败重试、资料/偏好、通知、切账号隔离和首屏数据失败恢复。
- `chat-keyboard-result.json`：真实双会话消息、IMЕ composing Enter 不发送、普通 Enter 发送；390×520 模拟键盘收缩视口，主要输入/发送不被底栏遮挡。
- `resource-result.json`：本地模型/WASM 200；模拟摄像头退出停止全部轨道、音频关闭；延迟 BLE 连接退出清理。真实手机、BLE、动作质量、SMTP、云端 AI 绑定未作为本轮完成条件。
- 最后布局细节检查 `final-presentation-result.json`：个人页查看/编辑按钮与文案不相交、三尺寸编辑可用；详情视觉使用进行中 GET 状态回放，只用于版式检查，未写业务数据。真实活动证据独立保留。

## 重启

实际停止本轮启动的服务后，在原项目目录运行 `start-demo.bat`。`persistence-result.json` 对比重启前后：3 账号、11 活动、40 运动记录、26 聊天消息相同；账号、昵称、偏好、XP、形象、装备与记录均一致。`post-restart-browser-result.json` 通过普通登录再读取三个账号，XP 分别 7／14／14；成员重新打开活动 10，看到聊天与已结算 +2 XP。

本轮没有新增后端接口、迁移数据库或改变 XP/签到/状态机/权限。先前经批准补齐 `sport_preferences` 的备份继续保留在 `server/data/backups/`，没有清空数据。普通演示账号权限未改变，未推送 GitHub 或部署公网。

## 文件与截图

完整设计稿：`C:/Users/16013/.codex/visualizations/2026/10/12/dongban-full-ui-v2/`。

本轮真实截图、组合图、临时脚本和结果：`C:/Users/16013/.codex/visualizations/2026/10/13/dongban-ui-implementation/`。

- 首页：`home-final-mobile.png`、`home-final-desktop.png`；对照：`upload-comparison.png`、`design-comparison-mobile.png`、`design-comparison-desktop.png`。
- 真实活动：`desktop-detail-live.png`、`mobile-detail-live.png`、`desktop-completed.png`、`mobile-completed.png`、`confirm-activity.png`。
- 个人与造型：`profile-390.png`、`profile-1440.png`、`new-avatar-mobile.png`、`new-avatar-male-mobile.png`。
- 训练：`timer-paused-mobile.png`、`workout-setup-mobile.png`、`workout-live-{390,768,1440}.png`、`workout-summary-{390,768,1440}.png`。
- 空/错误与键盘：`lobby-empty-mobile.png`、`lobby-error-mobile.png`、`chat-keyboard-mobile.png`。
- 后台：`admin-概览-1440.png` 及另外四个面板三尺寸截图，均使用模拟数据。

视觉对照、问题修复与可接受差异见 [design-qa.md](design-qa.md)。演示账号继续使用 `host@dajju.local`、`player1@dajju.local`、`player2@dajju.local`，密码继续为原密码；启动时显示，也保存在 `.env.demo`。真实数据和截图不是设计稿占位数字。
