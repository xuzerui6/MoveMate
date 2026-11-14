/**
 * 约定段模板 · 客户端数据的唯一拼装处。
 *
 * 源头是服务端 server/src/utils/boss-segments.ts：服务端创建打怪时把约定拍成
 * 快照，冻结口径以服务端为准，这里不产生任何新文案，只做形状转换。
 * - generate-segment-templates.ts 用它生成 src/features/motion/lib/segmentTemplates.ts；
 * - tests/boss-fight-segments.test.ts 用它逐字段比对生成物是否新鲜——
 *   服务端改了任何一条文案、没重新生成，测试就会红，漂移进不了主干。
 */
import {
  GENERIC_SEGMENT_TEMPLATE as SERVER_GENERIC,
  SEGMENT_FITNESS_MOVEMENTS,
  SEGMENT_TEMPLATES as SERVER_TEMPLATES,
  resolveSegmentContract,
} from '../../server/src/utils/boss-segments.ts';

export interface SegmentTemplateOptionData {
  value: string;
  name: string;
  segmentLabel: string;
  totalLabel: string;
}

export interface SegmentTemplateData {
  templateId: string;
  segmentsTotal: number;
  segmentLabel: string;
  totalLabel: string;
  /** 开打前二选一的打法（篮球）；开打锁定 */
  formats?: SegmentTemplateOptionData[];
  /** 健身段模式的固定动作清单（每段一个动作+人数无关的固定个数） */
  movements?: SegmentTemplateOptionData[];
}

export function buildSegmentTemplateData(): {
  templates: Record<string, SegmentTemplateData>;
  generic: SegmentTemplateData;
} {
  const templates: Record<string, SegmentTemplateData> = {};
  for (const [sport, t] of Object.entries(SERVER_TEMPLATES)) {
    templates[sport] = {
      templateId: t.templateId,
      segmentsTotal: t.segments,
      segmentLabel: t.segmentLabel,
      totalLabel: t.totalLabel,
      ...(t.formats?.length
        ? {
            formats: t.formats.map((f) => ({
              value: f.id,
              name: f.name,
              segmentLabel: f.segmentLabel,
              totalLabel: f.totalLabel,
            })),
          }
        : {}),
    };
  }
  // 健身不在服务端模板表里：服务端按动作逐个解析约定（resolveSegmentContract），
  // 这里逐个动作落成选项；顶层文案取默认动作（清单第一项，深蹲）的约定。
  const fitnessDefault = resolveSegmentContract('fitness', {});
  templates.fitness = {
    templateId: fitnessDefault.templateId,
    segmentsTotal: fitnessDefault.segmentsTotal,
    segmentLabel: fitnessDefault.segmentLabel,
    totalLabel: fitnessDefault.totalLabel,
    movements: SEGMENT_FITNESS_MOVEMENTS.map((m) => {
      const contract = resolveSegmentContract('fitness', { segmentMovement: m.id });
      return {
        value: m.id,
        name: m.name,
        segmentLabel: contract.segmentLabel,
        totalLabel: contract.totalLabel,
      };
    }),
  };
  const generic: SegmentTemplateData = {
    templateId: SERVER_GENERIC.templateId,
    segmentsTotal: SERVER_GENERIC.segments,
    segmentLabel: SERVER_GENERIC.segmentLabel,
    totalLabel: SERVER_GENERIC.totalLabel,
  };
  return { templates, generic };
}
