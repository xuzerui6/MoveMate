# 生产发布检查清单（dongban.xyz）

CI 只做检查、不自动发布；生产发布由维护者手工执行。本清单固化发布步骤与回滚点，逐项打勾再发布。部署机制细节见 [Cloudflare 部署](cloudflare-deployment.md)，其规定优先于本清单的摘要。

## 发布前

- [ ] `main` 的 CI 为 completed success，且本地串行全套验证全绿（client repository、client tsc、server 测试与构建、cloudflare 测试与 typecheck）。
- [ ] 涉及动作库数字变化时，README 与批次文档的口径已同步（图文完整数、图解数、待补数、摄像头完整数）。
- [ ] 本次是否打版本 tag 已决定；tag 只锚定源码版本，不代表已部署。
- [ ] 如本次包含 schema 变化，已确认向后兼容（旧 Worker 代码能读新结构），否则先拆分发布顺序。
- [ ] 重大版本发布前，留一份灾难恢复锚点：用 PITR 运维端点 `GET /api/migration/pitr/status`（MIGRATION_SECRET 鉴权）记录生产当前书签 + 全表计数 + databaseSize 并存档。注：该端点随下一次生产部署上线后本条才可执行（端点已在 main 并已部署预览，见 [服务端备份与恢复](server-backup-restore.md) 生产侧一节）；`restore` 恢复动作被守卫禁止于生产，属灾难处置流程而非发布动作，发布流程只做只读记录。

## 构建与部署

- [ ] 在配置了 `MOVEMATE_MEDIA_DIR` 的机器上做**站内严格构建**（默认模式）；公开构建（`MOVEMATE_PUBLIC_BUILD=1`）产物**不得**用于正式站点。
- [ ] 站内机器额外跑 `npm test --prefix client`（含站内专用素材的完整校验），而非只跑 `test:repository`。
- [ ] 按 [Cloudflare 部署](cloudflare-deployment.md) 的流程部署 Worker + Static Assets；**不改动 Durable Object namespace 与 production 实例绑定**，不删除 namespace、不重建数据库。

## 发布后抽查（十分钟内完成）

- [ ] `https://dongban.xyz/` 返回 200，首页正常渲染。
- [ ] `https://dongban.xyz/health` 返回 200。
- [ ] 登录一个真实账号，打开训练页做一次摄像头训练冒烟（能计数、能结束结算）。
- [ ] 管理面板「语音服务」页状态与发布前一致（总开关、设备池状态）。
- [ ] 动作库抽查 3 个条目（含 1 个图解条目、1 个视频条目），示范帧与视频可加载。

## 回滚

- 代码问题：`wrangler versions list` 找到上一个已验证版本，`wrangler rollback <版本ID>` 只回滚 Worker 代码，继续使用原 DO namespace 与实例。
- 数据问题：不要用旧快照或 Turso 旧库覆盖生产库；按部署文档使用 PITR 书签在原对象上**原地**恢复（PITR 书签与单个对象绑定，平台不存在实例副本，也没有副本核对这一步）；恢复前先用 `GET /api/migration/pitr/status` 记录当前书签、全表计数与 databaseSize 作对账锚点，执行恢复时当场把响应返回的 undo 书签抄录到外部运维记录。
- 回滚后重复「发布后抽查」全部项，并在本文件末尾追加一行发布记录。

## 可用性巡检（已上线，2026-11-05）

dongban.xyz 已有自动巡检：每 10 分钟从维护环境检查 `/` 与 `/health`，连续两次失败才报警（单次抖动不报、本机断网不误报），报警与恢复通知发到维护对话。局限：这是单一视角的巡检，只能发现「整站不可达」级别的问题；如需多地多运营商视角，可再注册外部监控服务（需维护者账号），届时替换本节。

## 发布记录

| 日期 | 版本/提交 | 发布人 | 抽查结果 | 备注 |
| --- | --- | --- | --- | --- |
| （待填） | | | | |
