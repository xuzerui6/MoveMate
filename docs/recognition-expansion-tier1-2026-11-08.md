# 识别扩容第一梯队（2026-11-08）

依据：`~/workspace/movemate-research/recognition-expansion-survey-2026-11-08.md` 第 3 节第一梯队（绑定规范）。本轮接入 6 条目录条目，摄像头可识别总数 **43 → 49**（服务端白名单 `planCameraFor` 校验 + 客户端注册表 + Cloudflare 运行时三处计数断言同步更新）。全部沿用现有「试用」口径：planCamera 状态 `trial`、摄像头不验证握法/重量、变式不互认。

## 逐条绑定

| 条目 | 新档案（library-recognition.json） | 路由（client recognition.ts） | 复用模式与继承门限 |
|---|---|---|---|
| exdb:0426 站姿双哑铃肩推 | `dumbbell_standing_press` | `PlanExerciseTracker('shoulder_press')` | C 推举档案直绑：双肘 55–125° 且手高 −0.1~0.8 躯干长为起始，峰值肘 ≥150° 且手高 ≥0.5，门限逐字未动 |
| exdb:1456 杠铃站姿军事推举（窄握）+ exdb:1457（宽握） | `barbell_military_press`（一档两条） | 同上 | 同上；**宽窄握不分辨**，与档案既有口径一致，准备页文案明示 |
| exdb:0381 哑铃后撤弓步 | `dumbbell_reverse_lunge` | `PlanExerciseTracker('reverse_lunge')` | I 弓步档案直绑：起始膝 ≥150° 且后撤位移 <0.15 腿长，峰值位移 ≥0.22 且膝 ≤125°，逐侧计数 |
| exdb:0300 哑铃传统硬拉 | `dumbbell_deadlift` | `ExtendedExerciseTracker('barbell_deadlift')` | F 髋铰链分支逐字复用：起始髋 45–130°、膝 75–145°、手在膝与踝之间；峰值髋、膝 ≥160°；跟踪侧手臂伸直门、脚位锚点门均不变 |
| exdb:0292 哑铃单臂俯身划船 | `one_arm_row` | `ExtendedExerciseTracker('one_arm_row')`（新增类型） | 见下节，为本梯队唯一新周期定义 |

五档均带 `recognitionVersion: 6`（与当前客户端识别版本一致，旧页面会被服务端版本门拦下并提示刷新，同 v4/v5 批次档案的既有做法）。

自适应管线归属（按克隆先例：`barbell_row`、`neutral_seated_press` 等同构克隆档案均在 `adaptiveEligible` 名单内）：`dumbbell_standing_press`、`barbell_military_press`、`dumbbell_deadlift` 加入名单（其测量模式 shoulder_press / barbell_deadlift 本就在自适应管线内）；`dumbbell_reverse_lunge` 不加（reverse_lunge 本体为 legacy）；`one_arm_row` 不加（新行为，未做自适应评估，按盘点报告口径单独评估后再定）。

## exdb:0292 单臂俯身划船：逐侧新定义

实现位置：`ExtendedExerciseTracker` 新增 `one_arm_row` 分支（measure 门 + `updateOneArmRow` 逐侧周期 + `emitOneArmRowRep`），周期机器复用锤式弯举的逐侧 SideCycle / feedPeakTrack / 回位累积，未动任何既有动作的代码路径。

- **门限全部继承俯身划船档案**，无新造数值：躯干倾角 25–85° 姿态门（超出返回形态错误，与既有形态门同族）；工作侧肘角起始 ≥145°、峰值 ≤100°；深度信号取 100 − 肘角喂峰值轨迹（穿越确认、PEAK_MIN_DWELL 等采样层规则与锤式相同）；峰值幅度公式 `(160 − 峰值肘角)/90 × 100`、躯干分 `100 − |倾角 − 校准倾角| × 3` 均为 bent_over_row 原公式。
- **逐侧独立**：两侧各跑自己的起始→峰值→回位周期，完成即发射，**不合并**（与锤式的双侧合并语义不同：本动作两侧是工作/支撑关系而非同步双侧）。支撑侧从不离开起始位就永远不可能产生计数；换侧在两次之间自由发生，无需重新锁定（逐侧周期在每次完成时各自复位）。逐侧计数写入 `leftReps/rightReps`（与站姿后屈腿同一记账方式，恢复/同步路径已支持）。
- **校准口径**：聚合起始 = 任一侧肘 ≥145°（工作侧垂臂成立即可），支撑臂撑凳/撑膝不必伸直——这是单臂动作与双臂档案起始定义的唯一口径差，源于动作本身。
- **第四轴 = 支撑稳定**（单侧动作的既有先例：站姿后屈腿的第四轴评的也是非工作侧）：支撑肘在本次离开起始位时的静止值与其在峰值最深采样处的实际值之差 × 1.5 分/度（1.5 为本文件全部协调类公式的统一斜率）。支撑臂没有绝对角度标准（撑凳 ≈90°、撑膝更高、直臂 ≈160° 均合法），只评静止程度、不评位置。静止值在该侧空闲停留在起始位时逐帧刷新，峰值期间冻结；校准后首帧即开拉的极端情形回退到校准基线肘角。此为本轮唯一的评分语义新定义，已在代码注释中明示依据。
- 稳定轴沿用锤式发射公式的速度/时长项（control 通道为 0：俯身划船档案本身无上臂控制罚分通道，未发明新罚分）。

## 夹具与验证

- 客户端 `library-recognition.test.ts` 对全部 library 档案自动覆盖：新五档各过「5/10 FPS × 横竖屏完整周期计数」与「静态/半程/遮挡/重载只保留完整次数」两组通用场景（fixtures：推举/弓步档复用 planPose 对应档案；硬拉档与 barbell_deadlift 共用同一姿势分支；one_arm_row 新增俯身单侧姿势，左拉峰值、右臂垂放支撑）。
- 新增 `client/tests/one-arm-row.test.ts`（5 项）：干净逐侧计数且静止支撑侧不计数（leftReps 3 / rightReps 0、对称轴 ≥90）；左右换侧逐次计数（1 左 + 2 右）；半程拉（肘 ≈120°）不计数；直立划船被形态门拒绝（反馈含「俯身」）；支撑臂中途游走（屈至 ≈120°）不产生支撑侧计数、不拦工作侧计数，但支撑稳定轴显著下降（<50）。
- 一致性计数更新：`server/tests/plan-camera.test.ts`（总数 49 + 六条新绑定的档案/状态断言）、`server/tests/extended-recognition.test.ts`（总数 49）、`cloudflare/tests/runtime.test.mjs`（两处目录总数 49）。
- 全量串行验证：client `test:repository` **408/408**（393 基线 + 15 新增）+ tsc；server **108/108** + build；cloudflare **34/34** + typecheck。前平举第四轮与锤式小轮的全部夹具原样通过，无既有动作行为变化。

## 消费面核查（代码级）

- 服务端：`camera.ts` 的 `profiles`/`bindings` 由两份 JSON 自动展开，新五档无需改服务端代码即进入 `planCameraFor`、库列表 `planCamera` 字段与计划页摄像头徽章路径；`snapshotCameraProfile` 对新档同样生效（跑动中快照不隐式获得新识别，与既有口径一致）。
- 客户端：计划页/准备页文案直接取档案的 placement/instruction（已按站姿/杠铃/单臂口径分别撰写，非照搬坐姿版）；`createRecognitionTracker` 新增四条路由（推举两档→shoulder_press、弓步→reverse_lunge、硬拉→barbell_deadlift 分支、单臂划船→新类型默认 extended 路径）；`RECOGNITION_VERSION` 保持 6（本轮未改既有档案行为，无需升版，新档以 recognitionVersion: 6 拦旧页面）。

## 部署记录

（部署后回填：提交、双站 Version、线上核验。）
