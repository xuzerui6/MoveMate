# 目录改名 Q2 批（2026-11-10）：五条名实不符条目改名

Edward 于 2026-11-10 13:23 批准（「好，就这么改」）。裁决框架见暂存区
`movemate-media-staging/text-revision/CATALOG-DECISION-FRAMEWORK.md`（卷宗 D14/D19/D20/D23/D24）。

## 方法（全批统一）

- **只改名，不动动作本体**：英文目录名改于 `server/src/gym/catalog.json`；
  中文名与别名改于 `scripts/reviewed-exercise-content.json` 策展层；正文、媒体、
  条目 ID、条数全部不变。用户计划与历史训练记录按 ID 引用，不受影响；
  历史快照中的旧名按快照语义保留（框架 §0.6）。
- **旧名保召回**：每条的旧英文名与旧中文名都追加进别名（搜索索引覆盖别名，
  已以真实搜索代码核查：12 组新旧名查询全部命中目标条目）。
- 0769 的生成台账 `scripts/exercise-media-approved.json` 中 expectedName 同步更新
  （与 Q1 对 0739 的处理一致）。

## 逐条结果

| 卷宗 | 条目 | 旧名 | 新名 | 附带 |
|---|---|---|---|---|
| D14 | exdb:0972 | band bicycle crunch / 弹力带蹬车卷腹 | **bicycle crunch / 蹬车卷腹** | 器械字段 band → body weight，移入徒手类（正文本就全程徒手） |
| D20 | exdb:0151 | cable bench press / 绳索卧推 | **cable standing chest press / 绳索站姿推胸** | 正文为完整自洽的站立推胸，bench 无落点；正文不动 |
| D23 | exdb:1349 | lever reverse t-bar row / 器械反向T杠划船 | **lever t-bar row / 器械T杠划船** | reverse 无指代（反握版由 exdb:1351 承载）；与 1351 成对成族 |
| D24 | exdb:0769 | smith sprint lunge / 史密斯冲刺弓步 | **smith rear foot elevated split squat / 史密斯后脚搭杠分腿蹲** | 已发布条目：正文与媒体（批次 73 定版双帧）不动、同 ID 保留；中文名以「搭杠」标明支点，与 exdb:0768（长凳支点）相区别——0768 的中文名已是「史密斯后脚抬高分腿蹲」，故不取字面直译以免同名 |
| D19 | exdb:1000 | band single leg reverse calf raise / 弹力带单腿反向提踵 | **band seated reverse calf raise / 弹力带坐姿反向提踵** | 站姿单腿背屈读法无来源可核，可核形式为坐姿背屈；正文暂按原文保留，待改文线按新名起草（改文批次 2 的 name-vs-movement 搁置就此以改名支解决，登记表由改文线登记员随后更新） |

## 计数（与 Q1 落地后完全一致，改名不动计数）

- 台账原始口径：总数 1,329、图文完整 795、待补 534、照片 682、图解 113、视频 18
  （publish-exercise-documentation 与 report 脚本实测）。
- 有效口径（剔除 Q1 的 20 条归档行）：总数 **1,309**、图文完整 **795**、待补 **514**。
- 分类位移仅一条：exdb:0972 由带类待补转入徒手类待补（带类待补 −1、徒手类待补 +1），
  总待补不变。

## 功能验证（真实服务代码，脚本核查）

- model 层五条均以新名/新中文名解析；exdb:0972 equipment = body weight；
  exdb:0769 reviewStatus = checked 且媒体仍挂载于同一 ID。
- 搜索召回 12/12：旧英文名（smith sprint lunge / band bicycle crunch /
  cable bench press / lever reverse t-bar row / band single leg reverse calf raise）、
  旧中文名（史密斯冲刺弓步 / 弹力带蹬车卷腹 / 绳索卧推 / 器械反向T杠划船 /
  弹力带单腿反向提踵）均命中对应条目；新名 bicycle crunch、
  smith rear foot elevated split squat 直达。

## 测试与发布

- 串行全套：client test:repository 519/519 + tsc、server 131/131 + build、
  cloudflare 34/34 + typecheck 全绿。
- 生产部署 Version `PENDING`；预览部署 Version `PENDING`（部署后回填）。
