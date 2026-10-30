import test from 'node:test';
import assert from 'node:assert/strict';
import {ExtendedExerciseTracker} from '../src/features/motion/lib/extendedRecognition';
import {newDemonstrationPose,createRecognitionTracker} from '../src/features/motion/lib/recognition';
import {NEW_EXERCISES,type NewExerciseType} from '../src/features/motion/lib/newExercises';
import {exerciseInfo} from '../src/features/motion/lib/exercises';
import type {NormalizedLandmark as Point} from '@mediapipe/tasks-vision';
const types=Object.keys(NEW_EXERCISES) as NewExerciseType[];
const copy=<T,>(p:T):T=>structuredClone(p);
function run(type:NewExerciseType,tracker=new ExtendedExerciseTracker(type,20),aspect=1,step=100){
  let now=0;
  const feed=(stage:'neutral'|'peak'|'left'|'right',duration:number,change?:(p:Point[],w:Point[]|null)=>void)=>{
    const input=newDemonstrationPose(type,stage),scale=Math.min(1,aspect);input.landmarks.forEach(p=>{p.x=.5+(p.x-.5)*scale/aspect;p.y=.5+(p.y-.5)*scale;});change?.(input.landmarks,input.worldLandmarks);
    for(let t=0;t<duration;t+=step){tracker.update(copy(input.landmarks),now,aspect,copy(input.worldLandmarks));now+=step;}return tracker.metrics;
  };
  return {tracker,feed,next:()=>now,advance:(ms:number)=>{now+=ms;}};
}
for(const type of types){
  test(`${type}: calibrated full cycles, stationary frames, aspect and low frame rate`,()=>{
    for(const aspect of [1,9/16,16/9])for(const step of [50,200]){
      const r=run(type,undefined,aspect,step);r.feed('neutral',3000);assert.equal(r.tracker.diagnostics.stage,'ready');
      r.feed('neutral',1500);assert.equal(r.tracker.metrics.reps,0);
      for(let i=0;i<3;i++){r.feed(type==='standing_leg_curl'&&i%2?'right':'peak',1200);r.feed('neutral',1200);assert.equal(r.tracker.metrics.reps,i+1,type);}
      assert.equal(r.tracker.metrics.scoreAccumulator.count,3);assert.ok(r.tracker.metrics.formScore>0);
      if(type==='standing_leg_curl'){assert.equal(r.tracker.metrics.scoreAccumulator.leftReps,2);assert.equal(r.tracker.metrics.scoreAccumulator.rightReps,1);}
    }
  });
  test(`${type}: half-cycle, brief confidence jitter, obstruction and refresh never fabricate a rep`,()=>{
    const r=run(type);r.feed('neutral',3000);r.feed('peak',100);r.feed('neutral',1000);assert.equal(r.tracker.metrics.reps,0);
    r.feed('neutral',1000,(p)=>{p.forEach(x=>x.visibility=.65)});assert.notEqual(r.tracker.diagnostics.stage,'tracking_lost');
    r.feed('peak',900);r.tracker.interrupt('暂停');r.feed('neutral',3000);assert.equal(r.tracker.metrics.reps,0);
    r.feed('peak',1000);r.feed('neutral',1000);assert.equal(r.tracker.metrics.reps,1);
    const saved=copy(r.tracker.metrics),restored=run(type,new ExtendedExerciseTracker(type,20,saved));restored.feed('peak',1200);assert.equal(restored.tracker.metrics.reps,1);restored.feed('neutral',3000);restored.feed('peak',1000);restored.feed('neutral',1000);assert.equal(restored.tracker.metrics.reps,2);
    r.feed('peak',1000);r.feed('peak',700,(p)=>p.forEach(x=>x.visibility=.1));r.feed('neutral',3000);assert.equal(r.tracker.metrics.reps,1);
  });
}
test('front raises reject lateral raises and missing direction data',()=>{
  const r=run('front_raise');r.feed('neutral',3000);
  r.feed('peak',1200,(p,w)=>{for(const o of [0,1]){p[13+o].x=o?.75:.25;p[15+o].x=o?.9:.1;if(w){w[13+o]={...w[13+o],x:o?.4:-.4,z:0};w[15+o]={...w[15+o],x:o?.6:-.6,z:0};}}});r.feed('neutral',1200);assert.equal(r.tracker.metrics.reps,0);
  const p=newDemonstrationPose('front_raise','peak').landmarks;r.tracker.update(p,r.next()+100,1,null);assert.equal(r.tracker.metrics.reps,0);assert.match(r.tracker.metrics.feedback,/方向/);
});
test('Romanian deadlifts reject squats and translating the whole frame',()=>{
  const r=run('romanian_deadlift');r.feed('neutral',3000);r.feed('peak',1200,p=>{for(const o of [0,1]){p[23+o].y=.70;p[25+o].x=.76+o*.06;p[25+o].y=.73;}});r.feed('neutral',3000);assert.equal(r.tracker.metrics.reps,0);
  r.feed('peak',1200,p=>p.forEach(x=>x.x+=.15));r.feed('neutral',3000);assert.equal(r.tracker.metrics.reps,0);
});
test('glute bridges reject shoulder/foot translation, while a clear side counts without invented bilateral scores',()=>{
  const r=run('glute_bridge');r.feed('neutral',3000);r.feed('peak',1200,p=>p.forEach(x=>x.y-=.08));r.feed('neutral',3000);assert.equal(r.tracker.metrics.reps,0);
  r.feed('peak',1200,p=>{for(const i of [12,24,26,28])p[i].visibility=.6});r.feed('neutral',1200);assert.equal(r.tracker.metrics.reps,1);assert.equal(r.tracker.metrics.scoreAccumulator.count,0);assert.equal(r.tracker.metrics.lastRepScore,null);
});
test('standing curls reject high knees and switching sides before returning, and preserve unscored side counts',()=>{
  const r=run('standing_leg_curl');r.feed('neutral',3000);r.feed('peak',1000,p=>{p[25].y=.50;p[25].x=.60});r.feed('neutral',1200);assert.equal(r.tracker.metrics.reps,0);
  r.feed('peak',1000);r.feed('right',1000);r.feed('neutral',3000);assert.equal(r.tracker.metrics.reps,0);
  r.feed('right',1000,p=>p.forEach(x=>x.visibility=.65));r.feed('neutral',1200);assert.equal(r.tracker.metrics.reps,1);assert.equal(r.tracker.metrics.scoreAccumulator.count,0);assert.equal(r.tracker.metrics.scoreAccumulator.rightReps,1);
});
test('unknown profiles fail closed and never reuse squat or push-up algorithms',()=>{
  assert.throws(()=>createRecognitionTracker('unsupported'),/不支持/);assert.match(exerciseInfo('unsupported').name,/未知/);
});
test('a counted curl with upper-arm drift receives lower control feedback without blocking its rep',()=>{
  const stable=run('hammer_curl'),drift=run('hammer_curl');
  for(const r of [stable,drift])r.feed('neutral',3000);
  stable.feed('peak',1200);stable.feed('neutral',1200);
  drift.feed('peak',1200,p=>{p[13].x-=.07;p[14].x+=.07;});drift.feed('neutral',1200);
  assert.equal(stable.tracker.metrics.reps,1);assert.equal(drift.tracker.metrics.reps,1);
  assert.ok(drift.tracker.metrics.formScore<stable.tracker.metrics.formScore);
});
