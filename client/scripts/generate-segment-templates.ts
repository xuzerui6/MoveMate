/**
 * 重新生成 src/features/motion/lib/segmentTemplates.ts（约定段模板客户端镜像）。
 *
 * 用法（在 client/ 下）：npx tsx scripts/generate-segment-templates.ts
 * 数据来自 scripts/segment-templates-data.ts，它直接读服务端
 * server/src/utils/boss-segments.ts —— 改文案只改服务端，然后跑这支脚本。
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSegmentTemplateData } from './segment-templates-data.ts';

const { templates, generic } = buildSegmentTemplateData();

const header = `/**
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
`;

const body = `${header}
export const SEGMENT_TEMPLATES: Record<string, SegmentTemplate> = ${JSON.stringify(templates, null, 2)};

export const GENERIC_SEGMENT_TEMPLATE: SegmentTemplate = ${JSON.stringify(generic, null, 2)};

/** 按运动类型取段模板（没有专属模板的走通用模板） */
export function segmentTemplateFor(sportType: string | undefined | null): SegmentTemplate {
  if (!sportType) return GENERIC_SEGMENT_TEMPLATE;
  return SEGMENT_TEMPLATES[sportType] ?? GENERIC_SEGMENT_TEMPLATE;
}
`;

const target = fileURLToPath(new URL('../src/features/motion/lib/segmentTemplates.ts', import.meta.url));
writeFileSync(target, body);
console.log(`segmentTemplates.ts regenerated from server/src/utils/boss-segments.ts -> ${target}`);
