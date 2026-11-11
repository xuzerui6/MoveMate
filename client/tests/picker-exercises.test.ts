import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  bodyGroupFor,
  equipLabelFor,
  filterPickerMovements,
  groupPickerMovements,
  pickerMovements,
  recentPickerMovements,
} from '../src/features/motion/lib/pickerExercises';
import {CAMERA_EXERCISES} from '../src/features/motion/lib/exercises';
import {NEW_EXERCISES, isNewExercise} from '../src/features/motion/lib/newExercises';
import pickerMetadata from '../src/features/motion/lib/picker-metadata.json';
import catalog from '../../server/src/gym/catalog.json';

test('picker metadata matches the library catalog for every trial movement (no drift)', () => {
  const byId = new Map((catalog as any[]).map(entry => [entry.id, entry]));
  for (const [type, definition] of Object.entries(NEW_EXERCISES)) {
    const entry = byId.get((definition as any).exerciseIds[0]);
    assert.ok(entry, `${type}: catalog entry missing`);
    const meta = (pickerMetadata as any)[type];
    assert.ok(meta, `${type}: picker metadata missing`);
    assert.equal(meta.bodyPart, entry.bodyPart, `${type}.bodyPart`);
    assert.equal(meta.equipment, entry.equipment, `${type}.equipment`);
    assert.equal(meta.target, entry.target, `${type}.target`);
  }
});

test('every picker movement resolves groups, a section and a thumbnail', () => {
  const movements = pickerMovements();
  assert.equal(movements.length, Object.keys(CAMERA_EXERCISES).length);
  assert.equal(movements.length, 22);
  for (const movement of movements) {
    assert.ok((pickerMetadata as any)[movement.type], `${movement.type}: metadata missing`);
    assert.ok(['上肢', '下肢', '核心', '全身'].includes(movement.bodyGroup), movement.type);
    assert.ok(['哑铃', '杠铃', '徒手'].includes(movement.equipLabel), movement.type);
    assert.equal(movement.section, `${movement.bodyGroup} · ${movement.equipLabel}`);
    assert.ok(movement.chips.includes('全部'), movement.type);
    assert.ok(movement.chips.includes(movement.bodyGroup), movement.type);
    assert.equal(movement.trial, isNewExercise(movement.type), movement.type);
    assert.ok(movement.thumb, `${movement.type}: published start-frame thumbnail missing`);
  }
});

test('group derivation: bodyPart and equipment map onto the design chips', () => {
  assert.equal(bodyGroupFor('upper arms'), '上肢');
  assert.equal(bodyGroupFor('shoulders'), '上肢');
  assert.equal(bodyGroupFor('back'), '上肢');
  assert.equal(bodyGroupFor('chest'), '上肢');
  assert.equal(bodyGroupFor('upper legs'), '下肢');
  assert.equal(bodyGroupFor('lower legs'), '下肢');
  assert.equal(bodyGroupFor('waist'), '核心');
  assert.equal(bodyGroupFor('cardio'), '全身');
  assert.equal(equipLabelFor('dumbbell'), '哑铃');
  assert.equal(equipLabelFor('barbell'), '杠铃');
  assert.equal(equipLabelFor('body weight'), '徒手');
});

test('grouped sections follow the design order and place known movements', () => {
  const sections = groupPickerMovements(pickerMovements());
  const titles = sections.map(s => s.title);
  assert.deepEqual(titles, [...titles].sort((a, b) => {
    const order = ['上肢 · 哑铃', '上肢 · 杠铃', '上肢 · 徒手', '下肢 · 哑铃', '下肢 · 杠铃', '下肢 · 徒手', '核心 · 哑铃', '核心 · 杠铃', '核心 · 徒手', '全身 · 哑铃', '全身 · 杠铃', '全身 · 徒手'];
    return order.indexOf(a) - order.indexOf(b);
  }));
  const inSection = (title: string) => sections.find(s => s.title === title)?.movements.map(m => m.type) ?? [];
  assert.ok(inSection('上肢 · 哑铃').includes('hammer_curl'));
  assert.ok(inSection('下肢 · 徒手').includes('squat'));
  assert.ok(inSection('全身 · 徒手').includes('mountain_climber'));
  assert.ok(inSection('下肢 · 杠铃').includes('barbell_good_morning'));
  assert.ok(inSection('核心 · 徒手').includes('lying_leg_raise'));
  // Every movement appears exactly once across the grouped list.
  const all = sections.flatMap(s => s.movements.map(m => m.type));
  assert.equal(all.length, 22);
  assert.equal(new Set(all).size, 22);
});

test('chip and search filters: barbell movements match no equipment chip', () => {
  const movements = pickerMovements();
  const dumbbell = filterPickerMovements(movements, '哑铃', '');
  assert.ok(dumbbell.length > 0);
  assert.ok(dumbbell.every(m => m.equipLabel === '哑铃'));
  assert.ok(!dumbbell.some(m => m.type === 'barbell_good_morning'));
  const bodyweight = filterPickerMovements(movements, '徒手', '');
  assert.ok(bodyweight.every(m => m.equipLabel === '徒手'));
  const search = filterPickerMovements(movements, '全部', '弯举');
  assert.ok(search.some(m => m.type === 'hammer_curl'));
  assert.ok(search.every(m => m.name.includes('弯举')));
  assert.equal(filterPickerMovements(movements, '全部', '不存在的动作').length, 0);
});

test('recent list: newest real session per movement, demos excluded', () => {
  const movements = pickerMovements();
  const history = [
    {exerciseType: 'squat', reps: 12, source: 'camera', startTime: 100},
    {exerciseType: 'hammer_curl', reps: 14, source: 'camera', startTime: 300},
    {exerciseType: 'squat', reps: 20, source: 'camera', startTime: 200},
    {exerciseType: 'push_up', reps: 9, source: 'demo', startTime: 400},
    {exerciseType: 'running', reps: 1, source: 'timer', startTime: 500},
  ];
  const recent = recentPickerMovements(history, movements);
  assert.deepEqual(recent.map(r => [r.movement.type, r.lastReps]), [['hammer_curl', 14], ['squat', 20]]);
});
