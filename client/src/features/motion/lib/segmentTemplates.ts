/**
 * 组队打怪二期 · 约定段模板（客户端镜像）
 *
 * 与服务端 server/src/utils/boss-segments.ts 逐条对应：服务端在创建打怪时
 * 把约定拍成快照存进 fight 行，这里只负责发起前给队长看清、选打法/动作。
 * 改任何一条，先改服务端再同步这里，并同步 server/tests/boss-fight-segments
 * 与 client/tests/boss-fight-segments 的断言。
 * 格数不随人数变——扩缩已经写进「一段」本身的定义里（设计稿 §2）。
 */

export interface SegmentTemplateOption {
  value: string
  name: string
  segmentLabel: string
}

export interface SegmentTemplate {
  templateId: string
  segmentsTotal: number
  segmentLabel: string
  totalLabel: string
  /** 开打前二选一的打法（篮球）；开打锁定 */
  formats?: SegmentTemplateOption[]
  /** 健身段模式的固定动作清单（每段一个动作+人数无关的固定个数） */
  movements?: SegmentTemplateOption[]
}

export const SEGMENT_TEMPLATES: Record<string, SegmentTemplate> = {
  basketball: {
    templateId: 'basketball',
    segmentsTotal: 4,
    segmentLabel: '打完一轮 10 分钟的比赛，算一段',
    totalLabel: '本场共 4 段，打满 4 段就是打赢',
    formats: [
      { value: 'minutes10', name: '10 分钟一轮', segmentLabel: '打完一轮 10 分钟的比赛，算一段' },
      { value: 'points21', name: '21 分一局', segmentLabel: '打完一局，先到 21 分的一方赢下这局，算一段' },
    ],
  },
  soccer: {
    templateId: 'soccer',
    segmentsTotal: 3,
    segmentLabel: '踢满 20 分钟，算一段',
    totalLabel: '本场共 3 段，一共踢满 60 分钟就是打赢',
  },
  badminton: {
    templateId: 'badminton',
    segmentsTotal: 4,
    segmentLabel: '打完一局 21 分（20 平后领先 2 分赢，30 分封顶），算一段',
    totalLabel: '本场共 4 段，打满 4 局就是打赢',
  },
  volleyball: {
    templateId: 'volleyball',
    segmentsTotal: 4,
    segmentLabel: '打完一局 25 分（24 平后领先 2 分赢），算一段',
    totalLabel: '本场共 4 段，打满 4 局就是打赢',
  },
  tennis: {
    templateId: 'tennis',
    segmentsTotal: 6,
    segmentLabel: '打完一盘里的一局（一个发球局打完），算一段',
    totalLabel: '本场共 6 段，打满一整盘就是打赢',
  },
  table_tennis: {
    templateId: 'table_tennis',
    segmentsTotal: 6,
    segmentLabel: '打完一局 11 分（10 平后领先 2 分赢），算一段',
    totalLabel: '本场共 6 段，打满 6 局就是打赢',
  },
  swimming: {
    templateId: 'swimming',
    segmentsTotal: 4,
    segmentLabel: '每个人各游 200 米，算一段',
    totalLabel: '本场共 4 段：每人每段 200 米，一共每人 800 米',
  },
  running: {
    templateId: 'running',
    segmentsTotal: 4,
    segmentLabel: '每个人各跑 1 公里，算一段（走完也算）',
    totalLabel: '本场共 4 段：每人每段 1 公里，一共每人 4 公里',
  },
  roller_skating: {
    templateId: 'roller_skating',
    segmentsTotal: 4,
    segmentLabel: '每个人各滑 1 公里，算一段（按场地一圈多少米换算，圈数开打前说好）',
    totalLabel: '本场共 4 段：每人每段 1 公里，一共每人 4 公里',
  },
  skateboarding: {
    templateId: 'skateboarding',
    segmentsTotal: 4,
    segmentLabel: '每个人各累计练习 15 分钟，算一段',
    totalLabel: '本场共 4 段：每人每段 15 分钟，一共每人 1 小时',
  },
  fitness: {
    templateId: 'fitness_segments',
    segmentsTotal: 4,
    segmentLabel: '全队每个人各做 20 次深蹲，算一段',
    totalLabel: '本场共 4 段：每人每段 20 次深蹲，一共每人 80 次',
    movements: [
      { value: 'seg_squat', name: '深蹲', segmentLabel: '全队每个人各做 20 次深蹲，算一段' },
      { value: 'seg_push_up', name: '俯卧撑', segmentLabel: '全队每个人各做 15 次俯卧撑，算一段' },
      { value: 'seg_jumping_jack', name: '开合跳', segmentLabel: '全队每个人各做 30 次开合跳，算一段' },
      { value: 'seg_high_knees', name: '高抬腿', segmentLabel: '全队每个人各做 40 次高抬腿，算一段' },
      { value: 'seg_lunge', name: '弓步蹲', segmentLabel: '全队每个人各做 20 次弓步蹲（左右合计），算一段' },
    ],
  },
}

export const GENERIC_SEGMENT_TEMPLATE: SegmentTemplate = {
  templateId: 'generic',
  segmentsTotal: 4,
  segmentLabel: '每个人各累计活动 15 分钟，算一段（不能拆开拼）',
  totalLabel: '本场共 4 段：每人每段 15 分钟，一共每人 1 小时',
}

/** 按运动类型取段模板（没有专属模板的走通用模板） */
export function segmentTemplateFor(sportType: string | undefined | null): SegmentTemplate {
  if (!sportType) return GENERIC_SEGMENT_TEMPLATE
  return SEGMENT_TEMPLATES[sportType] ?? GENERIC_SEGMENT_TEMPLATE
}
