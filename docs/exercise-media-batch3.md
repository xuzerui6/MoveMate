# 动作示范第三批交付

日期：2026-10-18。本批不改变摄像头识别、计时、XP、业务接口或数据库。

## 逐动作结果

| 动作 | ID | 本批结果 | 来源 |
| --- | --- | --- | --- |
| 开合跳 | motion:jumping_jack | 连续视频＋同源 3 帧 | Pexels 3048952 / fauxels |
| 原地高抬腿 | motion:high_knees | 连续视频＋同源 3 帧 | Pexels 5025964 / olia danilevich |
| 徒手交替后撤弓步 | movemate:reverse_lunge | 连续视频＋同源 5 帧 | Pexels 8456719 / Mikhail Nilov |
| 平地徒手双脚提踵 | exdb:1373 | 待补；现有器械／台阶形式不匹配 | 未采用替代素材 |
| 坐姿绳索划船（V 形窄握） | exdb:0861 | 双帧图片，视频待补 | free-exercise-db / Seated_Cable_Rows |
| 45° 腿举 | exdb:0739 | 双帧图片，视频待补 | Leg_Press |
| 器械腿屈伸 | exdb:0585 | 双帧图片，视频待补 | Leg_Extensions |
| 俯卧腿弯举 | exdb:0586 | 双帧图片，视频待补 | Lying_Leg_Curls |
| 哑铃锤式弯举 | exdb:0313 | 双帧图片，视频待补 | Hammer_Curls |
| V 杆下压 | exdb:0241 | 双帧图片，视频待补 | Triceps_Pushdown_-_V-Bar_Attachment |
| 跪姿绳索卷腹 | exdb:0175 | 双帧图片，视频待补 | Cable_Crunch |
| 上斜哑铃卧推 | exdb:0314 | 双帧图片，视频待补 | Incline_Dumbbell_Press |

图片覆盖从 16 增至 **27 个动作 ID**，连续视频从 6 增至 **9 个动作 ID**；新增 27 张分解帧、3 张封面、3 段视频，保留全部既有覆盖。全库 1,329 项，1,302 项没有示范，逐项见 `exercise-media-missing.csv`；11 个摄像头条目中 10 项有图，剩余徒手提踵。六项模板动作均有图片。

八项常用动作补齐明确中文名，纠正俯卧腿弯举旧译“仰卧”；锤式弯举改为掌心始终相对，绳索划船明确 V 形窄握中立握法。旧训练快照不被改写，动作 ID 不变。

## 来源、授权与人物偏好

免费公开图片采用 free-exercise-db 固定提交 `f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5` 的 Unlicense 数据。新视频逐阶段人工查看，分别检查原地形式、徒手、双侧交替、全身入镜和完整回位。源片片段／分解时间、SHA-256、作者和逐文件来源见 `scripts/exercise-media-approved.json`；发布文件及修改说明见 `/exercise-media/attribution.json`。

Pexels 原片及其衍生物受 [Pexels License](https://www.pexels.com/license/) 和 [使用条款](https://www.pexels.com/terms-of-service/) 约束，仅集成在站内动作说明与训练工具中，不作为独立素材分发，不随 GitHub 源码发布，也不按项目许可再授权。站内保留作者、链接和实际改动，不暗示人物背书。完整媒体有音视频去音轨及等比例压缩，无人物改绘、无空间裁切。旧 wger 视频及衍生物继续 CC BY-SA 4.0。

**本批新增且来源明确说明为亚洲人物的合格素材：0 项。** 已检查 Pexels 6547801（来源 Asian man），实片为交替旋转握法弯举，与双臂同时锤式不符；6551053（来源 Asian man）实际为划船测功仪，与坐姿绳索划船不同。均未使用。三段采用视频不因外貌被标注族裔。缺合格亚洲人物素材时保留准确的其他实拍示范，后续仍优先搜索。上述核对不构成专业教学认证。

## 仓库与部署素材分离

- `repository`：已许可的 16 张新增 WebP 随源码分发，既有公开资源保持原许可。
- `site-only`：三段新视频、3 张封面、11 张分解帧共 17 文件，保存在仓库外；Git 仅包含审核记录、来源、校验和构建逻辑。
- 当前电脑目录：`C:/Users/16013/.codex/media/movemate/exercise-media/`。原始候选、审核截图及临时脚本在 `.codex/visualizations/2026/10/18/exercise-media/batch3/`。

在其他已取得对应素材权限的部署电脑，先把审核文件按清单放入外部目录，再设置：

```powershell
$env:MOVEMATE_MEDIA_DIR = 'D:/movemate-licensed-media'
cd client
npm run build
# Cloudflare 同样读取这个环境变量
cd ../cloudflare
npm run build:web
npm run bundle
```

目录结构必须为 `MOVEMATE_MEDIA_DIR/exercise-media/<清单中的哈希文件名>`，不是原始 MP4。构建不从第三方自动下载文件。也可在已忽略的 `server/data/media-config.json` 保存 `{"MOVEMATE_MEDIA_DIR":"外部绝对路径"}`；环境变量优先。当前电脑已配置，`start-demo.bat` 继续可用。此目录是构建输入，不是 Cloudflare Secret 或付费存储。

`scripts/exercise-media-assets.mjs` 在开发、普通 Vite 和 Cloudflare 构建共用：先验证所有文件路径、大小和完整 SHA-256，再复制站内专用文件至静态产物。缺失、损坏、仓库内私有目录、私有文件混入 public 或被换名暂存至 Git 均失败。禁止把源片、站内专用文件或本机配置上传仓库；CI 须自行提供审核文件，否则构建明确停止。网站产物中包含授权文件是部署所需，不能将产物作为公开素材包发布。

## 验收

前端 116 项、后端 65 项、Workers 26 项通过；前后端构建、Workers 类型检查和打包通过。新增测试覆盖混合素材构建、缺文件、哈希错误、目录逃逸、误入 public、换名提交和暂存私有文件后替换工作副本。

浏览器采用 CUA 内置浏览器，入口 → 视频／图片筛选 → 摄像头交集 → 详情 → 播放／分解／放大 → 退出。390、768、1440px 无横向溢出，八项常用动作图片逐一加载成功；三段新增视频 readyState 4 并实际推进播放，阶段说明及原片时间对应。手机与电脑截图、HTTP 校验日志保存在项目外。

预览三段视频逐一验证前 1,024 字节和尾 512 字节返回 206 且与本地相同，越界 416、缺文件 404；同源分解图片字节相同，公开清单与源码一致。网络曾出现一次连接提前关闭，重试通过，未关闭 TLS 校验；不把该结果表述为无代理网络稳定性已解决。

隔离数据库回归：准备查看示范 → 弯举及侧平举关键点回放各 2 次 → 自动进入休息 → 肩推开始后暂停 → 刷新保留暂停与 18 秒累计时长 → 结束显示服务器已确认保存、3 组完成、0 XP。启动识别时示范暂停，结束后页面 video 元素为 0。回放并非真人拍摄，不代表动作质量验收。

隔离 HTTP 503 故障下显示“视频暂时无法播放，请重试”和“重新加载”；恢复后重试 readyState 4 且播放推进。不修改系统网络，未把故障模拟称为真实断网测试。

| 检查 | 结果 |
| --- | --- |
| 页面身份与实际内容 | 动伴动作库与计划页面正常渲染 |
| 错误覆盖层 | 新版未出现；旧 QA 标签在第一次刷新前引用旧 chunk，重新加载后恢复 |
| 控制台 | 预览无错误／警告；QA 模拟 503 为预期媒体错误 |
| 响应布局 | 390 / 768 / 1440px 无横向溢出，图片完整等比例 |
| 交互证据 | 筛选交集、播放、倍速、阶段、放大与 Escape、重试、训练暂停恢复结算 |
| 截图 | 项目外 batch3 目录：手机分解、平板弓步、电脑弯举与正式截图 |

关键命令：`client npm test / npm run build`、`server npm test / npm run build`、`cloudflare npm run build:web / npm run bundle / npm run typecheck / npm test`。浏览器使用 CUA 的 DOM、点击、原生下拉选择、只读视频状态与截图 API，无外部 Playwright 或 CDP。

真人摄像头质量、BLE 和有声语音未在本批重新验收。

## 发布与回退

- 最终预览版本：`7ce37741-6088-4478-88e4-5c317cb976ef`。
- 正式版本：`7d8101db-9e6e-4380-9550-171c24091c3f`。
- 正式地址：<https://dongban.xyz/train/library>；当前电脑 <http://localhost:3001/train/library> 已使用本次构建，继续运行。
- 无数据库迁移；出现问题可回滚上一个 Worker 版本 `6d4d4f82-8ca9-46d5-b183-c1fbca05d1d1`，保留现有数据库。站内专用媒体外部目录须随部署操作保留，不由 Git 恢复。
- 仅推送 GitHub `main`，不推送参赛仓库；不新增付费资源。

正式公开清单与源码一致；三段新视频的首段及尾段请求均为 206 且逐字节匹配，越界为 416、缺失为 404，同源帧文件匹配。正式手机页面能播放、切换三帧与查看出处，无相关控制台错误；该网络曾出现缓冲，不承诺无代理连接稳定性。正式截图：`batch3/production-mobile.png`、`batch3/production-desktop.png`（项目外）。
