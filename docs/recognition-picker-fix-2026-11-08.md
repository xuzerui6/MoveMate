# 识别扩容动作补进独立训练选择器（picker fix）— 2026-11-08

## 缺口

Edward 在真机打开 dongban.xyz 的「AI 动作训练」选择器，发现识别扩容第一、二梯队
（docs/recognition-expansion-tier1/tier2-2026-11-08.md）的 13 个动作目录条目
（12 个识别 profile）不在列表里：选择器只有基础 4 种 + 原有试用 6 种。

根因：两梯队的接线只做了计划路径——服务端 `planCamera` 绑定与动作库
`camera:'1'` 过滤。独立选择器的注册表是另一份数据
（`server/src/gym/new-recognition.json`，经 `client/src/features/motion/lib/newExercises.ts`
进入 `CAMERA_EXERCISES`），从未被扩容工作触及；服务端独立会话白名单
`CAMERA_TYPES` 也由这份注册表生成，所以这些动作连独立会话都无法创建。

为什么三方验证没拦住：tier 1/2 的自动验证面是「计划开始（gym actWorkout）+
动作库 camera 过滤 + 云端运行时」——三者都不经过 `Training.tsx` 的
`CAMERA_EXERCISES`，也没有任何测试断言「camera-linked 的 profile 必须能从
选择器到达」。本次新增的 `client/tests/picker-registry.test.ts` 正是补这条断言。

## 修法（单一注册表，不建平行副本）

把 12 个 tier profile 作为条目追加进 `server/src/gym/new-recognition.json`。
该注册表同时驱动：选择器列表、`isNewExercise`、服务端 `CAMERA_TYPES` 白名单
（独立会话 XP 规则对白名单内 camera 会话一律 reps × 2，选择器上的
「每{unit} 2 XP」文案因此与服务端一致，无需改服务端计费代码）、
`RecognitionStatus` 的阶段文案、`Workout` 的示范条目 id 与试用提示。

字段来源：`name/english/unit/placement/instruction/joints/axes/stages/exerciseIds`
逐字复制自 `server/src/gym/library-recognition.json` 的对应 profile，
`recognitionVersion: 6` 同步复制。**唯一新增字段是 `breathing`**（一条呼吸引导，
按注册表现有条目的句式写：用力阶段呼气）——library profile 的形状里没有这个
字段，而独立路径的语音陪练（coachPolicy）要读它。picker-registry 测试用
deepEqual 钉住其余 10 个共享字段与 library 逐字一致，防止两份数据漂移。

计划路径不受影响：`server/src/gym/camera.ts` 合并时 library 展开在后、
同名键以 library 为准；`planProfiles` 键集不变（56 个 camera-linked 条目的
服务端断言继续成立）。客户端 `createRecognitionTracker` 对 library profile
优先路由，与计划路径构造同一个 tracker（见下表，picker-registry 测试逐个钉住）。

协议版本：真实客户端恒发 `X-MoveMate-Recognition-Version: 6`；这 12 个条目
同时是 library profile，版本门以 library 条款为准（恰为 6），独立会话与
计划开始行为一致。

## 映射表（选择器条目 ↔ 目录条目 ↔ profile ↔ tracker）

| 选择器条目（profile） | 名称 | 目录条目 | Tracker（与计划路径同一构造） |
|---|---|---|---|
| dumbbell_standing_press | 站姿双哑铃肩推 | exdb:0426 | PlanExerciseTracker('shoulder_press') |
| barbell_military_press | 杠铃站姿军事推举 | exdb:1456、exdb:1457 | PlanExerciseTracker('shoulder_press') |
| dumbbell_reverse_lunge | 哑铃后撤弓步 | exdb:0381 | PlanExerciseTracker('reverse_lunge') |
| dumbbell_deadlift | 哑铃传统硬拉 | exdb:0300 | ExtendedExerciseTracker('barbell_deadlift') |
| one_arm_row | 哑铃单臂俯身划船 | exdb:0292 | ExtendedExerciseTracker('one_arm_row') |
| lying_leg_raise | 平凳仰卧举腿 | exdb:0620 | ExtendedExerciseTracker('lying_leg_raise') |
| upright_row | 哑铃直立划船 | exdb:0437 | ExtendedExerciseTracker('upright_row') |
| mountain_climber | 登山跑 | exdb:0630 | ExtendedExerciseTracker('mountain_climber') |
| split_squat | 哑铃单腿分腿蹲 | exdb:0410 | ExtendedExerciseTracker('split_squat') |
| seated_calf_raise | 坐姿哑铃提踵 | exdb:1379 | PlanExerciseTracker('seated_calf_raise') |
| barbell_good_morning | 杠铃早安式 | exdb:0044 | ExtendedExerciseTracker('romanian_deadlift') |
| bench_dip | 屈膝凳上臂屈伸 | exdb:0129 | ExtendedExerciseTracker('bench_dip') |

1456/1457 在计划路径本就是同一个 profile（barbell_military_press），
选择器同样合并为一个条目——与计划路径的处理一致。

56 个 camera-linked 目录条目的去向（picker-registry 测试全量核算）：
26 个经选择器可达（4 基础 + 原试用 6 个 profile 的 9 个条目 + tier 13 个条目），
30 个为计划专用并在测试中显式列名（6 个计划 profile：biceps_curl、
lateral_raise、shoulder_press、bent_over_row、reverse_lunge、calf_raise；
16 个扩容前的 library profile——不在本次范围）。

## 标签计数

试用页签 = 原 6 + tier 12 = **18 种**。`Training.tsx` 不再写死数字，
改为从注册表派生（`Object.keys(CAMERA_EXERCISES).filter(isNewExercise).length`），
以后注册表增减自动跟随。基础 4 种页签未动。

## 连带发现并修复：左右计数校验只认 standing_leg_curl

one_arm_row / mountain_climber / split_squat 的 tracker 每次完成动作都会在
scoreAccumulator 写入 leftReps/rightReps（左右和恒等于总次数）。但服务端两处
校验只给 standing_leg_curl 开了口子：

- `motion.service.ts`（独立会话）：非 standing_leg_curl 类型携带左右字段直接
  拒绝（「该动作不支持左右计数」）——这 3 个动作的独立会话第一次进度同步就会
  失败，本次不修则选择器接了也用不了。
- `gym/service.ts`（计划组）：同样的白名单——PlanWorkout 本就原样转发
  scoreAccumulator，所以这 3 个 profile 的**计划组在 tier 1/2 上线时已带此
  隐患**（自动测试当时发送的是不带左右字段的干净 score，未覆盖）。

修法：`motion.service.ts` 新增 `SIDE_COUNT_TYPES`
（standing_leg_curl、one_arm_row、mountain_climber、split_squat），这组类型
要求左右和与总次数一致、其余类型仍拒绝左右字段；`gym/service.ts` 的允许
名单同步扩到这 3 个 profile。客户端顺带把 Workout/Summary 的左右计数行
从仅 standing_leg_curl 扩到这 4 个类型（文案样式不变）。

## 演示模式

`newDemonstrationPose` 为 12 个条目补了 neutral/peak（单臂划船、登山跑另有
left/right）演示姿态，几何逐字移植自已通过横竖屏验收的 fixtures
（tests/fixtures/plan-camera.ts、library-camera.ts）；barbell_good_morning
与 romanian_deadlift 共用同一 tracker，复用其演示姿态。演示驱动
（useExerciseMetrics）对 one_arm_row、mountain_climber 启用左右交替阶段循环
（与 high_knees、standing_leg_curl 同组）。picker-registry 测试按演示驱动的
真实时序（中立 2.6s + 每阶段 1s）断言每个条目都能计出 ≥2 次，
单侧类左右各 ≥1 次。

另一处连带变化（良性）：PlanWorkout 的语音上下文此前对 tier 条目传
exerciseType='plan'，现在 isCameraExercise 为真后传真实 profile，
陪练会读到该动作自己的 instruction/breathing，仅文案更具体，不改变会话与计数。

## 测试

- client test:repository：436 → **466/466**
  （extended-recognition 通用循环随注册表自动覆盖 12 个新条目 ×2 场景 = +24；
  新增 picker-registry 6 个测试；该循环的 tracker 构造改走生产工厂
  `createRecognitionTracker`——计划路由的 profile 此前被直接用
  ExtendedExerciseTracker 构造、绕过了工厂，本次一并纠正；
  library-recognition 的断言由「library profile 不是 camera 动作」更新为
  「是 camera 动作 ⟺ 在独立注册表中」，即本次产品变化本身）
- server：115 → **127/127** + build 通过
  （独立协议循环随注册表自动覆盖 12 个新条目；循环内协议版本按条目
  recognitionVersion 取值——tier 条目为 6、原 6 为 2；每个条目的 XP 结算
  断言仍为 2 次 = 4 XP；计划映射循环同步按条目版本启动，并给单侧类条目
  发送合法的左右计数 payload，钉住上面的校验修复）
- cloudflare：34/34 + typecheck 通过

## 部署记录

- Commit：`88e58e3`（main，fast-forward 合并 feat/recognition-picker-fix；
  合并时 origin/main 仍为 fe8063b，视频窄口批次已在此前落地，无冲突）。
  GitHub CI（run 42474795442）：success。
- 生产 dongban.xyz：Version `76fd5a2a-edd7-41de-8be7-e37793350c17`。
- 预览 preview.dongban.xyz：Version `13f5491d-c661-49e1-bb75-cdc667db9679`。
- 服务器依赖本次在部署 worktree 内 `npm ci --prefix server` 干净成功
  （bcrypt 预编译包正常加载），未用 node_modules 拷贝回退。
- 生产 bundle 核验（部署后从 dongban.xyz 实际拉取）：首页引用
  `assets/index-8R7-65Fw.js`（与本地构建哈希一致，预览站相同）；
  `assets/Training-aDUQECl6.js` 含派生标签表达式（渲染为「新增18种 · 试用」）；
  `assets/exercises-DMI87hot.js` 含全部 12 个新动作名
  （站姿双哑铃肩推、杠铃站姿军事推举、哑铃后撤弓步、哑铃传统硬拉、
  哑铃单臂俯身划船、平凳仰卧举腿、哑铃直立划船、登山跑、哑铃单腿分腿蹲、
  坐姿哑铃提踵、杠铃早安式、屈膝凳上臂屈伸）与 profile 键
  （mountain_climber、dumbbell_standing_press、barbell_good_morning、
  one_arm_row 等）。
- 试用页签最终形态：「基础4种」不变；「新增18种 · 试用」共 18 个条目。
  Edward 真机点选 12 个新动作的实际识别体验待复测。
