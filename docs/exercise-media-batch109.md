# 动作库素材批次 109：B1b HOLD 重开 6 条（定稿文本 + 生成图同批接入）— B1 HOLD 收官批

日期：2026-11-11

本批把「502 普查」B1 HOLD 线的 6 条（0010/0011/0012/0013 辅助组、0833 驴式提踵、0225 绳索飞鸟）按 B2 门定稿的正文与 Codex CLI 生成的双帧同批接入：文本按 B2 放宽门定稿并转 `checked`，图片走 `ai-codex-fillB1b-*` 生成图口径登记，二者同一提交上线。完整 1057 → **1063 / 1,278 有效口径**（全目录原始口径 1063 / 1,329，待补 266，其中 51 条为已软归档，有效待补 215）。照片 944 → **950**（真人 349 不变，AI 生成 595 → **601**），图解 113、视频 18 不变；摄像头关联动作 56/56 均有图。

**本批为 B1 HOLD 线的收官批**：B1 非常规画面 12 条 SPEC READY 中 11 条已于批次 108 接入，0154 搁置；6 条 HOLD 至此全部接入完毕。0154 仍搁置（起始帧两次失败、第三根缆绳残留），其失败帧 `exdb-0154-start.png` 绝不使用。

## 名单核对（接入前逐字核对）

接入前把本批名单对定稿源文件 `census-502/B1-HOLD-DRAFTS.md`（PASS 2 修正已应用）逐字复核：6 条全部定稿——0010、0011、0012、0013、0225，0833 经 Edward 2026-11-11 目录裁决取选项 (a)（俯身约 90°、双手撑稳固物、同伴骑坐下背/臀部负重提踵）；选项 (b) 改名/改器械不取。生成暂存 `chatgpt-batchB1b/` 的 12 张帧（每条起始/关键各一，全部经 PIL 校验为 1536×1024）与 6 条定稿严格对应，无多无缺；`FAILED/` 内有 0012 峰值初稿（直线下放）、0225 峰值初稿（近正面机位）、0013 峰值原稿（双手落大腿）、0012 峰值原稿（双手落小腿中段）、0013 修复第 1 稿（辅助者上身拱起过大）。6 条的目录英文名已对 `origin/main` 的 `catalog.json` 逐字复核；6 条在最新 origin/main 上仍待补（清单 1057 条中无此 6 条、审核状态均为资料待核对）。**接入文本源**：全部以 B1-HOLD-DRAFTS 定稿正文为准，接入脚本直接从 DRAFTS 文件程序化解析定稿步骤（逐字保真），步骤合并仅按发布器 3–5 步规则以分号连接相邻步、句子实质不变（合并记录见文末）。

**B2 定稿门（Edward 2026-11-10 批准）：** 无两专业来源逐字互证时，以条目名称承载的定义特征 + 通行做法定稿，正文不得发明负荷、组次、节奏、持续时间、最大幅度或康复疗效类主张；每条 `reviewReason` 均带「按通行做法定稿（B2 门）」标注与依据拆分（来源覆盖 / 通行做法 / 目录继承），逐条披露哪些内容有来源覆盖、哪些是通行做法、哪些继承自目录旧文。

## 文本定版与生成门记录

| ID | 条目 | 定版要点（依据拆分 + 正文变更，逐条披露） | 生成图门记录 |
|---|---|---|---|
| exdb:0010 | assisted hanging knee raise with throw down（辅助悬垂举膝下压） | 来源覆盖：Muscle & Fitness《Partner Up for Shredded Abs》（Mehmet Edip）与 Redefining Strength《The Partner Cardio-Core Workout》（Cori Lefkowith），两家可署名专业来源印证辅助者下压小腿、练习者抵抗下放；Fitwill 与 Lyfta 同名页（镜像家族）「push the lower legs down」「throw down your knees… Resist」；最高点微收骨盆与停顿、不反弓、不摆动、每组间止摆均来自 Fitwill。目录继承：第 1—2 步悬垂姿势与抬膝至胸前。已排除的异读：ManiacMuscle 器械椅自助版（无辅助者）不采用。正文变更：第 1 步补辅助者位置与接触点（身前、双手扶小腿）；第 2 步补最高点停顿与骨盆微收；第 3 步将自助「爆发性地把腿扔下」改为辅助者下压 + 练习者抵抗；第 4 步删除现行「让双腿向后摆动」，改为静止后开始下一次；第 5 步按 G1 收尾。定稿 5 步原文直存。 | 双帧经父级亲核：起始帧悬垂、双臂全伸、手掌背向，膝抬至胸前、双腿并拢，辅助者站身前、双手扶小腿；峰值帧辅助者双手向下推压小腿，练习者腿下放至中途、膝仍微屈、双脚离地、无腰部反弓、无身体摆动。双帧均首稿过门，无披露。 |
| exdb:0011 | assisted hanging knee raise（辅助悬垂举膝） | 来源覆盖：Fitwill「Assistance from a station or partner helps reduce swinging」；Lyfta FAQ「having someone hold your legs」；Exsercise「use light partner help only when the hang or raise would otherwise collapse」。目录继承：第 1—2 步悬垂姿势与抬膝、第 3 步最高点暂停与挤压腹肌。**辅助形式为编辑定义**：同伴扶持；肘撑器械椅为另一有来源的形式，本稿未取（Lyfta 扶手措辞、ffocus；WellLifeUP 计划表亦列为肘撑形式但 PASS 2 未能检索到该页原文、不计入已验证来源）；取同伴形式的理由：现行第 1 步已定为引体向上杆悬垂（G3 继承）；家族一致性（0010/0012/0013 的辅助均为同伴）；B1 HOLD 的理由本身预设画面中有辅助者；接触点「小腿」是对「hold your legs」的编辑落点。**本句已按 filing 条件写入 reviewReason，不得删。**正文变更：第 1 步补辅助者位置与接触点；第 2 步补「轻托助力、稳住身体」；第 3—5 步继承不变。定稿 5 步原文直存。 | 双帧经父级亲核：起始帧悬垂、双腿自然下垂，辅助者站身前、双手扶住练习者小腿/膝部区域；峰值帧膝抬至胸前、双腿并拢、最高点停顿，辅助者双手在脚踝处轻托助力、无下压动作，与 0010 的下压形成对照。已接受的披露：起始帧辅助者双手落在膝盖高度而非小腿中段，峰值帧双手在脚踝处，两帧手位不一致，记录不改判。 |
| exdb:0012 | assisted lying leg raise with lateral throw down（辅助仰卧举腿侧向下压） | 来源覆盖：Fitwill「a partner pushes them downward and slightly to one side while you resist the force」；Muscle & Fitness「Throwing them to the side at least 45 degrees works the oblique muscles」；Redefining Strength「They can throw them straight ahead or angled to one side or the other」；ManiacMuscle「pushes or throws your legs slightly to one side instead of straight down」「Fight to keep your hips and torso from twisting」「Do not allow the heels to slam down」；握辅助者脚踝固定上身（M&F、Redefining）；辅助者站于头侧、双脚分于头两侧（M&F「头置于辅助者双脚之间」、Fitwill）；双腿抬至垂直、保持伸直并拢（Fitwill、Redefining）。**另一锚定体系的变体（已按 filing 条件补入证据注）**：ManiacMuscle 同名页取脚侧站位＋握器械锚点（「Your partner stands near your feet」「Grip a stable anchor: Hold the edge of a bench, a rack post, or another stable support behind your head」），其侧向下压与抗旋转的执行描述与本稿一致，分歧只在辅助者站位与练习者手握锚点；本稿取三家一致的头侧＋握辅助者脚踝形式。已排除的异读：单腿版是另一动作，不移入双腿正文。正文变更：第 1 步补垫子与辅助者头侧站位；第 2 步将「双手放臀下」改为握辅助者脚踝，并补「抬至垂直」；第 3 步写明辅助者握脚踝、向下压向一侧及抵抗要求；第 4 步保留「离地几英寸」与暂停；第 5 步按 G1″ 合并换边与样板句；M&F「至少 45 度」记入证据注、不写入正文。定稿 5 步原文直存。 | 双帧经父级亲核：起始帧辅助者站头侧、双脚分于练习者头部两侧，练习者双手握辅助者脚踝，双腿并拢抬至垂直、伸直，辅助者双手握练习者脚踝；峰值帧经一次锚定修复（双手由小腿中段移至握脚踝，1 稿成功），机位为头侧高位俯视，双腿向练习者左侧偏出、与躯干中线约成 45°、离地几英寸、双脚不触地，练习者双手仍握辅助者脚踝。已接受的披露：起始帧为足侧三/四分机位、峰值帧为头侧高位俯视，机位不同为呈现「侧向」改道之举，按 1458/0989 机位改道先例披露，两帧人物、服装、器械、场地一致。 |
| exdb:0013 | assisted lying leg raise with throw down（辅助仰卧举腿下压） | 来源覆盖：Fitwill「The partner should push the legs downward in a straight line with firm but predictable pressure. Resist the throw, lower slowly, and stop before the heels touch down」；握辅助者脚踝、辅助者站于头侧、双腿抬至垂直同 0012 的来源（M&F、Redefining、Fitwill），直线版亦适用（M&F「throw your legs away and down」、Redefining「throw them straight ahead」）；双脚不触地、近地面前稳住（M&F、Redefining）。**证据推翻规格的重开方向**：B1-SPECS 写辅助者「脚侧」，三家来源一致指头侧，本稿取头侧（PASS 2 复核确认）。正文变更：第 1—2 步同 0012 的对应修改；第 3 步写明直线下压（与 0012 的侧向形成对照）；第 4 步清理现行第 5/6 步对「放下」的重复描述，并补来源自带的近地面前稳住；第 5 步按 G1 收尾。定稿 5 步原文直存。 | 双帧经父级亲核：起始帧与 0012 同 setup（头侧、握辅助者脚踝、双腿抬至垂直）；峰值帧经两次锚定修复（双手由大腿上部移至握脚踝，取第 2 稿），双腿沿直线向下放低、近地面前稳住、双脚不触地，练习者双手仍握辅助者脚踝。已接受的披露：修复后辅助者躯干较原帧更深俯身（够到脚踝的必然结果），其余（直线下放、机位、场地）不变。原稿（双手落大腿）与修复第 1 稿（上身拱起过大）均归档于暂存 `FAILED/`。 |
| exdb:0225 | cable standing cross-over high reverse fly（绳索站姿交叉高位反向飞鸟） | 来源覆盖：Physitrack《Cable machine rear deltoid fly in standing》「The cables will cross for this exercise, so reach up and grasp the right cable in the left hand, and the left cable in the right hand」；Lyfta「Pull the handles of the cable machine out to your sides and slightly backwards」；ManiacMuscle「Pull the handles outward and slightly backward in a wide arc… rear-delt fly, not a row」；LiftManual「grips a high cable in each hand crossing the arms in front, then pulls them wide and back」；EresFitness「Pull your arms out to the sides and back until aligned with your back」；起始双臂胸前交叉（ManiacMuscle、LiftManual、Lyfta）；手掌斜朝下（Physitrack）。滑轮高度取「略高于肩」：四家独立来源一致指肩以上（LiftManual high position、ManiacMuscle slightly above shoulder height、Physitrack highest point、EresFitness high pulleys），支持肩同高的只有镜像家族（ffocus）与目录自身；**Lyfta 未写滑轮高度（PASS 1 证据注称 Lyfta 亦支持肩同高有误，已更正）**。挤压肩胛只在向后打开时成立：现行第 5 步「拉向身体前方」+「挤压肩胛」自相矛盾，且目录目标肌群字段已是后侧链；正向（体前夹胸）无独立来源，FitnessVolt 同名页复述目录正文、不是独立证据；选项 (b)（改为体前夹胸并改标题）已否决。正文变更：第 1 步滑轮高度为「略高于肩」；第 3 步改为起始交叉握法与手掌斜朝下；第 5 步纠正为「向两侧后方打开」；第 6 步「最高点」改为「动作末端」；第 7 步按 G1 收尾。定稿 7 步 → 存储 5 步（第 1、2 步与第 5、6 步分号合并）。 | 双帧经父级亲核：起始帧双滑轮略高于肩，左右手交叉握对侧手柄、双臂胸前交叉、手掌斜朝下，两根缆绳各从一侧滑轮连至对侧手、胸前交叉一次成单 X；峰值帧经机位改道修复（侧面 3/4 机位），双臂向两侧后方宽弧线打开、手在躯干正面平面之后，挤压肩胛，肘微屈，左手仍握右滑轮手柄、右手仍握左滑轮手柄。已接受的披露：起始帧与峰值帧机位不同（正面 vs 侧面），为呈现「向后打开」改道之举，按 1458/0989 机位改道先例披露，两帧人物、服装、器械、场地一致；修复后峰值滑轮高度约与肩平、略高于肩的读数不如起始帧明显。 |
| exdb:0833 | weighted donkey calf raise（负重驴式提踵） | 来源覆盖：Tiger Fitness《Donkey Calf Raise》（Marc Lobliner）「allowing a partner to sit on your back with a platform under your toes」；need.fit「standing on a calf block while bent forward over a bench with a dip belt or partner loading」「Hinging 90 degrees at the hips」；LiftManual「Have a training partner sit on your lower back (across your hips, not your spine)」；膝盖伸直、不锁死（Tiger Fitness、need.fit）；顶部停顿继承现行正文第 4 步。**目录裁决：Edward 2026-11-11 裁决取选项 (a)**（俯身约 90°、双手撑稳固物、同伴骑坐下背/臀部负重提踵），选项 (b) 改名/改器械不取；ExRx 同名页经转引、未直接打开核读，不计入独立证据数；三家独立来源已满足 B2 门。正文变更：第 1 步补俯身约 90 度、前臂撑凳（PASS 2 修正：原稿「双手扶住身前的长凳或稳固物」改为「前臂撑在身前的长凳上、双手握住长凳边缘」，与 LiftManual「brace your forearms on a bench」及 Tiger Fitness「forearms on the supporting pad and grip the handles」一致）、膝盖姿态；第 2 步新增同伴骑坐负重，此为名称中 weighted 的落点；第 3 步删除现行「尽可能抬高」的最大幅度措辞；第 4 步继承顶部停顿；第 5 步按 G1 收尾；器械（dip belt、器械驴式机）作为替代负重形式存在，本稿取同伴负重一种画到底、不混用。定稿 5 步原文直存。 | 双帧经父级亲核：起始帧侧面机位，练习者俯身约 90°、前臂撑凳、双手握凳缘，前掌踩高台边缘、脚跟悬空且降至台面以下，膝直不锁，同伴骑坐于下背/臀部、双腿垂于两侧；峰值帧（额度恢复后补生成，1 稿通过；Codex 用量上限 2026-11-11 23:52:33 北京时间恢复，探活通过后执行）脚跟抬至最高、前掌仍在高台边缘（放大核实未整脚离台）、小腿收紧，同伴仍骑坐于下背/臀部。已接受的披露：同伴穿深蓝 T 恤（与练习者灰色背心不同，便于区分两人），同伴双脚悬空未触地（骑坐自然结果）。 |

补充说明（与上表互补，均为已披露事项）：

- **生成采用率：本批 12 帧中 0833 峰值、0012 峰值修复各 1 稿即过终门；0013 峰值修复用满 2 稿（第 1 稿上身拱起过大，第 2 稿取用）**；其余 9 帧首稿过门。0012/0013 峰值修复均以现帧为锚、只改手位；0013 修复第 2 稿明确要求辅助者深俯身、髋部保持低位。
- **0012/0013 对照成立**：两条共用起始 setup（头侧、握辅助者脚踝、双腿垂直），峰值帧一为侧向约 45°、一为直线下放，区分清晰；修复后两条的辅助者手位均为握脚踝，与正文一致。
- **0833 额度事件**：生成会话在起始帧落盘后、峰值帧生成时触 Codex 用量上限（HTTP 429 `usage_limit_reached`，`resets_at` 1794412353 = 2026-11-11 23:52:33 北京时间），按纪律停工不重试；额度恢复后探活通过，仅补生成峰值帧，未重做起始帧。

## 仅记录的元数据旗标（不改数据）

- 无。

## 步骤合并记录（发布器 3–5 步规则）

- 0225：定稿 7 步 → 存储 5 步，第 1、2 步与第 5、6 步分号合并（与 108 批先例一致，保留原句末句号后接分号）。
- 其余 5 条定稿步数本在 3–5 步内，原文直存。全部合并仅以分号连接相邻步，定稿句子实质不变。

## 本批信号

1. **B1 HOLD 收官**：6 条 HOLD 全部接入；B1 非常规画面 12 条 SPEC READY 中 11 条（批次 108）+ 6 条 HOLD（本批）= 17 条已接入，仅 0154 搁置待重排。B1 线至此只剩 0154 一条未决。
2. **锚定修复有效但不保证首稿成功**：0013 峰值手位修复第 1 稿改了手、但辅助者上身拱起过大，第 2 稿以「深俯身、髋部低位」定向指令才取用；只改手位的修复提示词须同时写死躯干姿态，否则模型会为够到目标点重摆上身。
3. **Codex 用量上限纪律**：0833 峰值帧因 429 停工，额度恢复（23:52:33）后探活通过才续做，未循环重试；本批 4 个生成会话 token 约 38k / 17k / 38k / 43k。

## 当前计数（构建报告口径）

- 图文完整：**1063 / 1,329**（原始目录口径；扣除 Q1 归档 20 条与 C-31 归档 31 条后的有效口径为 **1063 / 1,278**，待补有效口径 215）；照片类 950 条 = 真人实拍 349 + AI 生成 601；原创图解 113，另有连续视频 18；
- 弹力带类不变（40/61）；摄像头关联动作 56 个全部有图（report 脚本 cameraPending 为空）。

## 验证与部署记录

- 名单核对：B1-HOLD-DRAFTS 名单、生成暂存帧、origin/main 待补状态三方一致（见上）；0154 确认未接入、仍待补。
- 串行全套测试（2026-11-11 本地，接入工作树）：client `test:repository` **534/534** + `tsc -b` 通过；server **131/131** + build 通过；cloudflare **34/34** + typecheck 通过。发布链计数四方一致：build 输出 1063 image entries；publish-media-metadata 输出 1063 records；publish-exercise-documentation 输出 complete 1063 / photos 950 / pending 266（原始口径，含已归档 51 条；有效口径 complete 1063 / pending 215 / total 1,278）；report 脚本 images 1063 / missing 266 / cameraImages 56 / cameraPending 空。
- 登记校验：`scripts/exercise-media-approved.json` 新增 6 行（sourceId `ai-codex-fillB1b-<id>`，登记总数 939 → 945），sourceSha256 全部由暂存候选字节程序化计算、无手抄；构建脚本批次号随批更新（108 → 109，来源块指向本文件、版本「2026-11-11 · 生成批次 109」）；client 仓库套件对每条登记逐条校验目录英文名与 `expectedName` 一致，全绿。构建以 `--only` 限定本批 6 条，其余 1057 条清单逐字保留（清单 diff 核验：仅新增本批 6 条、零删除、零改动）。
- 集成提交 `a617711`；main 合并 `7e8c43f`；GitHub CI 运行 **43058605249** success。
- 双站部署（`npx wrangler@4.158.0 deploy` 直跑）：生产 Version `22508bf0-bf23-4983-bb75-b00c0e0b5aa9`；预演经 step5 分支合并（分支真实尖端先以 `git ls-remote` 核实为 4e4e796，显式 fetch 后合最新 main 并推送为 cea57ec；合并后 client 套件复跑 534/534），预演 Version `5ff745f0-7c4f-41ad-8c82-bd74d004119d`。
- 在线核查（浏览器 UA，curl；urllib 直读在本机代理下会被截断，不可作结论）：新图 12 张双站 sha256 **24/24** 全合；双站 attribution.json 均实测 1063 条；双站首页 200；预演三张验收测试页（step5-heavy-test / step5-heavy-test-v2 / thunder-gate-test）均 200 保留完好。
- 「动伴进度」空间已于同轮同步（1063 / 1,278，约 83%）。
