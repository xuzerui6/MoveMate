# 公开构建 / 站内构建

## 诊断（2026-11-05，WS3）

公开克隆（无 `MOVEMATE_MEDIA_DIR`、无 `server/data/media-config.json`）
此前无法完成前端构建，复现命令与报错：

```bash
npm run build --prefix client
# [reviewed-exercise-media] Missing MOVEMATE_MEDIA_DIR: provide the reviewed
# site-only media directory before building. See docs/exercise-media-batch3.md
```

失败点在 `client/vite.config.ts` 挂载的 `exerciseMediaPlugin`：
`buildStart` / `closeBundle` 调 `scripts/exercise-media-assets.mjs` 的
`verifyExerciseMedia` / `installExerciseMedia`，而清单里有 `site-only`
条目时它要求外部素材目录存在且文件逐一通过 SHA-256 校验。
公开源码测试早已有对应的降级（`npm run test:repository --prefix client`
以 `MOVEMATE_MEDIA_TEST_SCOPE=repository` 只验仓库内媒体），但构建没有。

## 两种构建

| 构建 | 命令 | 行为 |
| --- | --- | --- |
| 站内构建（默认，严格） | `npm run build --prefix client`（已配置 `MOVEMATE_MEDIA_DIR`） | 全部清单文件逐一校验并把 `site-only` 文件拷入产物；缺目录、缺文件、校验失败即中断。这是唯一可作为正式站点的构建。 |
| 公开构建（显式降级） | `MOVEMATE_PUBLIC_BUILD=1 npm run build --prefix client` | 不要求 `MOVEMATE_MEDIA_DIR`，跳过 `site-only` 文件的字节校验与拷贝，只用仓库内媒体完成构建。未设置该变量时绝不自动降级。 |

开关由 `scripts/exercise-media-assets.mjs` 的 `isPublicBuild`
（选项 `publicBuild` 或环境变量 `MOVEMATE_PUBLIC_BUILD=1` / `true`）
控制，Vite 插件、开发服务器中间件与 `installExerciseMedia` 共用同一路径。

## 公开构建跳过什么（当前清单，2026-11-05）

含 `site-only` 文件的共 7 个条目：23 张分解图、7 段视频及其封面。

- 混合条目（仓库内帧仍在）：`motion:squat`、`motion:push_up`、`exdb:0285`。
- 全部帧均为 `site-only`：`motion:jumping_jack`、`motion:high_knees`、
  `movemate:reverse_lunge`、`exdb:3224`。

## 诚实边界（公开构建不是完整站点构建）

- 公开构建**不改写**已提交的 `exercise-media-index.json` 与
  `client/public/exercise-media/details/*.json`，因此这 7 个条目的详情
  仍会引用缺失的 `site-only` 帧：运行时对应图片/视频会走界面已有的
  失败态（单帧报错可重试、视频加载失败提示），文字、适用形式与肌群
  仍可正常查看；其余 293 个条目不受影响。
- 公开构建**不伪造**占位媒体、不从第三方下载、不把待补条目计为已完成。
  需要完整示范的正式站点必须用站内构建。
- 防泄漏检查在公开构建下保持全强度：`site-only` 文件出现在
  `client/public` 仍会中断构建；清单哈希与来源哈希仍用于检查
  Git 已追踪/已暂存的受限字节（见 `client/tests/media-assets.test.ts`
  的公开构建用例）。

## 相关说明

- 公开源码测试：`npm run test:repository --prefix client`（只验元数据与
  仓库内媒体字节），详见 `docs/development.md`。
- 站内素材配置：`docs/development.md`「动作示范素材」与
  `docs/exercise-media-batch3.md`。
