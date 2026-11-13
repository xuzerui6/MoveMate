/**
 * 注册页学校选择的小工具（纯函数，方便单测）：
 * 学校可以「只挂在列表里、暂不开放注册」（内测中），这类学校选了要给出提示并拦住注册。
 */
import type { Campus, School } from '../../types';

/** 学校暂未开放注册时的统一提示（与服务端文案保持一致） */
export const SCHOOL_CLOSED_MESSAGE = '这所学校正在小范围测试，暂时还不能注册';

/** 学校是否开放注册；老数据没这个字段时按开放处理 */
export function isSchoolRegistrationOpen(school: School | null | undefined): boolean {
  if (!school) return false;
  return school.registration_open !== false;
}

/** 学校在选择器里的展示名：没开放注册的带上「内测中」 */
export function schoolOptionLabel(school: School): string {
  return isSchoolRegistrationOpen(school) ? school.name : `${school.name} · 内测中`;
}

/** 某个学校的校区列表 */
export function campusesForSchool(campuses: Campus[], schoolId: number | null | undefined): Campus[] {
  if (!schoolId) return [];
  return campuses.filter((campus) => campus.school_id === schoolId);
}

/** 默认选中的学校：优先主学校，其次第一所开放注册的，都没有就第一所 */
export function defaultSchoolId(schools: School[], primary: School | null | undefined): number | '' {
  if (primary && schools.some((s) => s.id === primary.id)) return primary.id;
  const firstOpen = schools.find((s) => isSchoolRegistrationOpen(s));
  if (firstOpen) return firstOpen.id;
  return schools[0]?.id ?? '';
}
