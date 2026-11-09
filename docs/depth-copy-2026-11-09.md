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

（部署后回填：commit / production Version / preview Version。）
