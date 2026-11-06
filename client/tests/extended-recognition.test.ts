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
test('front raises count single-arm and alternating cycles, one rep per arm',()=>{
  const r=run('front_raise');r.feed('neutral',3000);assert.equal(r.tracker.diagnostics.stage,'ready');
  // Reverting one side's world arm to its hanging pose leaves only the other side raising.
  const rightOnly=(p:Point[],w:Point[]|null)=>{if(!w)return;w[13]={...w[13],x:-.2,y:.2,z:0};w[15]={...w[15],x:-.2,y:.4,z:0};};
  const leftOnly=(p:Point[],w:Point[]|null)=>{if(!w)return;w[14]={...w[14],x:.2,y:.2,z:0};w[16]={...w[16],x:.2,y:.4,z:0};};
  r.feed('peak',1000,rightOnly);r.feed('neutral',1200);assert.equal(r.tracker.metrics.reps,1);
  r.feed('peak',1000,leftOnly);r.feed('neutral',1200);assert.equal(r.tracker.metrics.reps,2);
  assert.equal(r.tracker.metrics.scoreAccumulator.count,2);
});
test('front raises never count a single-arm lateral raise',()=>{
  const r=run('front_raise');r.feed('neutral',3000);
  // Right arm straight out to the side in world space (lateral-dominant), left arm down:
  // the raised angle is in band and the elbow is straight, only the direction can reject it.
  const lateralRight=(p:Point[],w:Point[]|null)=>{if(!w)return;w[13]={...w[13],x:-.2,y:.2,z:0};w[15]={...w[15],x:-.2,y:.4,z:0};w[14]={...w[14],x:.4,y:0,z:0};w[16]={...w[16],x:.6,y:0,z:0};};
  r.feed('peak',1200,lateralRight);r.feed('neutral',1200);assert.equal(r.tracker.metrics.reps,0);
});
test('front raises accept a forward-dominant diagonal and reject a lateral-dominant one',()=>{
  const r=run('front_raise');r.feed('neutral',3000);
  const diag=(deg:number,o:0|1)=>(p:Point[],w:Point[]|null)=>{if(!w)return;const rad=deg*Math.PI/180,sx=o?1:-1,q=1-o;
    w[13+o]={...w[13+o],x:sx*.2+sx*Math.sin(rad)*.22,y:0,z:-Math.cos(rad)*.22};w[15+o]={...w[15+o],x:sx*.2+sx*Math.sin(rad)*.45,y:0,z:-Math.cos(rad)*.45};
    w[13+q]={...w[13+q],x:q?.2:-.2,y:.2,z:0};w[15+q]={...w[15+q],x:q?.2:-.2,y:.4,z:0};};
  r.feed('peak',1000,diag(40,1));r.feed('neutral',1200);assert.equal(r.tracker.metrics.reps,1);
  r.feed('peak',1000,diag(60,1));r.feed('neutral',1200);assert.equal(r.tracker.metrics.reps,1);
});
test('front raise calibration never shows the direction hint',()=>{
  const r=run('front_raise');
  // Arms out to the sides before calibration completes: not the start pose and the
  // direction test is false — the exact trap state from the on-device report, where
  // the old hint ordered the user to raise an arm and wipe their own calibration.
  const lateralBoth=(p:Point[],w:Point[]|null)=>{if(!w)return;w[13]={...w[13],x:-.4,y:0,z:0};w[15]={...w[15],x:-.6,y:0,z:0};w[14]={...w[14],x:.4,y:0,z:0};w[16]={...w[16],x:.6,y:0,z:0};};
  r.feed('peak',500,lateralBoth);
  assert.equal(r.tracker.diagnostics.stage,'calibrating');
  assert.doesNotMatch(r.tracker.metrics.feedback,/前举方向/);
  assert.match(r.tracker.metrics.feedback,/起始姿势/);
  assert.doesNotMatch(r.tracker.metrics.poseFeedback.message,/前举方向/);
  r.feed('neutral',3000);assert.equal(r.tracker.diagnostics.stage,'ready');
});
test('front raises calibrate and count with kneeling-level hip visibility',()=>{
  const r=run('front_raise');
  const kneel=(p:Point[])=>{p[23]={...p[23],visibility:.3};p[24]={...p[24],visibility:.3};};
  r.feed('neutral',3000,kneel);assert.equal(r.tracker.diagnostics.stage,'ready');
  const rightOnly=(p:Point[],w:Point[]|null)=>{kneel(p);if(!w)return;w[13]={...w[13],x:-.2,y:.2,z:0};w[15]={...w[15],x:-.2,y:.4,z:0};};
  r.feed('peak',1000,rightOnly);r.feed('neutral',1200,kneel);
  assert.equal(r.tracker.metrics.reps,1);
  // Low hip visibility keeps the rep unscored instead of resetting the session.
  assert.equal(r.tracker.metrics.scoreAccumulator.count,0);
  assert.equal(r.tracker.metrics.lastRepScore,null);
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
test('hammer curls count alternating single-arm cycles as one rep per arm',()=>{
  const r=run('hammer_curl');r.feed('neutral',3000);assert.equal(r.tracker.diagnostics.stage,'ready');
  const leftOnly=(p:Point[])=>{p[16]={...p[16],x:.57,y:.56};};
  const rightOnly=(p:Point[])=>{p[15]={...p[15],x:.43,y:.56};};
  r.feed('peak',1000,leftOnly);r.feed('neutral',1200);assert.equal(r.tracker.metrics.reps,1);
  r.feed('peak',1000,rightOnly);r.feed('neutral',1200);assert.equal(r.tracker.metrics.reps,2);
  assert.equal(r.tracker.metrics.scoreAccumulator.count,2);
});
test('hammer curls never count a shallow curl that stops above the peak threshold on both sides',()=>{
  const r=run('hammer_curl');r.feed('neutral',3000);
  r.feed('peak',1000,p=>{for(const o of [0,1]){p[15+o]={...p[15+o],x:.43+o*.14+.13,y:.44};}});r.feed('neutral',1200);assert.equal(r.tracker.metrics.reps,0);
});
test('a counted curl with upper-arm drift receives lower control feedback without blocking its rep',()=>{
  const stable=run('hammer_curl'),drift=run('hammer_curl');
  for(const r of [stable,drift])r.feed('neutral',3000);
  stable.feed('peak',1200);stable.feed('neutral',1200);
  drift.feed('peak',1200,p=>{p[13].x-=.07;p[14].x+=.07;});drift.feed('neutral',1200);
  assert.equal(stable.tracker.metrics.reps,1);assert.equal(drift.tracker.metrics.reps,1);
  assert.ok(drift.tracker.metrics.formScore<stable.tracker.metrics.formScore);
});
test('hammer curl returns still confirm when the elbow jitters around the start threshold',()=>{
  const r=run('hammer_curl',undefined,1,50);r.feed('neutral',3000);assert.equal(r.tracker.diagnostics.stage,'ready');
  r.feed('peak',1000);
  // Exact wrist placements for elbow angles of 152° (returned) and 138° (a jitter dip),
  // keeping the demo pose's forearm length so only the elbow angle changes.
  const inZone=(p:Point[])=>{p[15]={...p[15],x:.4957,y:.5436};p[16]={...p[16],x:.5043,y:.5436};};
  const dip=(p:Point[])=>{p[15]={...p[15],x:.5237,y:.524};p[16]={...p[16],x:.4763,y:.524};};
  // A single returned frame cannot confirm the return: accumulated hold is still required.
  r.feed('peak',50,inZone);r.feed('peak',50,dip);assert.equal(r.tracker.metrics.reps,0);
  // Alternating returned/dipped frames accumulate the 150 ms hold inside the window.
  for(let i=0;i<8;i++){r.feed('peak',50,inZone);r.feed('peak',50,dip);}
  assert.equal(r.tracker.metrics.reps,1);
});
test('hammer curl upper-arm hint needs a sustained deviation and never blocks the rep',()=>{
  const r=run('hammer_curl',undefined,1,100);r.feed('neutral',3000);
  // Translate elbows and wrists outward together: upper-arm angle ≈40° (raw hint fires,
  // control penalty >25) while the elbow stays at the ≈25° peak flexion.
  const drift=(p:Point[])=>{p[13]={...p[13],x:p[13].x-.1};p[15]={...p[15],x:p[15].x-.1};p[14]={...p[14],x:p[14].x+.1};p[16]={...p[16],x:p[16].x+.1};};
  // A brief 300 ms drift must not raise the hint (the retest's seated setup flapped it).
  r.feed('peak',300,drift);
  assert.doesNotMatch(r.tracker.metrics.feedback,/上臂靠近体侧/);
  assert.doesNotMatch(r.tracker.metrics.poseFeedback.message,/上臂靠近体侧/);
  // Clear long enough for the sustain timer to reset, then drift sustained past 1 s.
  r.feed('peak',500);
  r.feed('peak',1300,drift);
  assert.match(r.tracker.metrics.feedback,/上臂靠近体侧/);
  // The hint is advisory only: the rep still counts when the arms return.
  r.feed('neutral',1200);assert.equal(r.tracker.metrics.reps,1);
});
