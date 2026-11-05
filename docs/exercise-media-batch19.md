# 动作库第十九批：真人实拍第七批（2026-11-05）

按第十三批口径继续推进：新补只用真人实拍，已发布图解保留、仅在实拍合格时替换。
本批从候选池取 14 对逐对看图核对，固定版本 free-exercise-db
（`f00c92c`，Unlicense）图片 URL 与第十三批一致。2026-10-29 针对 Gym Visual
候选的旧驳回不适用于本实拍，逐条按本批标准独立核对；其中 0530、0517、0777、
0807、0628 的旧驳回针对的是旧候选或旧文字口径，本批据实拍照片与「名称为准」
口径重新核对后采用，条目文字已按照片形式改写（见采用说明）。

## 本批采用（8 条，均为 free-exercise-db 实拍双帧，Unlicense）

新增完成（7）：

- exdb:0530 双壶铃风车（Double_Kettlebell_Windmill：双手各握一铃、一臂过顶站立 + 侧屈风车下探；目录原单铃写法已按照片的双铃形式改写）
- exdb:0517 壶铃进阶风车（Advanced_Kettlebell_Windmill：单臂持铃过顶站立 + 屈膝侧屈风车下探；目录原左右指向矛盾写法已按照片改写）
- exdb:0531 壶铃加大幅度单臂地板推举（Extended_Range_One-Arm_Kettlebell_Floor_Press：仰卧地面持铃屈肘 + 伸臂推举至锁定）
- exdb:0777 哑铃施法者摆动（Spell_Caster：单手持铃向对侧下伸 + 转体摆铃至另一侧；文字注明交替与镜像）
- exdb:0807 悬吊反向卷腹（Suspended_Reverse_Crunch：双脚悬吊带中平板支撑 + 屈膝收腹卷骨盆；目录原单杠悬垂写法已按照片的悬吊带形式改写）
- exdb:3193 臀腿挺身（Glute_Ham_Raise：俯卧器械低位 + 发力抬体至直线）
- exdb:0628 怪兽行走（Monster_Walk：脚踝套带微屈膝站立 + 侧向迈步保持张力；照片所示弹力带形式已写入步骤）

图解替换为真人实拍（1，图解文件已删除）：

- exdb:0660 双哑铃窄距支撑俯卧撑（Close-Grip_Push-Up_off_of_a_Dumbbell：双手分别握稳地面两只哑铃窄距支撑 + 屈肘下降后推起；与条目定义一致，原图解已删除）

## 本批驳回（6 对，已记入白名单 rejected）

- Double_Kettlebell_Snatch → exdb:0529：两帧仅为双铃站立与腿间屈髋低位，未见双铃过顶锁定关键阶段，不采用。
- One-Arm_Kettlebell_Clean_and_Jerk → exdb:0537：两帧为腿间摆铃与架肩，翻举完成但未见挺举过顶锁定关键阶段，不采用。
- One-Arm_Kettlebell_Jerk → exdb:0538：两帧均为架肩站姿与下蹲预蹲，未见过顶锁定关键阶段，不采用。
- Kettlebell_Turkish_Get-Up_Squat_style → exdb:0551：两帧为仰卧与坐起过渡，未见深蹲式起身（跪姿经深蹲站起）关键阶段，不采用。
- Squat_Jerk → exdb:0786：两帧为杠铃架肩站姿与下蹲预蹲，未见过顶推举与分腿关键阶段，不采用。
- Bottoms-Up_Clean_From_The_Hang_Position → exdb:0525：两帧均为悬垂低位，未见底部朝上架肩关键位，不采用。

## 测试断言同步

本批替换 0660 图解后，client/tests/exercise-library-scale.test.ts 原断言
（要求 illustrations 配置中 0660 含两只哑铃）因图解条目已按流水线删除而失效。
断言已同步为检查替换后的实拍记录：媒体为 Close-Grip_Push-Up_off_of_a_Dumbbell
实拍双帧，条目 form 写明「分别」「两只」——即照片所示为地面两只独立哑铃，
而非原断言所防的单只直立哑铃形式，原防呆意图不变。

## 结果

图文完整 354 → **361**（实拍照片 217 → **225**，原创图解 137 → **136**，视频 15 不变），
待补 975 → **968**。摄像头关联 43 条不变（43/43）。
本批 1 项图解替换（0660）；其余图解候选未进入本批，暂不替换。
