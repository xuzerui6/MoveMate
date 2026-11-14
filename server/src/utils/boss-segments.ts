/**
 * 组队打怪二期 · 约定段模式模板（设计稿 2026-11-14 定稿，Edward 已批准）。
 *
 * 口径（不要随手改，改模板等于改玩法）：
 * - 一场段模式打怪的总格数 = 模板的基础格数，不随队伍人数变化
 *   （人数的分量已经写进「一段」的定义里：个人完成类每人一份、比赛类一个完整单元）。
 * - 「一段是什么」按运动写死；篮球有两种写死的打法，开打前二选一、全场不变。
 * - 没有专属模板的运动一律走通用模板：每人各累计活动 15 分钟。
 * - 本文件是约定文案的唯一源头。客户端镜像（client/src/features/motion/lib/
 *   segmentTemplates.ts）由 client/scripts/generate-segment-templates.ts 从本文件
 *   生成，不要手改；客户端测试会逐字段比对，改了这边没重新生成就会红。
 */

export interface SegmentFormat {
  id: string;
  /** 打法名字（约定确认页展示） */
  name: string;
  segmentLabel: string;
  totalLabel: string;
}

export interface SegmentTemplate {
  /** 模板 id：有专属模板时就是 sport_type，通用模板为 'generic' */
  templateId: string;
  sportName: string;
  /** 基础格数 = 本场总格数 */
  segments: number;
  segmentLabel: string;
  totalLabel: string;
  formats?: SegmentFormat[];
}

export interface SegmentContract {
  templateId: string;
  segmentFormat: string | null;
  segmentLabel: string;
  totalLabel: string;
  segmentsTotal: number;
}

export const SEGMENT_TEMPLATES: Record<string, SegmentTemplate> = {
  basketball: {
    templateId: 'basketball',
    sportName: '篮球',
    segments: 4,
    segmentLabel: '打满 10 分钟比赛（暂停、场边休息不计入）',
    totalLabel: '本场共 4 段：每段打满 10 分钟，一共 40 分钟比赛，休息另算。',
    formats: [
      {
        id: 'minutes10',
        name: '10 分钟一轮',
        segmentLabel: '打满 10 分钟比赛（暂停、场边休息不计入）',
        totalLabel: '本场共 4 段：每段打满 10 分钟，一共 40 分钟比赛，休息另算。',
      },
      {
        id: 'points21',
        name: '21 分一局',
        segmentLabel: '打完一局 21 分比赛',
        totalLabel: '本场共 4 段：每段打完一局 21 分，一共 4 局。',
      },
    ],
  },
  soccer: {
    templateId: 'soccer',
    sportName: '足球',
    segments: 3,
    segmentLabel: '踢满 20 分钟比赛（暂停不计时，没踢满不算一段）',
    totalLabel: '本场共 3 段：每段踢满 20 分钟，一共 60 分钟比赛。',
  },
  badminton: {
    templateId: 'badminton',
    sportName: '羽毛球',
    segments: 4,
    segmentLabel: '按 21 分制打完一局（20 平后领先 2 分，先到 30 分结束）',
    totalLabel: '本场共 4 段：一共打完 4 局。',
  },
  volleyball: {
    templateId: 'volleyball',
    sportName: '排球',
    segments: 4,
    segmentLabel: '按 25 分制打完一局（24 平后领先 2 分）',
    totalLabel: '本场共 4 段：一共打完 4 局。',
  },
  tennis: {
    templateId: 'tennis',
    sportName: '网球',
    segments: 6,
    segmentLabel: '打完一个发球局（至少赢 4 分、还要领先 2 分，平分就继续打完）',
    totalLabel: '本场共 6 段：一共打完 6 个发球局。',
  },
  table_tennis: {
    templateId: 'table_tennis',
    sportName: '乒乓球',
    segments: 6,
    segmentLabel: '按 11 分制打完一局（10 平后领先 2 分）',
    totalLabel: '本场共 6 段：一共打完 6 局。',
  },
  swimming: {
    templateId: 'swimming',
    sportName: '游泳',
    segments: 4,
    segmentLabel: '每人各累计游完 200 米（25 米池 8 个单程、50 米池 4 个单程），可以中途休息，全员都完成才算一段',
    totalLabel: '本场共 4 段：每人一共游 800 米。',
  },
  running: {
    templateId: 'running',
    sportName: '跑步',
    segments: 4,
    segmentLabel: '每人各跑完 1 公里（标准跑道 2 圈半），可以跑也可以走，不比速度，全员都完成才算一段',
    totalLabel: '本场共 4 段：每人一共跑 4 公里。',
  },
  roller_skating: {
    templateId: 'roller_skating',
    sportName: '轮滑',
    segments: 4,
    segmentLabel: '每人各累计滑完 1 公里（按标好距离的路线，或按场馆一圈的长度折算圈数，开打前定好、全场用同一个标准），全员都完成才算一段',
    totalLabel: '本场共 4 段：每人一共滑 4 公里。',
  },
  skateboarding: {
    templateId: 'skateboarding',
    sportName: '滑板',
    segments: 4,
    segmentLabel: '每人各累计练习 15 分钟（刷街、练动作都算；光围观、聊天、离场休息不算），全员都完成才算一段',
    totalLabel: '本场共 4 段：每人一共练 60 分钟。',
  },
};

export const GENERIC_SEGMENT_TEMPLATE: SegmentTemplate = {
  templateId: 'generic',
  sportName: '这个运动',
  segments: 4,
  segmentLabel: '每人各累计活动 15 分钟（上课、轮流练习都算；和运动无关的休息不算），全员都完成才算一段',
  totalLabel: '本场共 4 段：每人一共活动 60 分钟。',
};

/** 健身在约定段模式里能选的动作（写死清单：一项动作 + 每人每段的量，全场不变） */
export const SEGMENT_FITNESS_MOVEMENTS = [
  { id: 'seg_squat', name: '深蹲', perSegment: '每人 20 次' },
  { id: 'seg_push_up', name: '俯卧撑', perSegment: '每人 15 次' },
  { id: 'seg_jumping_jack', name: '开合跳', perSegment: '每人 30 次' },
  { id: 'seg_high_knees', name: '高抬腿', perSegment: '每人 40 次' },
  { id: 'seg_lunge', name: '弓步蹲', perSegment: '每人 20 次（左右合计）' },
] as const;

export type SegmentFitnessMovementId = (typeof SEGMENT_FITNESS_MOVEMENTS)[number]['id'];

export function isSegmentFitnessMovement(id: string): boolean {
  return SEGMENT_FITNESS_MOVEMENTS.some((m) => m.id === id);
}

/** 按运动类型取模板；没有专属模板的一律通用模板 */
export function segmentTemplateForSport(sportType: string): SegmentTemplate {
  return SEGMENT_TEMPLATES[sportType] || GENERIC_SEGMENT_TEMPLATE;
}

/**
 * 把「运动 + 打法选择」落成一份写死的约定（创建打怪时拍快照存进 fight 行，
 * 开打后不再随模板表变化）。篮球不传打法时默认按时间打。
 * 健身段模式必须给出写死清单里的动作 id（segmentMovement），缺省取第一项。
 */
export function resolveSegmentContract(
  sportType: string,
  opts: { segmentFormat?: string; segmentMovement?: string } = {},
): SegmentContract {
  if (sportType === 'fitness') {
    const movement = SEGMENT_FITNESS_MOVEMENTS.find((m) => m.id === opts.segmentMovement)
      || SEGMENT_FITNESS_MOVEMENTS[0];
    return {
      templateId: 'fitness',
      segmentFormat: movement.id,
      segmentLabel: `每人各做完一组${movement.name}（${movement.perSegment.replace('每人 ', '')}），可以分组做，全员都完成才算一段`,
      totalLabel: `本场共 4 段：每人一共做 4 大组${movement.name}。`,
      segmentsTotal: 4,
    };
  }
  const template = segmentTemplateForSport(sportType);
  if (template.formats?.length) {
    const format = template.formats.find((f) => f.id === opts.segmentFormat) || template.formats[0];
    return {
      templateId: template.templateId,
      segmentFormat: format.id,
      segmentLabel: format.segmentLabel,
      totalLabel: format.totalLabel,
      segmentsTotal: template.segments,
    };
  }
  return {
    templateId: template.templateId,
    segmentFormat: null,
    segmentLabel: template.segmentLabel,
    totalLabel: template.totalLabel,
    segmentsTotal: template.segments,
  };
}
