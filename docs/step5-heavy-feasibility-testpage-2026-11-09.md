# Step-5 Heavy 可行性测试页（2026-11-09）

融合计划（Muse×Codex）第 5 步的真机预检页：Heavy 只有在目标设备上**持续 ≥15 Hz 且推理延迟 p95 ≤150 ms** 才算可行。本页只做准备与预检——正式结论等 Edward 在 iPhone 17 Pro（iOS 26）上跑完再下。Edward 的核心关切是加载时间，所以下载/初始化耗时是一等测量，不是附带。

## 地址（仅预览站）

- 测试页：**https://preview.dongban.xyz/step5-heavy-test**（带 `.html` 后缀的地址会 307 跳转到此）
- **生产站未部署**（已核查：dongban.xyz 该路径返回的是 App 外壳，无测试页内容）。页面文件在仓库 `client/public/step5-heavy-test.html`，随分支 `feat/step5-heavy-testpage` 保存；预览 Version `c27861c0-6afe-42de-b300-34778047e398`。

## 页面测什么（Full 对照 + Heavy，顺序自动跑完）

与正式 App 完全同源同路径：模型配置钉死为 `pose-models.json` 的同一组数值（Full 9,398,198 B / sha256 `5134a3a…`；Heavy 30,664,242 B / sha256 `64437af8…`，两分片顺序拼合）；WASM 用本机 `/pose/wasm`；创建参数与 App 主线程路径一致（VIDEO、numPoses 1、三项置信度 .55、modelAssetBuffer、GPU delegate 优先、失败回退 CPU）；模型字节按 App 的方式写入同一 Cache Storage（`pose-models-v1`）。

1. **冷下载**：先删本机缓存中的该模型，再以 `cache:'no-store'` 绕过 HTTP 缓存真实下载（分片顺序与 App 一致），拼合后做大小＋SHA-256 校验并写入缓存。报：秒数、MB、MB/s。（与 App 的唯一有意偏差：App 的 fetch 用默认缓存模式——首次下载两者等价；测试页用 no-store 保证重复打开也测到真实网络耗时，不让 30 天 HTTP 缓存把数字做小。）
2. **冷初始化**：建模（createFromOptions）→ 首次成功 detectForVideo 的总耗时，并单列首帧推理耗时与实际 delegate。
3. **热加载**：关模型 → 从 Cache Storage 读回字节（单列耗时）→ 重建＋首帧，即 App 后续每次打开的真实路径。
4. **持续推理**：Full 30 秒、Heavy 180 秒（可用 `?fullDur=&heavyDur=` 覆盖），背靠背调用 detectForVideo。报：平均 FPS、延迟 p50/p95/最大、前 10 秒 vs 后 10 秒 FPS、最低整秒 FPS、检出人体帧占比、错误数。页面据参考线直接给 Heavy「达到/未达到」。
5. **呈现**：两张大字号结果卡 + 结论横幅 + 完整结果文本框（一键复制）。出错也进文本框，截图即可传达。

客户端-only：视频不离开设备、不上传不保存；无登录；不触碰正式 App 的任何行为。

## 桌面预检结果（只是冒烟，不是结论）

在本机以无头 Chromium 131（SwiftShader 软件 WebGL、假摄像头喂 Phase-0 前平举录像的相机区裁剪 480×504@20fps）对**已部署的预览页**跑通两轮（参数缩短为 Full 10s / Heavy 30s 与 5s / 5s）：全流程零错误，delegate=GPU（软件渲染），人体检出率 80%（Full 首轮）。

- Full：冷下载 4.3s（2.2 MB/s，经本机出口代理）· 冷初始化 17.3s · 热加载 12.8s（缓存读 0.2s）· 持续 0.5 FPS、p95 3,516 ms
- Heavy：冷下载 17.6s（1.7 MB/s）· 冷初始化 19.6s · 热加载 25.1s（缓存读 1.1s）· 持续 0.2 FPS、p95 8,517 ms

**这些性能数字是软件渲染＋共享 vCPU 的产物，只证明测量链路真实可用，对 iPhone 无任何指示意义**；下载数字也走的是本机代理网络。真机数字以 Edward 的运行为准。

顺带 vendored：`client/public/pose/vision_bundle.mjs`（137,809 B）为仓库钉死版本 `@mediapipe/tasks-vision@0.10.22-rc.20250304` 的官方 bundle 原样拷贝，使测试页零外部依赖（不走 CDN）。客户端仓库测试 507/507 通过。

## 给 Edward 的 2 分钟说明（实际约 5–8 分钟）

1. 在 iPhone 上用 Safari 打开 https://preview.dongban.xyz/step5-heavy-test
2. 点「开始测试」，弹窗问摄像头时点「允许」
3. 把手机放稳、保持页面在前台、**不要锁屏**，等它自己跑完（先 Full 约 1 分钟，再 Heavy 约 4–6 分钟，屏幕上有进度）
4. 看到「全部完成 ✅」后，**截一张图**发回来；也可以点「复制结果」把文本粘贴发回（信息更全）

---

# v2：预登记复测页（室内 · Worker 配置）— 2026-11-09 追加

## 为什么有这次复测（Codex 第十轮 Q1 裁决）

v1 真机结果（见 `accuracy-phase0/step5-heavy-feasibility-result-2026-11-09.md`）：Heavy 户外、主线程、特写取景下 180 秒内由 70.9 FPS 单调崩落至末 10 秒 11.6 FPS，冻结门（持续 ≥15 FPS 且 p95 ≤150 ms）**未达标，按冻结规则应用，不事后软化**。Codex 第十轮同意未达标，同时授权**唯一一次预登记复测**：室内、健身取景、正式 App 首选的 Worker 实现，定义了一个不同且相关的运行条件——不是把失败的测试重跑到过为止。失败记录保留在案；复测若通过，结论仅限「feasible under the tested indoor Worker configuration（在本次室内 Worker 配置下可行）」；**若再次失败，本复测路线关闭**，后续调度变化需要另行立项的运行时候选。Codex 还记了两点措辞修正：崩落记为「progressive throughput collapse, consistent with thermal throttling（与热降频一致的渐进吞吐崩落）」，不写成已证实的热因；v1 的热加载只能说「两次运行数值相近」，不能说统计等同。

## 地址（仅预览站）

- 复测页：**https://preview.dongban.xyz/step5-heavy-test-v2**（v1 页保留在原地址 `/step5-heavy-test`，不覆盖）
- 新增文件：`client/public/step5-heavy-test-v2.html`；`client/public/pose/step5-pose-worker.js`——由正式 App 的 `client/src/features/motion/lib/pose.worker.ts`（分支基线 be55c65）以 esbuild（`--bundle --format=iife --platform=browser --target=safari15`）打包，与正式 App 的 Worker 同一份代码、同一消息协议；文件头有来源标注。
- 预览 Version：`57114a3e-d162-44b3-ba41-6bc1af664453`（2026-11-09 部署；已核查：预览站 v2 页与 worker 文件与仓库源文件 sha256 逐字节一致，v1 页仍在原地址，生产站该路径只有 App 外壳、无测试页内容）。客户端仓库测试 507/507 通过。

## 冻结 vs 可变（Codex 第十轮表，逐项落实）

| 可变（已声明） | 冻结（不变） |
|---|---|
| 室内环境与健身取景（页面给了取景指引：支好手机、完整上半身入画） | 同一设备等级、模型字节＋SHA-256、delegate 顺序（GPU 优先）、模型设置（三项置信度 .55、numPoses 1、VIDEO） |
| 正式 App 首选的 Worker 实现（pose.worker + poseTransport 协议：init 12s / 首帧 8s / 稳态帧 1s 超时；建好先探一帧） | ≥15 FPS 与 p95 ≤150 ms 两条线；持续段 180 秒不缩短 |
| 规范化的起始设备状态（页面清单：手机先冷却、关其他 App、不充电；固定顺序 Full 先跑、中间冷却 60 秒、摄像头关闭让 SoC 空转，再跑 Heavy） | 测量定义、工作负载调度、评分配置、失败处理 |
| 上述已声明的部署条件 | 完整时间序列、错误数、检出可用性的报告（含逐秒系列与末段表现） |

## 协议澄清（前瞻性 operationalize，不是事后改线）

v1 的「持续」没有显式窗口定义。本次在开跑前冻结为：**排除前 10 秒启动期后，每一个完整的滚动 10 秒窗口（步长 1 秒）内新鲜帧处理率 ≥ 15 FPS**（窗口内新鲜帧数 ÷ 10）；p95 ≤ 150 ms 保留，另加报末 30 秒的帧率与 p95。页面与结果文本都标注为「协议澄清」。

**延迟口径**：Worker 路径下主线程测不到 v1 的同步 detect 时长，p95 采用正式 App 自己的帧龄定义（`poseProtocol` 的 latencies = receivedAt − capturedAt；正式 App 的探针门 evaluateProbe 正是用这个量，线为 200 ms）——它上界于推理时长，是更保守的方向，不是软化。推理往返（提交→回复）p50/p95 同时另报。

## 重复帧仪表（Codex 第十轮的 instrumentation check）

Codex 指出：30 FPS 摄像头不可能产生 128.6 个不同画面/秒——v1 的背靠背循环在对同一画面重复推理。v2 的帧泵移植正式 App `useAdaptivePose` 的调度（requestVideoFrameCallback 驱动、500ms 看门狗回退 rAF、mediaTime 严格递增＋decoded 计数双重新鲜性判定、inFlight 串行），并分开计数：**呈现**（新画面到达数）、**提交**、**完成**、**忙碌跳过**、**同一 mediaTime 重复提交**（结构上应为 0）。分开报告：(a) 推理吞吐（完成推理/秒）、(b) 新鲜帧处理率（不同画面/秒，判定用它）、(c) 相机→结果年龄。

**有意偏差（两处，均已声明）**：① 稳态帧 1 秒超时在正式 App 中触发降级；复测必须把一个固定配置测满 180 秒，故超时只记错误并继续，迟到回复按正式 App 一样忽略。② 冷下载沿用 v1 的 no-store 偏差（理由同 v1 节）。其余与 v1 的差别只有：Full 持续段由 30 秒改为 180 秒（Codex 要求 Full 同为 180 秒对照——v1 的 30 秒结果不构成 180 秒稳定性证据）、Worker 路径、重复帧仪表、协议澄清门、冷却/顺序与起始状态清单、室内取景指引。总时长约 9 分钟（下载＋初始化＋180＋热加载 ≈ 每模型 3.5–4 分钟 ×2 ＋ 冷却 1 分钟）。

## 桌面冒烟（本机无头 Chromium 131、SwiftShader、假摄像头喂 FR-A 录像裁剪 480×600@20fps；缩短参数 Full 30s / Heavy 30s / 冷却 2s，对本地静态服务器与已部署预览页各跑一轮）

两轮均零错误跑完（冷下载→冷初始化→持续段→热加载→冷却→自动重开摄像头→第二个模型→结论＋结果文本）：

- **本地静态服务器轮**（Full 30s / Heavy 30s / 冷却 2s）：Full 呈现 577、提交 210、完成 210、忙碌跳过 367、**重复提交 0**；新鲜帧率 6.99 ≈ 吞吐 7.00。Heavy 呈现 600、提交 169、完成 169、忙碌跳过 431、重复 0；新鲜 5.62 ≈ 吞吐 5.63。两模型均 提交＋忙碌跳过＝呈现，核算闭合。
- **已部署预览页轮**（Full 25s / Heavy 25s / 冷却 1s，经本机 CONNECT 转发走真实网络）：Full 呈现 500＝提交 242＋忙碌跳过 258，重复 0，新鲜 9.66 ≈ 吞吐 9.68，冷下载 4.1s（真实字节、页内 SHA 校验通过）；Heavy 呈现 496＝136＋360，重复 0，新鲜 5.41 ≈ 吞吐 5.44，冷下载 3.1s。

这正是 Codex 要的对照：v1 主线程背靠背循环的「128.6 FPS」是同一画面被重复推理约 4.3 次的吞吐数；v2 里吞吐与新鲜帧率按构造近似相等，且每一个呈现的画面都有去向（提交/忙碌跳过/重复=0）。两轮桌面运行都落在 **worker-cpu**：SwiftShader 环境下 GPU 尝试快速失败、按正式 App 的顺序回退 CPU——回退路径本身工作正常；目标 iPhone 上正式 App 的 Worker GPU 路径已于 2026-11-07 真机验证过（Full · Worker GPU）。桌面帧率/延迟（新鲜 5–10 FPS、p95 120–271 ms、判未达标）纯属软件渲染产物，对真机无指示意义，真机判定以 Edward 按上节说明跑出的结果为准。

## 给 Edward 的运行说明（约 9 分钟）

1. 在 iPhone 上用 Safari 打开 https://preview.dongban.xyz/step5-heavy-test-v2
2. 先按页面顶部清单准备：**在室内**把手机像平时训练那样支好，手机摸起来不热、关掉其他 App、不要插充电线
3. 站进画面确认能看到**完整上半身**，点「开始测试」，摄像头弹窗点「允许」
4. 之后全自动：先 Full（约 4 分钟）→ 自动冷却 60 秒（摄像头会关，别操作手机）→ 自动继续 Heavy（约 4 分钟）；万一冷却后页面让你点一下「继续」，点它就行
5. 看到「全部完成 ✅」后**截图**发回；也可以点「复制结果」粘贴文本发回（信息更全，含逐秒系列）

## 已知边界

- 本页测的是主线程路径（iPhone 实验路径）；Worker 路径不在本页范围。
- 「冷下载」在同一台手机重复跑时，Cache Storage 条目会被页面先删再测，仍是真冷；但运营商/网络状态差异会体现在 MB/s 上，属预期。
- Heavy 在 App 内目前仅为手动实验档、从不自动启用（`poseCompatibility.ts`：曾在参考 iPhone 上决定性地未过探针且每台设备 30.7 MB）——本页是融合计划第 5 步的正式可行性门，不改变这一状态。

---

## 附记（2026-11-10 晚）：首跑无效——帧泵新鲜度判定缺陷与修复

**首跑记录（无效）**：2026-11-10 21:23，Edward 在 iPhone 17 Pro（iOS 26）室内按说明跑 v2 页。结果：Full 与 Heavy 各 180 秒内均只记录 **呈现 1 / 提交 1 / 完成 1** 帧，0 错误、0 超时；唯一一帧往返很快（Full 15 ms、Heavy 30 ms、检出人体）。页面当时给出的「未达到／路线关闭」结论**不成立**：对照臂 Full 在正式 App 同机同路径（Worker GPU）日常实测 21–24 FPS，0.0 FPS 与既证事实矛盾，说明没测到东西的是仪器，不是模型。**该次运行判为无效（invalid run），不消耗预登记的那一次复测**；Heavy 路线不因这次运行关闭。

**根因**：v2 页 `perfRun` 的新鲜度判定写作 `media > lastMedia && (!!metadata || decoded === null || decoded > lastDecoded)`——在无 metadata 的路径（500ms 看门狗触发 rAF 回退后）上无条件以 decoded 帧计数（`getVideoPlaybackQuality().totalVideoFrames` / `webkitDecodedFrameCount`）门控提交。而 iOS Safari 对 getUserMedia 相机流的该计数从不递增，第一帧之后再无「新鲜」帧，帧泵饿死。正式 App `useAdaptivePose` 的同段代码本就不同：decoded 门只在 `!metadata && !r.appleCamera` 时生效（Apple 相机流明确豁免），另有 mediaTime 停滞 >500ms 时强制切 rAF 的逃逸——v2 页移植帧泵时漏掉了这两处，正是 2026-11-09 户外 Worker 轮「两模型各只处理 1 帧」的同一缺陷（当时误记为测试页帧投递冻结）。

**修复（已上线预览站）**：① 新鲜度改为与正式 App 同式：mediaTime/currentTime 严格递增驱动提交；decoded 计数只保留为仪表，仅在「无 metadata 且非 Apple 相机流」时作门；补上 Apple 停滞逃逸（mediaTime 停滞 >500ms → forceRaf + 改用 currentTime）。② 新增**仪器有效性门**：任一模型 180 秒内呈现帧 <300 时，该模型判定与整页结论只读作「无效运行——帧泵未正常工作，本次测试无效」，不再输出模型「未达到」结论。③ 页脚已加同义披露行。判定线（滚动 10 秒窗口 ≥15 FPS、p95 ≤150 ms、排除前 10 秒）、顺序（Full→冷却 60 秒→Heavy）、时长与冷下载口径均未动。

**下一步**：Edward 方便时在同一预览地址重跑（即真正的预登记复测）；通过口径不变——仅表示「在室内 Worker 配置下可行」。
