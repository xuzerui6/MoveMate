/**
 * 组队打怪二期 · 约定段模板（客户端镜像）—— 自动生成，不要手改。
 *
 * 唯一源头：server/src/utils/boss-segments.ts（服务端创建打怪时把约定拍成快照，
 * 冻结口径以服务端为准，这里只负责发起前给队长看清、选打法/动作）。
 * 改文案先改服务端，再在 client/ 下跑：
 *   npx tsx scripts/generate-segment-templates.ts
 * 重新生成本文件。tests/boss-fight-segments.test.ts 会逐字段比对，
 * 没重新生成就会红。
 * 格数不随人数变——扩缩已经写进「一段」本身的定义里（设计稿 §2）。
 */

export interface SegmentTemplateOption {
  value: string;
  name: string;
  segmentLabel: string;
  totalLabel: string;
}

export interface SegmentTemplate {
  templateId: string;
  segmentsTotal: number;
  segmentLabel: string;
  totalLabel: string;
  /** 开打前二选一的打法（篮球）；开打锁定 */
  formats?: SegmentTemplateOption[];
  /** 健身段模式的固定动作清单（每段一个动作+人数无关的固定个数） */
  movements?: SegmentTemplateOption[];
}

export const SEGMENT_TEMPLATES: Record<string, SegmentTemplate> = {
  "basketball": {
    "templateId": "basketball",
    "segmentsTotal": 4,
    "segmentLabel": "打满 10 分钟比赛（暂停、场边休息不计入）",
    "totalLabel": "本场共 4 段：每段打满 10 分钟，一共 40 分钟比赛，休息另算。",
    "formats": [
      {
        "value": "minutes10",
        "name": "10 分钟一轮",
        "segmentLabel": "打满 10 分钟比赛（暂停、场边休息不计入）",
        "totalLabel": "本场共 4 段：每段打满 10 分钟，一共 40 分钟比赛，休息另算。"
      },
      {
        "value": "points21",
        "name": "21 分一局",
        "segmentLabel": "打完一局 21 分比赛",
        "totalLabel": "本场共 4 段：每段打完一局 21 分，一共 4 局。"
      }
    ]
  },
  "soccer": {
    "templateId": "soccer",
    "segmentsTotal": 3,
    "segmentLabel": "踢满 20 分钟比赛（暂停不计时，没踢满不算一段）",
    "totalLabel": "本场共 3 段：每段踢满 20 分钟，一共 60 分钟比赛。"
  },
  "badminton": {
    "templateId": "badminton",
    "segmentsTotal": 4,
    "segmentLabel": "按 21 分制打完一局（20 平后领先 2 分，先到 30 分结束）",
    "totalLabel": "本场共 4 段：一共打完 4 局。"
  },
  "volleyball": {
    "templateId": "volleyball",
    "segmentsTotal": 4,
    "segmentLabel": "按 25 分制打完一局（24 平后领先 2 分）",
    "totalLabel": "本场共 4 段：一共打完 4 局。"
  },
  "tennis": {
    "templateId": "tennis",
    "segmentsTotal": 6,
    "segmentLabel": "打完一个发球局（至少赢 4 分、还要领先 2 分，平分就继续打完）",
    "totalLabel": "本场共 6 段：一共打完 6 个发球局。"
  },
  "table_tennis": {
    "templateId": "table_tennis",
    "segmentsTotal": 6,
    "segmentLabel": "按 11 分制打完一局（10 平后领先 2 分）",
    "totalLabel": "本场共 6 段：一共打完 6 局。"
  },
  "swimming": {
    "templateId": "swimming",
    "segmentsTotal": 4,
    "segmentLabel": "每人各累计游完 200 米（25 米池 8 个单程、50 米池 4 个单程），可以中途休息，全员都完成才算一段",
    "totalLabel": "本场共 4 段：每人一共游 800 米。"
  },
  "running": {
    "templateId": "running",
    "segmentsTotal": 4,
    "segmentLabel": "每人各跑完 1 公里（标准跑道 2 圈半），可以跑也可以走，不比速度，全员都完成才算一段",
    "totalLabel": "本场共 4 段：每人一共跑 4 公里。"
  },
  "roller_skating": {
    "templateId": "roller_skating",
    "segmentsTotal": 4,
    "segmentLabel": "每人各累计滑完 1 公里（按标好距离的路线，或按场馆一圈的长度折算圈数，开打前定好、全场用同一个标准），全员都完成才算一段",
    "totalLabel": "本场共 4 段：每人一共滑 4 公里。"
  },
  "skateboarding": {
    "templateId": "skateboarding",
    "segmentsTotal": 4,
    "segmentLabel": "每人各累计练习 15 分钟（刷街、练动作都算；光围观、聊天、离场休息不算），全员都完成才算一段",
    "totalLabel": "本场共 4 段：每人一共练 60 分钟。"
  },
  "fitness": {
    "templateId": "fitness",
    "segmentsTotal": 4,
    "segmentLabel": "每人各做完一组深蹲（20 次），可以分组做，全员都完成才算一段",
    "totalLabel": "本场共 4 段：每人一共做 4 大组深蹲。",
    "movements": [
      {
        "value": "seg_squat",
        "name": "深蹲",
        "segmentLabel": "每人各做完一组深蹲（20 次），可以分组做，全员都完成才算一段",
        "totalLabel": "本场共 4 段：每人一共做 4 大组深蹲。"
      },
      {
        "value": "seg_push_up",
        "name": "俯卧撑",
        "segmentLabel": "每人各做完一组俯卧撑（15 次），可以分组做，全员都完成才算一段",
        "totalLabel": "本场共 4 段：每人一共做 4 大组俯卧撑。"
      },
      {
        "value": "seg_jumping_jack",
        "name": "开合跳",
        "segmentLabel": "每人各做完一组开合跳（30 次），可以分组做，全员都完成才算一段",
        "totalLabel": "本场共 4 段：每人一共做 4 大组开合跳。"
      },
      {
        "value": "seg_high_knees",
        "name": "高抬腿",
        "segmentLabel": "每人各做完一组高抬腿（40 次），可以分组做，全员都完成才算一段",
        "totalLabel": "本场共 4 段：每人一共做 4 大组高抬腿。"
      },
      {
        "value": "seg_lunge",
        "name": "弓步蹲",
        "segmentLabel": "每人各做完一组弓步蹲（20 次（左右合计）），可以分组做，全员都完成才算一段",
        "totalLabel": "本场共 4 段：每人一共做 4 大组弓步蹲。"
      }
    ]
  }
};

export const GENERIC_SEGMENT_TEMPLATE: SegmentTemplate = {
  "templateId": "generic",
  "segmentsTotal": 4,
  "segmentLabel": "每人各累计活动 15 分钟（上课、轮流练习都算；和运动无关的休息不算），全员都完成才算一段",
  "totalLabel": "本场共 4 段：每人一共活动 60 分钟。"
};

/** 按运动类型取段模板（没有专属模板的走通用模板） */
export function segmentTemplateFor(sportType: string | undefined | null): SegmentTemplate {
  if (!sportType) return GENERIC_SEGMENT_TEMPLATE;
  return SEGMENT_TEMPLATES[sportType] ?? GENERIC_SEGMENT_TEMPLATE;
}
