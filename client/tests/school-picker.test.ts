import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHOOL_CLOSED_MESSAGE,
  campusesForSchool,
  defaultSchoolId,
  isSchoolRegistrationOpen,
  schoolOptionLabel,
} from '../src/pages/Login/schools.ts';
import type { Campus, School } from '../src/types.ts';

const jlu: School = { id: 1, code: 'jlu', name: '吉林大学', registration_open: true };
const jlsu: School = { id: 2, code: 'jlsu', name: '吉林体育学院', registration_open: false };
const schools = [jlu, jlsu];
const campuses: Campus[] = [
  { id: 1, school_id: 1, code: 'qianwei', name: '前卫校区（中心校区）' },
  { id: 2, school_id: 1, code: 'nanling', name: '南岭校区' },
  { id: 4, school_id: 2, code: 'jlsu-nanling', name: '南岭校区' },
  { id: 5, school_id: 2, code: 'jlsu-linhe', name: '临河校区' },
];

test('school list renders both schools with the right states', () => {
  assert.equal(schoolOptionLabel(jlu), '吉林大学');
  assert.equal(schoolOptionLabel(jlsu), '吉林体育学院 · 内测中');
  assert.equal(isSchoolRegistrationOpen(jlu), true);
  assert.equal(isSchoolRegistrationOpen(jlsu), false);
  // 老数据没有 registration_open 字段时按开放处理，不误伤现有学校
  assert.equal(isSchoolRegistrationOpen({ id: 9, code: 'legacy', name: '老学校' }), true);
  assert.equal(SCHOOL_CLOSED_MESSAGE, '这所学校正在小范围测试，暂时还不能注册');
});

test('campuses are filtered to the selected school', () => {
  assert.deepEqual(campusesForSchool(campuses, 1).map((c) => c.id), [1, 2]);
  assert.deepEqual(campusesForSchool(campuses, 2).map((c) => c.id), [4, 5]);
  assert.deepEqual(campusesForSchool(campuses, null), []);
});

test('default selection prefers the primary open school', () => {
  assert.equal(defaultSchoolId(schools, jlu), 1);
  assert.equal(defaultSchoolId(schools, null), 1);
  assert.equal(defaultSchoolId([jlsu], null), 2);
  assert.equal(defaultSchoolId([], null), '');
});
