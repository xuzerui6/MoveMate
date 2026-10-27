import test from 'node:test';
import assert from 'node:assert/strict';
import {isUnreviewedOfficialExercise,workoutGuideInstruction} from '../src/features/gym/exerciseGuidance';

test('unreviewed and legacy official snapshots never feed contradicted steps into voice coaching',()=>{
  for(const reviewStatus of [undefined,'needs_review']){
    const snapshot={id:'exdb:0137',reviewStatus,instructions:['坐到长凳边缘，以凳上臂屈伸作为Body-Up。']};
    const saved=structuredClone(snapshot),instruction=workoutGuideInstruction(snapshot);
    assert.ok(isUnreviewedOfficialExercise(snapshot));
    assert.ok(instruction.includes('仅提供通用节奏'));
    assert.ok(!instruction.includes('长凳'));assert.deepEqual(snapshot,saved);
  }
});

test('reviewed guidance, user-authored snapshots and explicit recognition instructions keep their existing meaning',()=>{
  const current={id:'exdb:0137',reviewStatus:'checked',instructions:['前臂支撑。','双掌压地伸肘。']};
  assert.equal(workoutGuideInstruction(current),'前臂支撑。 双掌压地伸肘。');
  const custom={id:'user:13',instructions:['本人保存的动作说明。']};
  assert.equal(isUnreviewedOfficialExercise(custom),false);
  assert.equal(workoutGuideInstruction(custom),'本人保存的动作说明。');
  assert.equal(workoutGuideInstruction({id:'motion:squat'},'站稳校准后下蹲回站立。'),'站稳校准后下蹲回站立。');
  assert.equal(workoutGuideInstruction(undefined),'');
});
