# 文档中心

[返回项目首页](../README.md)

## 开始使用与开发

| 文档 | 用途 |
| --- | --- |
| [开发指南](development.md) | 环境、演示启动、专用素材、测试、配置和常见故障 |
| [架构与目录](architecture.md) | 本机／云端运行方式、账号隔离、计时结算及媒体构建 |
| [贡献指南](../CONTRIBUTING.md) | 提交问题、开发约定、必要验证与 PR |
| [安全报告](../SECURITY.md) | 私下报告与公开反馈边界 |

## 功能与部署

| 文档 | 内容 |
| --- | --- |
| [计划训练](plan-training.md) | 计划、组记录、结算及数据兼容 |
| [第二阶段训练能力](training-stage2.md) | 自由训练、排课、分析、进阶及数据恢复 |
| [计划内摄像头](plan-camera.md) | 支持形式、试用动作、计数与评分 |
| [新增六种 AI 动作](recognition-six-actions.md) | 拍摄要求、动作映射、版本兼容、计数与验收边界 |
| [常用动作摄像头扩展](library-camera-common.md) | 动作库新增 10 个标准条目、协议 v3 与计划／自由训练验收 |
| [计数修复记录](training-counting-fix.md) | 识别诊断、状态机与实拍边界 |
| [第四批动作示范](exercise-media-batch4.md) | 当前覆盖、20 项审核结果、中文资料、素材许可及部署 |
| [第三批动作示范](exercise-media-batch3.md) | 上一批素材与外部目录配置 |
| [全库覆盖 CSV](exercise-media-coverage.csv) / [缺失 CSV](exercise-media-missing.csv) | 按动作 ID 查询图片、视频及摄像头能力 |
| [统一语音](shared-voice.md) | 设备池、学习演示限制、配置与验证 |
| [Cloudflare 部署](cloudflare-deployment.md) | 生产／预览、密钥、迁移、备份与回滚 |
| [第三方声明](../DONGBAN_THIRD_PARTY_NOTICES.md) | 代码与独立素材许可、署名 |

## 验收记录

这些文件记录特定日期、版本及环境，不表示所有浏览器、真人动作或外设均已通过。

- [稳定性与恢复第三批](recovery-reliability-stage3.md)（2026-10-25，草稿基线与冲突、加载隔离、断网与存储异常）
- [产品体检与体验修复](product-experience-fixes.md)（2026-10-20，训练结束、日程、单位、收藏及失败恢复）
- [计划编辑可靠性与手机操作](plan-editor-reliability.md)（2026-10-21，保存快照、草稿异常、设置与周日程缓存）
- [计划训练验收](plan-training-acceptance.md)
- [训练流程验收](training-acceptance.md)
- [四动作验收](../CAMERA_TRAINING_ACCEPTANCE.md)
- [页面与交互验收](../UI_ACCEPTANCE.md)
- [Cloudflare 迁移验收](cloudflare-acceptance.md)
- [第四批媒体验收](exercise-media-batch4.md#验收)
- [第三批媒体验收](exercise-media-batch3.md#验收)

## 历史资料

[原 README 实施记录](implementation-notes.md)、[第一批媒体](exercise-media.md)、[第二批媒体](exercise-media-batch2.md)、[Vercel 旧方案](vercel-deployment.md)保留用于理解迁移过程。当前部署以 Cloudflare 文档为准；历史 PRD 中的 PostgreSQL、Redis、固定积分规则不代表现行实现。
