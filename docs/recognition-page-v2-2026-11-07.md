# 识别页 v2 落地记录（2026-11-07）

定版依据：`~/workspace/goals/movemate-development/files/recognition-design-v2.html`
（Edward 2026-11-07 批准整体方向；陪伴话术热度定档「适中」）。
北极星：聊天式运动陪伴、鼓励与情绪价值第一，姿势提示适度而准确。

## 落点组件

| 层 | 文件 | 内容 |
|---|---|---|
| 文案中枢 | `client/src/features/motion/lib/companionCopy.ts` | 19 条对照文案常量、禁用词表、`buildSetReveal`（先报进步→接住退步→事实兜底）、`milestoneLine`、`repDoneLine`、`workoutDoneLine` |
| 骨骼绘制 | `client/src/features/motion/lib/displayPose.ts`、`components/PoseCanvas.tsx` | V4-B 分档绘制（见下）；评估器/计数/评分/平滑外推未动 |
| 自由训练 HUD | `client/src/features/motion/pages/Workout.tsx`、`client/src/training.css` | 全幅画面覆盖层：状态胶囊、语音 chip、校准环、大号计次、单句陪伴句；计时校准前不渲染 |
| 计划训练 HUD | `client/src/features/gym/PlanWorkout.tsx`、`features/gym/gym.css` | 同款胶囊 + 语音 chip；组中评分行/四轴行移除；组间休息区揭晓块 |
| 组间揭晓 | `pages/Summary.tsx`（自由训练结算）、`PlanWorkout.tsx` 休息区 | 进步先行（真实差值）→ 四轴 AnimatedProgress 生长 → 只给一个小目标 |
| 诊断折叠 | `components/RecognitionStatus.tsx`、`features/gym/PlanRecognitionStatus.tsx`、`components/PoseDiagnostics.tsx` | 入口统一改名「识别详情」，原「当前阶段：…」行移入折叠层，字段一条未删 |
| 引擎文案 | `lib/exerciseMetrics.ts`、`lib/extendedRecognition.ts`、`lib/adaptiveRecognition.ts`、`features/gym/planRecognition.ts`、`lib/poseFeedback.ts`、`lib/coachCues.ts`、`server/src/gym/new-recognition.json`、`server/src/gym/library-recognition.json` | 阶段词、校准、完成、打断、提示全量换陪伴版 |

## 骨骼分档（V4-B，仅显示层）

- 连线按两端关键点可见度的弱者分档：≥0.5 实线（#00c65e，4.5px）、0.3–0.5 琥珀虚线（#f5b93f，[7,6]）、<0.3 不画。
- 主关节（肩/肘/腕 11–16）实心 + 白色外环（r6）；次关节小点（r4）；受影响关节琥珀大点（r8）；可见度 <0.3 的关节不画。
- 移除了旧绘制的发光（shadowBlur），符合方案「克制」红线。F1–F3 的 One-Euro 平滑与速度外推原样保留；`displayPose` 只新增纯函数 `segmentGrade`/`jointTier`，有单测覆盖边界。

## 19 条文案落地

全部落地（热度=适中）。主要落点：行 1 准备页页脚；行 2 自适应校准引导标题 + 出画提示；行 3 等待起始（基础四 + 扩展/计划引擎）；行 4 校准暂停（校准改为跨帧累积、不清零，文案与行为一致）；行 5 校准完成（引擎消息 + HUD 事件句）；行 6 峰值（弯举类逐字采用，其余动作按同句式适配）；行 7 完成一次（引擎完成反馈 + `repDoneLine`）；行 8/9 里程碑（HUD 事件句 + 语音 cue）；行 10 上臂提示逐字；行 11/12 幅度/速度提示（poseFeedback + 引擎近峰值提示）；行 13 出画；行 14 看不清/冻结（自适应冻结路径全量）；行 15 半程未完成；行 16 三维依据不稳；行 17/18 组间揭晓（`buildSetReveal`）；行 19 训练完成（结算标题，见偏差 1）。

红线执行：鼓励只挂真实事实——进步句带真实差值（如「屈肘幅度比上一组好了一截（60 → 80）」）、里程碑只在真实计数点触发、连续天数只在 streak>1 时出现；无事实时用中性陪伴句或事实句。姿势提示一次只给最要紧的一条（HUD 陪伴句优先级：事件句 → poseFeedback 主问题 → 引擎阶段反馈）。禁用词（下降/变差/失败/丢弃/无效/冻结）有单测扫描全部陪伴常量与 poseFeedback 动作句。

## 偏差清单（如实）

1. **行 19**：设计例句后半「你比昨天又强了一点」无数据支撑，按方案自身红线删除；标题只用「今天陪你练完啦」，连续天数 >1 时追加真实事实后缀。
2. **行 8**：半程句不用「节奏特别稳」（无节奏测量数据），用中性版「一半啦，保持住」。
3. **行 17**：落地句式为带真实差值的「先说进步：X 比上一组好了一截（a → b）——你的进步，我都记着呢」，比设计例句更贴合「鼓励必须挂事实」红线；设计例句原句保留为常量 `COPY_SET_BETTER`（单测覆盖，未在 UI 使用）。
4. **诊断分两块**：`PoseDiagnostics`（模型与性能）保留为独立折叠块，改名「识别详情 · 模型与性能（仅本机）」；识别字段折叠块改名「识别详情（仅本机）」。内容均未删。
5. **计划训练的会话累计计时**（侧栏「累计有效运动」）未隐藏：它是整场累计而非单组时钟；计划流程的单组 HUD 本就不显示计时。自由训练的单组计时严格执行「校准闩锁前不渲染」。
6. **桌面端（≥1100px）**：HUD 不在画面上叠加，计次/计时/陪练句走右侧栏（设计稿桌面方案），移动端为画面覆盖层。语音详细控制条仍在栏内，画面上只有开关 chip。
7. **计划流程的组间对比**只在本场训练内已完成的相机组之间进行（数据来自已保存的评分组累加器，四轴均值口径与结算一致）；跨场次对比在自由训练结算页（基于历史记录）。计划流程若本场没有上一组，揭晓只陈述本组事实。
8. **各动作的器械/体位有效性说明**（如「请平躺平凳」类门槛说明）与 `framingFeedback` 的关节级站位引导保持原文：它们是精确的操作说明、语气已中性，且被测试锁定；不在 19 条范围内。
9. **诊断技术字符串**（计数依据、动作幅度、最近重置原因）保留工程原文，只出现在折叠的「识别详情」里。为此三个跟踪器的 `interrupt()` 拆为技术原因（诊断）+ 陪伴反馈（界面）双参数，界面不再透出技术原因。
10. **校准进度文案**保留起始姿势锚点：「就快好啦，保持起始姿势（N%）」——前举圆 2 的教训是校准中绝不能给出会误导站位的句子。

## 验证

- client `test:repository` 369/369（基线 360 + 新增 companion-copy 9 条：揭晓分支、里程碑、禁用词扫描、骨骼分档边界）。
- client `tsc -b` 通过；server 103/103（两份阶段文案 JSON 已同步）。
- 计数/评分/门控逻辑未改：仅字符串、显示绘制与 HUD 结构变更；`interrupt` 签名扩展保持默认行为兼容。
