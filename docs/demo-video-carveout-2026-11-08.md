# 示范视频窄口批次（2026-11-08）

## 背景与决策

- 2026-11-08 Edward 指示示范视频改走视频生成模型（「示范视频你就用视频生成模型生成」）。形态类试点 4 条（锤式弯举单锚/双锚、杠铃深蹲、窄握卧推）经 Muse 逐帧过门 **0/4 失败**：握法在动作中被模型改掉（锤式变普通弯举，双锚+明示不许旋转仍翻）、深蹲几乎无下蹲且出现鬼影腿、卧推杠铃轨迹漂到颈部。失败为系统性而非随机，**形态类生成示范视频就此搁置**（试点素材与门检帧在 `~/workspace/movemate-media-staging/demo-video-pilot/`）。
- Muse 建议、Edward 批准（「按你说的来」）：只给**无形态细节可丢的节律性徒手动作**做生成视频，每条照样逐帧过门。原建议举例的开合跳/高抬腿已有真人 Pexels 视频，故本批取实际无视频的节律集 3 条，全部通过（门检记录：`~/workspace/movemate-media-staging/demo-video-carveout/GATE-NOTES.md`）。

## 本批接入（3 条，视频 15 → 18）

| 条目 | 视频文件 | 锚点与门检结论 |
|---|---|---|
| exdb:0630 mountain climber（登山跑） | `ai-generated-exdb-0630-video.e7973d2a6ab0.mp4`（2,317,218 B） | 以库内真人起始帧为锚图生视频。平板位双腿交替收膝、手掌钉住、背部基本平，臀高轻微起伏在快速执行常态范围内；无多余肢体、无场景漂移 |
| exdb:0514 freehand jump squat（徒手跳蹲） | `ai-generated-exdb-0514-video.a539ac97ecdd.mp4`（4,333,518 B） | 以库内真人深蹲帧为锚。三相完整：深蹲位与锚一致 → 腾空全身伸展双脚离地 → 落回深蹲位；无鬼影肢体；空中帧面部轻微运动模糊，可接受 |
| exdb:3361 skater hops（滑冰跳） | `ai-generated-exdb-3361-video.add962ebb4d1.mp4`（4,136,668 B） | **文字生成（无锚点）**，逐帧核验左右交替节律成立。**保留意见如实披露：生成自带带英文品牌海报的健身房场景（HAMMER STRENGTH 等），与库内其他媒体的场景语言不一致**——非形态问题，留待 Edward 终审时一并看 |

三条均为 1088×720 / 24fps / 10s mp4。

## 接入口径

- **video 字段**：与既有 15 条视频同构（src / sha256 / bytes / distribution / poster / posterSha256 / aspectRatio=1088/720）。
- **distribution = `repository`**：生成视频与 AI 生成图片同路，文件进仓库 `client/public/exercise-media/` 随站发布（site-only 只留给 Pexels 等站外授权素材）。
- **poster = 各条目现有起始（phase-0）帧**：poster 直接引用条目 images[0] 的 src 与 sha256，不另制视频抽帧图——0630/0514 的视频本就以该帧为锚生成，首帧与之等价；3361 用其生成图起始帧。此为与既有 wger 条目（专用 -poster 抽帧文件）不同的一处口径，理由在此明示。
- **来源披露**：三条各追加一条 sources，标注「AI 生成 / ai-generated-exdb-XXXX（示范视频）」、作者「MoveMate 项目（AI 生成视频，无摄影师）」，changes 写明生成方式（0630/0514 锚图生视频；3361 文字生成、背景为生成场景）；note 同步改写，明示「附 AI 生成连续示范视频（视频非真人实拍）」，原「不是连续动画」表述删除。原图片来源一字未动，追加在 sources 末尾不扰动既有 sourceIndex。
- **计数**：发布链（metadata → documentation → report）三方一致：图文完整 **769/1,329 不变**（三条原已完整），**视频 15 → 18**（唯一视频文件 12 → 15；既有 3 个 Pexels 视频为多条目共享同一文件），待补 560 不变，摄像头 49 不变。

## 机械说明（如实）

- `cloudflare/src/media-sizes.json` 按其生成规则（manifest 视频 src→bytes）同步 +3 条唯一文件。
- `client/public/exercise-media/attribution.json` 是 manifest 的镜像（通常由 build-exercise-media.py 整批重写）；本批只同步其 entries 至与新 manifest 一致，version/reviewedAt 未动。
- 发布链为三条各生成了新的哈希 detail JSON；旧哈希 detail 文件为发布管线历来留下的未引用孤儿（0514 此前已有两份），本批未做清理。
- 测试（全串行）：client `test:repository` **408/408** + tsc；server **108/108** + build；cloudflare **34/34** + typecheck。首轮 client 曾因 attribution.json 未同步失败一次，同步后全绿。

## 部署记录

（合并与双站部署后回填。）
