# 动作图片批次 86（1458 侧面路线接入 + 批次 84 登记补登 13 条）：图文完整 846 → 847

日期：2026-11-10。本批两件小事合批接入：

1. **exdb:1458（EZ杠坐姿弯举）接入**——普查 A4 杠铃/EZ杠批在批次 85 时唯一暂缓的条目，正面描绘路线两稿未成后经主理人改判正侧面机位重开，双帧首稿过门、终门亲核通过，本批补齐（A4 十条至此全齐）。
2. **批次 84 登记补登**——批次 84 接入时未将其 13 条登记进 `scripts/exercise-media-approved.json`（批次 85 文档已如实记录该缺口），本批按已发布清单记录逐条补登，恢复登记与已发布清单的对应关系。

## 本轮定版（1 条）

| 条目 | 名称 | 成帧要点与裁定记录 |
| --- | --- | --- |
| exdb:1458 | EZ杠坐姿弯举 | **侧面路线成帧（如实披露）**：种子意见指正文「上臂放大腿」与普通坐姿弯举的自然垂体侧不同、需独立核对，本条定义性构型即双上臂平贴大腿上表面。右前方 45° 正面路线起始帧两稿均判 CONFIG 废稿并留档（稿 1 双上臂垂落两膝之间；稿 2 右上臂贴腿但左上臂仍垂落、且躯干折叠趴伏与正文「身体坐直」相抵），峰值帧未跑。主理人据此改判**正侧面机位**重开：侧面下上臂—大腿贴附面、躯干直立与弯举弧线均可无歧义判读。侧面路线双帧均首稿过门：起始帧坐平凳、躯干直立、双脚平放地面，反手（掌心向上）与肩同宽握 EZ 杠内侧弯曲段（波浪杆形可辨），双上臂沿大腿上表面平放、杠垂于双膝前下方；关键帧仅前臂屈肘卷杠至肩高，双上臂仍贴腿原位、躯干直立、掌心向上不变。终门观察项（如实记录）：关键帧双脚略收于凳下（起始帧为凳前平放），属一对帧内正常脚位差，双脚均平放着地；关键帧近侧贴附面部分被上举前臂与杠片遮挡，贴附靠上臂走向与起始帧同线、肘位未移判读。正文原样不改。 |

台账 sourceId 为 `ai-codex-fillA4-1458`（与 A4 其余九条同系）。生成图片并入照片类计数，产品端不加「AI 生成」计数标签。

## 步骤合并记录（接入存储形制）

- **1458**：正文 7 步 → 存储 5 步。第 4 步（卷曲至肩）与第 5 步（顶部停顿挤压）合并；第 6 步（缓慢放回）与第 7 步（重复样板句）合并；余步各自独立，定稿句子无一删减。

`form`（动作要领）与 `cues`（提示）于接入时按正文凝练派生，不引入正文之外的任何断言。

## 批次 84 登记补登（13 条）

批次 84 的 13 条成品图与清单条目本身完整无误（来源块指向批次 84 文档、版本「2026-11-10 · 生成批次 84」），缺的只是 `scripts/exercise-media-approved.json` 的登记行。本批补登的 13 条为：

| 条目 | 名称（目录英文名） | 登记 sourceId |
| --- | --- | --- |
| exdb:0007 | alternate lateral pulldown | ai-codex-fillB2-1-0007 |
| exdb:0022 | barbell pullover to press | ai-codex-fillB2-1-0022 |
| exdb:0024 | barbell bench front squat | ai-codex-fillB2-1-0024 |
| exdb:0067 | barbell one arm snatch | ai-codex-fillB2-1-0067 |
| exdb:0104 | barbell standing back wrist curl | ai-codex-fillB2-1-0104 |
| exdb:0110 | barbell standing reverse grip curl | ai-codex-fillB2-1-0110 |
| exdb:0112 | barbell standing twist | ai-codex-fillB2-1-0112 |
| exdb:0152 | cable concentration extension (on knee) | ai-codex-fillB2-1-0152 |
| exdb:0193 | cable one arm straight back high row (kneeling) | ai-codex-fillB2-1-0193 |
| exdb:0213 | cable seated high row (v-bar) | ai-codex-fillB2-1-0213 |
| exdb:0224 | cable standing back wrist curl | ai-codex-fillB2-1-0224 |
| exdb:0253 | chin-ups (narrow parallel grip) | ai-codex-fillB2-1-0253 |
| exdb:0282 | decline sit-up | ai-codex-fillB2-1-0282 |

补登方法与口径：

- 每行数据**全部派生自已发布记录**：`sourceId`、`sourceSha256`、`phases`、`note` 逐字取自 `client/src/features/gym/exercise-media.json` 中该条目已上线的清单条目（来源块与双帧相位文案），`expectedName` 取自目录（`server/src/gym/catalog.json`）英文名——与 client 测试对登记的校验口径（目录名须与 expectedName 一致）对齐。全程程序化提取与计算，无手抄哈希。
- **登记形制无需任何调整**：补登行与批次 85 自登记行字段集与字段序完全一致（`exerciseId / expectedName / sourceId / sourceUrl / license / author / sourceSha256 / phases / generated / note`）。
- 补登**不改动这 13 条的任何已发布字节**：本批构建以 `--only exdb:1458` 运行，清单与其余 846 条逐字保留（构建后 git 差异核过，清单仅新增 1458 一条）。
- **构建脚本批次号说明（如实记录，不改写历史）**：`scripts/build-exercise-media.py` 的生成来源块批次号在批次 84 时未随批更新（当时仍为 83），批次 84 的 13 条系由接入方按同形制直接构建清单条目、来源块正确标注批次 84；批次 85 恢复随批更新（83 → 85），本批续行（85 → 86，新接入的 1458 来源块指向本文件）。脚本批次号序列中「84」的缺位只是台账记录形态的历史痕迹，已发布来源块各自标注无误，无需也不应回填改写。

连同 1458 本行，本批 `scripts/exercise-media-approved.json` 共新增登记 14 行。

## 当前计数（构建报告口径）

- 图文完整：**847 / 1,329**（原始目录口径；扣除 Q1 归档 20 条与 C-31 归档 31 条后的有效口径为 **847 / 1,278**，待补有效口径 431）；照片类 734 条 = 真人实拍 349 + AI 生成 385；原创图解 113，另有连续视频 18；
- 弹力带类不变（34/61）；摄像头关联动作 56 个全部有图（report 脚本 cameraPending 为空）。

## 验证与部署记录

- 串行全套测试（2026-11-10 本地，接入工作树）：client `test:repository` **519/519** + `tsc -b` 通过；server **131/131** + build 通过；cloudflare **34/34** + typecheck 通过（cloudflare 首跑有 2 条 runtime 测试因本地子进程冷启动 `fetch failed` 失败，原样重跑 34/34 全过——既有环境 flake，与本批改动无关）。发布链计数三方一致：build 输出 847 image entries；publish-media-metadata 输出 847 records；publish-exercise-documentation 输出 complete 847 / photos 734 / pending 482（原始口径，含已归档 51 条；有效口径 complete 847 / pending 431 / total 1,278）；report 脚本 images 847 / missing 482 / cameraImages 56 / cameraPending 空。
- 登记校验：补登后 client 仓库套件全绿——`exercise-media.test.ts` 对每条 approved 登记逐条校验目录英文名与 `expectedName` 一致、清单条目存在且来源块完整（author/url/version/changes/sourceSha256 与许可白名单），13 条补登行派生自已发布清单、与校验口径逐项对齐；构建以 `--only exdb:1458` 运行，1458 之外全部条目在清单中逐字保留（git 差异核过）。
- 合并与 CI：接入提交 `3deb6f4`；main 合并 `ec716f4`；GitHub CI 运行 **42810644449** success。
- 部署（wrangler@4.158.0 直调 + vault token）：生产 Version **`3f3b5640-6599-49ae-aabe-23dcf7ba113d`**；预演经 step5 分支合并 `afb808b`（部署前 client 套件首跑 504/506、2 败且有测试文件未完整执行，同属冷启动 flake，原样复跑 519/519 全绿后部署），预演 Version **`7df713b8-50b4-4b4e-91c3-a2f5640b6361`**。线上核查（浏览器 UA）：1458 双帧 WebP sha256 生产 **2/2**、预演 **2/2** 全合；生产与预演 attribution.json 均实测 847 条且 exdb:1458 在列；生产首页 200；预演三张验收测试页（step5-heavy-test / step5-heavy-test-v2 / thunder-gate-test）均 200 保留完好。
