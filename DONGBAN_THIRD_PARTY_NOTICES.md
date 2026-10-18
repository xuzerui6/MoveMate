# Third-party notices

本项目的小智协议适配参考了以下 MIT License 项目的公开协议、设备激活流程和 MCP 设计，并使用 TypeScript 独立实现 Web 适配层；没有复制其界面素材。

- [xiaozhi-esp32](https://github.com/78/xiaozhi-esp32) — Copyright (c) xiaozhi-esp32 contributors — MIT License
- [py-xiaozhi](https://github.com/huangjunsen0406/py-xiaozhi) — Copyright (c) py-xiaozhi contributors — MIT License

完整许可文本请以各上游仓库当前的 `LICENSE` 文件为准。

## 本地界面字体与图标

- Noto Sans SC Variable，字体包固定为 `@fontsource-variable/noto-sans-sc@5.3.1`。字体本地打包并自行托管，采用 SIL Open Font License 1.1。完整许可证保存在 `client/public/licenses/Noto-Sans-SC-OFL.txt`。
- Phosphor Icons，标准界面图标使用现有 `@phosphor-icons/react`。MIT 许可保存在 `client/public/licenses/Phosphor-MIT.txt`。
- 保留原动伴像素角色与装备；设计用强调笔画、底座、按钮纹理为项目内独立图片。没有使用设计稿中的模拟摄像头照片代替实际视频。

## 动作库示范素材（2026-10-18 第一、二批）

- 图片：free-exercise-db，固定提交 `f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5`，按仓库声明采用 Unlicense；逐项保留原始 SHA-256，未对原图虚构摄影署名。许可：`client/public/exercise-media/UNLICENSE.txt`。
- 连续视频：wger video 6、12、17、22、49、71，作者 Goulart，CC BY-SA 4.0。按原比例转码、去掉音轨、选取对应完整动作片段并提取封面及三阶段分解帧；视频衍生物、分解帧和封面继续采用 CC BY-SA 4.0。许可：`client/public/exercise-media/CC-BY-SA-4.0.txt`。
- 每项来源 URL、固定版本／源文件校验、发布校验与修改说明：`client/public/exercise-media/attribution.json`；站内详情提供同一清单。肌群图继续采用已有 MuscleMap MIT 数据及署名。
- 未复制或热链 openGym 的 Gym visual 图片、动画，也未将其用于生成素材输入。完整核验及缺失情况见 `docs/exercise-media.md`、`docs/exercise-media-batch2.md`。
