import {test} from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_PROFILES, PlanExerciseTracker, type NewPlanProfile } from '../src/features/gym/planRecognition';
import { planPose } from './fixtures/plan-camera';
import { restoredSetMetrics } from '../src/features/gym/workoutSync';
const mix=(a:ReturnType<typeof planPose>,b:ReturnType<typeof planPose>,u:number)=>a.map((v,i)=>({...v,x:v.x+(b[i].x-v.x)*u,y:v.y+(b[i].y-v.y)*u}));
function replay(type:NewPlanProfile,fps=10,aspect=1,restored:any={}){
  const tracker=new PlanExerciseTracker(type,20,restored);let now=0;
  const hold=(points:ReturnType<typeof planPose>|null,ms=1000)=>{for(let t=0;t<ms;t+=1000/fps){now+=1000/fps;tracker.update(points?.map(v=>({...v,x:.5+(v.x-.5)*.8/aspect,y:.5+(v.y-.5)*.8}))||null,now,aspect);}};
  const neutral=planPose(type),peak=planPose(type,'peak');
  const cycle=(to=peak)=>{for(let i=1;i<=10;i++)hold(mix(neutral,to,i/10),100);hold(to,500);for(let i=1;i<=10;i++)hold(mix(to,neutral,i/10),100);hold(neutral,700);};
  return {tracker,hold,cycle,neutral,peak,calibrate:()=>hold(neutral,2800)};
}
for(const type of PLAN_PROFILES){
  test(`${type}: complete cycles at varied aspect and frame rate, with bounded score`,()=>{
    for(const fps of [5,15,30])for(const aspect of [.75,16/9]){const r=replay(type,fps,aspect);r.calibrate();assert.ok(r.tracker.metrics.poseFeedback.calibrated,`${type} calibration`);r.cycle();r.cycle();assert.equal(r.tracker.metrics.reps,2,`${fps}fps ${aspect} ${r.tracker.metrics.feedback} ${r.tracker.diagnostics.lastResetReason}`);assert.equal(r.tracker.metrics.scoreAccumulator.count,2);assert.ok(r.tracker.metrics.formScore>=0&&r.tracker.metrics.formScore<=100);}
  });
  test(`${type}: no half rep or static jitter; pause/loss/reload discard half and preserve completed`,()=>{
    const r=replay(type);r.calibrate();r.cycle(mix(r.neutral,r.peak,.25));assert.equal(r.tracker.metrics.reps,0);for(let i=0;i<40;i++)r.hold(r.neutral.map(p=>({...p,y:p.y+Math.sin(i)*.001})),100);assert.equal(r.tracker.metrics.reps,0);r.hold(r.peak);r.tracker.interrupt();r.hold(r.neutral,3000);assert.equal(r.tracker.metrics.reps,0);r.cycle();assert.equal(r.tracker.metrics.reps,1);r.hold(r.peak);r.hold(null);r.hold(r.neutral,3000);assert.equal(r.tracker.metrics.reps,1);const restored=replay(type,10,1,r.tracker.metrics);restored.calibrate();restored.cycle();assert.equal(restored.tracker.metrics.reps,2);assert.equal(restored.tracker.metrics.scoreAccumulator.count,2);
  });
  test(`${type}: marginal confidence can count without fabricated score; severe occlusion cannot count`,()=>{
    const r=replay(type);r.calibrate();r.cycle(r.peak.map(p=>({...p,visibility:.6})));assert.equal(r.tracker.metrics.reps,1);assert.equal(r.tracker.metrics.scoreAccumulator.count,0);r.hold(r.peak.map(p=>({...p,visibility:.1})));r.hold(r.neutral,3000);assert.equal(r.tracker.metrics.reps,1);
  });
}
test('reverse lunge counts each side and restores side totals; forward step cannot count',()=>{
  const r=replay('reverse_lunge');r.calibrate();r.cycle();r.cycle(planPose('reverse_lunge','right'));assert.equal(r.tracker.metrics.reps,2);assert.equal(r.tracker.metrics.scoreAccumulator.leftReps,1);assert.equal(r.tracker.metrics.scoreAccumulator.rightReps,1);const next=replay('reverse_lunge',10,1,r.tracker.metrics);next.calibrate();next.cycle();assert.equal(next.tracker.metrics.scoreAccumulator.leftReps,2);const forward=r.peak.map(p=>({...p}));for(const i of [27,29,31])forward[i].x+=.55;const f=replay('reverse_lunge');f.calibrate();f.cycle(forward);assert.equal(f.tracker.metrics.reps,0);
});
test('scoring distinguishes coordination and posture without a score counting gate',()=>{
  const good=replay('biceps_curl');good.calibrate();good.cycle();const poor=replay('biceps_curl');poor.calibrate();const pose=planPose('biceps_curl','peak');pose[11].x-=.12;pose[12].x-=.12;poor.cycle(pose);assert.equal(poor.tracker.metrics.reps,1);assert.ok(poor.tracker.metrics.formScore<good.tracker.metrics.formScore);
});
test('unscored lunge side counts restore without inventing scored repetitions',()=>{
 const score={count:0,total:0,depth:0,stability:0,trunk:0,symmetry:0,leftReps:1,rightReps:0};
 const r=replay('reverse_lunge',10,1,restoredSetMetrics({reps:1,score}));r.calibrate();r.cycle(planPose('reverse_lunge','right'));assert.equal(r.tracker.metrics.reps,2);assert.equal(r.tracker.metrics.scoreAccumulator.count,1);assert.equal(r.tracker.metrics.scoreAccumulator.leftReps,1);assert.equal(r.tracker.metrics.scoreAccumulator.rightReps,1);
});
test('short visibility noise is smoothed before reset; frame stalls and invalid input cannot complete a half rep',()=>{
 for(const type of PLAN_PROFILES){const r=replay(type);r.calibrate();r.hold(r.neutral.map(p=>({...p,visibility:.5})),100);assert.ok(r.tracker.metrics.poseFeedback.calibrated);r.cycle();assert.equal(r.tracker.metrics.reps,1);r.hold(r.peak);r.tracker.update(null,100000,1);r.hold(r.neutral,3000);assert.equal(r.tracker.metrics.reps,1);assert.equal(r.tracker.update(r.neutral,NaN,1).reps,1);}
});
