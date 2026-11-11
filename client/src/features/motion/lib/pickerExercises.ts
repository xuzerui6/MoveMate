import {CAMERA_EXERCISES} from './exercises';
import {NEW_EXERCISES, isNewExercise} from './newExercises';
import {mediaSummaryFor} from '../../gym/media';
import metadata from './picker-metadata.json';

export type PickerBodyGroup = '上肢' | '下肢' | '核心' | '全身';
export type PickerEquipLabel = '哑铃' | '杠铃' | '徒手';
export type PickerChip = '全部' | PickerBodyGroup | '哑铃' | '徒手';
export const PICKER_CHIPS: PickerChip[] = ['全部', '上肢', '下肢', '核心', '全身', '哑铃', '徒手'];

const BODY_GROUP_ORDER: PickerBodyGroup[] = ['上肢', '下肢', '核心', '全身'];
const EQUIP_ORDER: PickerEquipLabel[] = ['哑铃', '杠铃', '徒手'];

/** Library bodyPart → the picker's four body chips. */
export function bodyGroupFor(bodyPart: string): PickerBodyGroup {
  switch (bodyPart) {
    case 'upper legs':
    case 'lower legs':
      return '下肢';
    case 'waist':
      return '核心';
    case 'cardio':
      return '全身';
    default: // upper arms, shoulders, back, chest, neck
      return '上肢';
  }
}

export function equipLabelFor(equipment: string): PickerEquipLabel {
  if (equipment === 'dumbbell') return '哑铃';
  if (equipment === 'barbell') return '杠铃';
  return '徒手';
}

export interface PickerMovement {
  type: string;
  name: string;
  english: string;
  unit: string;
  trial: boolean;
  thumb: string | null;
  bodyGroup: PickerBodyGroup;
  equipLabel: PickerEquipLabel;
  section: string;
  chips: PickerChip[];
}

type PickerMetadata = Record<string, {bodyPart: string; equipment: string; target: string}>;
const pickerMetadata = metadata as PickerMetadata;

/** Every picker-reachable camera movement with its derived grouping, thumbnail and
 * chip membership, in registry order. Groups come from picker-metadata.json, which
 * is generated from the library catalog (scripts/generate-picker-metadata.mjs) and
 * guarded by tests against catalog drift. */
export function pickerMovements(): PickerMovement[] {
  return Object.entries(CAMERA_EXERCISES).map(([type, exercise]) => {
    const meta = pickerMetadata[type];
    const bodyGroup = bodyGroupFor(meta?.bodyPart ?? '');
    const equipLabel = equipLabelFor(meta?.equipment ?? '');
    const chips: PickerChip[] = ['全部', bodyGroup];
    if (equipLabel === '哑铃' || equipLabel === '徒手') chips.push(equipLabel);
    const libraryId = isNewExercise(type) ? NEW_EXERCISES[type].exerciseIds[0] : `motion:${type}`;
    return {
      type,
      name: exercise.name,
      english: exercise.english,
      unit: exercise.unit,
      trial: isNewExercise(type),
      thumb: mediaSummaryFor(libraryId)?.thumb ?? null,
      bodyGroup,
      equipLabel,
      section: `${bodyGroup} · ${equipLabel}`,
      chips,
    };
  });
}

export interface PickerSection {title: string; movements: PickerMovement[]}

/** Groups movements into design-order sections: 上肢 → 下肢 → 核心 → 全身， and
 * 哑铃 → 杠铃 → 徒手 within each body group; registry order inside a section. */
export function groupPickerMovements(movements: PickerMovement[]): PickerSection[] {
  const sections: PickerSection[] = [];
  for (const bodyGroup of BODY_GROUP_ORDER) {
    for (const equipLabel of EQUIP_ORDER) {
      const inSection = movements.filter(m => m.bodyGroup === bodyGroup && m.equipLabel === equipLabel);
      if (inSection.length) sections.push({title: `${bodyGroup} · ${equipLabel}`, movements: inSection});
    }
  }
  return sections;
}

export function filterPickerMovements(movements: PickerMovement[], chip: PickerChip, query: string): PickerMovement[] {
  const q = query.trim().toLowerCase();
  return movements.filter(m =>
    m.chips.includes(chip) &&
    (!q || m.name.includes(query.trim()) || m.english.toLowerCase().includes(q)));
}

export interface RecentPickerEntry {movement: PickerMovement; lastReps: number}

/** Session start times arrive as epoch ms from the client and ISO strings from
 * the server; both normalize to ms here. */
export const sessionStartMs = (value: number | string): number =>
  typeof value === 'number' ? value : Date.parse(value) || 0;

/** 最近练过： the most recent real (non-demo) session per movement, newest first.
 * History order is not trusted; startTime decides. */
export function recentPickerMovements(
  history: {exerciseType: string; reps: number; source?: string; startTime: number | string}[],
  movements: PickerMovement[],
  limit = 3,
): RecentPickerEntry[] {
  const byType = new Map(movements.map(m => [m.type, m]));
  const latest = new Map<string, {reps: number; startTime: number}>();
  for (const session of history) {
    if (session.source === 'demo' || !byType.has(session.exerciseType)) continue;
    const startTime = sessionStartMs(session.startTime);
    const current = latest.get(session.exerciseType);
    if (!current || startTime > current.startTime) latest.set(session.exerciseType, {reps: session.reps, startTime});
  }
  return [...latest.entries()]
    .sort((a, b) => b[1].startTime - a[1].startTime)
    .slice(0, limit)
    .map(([type, info]) => ({movement: byType.get(type)!, lastReps: info.reps}));
}
