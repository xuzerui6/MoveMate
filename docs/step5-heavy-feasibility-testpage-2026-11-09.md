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

## 已知边界

- 本页测的是主线程路径（iPhone 实验路径）；Worker 路径不在本页范围。
- 「冷下载」在同一台手机重复跑时，Cache Storage 条目会被页面先删再测，仍是真冷；但运营商/网络状态差异会体现在 MB/s 上，属预期。
- Heavy 在 App 内目前仅为手动实验档、从不自动启用（`poseCompatibility.ts`：曾在参考 iPhone 上决定性地未过探针且每台设备 30.7 MB）——本页是融合计划第 5 步的正式可行性门，不改变这一状态。
