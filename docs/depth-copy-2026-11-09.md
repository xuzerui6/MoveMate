# 锤式弯举幅度限定句改词 — 2026-11-09

## 改了什么

`COPY_DEPTH_SHALLOW_LIMIT`（`client/src/features/motion/lib/companionCopy.ts`）的文案一处：

- 旧：「幅度先记你举到的高度——深浅我还分不清，就不拿它下结论啦」
- 新：「举到多高，我都给你记着呢」

## 为什么

旧句是 channel-suspensions 一轮随限制一起上线的（见 `docs/channel-suspensions-2026-11-09.md`），
口径是工程式的免责声明。Edward 2026-11-09 晚否决了这个口气（「你肯定要换用户爱听的话」），
并在三个陪伴语气候选里亲选了新句。语义不变：幅度只报「举到的高度」这个测量事实、
不拿它下深浅的质量结论——只是换成陪伴口吻说出同一件事。

## 范围纪律

只改词。常量的定义位置、两个渲染点的出现条件与版式全部不变：

- Summary 结算页（`Summary.tsx`）：`scored && withheld && exerciseType==='hammer_curl'` 时显示；
- PlanWorkout 组间休息页（`PlanWorkout.tsx`）：`hammer_curl && totalWithheld(lastAssessment)` 时显示。

计数、评分、分享卡（卡片仍按 share-card-depth-omission 的口径省略幅度数值）均不受影响。

## 测试夹具

没有任何夹具钉住旧句的字面量。唯一引用该常量的测试是
`client/tests/companion-copy.test.ts`——它经由常量引用断言文案不含陪伴文案违禁词；
新句同样不含违禁词，该测试无需改动、原样通过。

## 上线记录

- Commit：`a0b07d6`（main）；CI 绿（run 42648053896）。串行套件：client test:repository
  519/519 + tsc、server 131/131 + build、cloudflare 34/34 + typecheck。
- Production：Version `ad75f081-75f0-43e9-b421-64d2f6206943`（dongban.xyz 已核验生效：
  index 指向新构建 `index-Cqtv6Wkx.js`，`poseFeedback` 分块含新句、旧句消失）。
- Preview：Version `866bc963-2d75-4ba9-a1ab-1ec156545e68`，经 step5 测试页分支合并
  main 后部署（merge `9a70b5b`），已核验生效且 `/step5-heavy-test`、
  `/step5-heavy-test-v2`、`/thunder-gate-test` 三个待测页面均完好。
- 如实记录：2026-11-09 15:49–16:0x UTC 期间 Cloudflare 侧出现部署传播停滞
  （production 首个版本 `4c62f0ce` 已被 API 记为 100% 生效，但边缘一度仍在发
  上一版内容；preview 的 versions 接口同期两次 504）。等待传播恢复后两站均
  核验为新内容，未做任何代码层面的额外改动。
