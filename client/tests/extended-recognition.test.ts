import test from 'node:test';
import assert from 'node:assert/strict';
import {ExtendedExerciseTracker,sustainedPeak,evaluatePeakEvidence,type TimedSpan} from '../src/features/motion/lib/extendedRecognition';
import {medianOf} from '../src/features/motion/lib/sessionMigration';
import {newDemonstrationPose,createRecognitionTracker} from '../src/features/motion/lib/recognition';
import {poseIssueCopy} from '../src/features/motion/lib/poseFeedback';
import {COPY_FRAMING,COPY_FRAMING_UPPER,COPY_NOT_SEEN,COPY_NOT_SEEN_UPPER,framingCopyFor,notSeenCopyFor} from '../src/features/motion/lib/companionCopy';
import {NEW_EXERCISES,type NewExerciseType} from '../src/features/motion/lib/newExercises';
import {exerciseInfo} from '../src/features/motion/lib/exercises';
import type {NormalizedLandmark as Point} from '@mediapipe/tasks-vision';
const types=Object.keys(NEW_EXERCISES) as NewExerciseType[];
const copy=<T,>(p:T):T=>structuredClone(p);
// Trackers are built through the production factory, not the Extended class
// directly: tier 1-2 picker entries (e.g. dumbbell_standing_press) route to
// PlanExerciseTracker / remapped Extended types exactly as the plan path does,
// and this loop must exercise that routing rather than bypass it.
function run(type:NewExerciseType,tracker=createRecognitionTracker(type,20),aspect=1,step=100){
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
    const saved=copy(r.tracker.metrics),restored=run(type,createRecognitionTracker(type,20,saved));restored.feed('peak',1200);assert.equal(restored.tracker.metrics.reps,1);restored.feed('neutral',3000);restored.feed('peak',1000);restored.feed('neutral',1000);assert.equal(restored.tracker.metrics.reps,2);
    r.feed('peak',1000);r.feed('peak',700,(p)=>p.forEach(x=>x.visibility=.1));r.feed('neutral',3000);
    // Round 4 (front raise only): a short obstruction (700 ms ≤ the 2000 ms
    // preservation bound) no longer voids a cycle whose peak was already fully
    // evidenced before the hole — the raise completes on the post-hole return.
    // Every other type keeps the hard reset, and a hole past the bound still
    // voids (see the round-4 occlusion fixtures).
    assert.equal(r.tracker.metrics.reps,type==='front_raise'?2:1);
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
/** Geometrically exact front-raise world landmarks (demo-pose convention: y down,
 * forward = −z), parameterised by the TRUE shoulder-flexion angle. The optional
 * `model` mode rebuilds the arm segment-wise with the distortion signature
 * measured from the production model's output on the 2026-11-07 retest footage:
 * at a true 90° raise the world elbow sits along a ≈70° flexion direction on a
 * compressed 0.17 m segment with a ≈32° apparent elbow bend, while the wrist
 * line still recovers ≈90° — the elbow channel is the weak link, not the wrist. */
function frontRaiseWorld(thetaDeg:number,opts:{left?:boolean;right?:boolean;lateral?:boolean;model?:{flex:number;bend:number}}={}){
  const {left=true,right=true,lateral=false,model}=opts;
  const world:Point[]=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:1}));
  const w=(i:number,x:number,y:number,z:number)=>{world[i]={x,y,z,visibility:1};};
  w(0,0,-.15,-.1);
  for(const o of [0,1]){
    const sx=o?.2:-.2,raising=(o?right:left),th=(raising?thetaDeg:5)*Math.PI/180;
    w(11+o,sx,0,0);w(23+o,sx,.4,0);w(25+o,sx,.85,0);w(27+o,sx,1.28,0);
    if(model&&raising&&!lateral){
      // Segment-wise model signature: the elbow lands along a flexion direction of
      // only flex·(θ−5°)+5° at 0.17 m (compressed segment), and the forearm continues
      // with an apparent bend, so the wrist line still recovers ≈θ.
      const ef=(5+(thetaDeg-5)*model.flex)*Math.PI/180,bend=model.bend*((thetaDeg-5)/85)*Math.PI/180;
      const ex=sx,ey=Math.cos(ef)*.17,ez=-Math.sin(ef)*.17;
      w(13+o,ex,ey,ez);
      w(15+o,ex,ey+Math.cos(ef+bend)*.26,ez-Math.sin(ef+bend)*.26);
    }else{
      const dir=lateral?[Math.sign(sx)*Math.sin(th),Math.cos(th),0]:[0,Math.cos(th),-Math.sin(th)];
      w(13+o,sx+dir[0]*.28,dir[1]*.28,dir[2]*.28);
      w(15+o,sx+dir[0]*.54,dir[1]*.54,dir[2]*.54);
    }
  }
  return world;
}
function feedWorld(r:ReturnType<typeof run>,world:Point[],duration:number){
  r.feed('neutral',duration,(p,w)=>{if(w)world.forEach((v,i)=>{w[i]={...v};});});
}
function frontRaiseImage():Point[]{
  const p:Point[]=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:.95}));
  const put=(i:number,x:number,y:number)=>{p[i]={x,y,z:0,visibility:.95};};
  put(0,.5,.14);
  for(const o of [0,1]){const sx=.40+o*.20;put(11+o,sx,.28);put(13+o,sx,.44);put(15+o,sx,.62);put(23+o,.44+o*.12,.55);put(25+o,.44+o*.12,.74);put(27+o,.44+o*.12,.92);}
  return p;
}
/** Raised-cosine front-raise trajectories at 24 FPS into a prefiltered tracker —
 * the same fixture style as the tempo-tuning tests, parameterised by peak angle,
 * optional world-landmark distortion, and which sides raise. */
function raiseTrajectory(peak:number,reps:number,opts:{model?:{flex:number;bend:number};left?:boolean;right?:boolean}={}){
  const tracker=new ExtendedExerciseTracker('front_raise',reps,{},true);
  const img=frontRaiseImage(),step=1000/24;let t=0;
  const feed=(v:number)=>{tracker.update(structuredClone(img),t,1,frontRaiseWorld(v,opts));t+=step;};
  for(let c=0;c<63;c++)feed(5);
  const cycles=Math.round(0.9*24);
  for(let r=0;r<reps;r++)for(let k=0;k<cycles;k++){const u=k/cycles;feed(5+(peak-5)*(1-Math.cos(2*Math.PI*u))/2);}
  for(let c=0;c<34;c++)feed(5);
  return tracker;
}
test('front raises count a true 110° raise and reject an over-head 130° raise',()=>{
  assert.equal(raiseTrajectory(110,2).metrics.reps,2);
  assert.equal(raiseTrajectory(130,2).metrics.reps,0);
  // A held true 110° reads back as ≈110° on the diagnostics channel.
  const tracker=new ExtendedExerciseTracker('front_raise',20,{},true);let t=0;const img=frontRaiseImage();
  for(let c=0;c<63;c++){tracker.update(structuredClone(img),t,1,frontRaiseWorld(5));t+=1000/24;}
  for(let c=0;c<12;c++){tracker.update(structuredClone(img),t,1,frontRaiseWorld(110));t+=1000/24;}
  assert.match(tracker.diagnostics.motion||'',/抬臂 1\d\d° \/ 1\d\d°/);
});
test('front raises still reject a held 45° half raise',()=>{
  const r=run('front_raise');r.feed('neutral',3000);
  feedWorld(r,frontRaiseWorld(45),1200);r.feed('neutral',1200);assert.equal(r.tracker.metrics.reps,0);
});
test('front raises count a shoulder-height raise under the measured world-landmark distortion',()=>{
  // Segment-wise signature from the production model's output on the retest
  // footage (worst straight-arm peak frame, t≈46.5 s): at a true 90° raise the
  // elbow sits along a ≈70° flexion direction (flex ratio 65/85) on a 0.17 m
  // segment, with a ≈32° apparent elbow bend; the wrist line still reads ≈90°.
  const MODEL={flex:65/85,bend:32};
  const angleOld=(world:Point[],s:number)=>{
    const sub=(a:Point,b:Point)=>[a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0)],dot=(a:number[],b:number[])=>a.reduce((n,x,i)=>n+x*b[i],0),nrm=(v:number[])=>v.map(x=>x/(Math.hypot(...v)||1));
    return Math.acos(Math.max(-1,Math.min(1,dot(nrm(sub(world[13+s],world[11+s])),nrm(sub(world[23+s],world[11+s]))))))*180/Math.PI;
  };
  // Counterfactual with the pre-round-2 formula (3D elbow angle vs the hip): the
  // same landmarks read ≈70° — a 20° under-read on the elbow channel.
  const distorted=frontRaiseWorld(90,{model:MODEL});
  assert.ok(Math.abs(angleOld(distorted,0)-70)<3,`counterfactual elbow angle ${angleOld(distorted,0).toFixed(1)}° should read ≈70°`);
  // The measured frame itself, rebuilt landmark-for-landmark from the model's
  // output on Edward's video (sagittal components, metres; elbow angles implied
  // 142°/149°): the old formula read 73°/86°, the sagittal wrist angle ≈92°/92°.
  const measured:Point[]=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:1}));
  const mw=(i:number,x:number,y:number,z:number)=>{measured[i]={x,y,z,visibility:1};};
  mw(0,0,-.15,-.1);
  mw(11,-.2,0,0);mw(23,-.2,.4,0);mw(13,-.2,.056,-.149);mw(15,-.2,-.010,-.357);
  mw(12,.2,0,0);mw(24,.2,.4,0);mw(14,.2,.023,-.228);mw(16,.2,-.016,-.427);
  const tracker=new ExtendedExerciseTracker('front_raise',20,{},true);let t=0;const img=frontRaiseImage();
  for(let c=0;c<63;c++){tracker.update(structuredClone(img),t,1,frontRaiseWorld(5));t+=1000/24;}
  for(let c=0;c<12;c++){tracker.update(structuredClone(img),t,1,structuredClone(measured));t+=1000/24;}
  const m=/抬臂 (\d+)° \/ (\d+)°/.exec(tracker.diagnostics.motion||'');assert.ok(m,`motion readout missing: ${tracker.diagnostics.motion}`);
  assert.ok(Number(m[1])>=85&&Number(m[1])<=98&&Number(m[2])>=85&&Number(m[2])<=98,`measured frame should read ≈92°, got ${m[1]}°/${m[2]}°`);
  // …and full distorted cycles count, bilaterally and one arm at a time.
  assert.equal(raiseTrajectory(90,2,{model:MODEL}).metrics.reps,2);
  assert.equal(raiseTrajectory(90,1,{model:MODEL,left:false}).metrics.reps,1);
  assert.equal(raiseTrajectory(90,1,{model:MODEL,right:false}).metrics.reps,1);
});
test('calibration progress is latched: leaving the start pose pauses the hold instead of rewinding it',()=>{
  const r=run('front_raise');
  r.feed('neutral',1200);const earned=r.tracker.diagnostics.calibrationProgress;
  assert.ok(earned>=.5&&earned<1,`expected banked progress ≈0.55–0.6, got ${earned}`);
  assert.equal(r.tracker.diagnostics.stage,'calibrating');
  // Raising the arms (the exact behaviour the old reset punished) must not rewind it.
  r.feed('peak',600);assert.ok(r.tracker.diagnostics.calibrationProgress>=earned,`progress rewound: ${earned} → ${r.tracker.diagnostics.calibrationProgress}`);
  assert.equal(r.tracker.diagnostics.stage,'calibrating');
  // The remaining hold accumulates on top of the banked time and latches ready.
  r.feed('neutral',1000);assert.equal(r.tracker.diagnostics.stage,'ready');assert.equal(r.tracker.diagnostics.calibrationProgress,1);
  // A tracker that never sees the start pose still never calibrates.
  const fresh=run('front_raise');fresh.feed('peak',3000);assert.equal(fresh.tracker.diagnostics.calibrationProgress,0);assert.equal(fresh.tracker.diagnostics.stage,'calibrating');
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
// --- Fast-tempo synthetic trajectories (2026-11-07 tempo tuning) -------------------
// Independent parametric fixtures: both elbows follow a raised-cosine angle
// trajectory sampled at a fixed FPS, fed to the tracker built the way the production
// adaptive path builds it (prefiltered). Not model predictions or camera recordings.
function elbowPose(deg:number):Point[]{
  const p:Point[]=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}));
  const put=(i:number,x:number,y:number)=>{p[i]={x,y,z:0,visibility:1};};
  put(0,.5,.16);
  for(const o of [0,1]){
    const sx=.40+o*.20,hx=.43+o*.14;
    put(11+o,sx,.30);put(23+o,hx,.56);put(25+o,hx,.74);put(27+o,hx,.92);put(13+o,sx,.48);
    const f=(180-deg)*Math.PI/180,dir=o?-1:1;
    put(15+o,sx+dir*.18*Math.sin(f),.48+.18*Math.cos(f));
  }
  return p;
}
function curlTrajectory(fps:number,period:number,peak:number,reps:number,phase=0,rest=160){
  const tracker=new ExtendedExerciseTracker('hammer_curl',reps,{},true);
  const step=1000/fps;let t=phase*step;
  const feed=(deg:number)=>{const raw=elbowPose(deg);tracker.update(raw,t,1,structuredClone(raw));t+=step;};
  for(let c=0;c<2.6*fps;c++)feed(rest);
  const cycles=Math.round(period*fps);
  for(let r=0;r<reps;r++)for(let k=0;k<cycles;k++){const u=k/cycles;feed(rest-(rest-peak)*(1-Math.cos(2*Math.PI*u))/2);}
  for(let c=0;c<1.4*fps;c++)feed(rest);
  return tracker;
}
test('hammer curls count fast tempos completely at 24 and 15 FPS (synthetic trajectories)',()=>{
  for(const fps of [24,15])for(const period of [1.0,0.7])for(const peak of [65,75])for(const phase of [0,0.37]){
    assert.equal(curlTrajectory(fps,period,peak,6,phase).metrics.reps,6,`${fps} FPS, ${period}s/rep, peak ${peak}°, phase ${phase}`);
  }
});
test('hammer curls still reject half-range cycles at fast tempos',()=>{
  for(const fps of [24,15])for(const period of [1.0,0.7])assert.equal(curlTrajectory(fps,period,100,6).metrics.reps,0,`${fps} FPS, ${period}s/rep`);
});
test('hammer curls reject a one-frame peak spike at rest and mid-excursion',()=>{
  const tracker=new ExtendedExerciseTracker('hammer_curl',20,{},true);let t=0;const step=1000/24;
  const feed=(deg:number,n=1)=>{for(let i=0;i<n;i++){const raw=elbowPose(deg);tracker.update(raw,t,1,structuredClone(raw));t+=step;}};
  feed(160,63);
  feed(70,1);feed(160,24);
  assert.equal(tracker.metrics.reps,0);
  feed(120,6);feed(70,1);feed(120,6);feed(160,24);
  assert.equal(tracker.metrics.reps,0);
});
function raiseWorld(v:number):Point[]{
  const w:Point[]=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:1}));
  const put=(i:number,x:number,y:number,z:number)=>{w[i]={x,y,z,visibility:1};};
  put(0,0,-.15,-.1);
  for(const o of [0,1]){
    const sx=o?.2:-.2,rad=v*Math.PI/180,cy=Math.cos(rad),sz=-Math.sin(rad);
    put(11+o,sx,0,0);put(23+o,sx,.4,0);put(13+o,sx,.2*cy,.2*sz);put(15+o,sx,.45*cy,.45*sz);put(25+o,sx,.75,0);put(27+o,sx,1.05,0);
  }
  return w;
}
function raiseImage():Point[]{
  const p:Point[]=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}));
  const put=(i:number,x:number,y:number)=>{p[i]={x,y,z:0,visibility:1};};
  put(0,.5,.14);
  for(const o of [0,1]){const sx=.40+o*.20;put(11+o,sx,.28);put(13+o,sx,.44);put(15+o,sx,.62);put(23+o,.44+o*.12,.55);put(25+o,.44+o*.12,.74);put(27+o,.44+o*.12,.92);}
  return p;
}
test('front raises count fast tempos completely (synthetic trajectories)',()=>{
  for(const fps of [24,15]){
    const tracker=new ExtendedExerciseTracker('front_raise',6,{},true);
    const step=1000/fps;let t=0;const img=raiseImage();
    const feed=(v:number)=>{tracker.update(structuredClone(img),t,1,raiseWorld(v));t+=step;};
    for(let c=0;c<2.6*fps;c++)feed(10);
    const cycles=Math.round(0.8*fps);
    for(let r=0;r<6;r++)for(let k=0;k<cycles;k++){const u=k/cycles;feed(10+85*(1-Math.cos(2*Math.PI*u))/2);}
    for(let c=0;c<1.4*fps;c++)feed(10);
    assert.equal(tracker.metrics.reps,6,`${fps} FPS`);
  }
});
// --- Round 3 (2026-11-08): calibration survival, peak-to-peak symmetry, sustained stability ---
const rot2=(x:number,y:number,rad:number):[number,number]=>[x*Math.cos(rad)-y*Math.sin(rad),x*Math.sin(rad)+y*Math.cos(rad)];
/** Parametric two-arm curl pose: per-side elbow angle plus a shared upper-arm tilt
 * (degrees from vertical). Built by rotating the straight-down arm, so the elbow
 * angle and the upper-arm angle are exact by construction (rotation invariance),
 * matching what measure() reads back from the world landmarks. */
function curlPose(leftElbow:number,rightElbow:number,upperDeg=0):Point[]{
  const p:Point[]=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}));
  const put=(i:number,x:number,y:number)=>{p[i]={x,y,z:0,visibility:1};};
  put(0,.5,.16);
  const elbows=[leftElbow,rightElbow];
  for(const o of [0,1]){
    const sx=.40+o*.20,dir=o?-1:1,phi=upperDeg*Math.PI/180;
    put(11+o,sx,.30);put(23+o,sx,.56);put(25+o,sx,.74);put(27+o,sx,.92);
    const [ux,uy]=rot2(0,1,dir*phi);
    const ex=sx+ux*.18,ey=.30+uy*.18;put(13+o,ex,ey);
    const [fx,fy]=rot2(ux,uy,-dir*(180-elbows[o])*Math.PI/180);
    put(15+o,ex+fx*.18,ey+fy*.18);
  }
  return p;
}
test('front raise calibration survives transient gate interrupts, and a latched ready persists',()=>{
  const r=run('front_raise');
  r.feed('neutral',1200);const earned=r.tracker.diagnostics.calibrationProgress;
  assert.ok(earned>=.5&&earned<1,`expected banked progress ≈0.55, got ${earned}`);
  // The dorm set-up failure: the nose (a required joint for front raise) leaves
  // the frame while the user repositions — a burst of gate interrupts.
  const outOfFrame=(p:Point[])=>{p[0]={...p[0],x:1.2};};
  r.feed('neutral',800,outOfFrame);
  assert.equal(r.tracker.diagnostics.stage,'tracking_lost');
  assert.ok(r.tracker.diagnostics.calibrationProgress>=earned,`progress rewound by a gate interrupt: ${earned} → ${r.tracker.diagnostics.calibrationProgress}`);
  // The remaining hold accumulates on top of the preserved bank and latches.
  r.feed('neutral',900);assert.equal(r.tracker.diagnostics.stage,'ready');assert.equal(r.tracker.metrics.poseFeedback.calibrated,true);
  // Once ready, another burst cannot un-ready the session, and a raise still counts.
  r.feed('neutral',800,outOfFrame);r.feed('neutral',300);
  assert.equal(r.tracker.diagnostics.stage,'ready');assert.equal(r.tracker.metrics.poseFeedback.calibrated,true);
  r.feed('peak',1000);r.feed('neutral',1200);assert.equal(r.tracker.metrics.reps,1);
});
test('front raise calibration bank expires after ten seconds without a start pose',()=>{
  const r=run('front_raise');
  r.feed('neutral',1200);const earned=r.tracker.diagnostics.calibrationProgress;
  assert.ok(earned>=.5,`expected banked progress ≈0.55, got ${earned}`);
  const outOfFrame=(p:Point[])=>{p[0]={...p[0],x:1.2};};
  r.feed('neutral',11000,outOfFrame);
  // Back in the start pose, progress restarts from ≈0 instead of resuming at 55%.
  r.feed('neutral',300);
  const progress=r.tracker.diagnostics.calibrationProgress;
  assert.ok(progress<=.2&&progress<earned,`bank should have expired, progress=${progress}`);
  assert.equal(r.tracker.diagnostics.stage,'calibrating');
  r.feed('neutral',2000);assert.equal(r.tracker.diagnostics.stage,'ready');
});
test('hammer curls record peak-timing offsets for loosely synchronized bilateral peaks (step 3: category, not a number)',()=>{
  const tracker=new ExtendedExerciseTracker('hammer_curl',20,{},true);
  const step=1000/24;let t=0;
  const feed=(l:number,r:number)=>{const raw=curlPose(l,r);tracker.update(raw,t,1,structuredClone(raw));t+=step;};
  for(let c=0;c<63;c++)feed(160,160);
  assert.equal(tracker.diagnostics.stage,'ready');
  // ≈2 s bilateral curls peaking at 79°, the right side ≈375 ms behind: outside
  // the 150 ms merge overlap (both reps emit as singles) but inside the 800 ms
  // peak window. Pre-contract this scored a numeric symmetry peak-to-peak;
  // step 3 records the peak-timing offset (≈375 ms) instead — the evidence
  // the category is derived from.
  const P=48,OFF=9;
  const wave=(k:number)=>{const u=(k%P)/P;return 160-81*(1-Math.cos(2*Math.PI*u))/2;};
  for(let rep=0;rep<3;rep++)for(let k=0;k<P;k++)feed(wave(k),wave(k-OFF));
  for(let c=0;c<40;c++)feed(160,160);
  assert.equal(tracker.metrics.reps,6);
  const offsets=tracker.metrics.scoreAccumulator.symmetryOffsetsMs;
  assert.equal(offsets?.length,6);
  assert.ok(offsets!.every(o=>o>=250&&o<=500),`offsets ${offsets} should all be ≈375 ms`);
  assert.deepEqual(tracker.metrics.axisAssessment?.symmetry,{kind:'category',category:'slight'});
  // No numeric symmetry is emitted or accumulated for new sets.
  assert.equal(tracker.metrics.formBreakdown.symmetry,0);
  assert.equal(tracker.metrics.scoreAccumulator.symmetry,0);
});
test('hammer curls read true alternating curls as 明显交替 from peak timing (step 3)',()=>{
  const tracker=new ExtendedExerciseTracker('hammer_curl',20,{},true);
  const step=1000/24;let t=0;
  const feed=(l:number,r:number)=>{const raw=curlPose(l,r);tracker.update(raw,t,1,structuredClone(raw));t+=step;};
  for(let c=0;c<63;c++)feed(160,160);
  // Arms alternate whole cycles (≈1.2 s each): peaks land ≈1.2 s apart, far
  // outside the 800 ms pairing window. Pre-contract the resting-arm formula
  // scored these ≈90+; step 3 reads the same stream as what it is — peaks
  // that never coincide — and records the ≈1.2 s offset per rep.
  const P=29;
  const wave=(k:number)=>{const u=(k%P)/P;return 160-85*(1-Math.cos(2*Math.PI*u))/2;};
  for(let k=0;k<4*P;k++){
    const leftTurn=Math.floor(k/P)%2===0;
    feed(leftTurn?wave(k):160,leftTurn?160:wave(k));
  }
  for(let c=0;c<40;c++)feed(160,160);
  assert.equal(tracker.metrics.reps,4);
  const offsets=tracker.metrics.scoreAccumulator.symmetryOffsetsMs;
  // Three of four reps record: the FIRST rep emits on the +600 ms pending
  // flush, before the partner's first peak has locked — at emit time it
  // genuinely has no bilateral evidence yet. Later reps read the previous
  // partner peak (≈1.2 s away) and record it.
  assert.equal(offsets?.length,3);
  assert.ok(offsets!.every(o=>o>800),`offsets ${offsets} should all exceed the 800 ms pairing window`);
  assert.deepEqual(tracker.metrics.axisAssessment?.symmetry,{kind:'category',category:'alternating'});
});
test('hammer curls record no bilateral evidence when the resting arm never peaks (step 3: unassessable, not a penalty)',()=>{
  const tracker=new ExtendedExerciseTracker('hammer_curl',20,{},true);
  const step=1000/24;let t=0;
  const feed=(l:number,r:number)=>{const raw=curlPose(l,r);tracker.update(raw,t,1,structuredClone(raw));t+=step;};
  for(let c=0;c<63;c++)feed(160,160);
  assert.equal(tracker.diagnostics.stage,'ready');
  // True single-arm work: the right arm never peaks (held at 95°), so no
  // peak-timing evidence exists for either rep. Pre-contract the peakOther
  // formula convicted the set (≈46) for the resting arm's posture; step 3
  // records nothing and declares the axis unassessable for this set.
  const P=48;
  const wave=(k:number)=>{const u=(k%P)/P;return 160-85*(1-Math.cos(2*Math.PI*u))/2;};
  for(let rep=0;rep<2;rep++)for(let k=0;k<P;k++)feed(wave(k),95);
  for(let c=0;c<40;c++)feed(160,95);
  assert.equal(tracker.metrics.reps,2);
  assert.equal(tracker.metrics.scoreAccumulator.symmetryOffsetsMs?.length??0,0);
  assert.deepEqual(tracker.metrics.axisAssessment?.symmetry,{kind:'unassessable',reason:'no-bilateral-evidence'});
});
// --- Hammer symmetry round (2026-11-08): peer-peak memory across soft interrupts + set median ---
/** Choreographed split bilateral effort for the peer-peak fixtures: the left
 * arm peaks (79°) and its peak episode CLOSES — the peak is locked in its
 * cycle — then it descends only to a 110° hover and never completes. The right
 * arm is mid-rise when a blind burst (visibility .1, no world) interrupts;
 * after the burst it finishes its rise, peaks ≈600 ms after the left peak's
 * midpoint (inside the 800 ms pairing window), returns and completes. The
 * left arm stays at 110° past the right's deepest frame, so the instantaneous
 * fallback would read peakOther=110° → symmetry 64: the two paths are cleanly
 * separable. With `blindFrames` beyond the 2000 ms preservation bound, the
 * memory is wiped mid-burst (and the pairing window would reject a peak that
 * old anyway — the bound is what guarantees no stale state is carried). */
function splitEffort(blindFrames:number){
  const tracker=new ExtendedExerciseTracker('hammer_curl',20,{},true);
  const step=1000/24;let t=0;
  const feed=(l:number,r:number)=>{const raw=curlPose(l,r);tracker.update(raw,t,1,structuredClone(raw));t+=step;};
  const blind=()=>{const raw=curlPose(160,160);raw.forEach(p=>p.visibility=.1);tracker.update(raw,t,1,null);t+=step;};
  const glide=(a:number,b:number,n:number)=>Array.from({length:n},(_,k)=>{const u=(1-Math.cos(Math.PI*(k+1)/n))/2;return a+(b-a)*u;});
  for(let c=0;c<63;c++)feed(160,160);
  assert.equal(tracker.diagnostics.stage,'ready');
  // Left: rise 8, hold 4 (episode locks on the descent's first frame), descend
  // to a 110° hover. Right: rests 6 frames, then a slow rise (14-frame glide;
  // the samples seen before the burst reach only ≈94°, never the peak zone).
  const leftRise=glide(160,79,8),rightRise=glide(160,79,14);
  for(let k=0;k<8;k++)feed(leftRise[k],k<6?160:rightRise[k-6]);
  for(let k=0;k<4;k++)feed(79,rightRise[2+k]);
  const leftDown=glide(79,110,4);
  for(let k=0;k<4;k++)feed(leftDown[k],rightRise[6+k]);
  // Both arms hold while the right's slow rise is interrupted mid-flight.
  for(let b=0;b<blindFrames;b++)blind();
  // Right finishes its rise from ≈94° (its last pre-burst sample), peaks,
  // returns; left keeps hovering at 110° until the right's peak is well past,
  // then both settle back to rest.
  for(const e of [90,84])feed(110,e);
  for(let k=0;k<4;k++)feed(110,79);
  const rightDown=glide(79,160,8);
  for(let k=0;k<8;k++)feed(110,rightDown[k]);
  for(let c=0;c<6;c++)feed(110,160);
  const leftDown2=glide(110,160,6);
  for(let k=0;k<6;k++)feed(leftDown2[k],160);
  for(let c=0;c<40;c++)feed(160,160);
  return tracker;
}
test('hammer peer-peak memory survives a short soft interrupt and rescues a split bilateral rep',()=>{
  const tracker=splitEffort(5); // ≈208 ms hole, inside the 2000 ms bound
  assert.equal(tracker.metrics.reps,1);
  // Step 3: the rescued peer peak now lands as peak-timing evidence — one
  // offset inside the pairing window (≈600 ms by choreography), read as
  // 略有错峰. Before the symmetry round the interrupt wiped lastPeak and the
  // same rep carried no bilateral evidence at all.
  const offsets=tracker.metrics.scoreAccumulator.symmetryOffsetsMs;
  assert.equal(offsets?.length,1);
  assert.ok(offsets![0]>=400&&offsets![0]<=800,`offset ${offsets![0]} should be the preserved peer peak's ≈600 ms`);
  assert.deepEqual(tracker.metrics.axisAssessment?.symmetry,{kind:'category',category:'slight'});
});
test('hammer peer-peak memory does not survive a hole past the preservation bound',()=>{
  const tracker=splitEffort(60); // ≈2500 ms hole: the bound expires mid-burst
  assert.equal(tracker.metrics.reps,1);
  // No rescue: the peer peak is gone and the other side never peaks again,
  // so the rep records no bilateral evidence (pre-contract it fell to the
  // instantaneous formula, ≈64).
  assert.equal(tracker.metrics.scoreAccumulator.symmetryOffsetsMs?.length??0,0);
  assert.deepEqual(tracker.metrics.axisAssessment?.symmetry,{kind:'unassessable',reason:'no-bilateral-evidence'});
});
test('medianOf takes the middle value, averaging the two middles on even counts',()=>{
  assert.equal(medianOf([]),0);
  assert.equal(medianOf([46]),46);
  assert.equal(medianOf([100,46,100]),100);
  assert.equal(medianOf([40,60]),50);
  assert.equal(medianOf([37,50,63,100]),56.5);
  assert.equal(medianOf([90,10,80,20]),50);
});
test('hammer set symmetry category is the median of per-rep offsets, so one alternating effort cannot convict the set',()=>{
  const tracker=new ExtendedExerciseTracker('hammer_curl',20,{},true);
  const step=1000/24;let t=0;
  const feed=(l:number,r:number)=>{const raw=curlPose(l,r);tracker.update(raw,t,1,structuredClone(raw));t+=step;};
  for(let c=0;c<63;c++)feed(160,160);
  const P=48;
  const wave=(k:number)=>{const u=(k%P)/P;return 160-81*(1-Math.cos(2*Math.PI*u))/2;};
  const effort=(off:number)=>{
    for(let k=0;k<P+off;k++)feed(wave(k),wave(k-off));
    for(let c=0;c<40;c++)feed(160,160);
  };
  // Three synchronized efforts (peaks ≈83 ms apart, merged pairs, one offset
  // each) around one alternating effort (peaks ≈917 ms apart, two singles,
  // one offset each): offsets [83, 917, 917, 83, 83] → median 83 = 同步,
  // while the mean (≈417) would report 略有错峰 — the median keeps one
  // loose effort from mislabelling a synchronized set, as it did for the
  // retired numeric axis.
  effort(2);effort(22);effort(2);effort(2);
  assert.equal(tracker.metrics.reps,5);
  const offsets=tracker.metrics.scoreAccumulator.symmetryOffsetsMs;
  assert.equal(offsets?.length,5);
  assert.deepEqual(tracker.metrics.axisAssessment?.symmetry,{kind:'category',category:'sync'});
});
test('hammer true single-arm sets record no timing offsets — no phantom peer evidence',()=>{
  const tracker=new ExtendedExerciseTracker('hammer_curl',20,{},true);
  const step=1000/24;let t=0;
  const feed=(l:number,r:number)=>{const raw=curlPose(l,r);tracker.update(raw,t,1,structuredClone(raw));t+=step;};
  for(let c=0;c<63;c++)feed(160,160);
  const P=48;
  const wave=(k:number)=>{const u=(k%P)/P;return 160-85*(1-Math.cos(2*Math.PI*u))/2;};
  for(let rep=0;rep<2;rep++)for(let k=0;k<P;k++)feed(wave(k),95);
  for(let c=0;c<40;c++)feed(160,95);
  assert.equal(tracker.metrics.reps,2);
  // The resting side never peaks, so neither rep has bilateral evidence:
  // nothing is recorded and the axis is unassessable for the set (the
  // pre-contract instantaneous values ≈46 graded the resting arm's angle).
  assert.equal(tracker.metrics.scoreAccumulator.symmetryOffsetsMs?.length??0,0);
  assert.deepEqual(tracker.metrics.axisAssessment?.symmetry,{kind:'unassessable',reason:'no-bilateral-evidence'});
});

test('sustainedPeak credits only deviations sustained for at least 150 ms',()=>{
  const win=(start:number,v:number):TimedSpan=>({start,end:start+100,v});
  // A lone 100 ms window at 800 amid 200s cannot prove sustainment.
  assert.equal(sustainedPeak([win(0,200),win(100,800),win(200,200),win(300,200)],800),200);
  // Two consecutive windows at 500 cover 200 ms ≥ 150 ms.
  assert.equal(sustainedPeak([win(0,200),win(100,500),win(200,500),win(300,200)],500),500);
  // A non-qualifying sample breaks the run.
  assert.equal(sustainedPeak([win(0,500),win(100,100),win(200,500),win(300,100)],500),100);
  // Too little evidence falls back to the raw maximum (short cycles score as before).
  assert.equal(sustainedPeak([win(0,800),win(100,200)],800),800);
  assert.equal(sustainedPeak([],42),42);
  // One long span (a held level from dense control samples) proves itself.
  assert.equal(sustainedPeak([{start:0,end:200,v:60},{start:200,end:300,v:10},{start:300,end:400,v:10}],60),60);
});
function controlTrajectory(upper:(k:number)=>number){
  const tracker=new ExtendedExerciseTracker('hammer_curl',20,{},true);
  const step=1000/24;let t=0;
  const feed=(e:number,u:number)=>{const raw=curlPose(e,e,u);tracker.update(raw,t,1,structuredClone(raw));t+=step;};
  for(let c=0;c<63;c++)feed(160,22);
  const P=58;
  for(let k=0;k<P;k++){const u=k/P;feed(160-85*(1-Math.cos(2*Math.PI*u))/2,upper(k));}
  for(let c=0;c<40;c++)feed(160,22);
  return tracker;
}
test('hammer curl stability charges sustained upper-arm drift but not a 100 ms spike',()=>{
  const sustained=controlTrajectory(()=>42);
  assert.equal(sustained.metrics.reps,1);
  // (42−15)×1.5 ≈ 40 of control penalty sustained for the whole cycle → stability ≈ 60.
  const s1=sustained.metrics.formBreakdown.stability;
  assert.ok(s1>=54&&s1<=66,`sustained-drift stability ${s1} should be ≈60, as before`);
  // Revised (round 5, workstream C): this fixture used to also pin the
  // unstable_movement issue for the drift rep. That correction derives
  // entirely from the suspended control term (the trajectory's
  // speed/duration evidence is clean), so it is now suppressed; the
  // internal stability computation above is unchanged.
  assert.ok(!sustained.metrics.lastRepIssues.includes('unstable_movement'));
  const spiked=controlTrajectory(k=>k>=14&&k<=16?55:22);
  assert.equal(spiked.metrics.reps,1);
  // Three frames (≈125 ms) at penalty 60 cannot prove 150 ms; the sustained ≈10 stands.
  const s2=spiked.metrics.formBreakdown.stability;
  assert.ok(s2>=80,`spiked stability ${s2} should stay ≥80 (sustained control ≈10), not collapse to ≈40`);
});
test('hammer curl stability ignores a one-window angular-velocity spike but charges sustained speed',()=>{
  const drive=(angles:number[])=>{
    const tracker=new ExtendedExerciseTracker('hammer_curl',20,{},true);
    const step=1000/24;let t=0;
    const feed=(e:number)=>{const raw=curlPose(e,e);tracker.update(raw,t,1,structuredClone(raw));t+=step;};
    for(let c=0;c<63;c++)feed(160);
    for(const e of angles)feed(e);
    for(let c=0;c<40;c++)feed(160);
    return tracker;
  };
  // Slow work down to 120°, a one-frame step to the peak (a single ≈460°/s
  // window), a held peak, a slow return: one window cannot prove sustainment.
  const spike:number[]=[];
  for(let k=0;k<=12;k++)spike.push(160-k);
  for(let k=13;k<=24;k++)spike.push(144-2*(k-12));
  spike.push(66);
  for(let k=0;k<11;k++)spike.push(66);
  for(let k=1;k<=36;k++)spike.push(66+94*k/36);
  const spiked=drive(spike);
  assert.equal(spiked.metrics.reps,1);
  assert.ok(spiked.metrics.formBreakdown.stability>=99,`one-window spike stability ${spiked.metrics.formBreakdown.stability} should stay ≈100`);
  // The same travel spread steadily across two windows (≈312°/s sustained) is charged.
  const steady:number[]=[];
  for(let k=0;k<=12;k++)steady.push(160-k);
  for(let k=13;k<=19;k++)steady.push(144-13*(k-13));
  for(let k=0;k<11;k++)steady.push(66);
  for(let k=1;k<=36;k++)steady.push(66+94*k/36);
  const sustained=drive(steady);
  assert.equal(sustained.metrics.reps,1);
  const ss=sustained.metrics.formBreakdown.stability;
  assert.ok(ss>=93&&ss<=97&&ss<spiked.metrics.formBreakdown.stability,`sustained-speed stability ${ss} should be ≈96, below the spike's ≈100`);
});
function raiseWorld2(l:number,r:number):Point[]{
  const w:Point[]=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:1}));
  const put=(i:number,x:number,y:number,z:number)=>{w[i]={x,y,z,visibility:1};};
  put(0,0,-.15,-.1);
  for(const o of [0,1]){
    const sx=o?.2:-.2,v=(o?r:l)*Math.PI/180,cy=Math.cos(v),sz=-Math.sin(v);
    put(11+o,sx,0,0);put(23+o,sx,.4,0);put(13+o,sx,.2*cy,.2*sz);put(15+o,sx,.45*cy,.45*sz);put(25+o,sx,.75,0);put(27+o,sx,1.05,0);
  }
  return w;
}
test('front raise singles record per-side depth tallies (diagnostics); depth presents as channel-suspended',()=>{
  const tracker=new ExtendedExerciseTracker('front_raise',20,{},true);
  const step=1000/24;let t=0;const img=raiseImage();
  const feed=(l:number,r:number)=>{tracker.update(structuredClone(img),t,1,raiseWorld2(l,r));t+=step;};
  for(let c=0;c<63;c++)feed(10,10);
  assert.equal(tracker.diagnostics.stage,'ready');
  // One bilateral effort, loosely synchronized: left peaks at 76°, the right
  // ≈708 ms later at 68°. Counting is unchanged (two singles). Pre-contract
  // the pair scored a numeric symmetry peak-to-peak (≈88); step 3 emitted no
  // symmetry number frontally, and depth landed as per-side bands — both
  // peaks sit in the 65–79° neighbourhood, short of the shoulder band.
  // Channel suspensions (2026-11-09, Codex round-7): the tallies below
  // still accumulate, but the band assignment itself was convicted, so
  // the axis presents as unassessable ('channel') and no band is shown.
  const P=48,OFF=17;
  const wave=(k:number,peak:number)=>{const u=(k%P)/P;return 10+(peak-10)*(1-Math.cos(2*Math.PI*u))/2;};
  for(let k=0;k<P;k++)feed(wave(k,76),wave(k-OFF,68));
  for(let c=0;c<48;c++)feed(10,10);
  assert.equal(tracker.metrics.reps,2);
  assert.deepEqual(tracker.metrics.axisAssessment?.symmetry,{kind:'unassessable',reason:'view'});
  assert.deepEqual(tracker.metrics.scoreAccumulator.depthBandCounts,{left:{below:1},right:{below:1}});
  assert.deepEqual(tracker.metrics.axisAssessment?.depth,{kind:'unassessable',reason:'channel'});
  assert.deepEqual(tracker.metrics.axisAssessment?.stability,{kind:'unassessable',reason:'channel'});
  assert.deepEqual(tracker.metrics.axisAssessment?.trunk,{kind:'unassessable',reason:'channel'});
  // No numeric depth or symmetry is emitted or accumulated for new sets.
  assert.equal(tracker.metrics.formBreakdown.depth,0);
  assert.equal(tracker.metrics.formBreakdown.symmetry,0);
});
test('front raise: a hard lean still computes trunk internally, but the suspended axis derives no correction',()=>{
  const tracker=new ExtendedExerciseTracker('front_raise',20,{},true);
  const step=1000/24;let t=0;const img=raiseImage();
  // Hips shifted +0.10 of frame width against the shoulders: the image
  // tilt reads ≈27° (posture ≈69, shift ≈19 vs the upright baseline),
  // so the internal trunk value collapses (≈40) — the read the
  // spillover audit convicted. It used to print a per-rep
  // body_alignment correction and a live one (posture < 70).
  const leanImg=raiseImage().map((p,i)=>i===23||i===24?{...p,x:p.x+.10}:p);
  let liveBodyAlignmentSeen=false;
  const feed=(l:number,r:number,lean=false)=>{tracker.update(structuredClone(lean?leanImg:img),t,1,raiseWorld2(l,r));t+=step;if(tracker.metrics.poseFeedback.primaryIssue==='body_alignment')liveBodyAlignmentSeen=true;};
  for(let c=0;c<63;c++)feed(10,10);
  assert.equal(tracker.diagnostics.stage,'ready');
  const P=48,OFF=17;
  const wave=(k:number,peak:number)=>{const u=(k%P)/P;return 10+(peak-10)*(1-Math.cos(2*Math.PI*u))/2;};
  for(let k=0;k<P;k++)feed(wave(k,76),wave(k-OFF,68),true);
  for(let c=0;c<48;c++)feed(10,10);
  assert.equal(tracker.metrics.reps,2);
  const tb=tracker.metrics.formBreakdown.trunk;
  assert.ok(tb<70,`internal trunk ${tb} should show the lean read (<70), proving the fixture exercises the convicted path`);
  assert.equal(tracker.metrics.correctionCounts.body_alignment,0);
  assert.ok(!tracker.metrics.lastRepIssues.includes('body_alignment'));
  assert.equal(liveBodyAlignmentSeen,false,'the live posture issue reads the suspended tilt channel and must not fire');
});
// --- Round 4 (2026-11-08): peak evidence, overshoot revocation, cycle preservation, blocker hints ---
/** Parametric front-raise frame with per-side exact (raised θ, elbow E, direction
 * λ): λ is the wrist line's azimuth from forward (0°) toward lateral (90°), so
 * forward-dominant ⟺ λ<45° and lateral-dominant ⟺ λ≥45°. The wrist is placed so
 * measure() reads raised=θ exactly at any λ; the elbow is built segment-wise in
 * the sagittal plane (upper .28, forearm .26 — the δ construction of the exact
 * builders above), so the elbow angle reads E exactly (bent fixtures are
 * sagittal, λ=0, by construction). */
type RaiseSpec={theta:number;elbow:number;lambda?:number};
const RS=(theta:number,elbow=170,lambda=0):RaiseSpec=>({theta,elbow,lambda});
const RREST=RS(10,170);
function raiseFrame(spec:{l:RaiseSpec;r:RaiseSpec},noseZ=-.1):Point[]{
  const w:Point[]=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:1}));
  const put=(i:number,x:number,y:number,z:number)=>{w[i]={x,y,z,visibility:1};};
  put(0,0,-.15,noseZ);
  const LU=.28,LF=.26;
  for(const o of [0,1]){
    const sx=o?.2:-.2,s=o?spec.r:spec.l,rho=s.theta*Math.PI/180,lam=(s.lambda??0)*Math.PI/180;
    put(11+o,sx,0,0);put(23+o,sx,.4,0);put(25+o,sx,.75,0);put(27+o,sx,1.05,0);
    if(s.elbow>=180||lam!==0){
      const tanL=Math.tan(lam),n=1/Math.hypot(1,Math.sin(rho)*tanL);
      const dx=Math.sign(sx)*Math.sin(rho)*tanL*n,dy=Math.cos(rho)*n,dz=-Math.sin(rho)*n;
      put(13+o,sx+LU*dx,LU*dy,LU*dz);put(15+o,sx+(LU+LF)*dx,(LU+LF)*dy,(LU+LF)*dz);
    }else{
      const psi=(180-s.elbow)*Math.PI/180,delta=Math.atan2(LF*Math.sin(psi),LU+LF*Math.cos(psi)),phi=rho-delta,fa=phi+psi;
      put(13+o,sx,LU*Math.cos(phi),-LU*Math.sin(phi));
      put(15+o,sx,LU*Math.cos(phi)+LF*Math.cos(fa),-LU*Math.sin(phi)-LF*Math.sin(fa));
    }
  }
  return w;
}
function driveRaise(specs:{l:RaiseSpec;r:RaiseSpec}[]){
  const tracker=new ExtendedExerciseTracker('front_raise',20,{},true);
  const img=frontRaiseImage(),step=1000/24;let t=0;
  const feed=(s:{l:RaiseSpec;r:RaiseSpec})=>{tracker.update(structuredClone(img),t,1,raiseFrame(s));t+=step;};
  for(let c=0;c<63;c++)feed({l:RREST,r:RREST});
  for(const s of specs)feed(s);
  return {tracker,feed,feedRaw:(raw:Point[]|null,world:Point[]|null)=>{tracker.update(raw,t,1,world);t+=step;}};
}
const bothR=(s:RaiseSpec)=>({l:s,r:s});
const leftOnly=(specs:RaiseSpec[])=>specs.map(s=>({l:s,r:RREST}));
const glideR=(a:RaiseSpec,b:RaiseSpec,n:number):RaiseSpec[]=>Array.from({length:n},(_,k)=>{const u=(1-Math.cos(Math.PI*(k+1)/n))/2;return {theta:a.theta+(b.theta-a.theta)*u,elbow:a.elbow+(b.elbow-a.elbow)*u,lambda:(a.lambda??0)+((b.lambda??0)-(a.lambda??0))*u};});
const holdR=(s:RaiseSpec,n:number):RaiseSpec[]=>Array.from({length:n},()=>({...s}));
const cycleR=(peak:number,elbowAt:(k:number)=>number,n=22):RaiseSpec[]=>Array.from({length:n},(_,k)=>{const u=k/n;return {theta:10+(peak-10)*(1-Math.cos(2*Math.PI*u))/2,elbow:elbowAt(k)};});
test('peak evidence: an elbow dip on exactly the deepest frame is bridged by qualified neighbours',()=>{
  const S=(t:number,raised:number,elbow:number,fwd=true,lat=false)=>({t,raised,elbow,fwd,lat});
  assert.equal(evaluatePeakEvidence([S(0,80,155),S(100,95,137),S(200,94,155),S(300,90,155)],100,95),'qualified');
  // A clearly bent deepest sample disqualifies the peak outright.
  assert.equal(evaluatePeakEvidence([S(0,80,155),S(100,95,115),S(200,94,155),S(300,90,155)],100,95),'revoked');
  // One good frame at the peak is not sustained evidence.
  assert.equal(evaluatePeakEvidence([S(0,80,100),S(100,95,155),S(200,94,100)],100,95),'insufficient');
});
test('front raises count an in-band raise whose deepest frame dips at the elbow (and stay single-arm)',()=>{
  // The replay's two dead raises, rebuilt exactly: elbow 137° on the max frame
  // only, 155° on the qualified neighbours. Left arm only — the right rests.
  const specs=[...leftOnly(cycleR(95,k=>k===11?137:155)),...leftOnly(glideR(RS(12,155),RREST,4)),...holdR(RREST,34).map(s=>bothR(s))];
  assert.equal(driveRaise(specs).tracker.metrics.reps,1);
});
test('front raise: an elbow dip away from the peak still computes stability internally, but the provisionally suspended axis derives no correction',()=>{
  // Elbow at 120° for sustained stretches of the rise and the return
  // (the peak neighbourhood keeps 160°, so the raise qualifies and
  // scores): the elbow-channel control term (75) alone manufactures
  // the stability shortfall — the speed/duration evidence is clean
  // (stabilityWithoutControl ≈98). Channel suspension (2026-11-09,
  // Codex round-7, provisional for this axis): the correction stands
  // only when the unsuspended evidence produces the shortfall, so
  // none is derived; the internal value still computes.
  const specs=[...cycleR(95,k=>(k>=2&&k<=7)||(k>=15&&k<=20)?120:160,22).map(s=>bothR(s)),...holdR(RREST,34).map(s=>bothR(s))];
  const {tracker}=driveRaise(specs);
  assert.equal(tracker.metrics.reps,1);
  const s=tracker.metrics.formBreakdown.stability;
  assert.ok(s<70,`internal stability ${s} should show the control-manufactured shortfall (<70)`);
  assert.equal(tracker.metrics.correctionCounts.unstable_movement,0);
  assert.ok(!tracker.metrics.lastRepIssues.includes('unstable_movement'));
  assert.deepEqual(tracker.metrics.axisAssessment?.stability,{kind:'unassessable',reason:'channel'});
});
test('front raises reject a raise bent exactly at the peak frame, and one bent sustained around it',()=>{
  const bentAtPeak=[...leftOnly(cycleR(95,k=>k===11?115:155)),...holdR(RREST,34).map(s=>bothR(s))];
  assert.equal(driveRaise(bentAtPeak).tracker.metrics.reps,0);
  const bentAround=[...leftOnly(cycleR(95,k=>k>=9&&k<=13?115:155)),...holdR(RREST,34).map(s=>bothR(s))];
  assert.equal(driveRaise(bentAround).tracker.metrics.reps,0);
});
test('front raises revoke an earned peak when the same raise later overshoots',()=>{
  const arc=(secondPeak:number)=>[
    ...glideR(RREST,RS(100,155),11),...glideR(RS(100,155),RS(50,155),8),...holdR(RS(50,155),2),
    ...glideR(RS(50,155),RS(secondPeak,155),10),...glideR(RS(secondPeak,155),RS(50,155),8),
    ...glideR(RS(50,155),RREST,6),...holdR(RREST,34),
  ].map(s=>bothR(s));
  // First segment latches in band, dip, second segment overshoots to 125°:
  // the whole raise is void, not just the second segment.
  assert.equal(driveRaise(arc(125)).tracker.metrics.reps,0);
  // Control: a second in-band segment changes nothing — the raise counts once.
  assert.equal(driveRaise(arc(95)).tracker.metrics.reps,1);
});
test('front raise occlusion: a short hole preserves the open cycle, a long hole voids it',()=>{
  const blind=frontRaiseImage().map(p=>({...p,visibility:.1}));
  const open=[...glideR(RREST,RS(95,155),9),...holdR(RS(95,155),8)];
  const shortHole=driveRaise(leftOnly(open));
  for(let i=0;i<15;i++)shortHole.feedRaw(structuredClone(blind),null); // ≈625 ms
  for(const s of leftOnly([...holdR(RS(93,155),3),...glideR(RS(93,155),RREST,9),...holdR(RREST,34)]))shortHole.feed(s);
  assert.equal(shortHole.tracker.metrics.reps,1);
  const longHole=driveRaise(leftOnly(open));
  for(let i=0;i<72;i++)longHole.feedRaw(structuredClone(blind),null); // ≈3000 ms
  for(const s of holdR(RREST,40))longHole.feed(bothR(s)); // he lowered the arm during the hole
  assert.equal(longHole.tracker.metrics.reps,0);
});
test('front raises reject direction transitions through the peak and a one-frame direction spike',()=>{
  const sweep=(from:number,to:number)=>[
    ...glideR(RREST,RS(90,170,from),9),
    ...Array.from({length:12},(_,k)=>RS([91,92,93,93,92,91,90,90,90,90,90,90][k],170,from+(to-from)*k/11)),
    ...glideR(RS(90,170,to),RREST,8),...holdR(RREST,34),
  ].map(s=>({l:s,r:RREST}));
  // Forward at the rise, rotating to lateral across the peak plateau.
  assert.equal(driveRaise(sweep(0,88)).tracker.metrics.reps,0);
  // Lateral at the rise, rotating to forward across the peak plateau.
  assert.equal(driveRaise(sweep(88,0)).tracker.metrics.reps,0);
  // A held lateral raise with a single forward frame exactly at the peak.
  const spike=[
    ...glideR(RREST,RS(93,170,75),9),
    ...Array.from({length:12},(_,k)=>RS(93,170,k===6?0:75)),
    ...glideR(RS(93,170,75),RREST,8),...holdR(RREST,34),
  ].map(s=>({l:s,r:RREST}));
  assert.equal(driveRaise(spike).tracker.metrics.reps,0);
});
test('front raise hints name the actual blocker, and the dead zone stays quiet about direction',()=>{
  const d=driveRaise([]);
  const L=(s:RaiseSpec)=>({l:s,r:RREST});
  // 25–37° is the constructed dead zone: the forward cone cannot pass there,
  // so the hint asks for height, not direction.
  for(let i=0;i<6;i++)d.feed(L(RS(30,170,60)));
  assert.equal(d.tracker.metrics.feedback,'继续抬臂，方向待确认');
  assert.doesNotMatch(d.tracker.metrics.feedback,/尚未确认前举方向/);
  // Above the dead zone, a lateral raise hears the direction blocker.
  for(let i=0;i<6;i++)d.feed(L(RS(60,170,60)));
  assert.match(d.tracker.metrics.feedback,/尚未确认前举方向/);
  // Forward but clearly bent at height: the elbow is the blocker.
  for(let i=0;i<6;i++)d.feed(L(RS(80,110,0)));
  assert.match(d.tracker.metrics.feedback,/手肘再伸直一点点/);
  // Over-head: the overshoot is the blocker.
  for(let i=0;i<3;i++)d.feed(L(RS(120,170,0)));
  assert.match(d.tracker.metrics.feedback,/举得有点高啦/);
});
test('front raise calibration surfaces a weak-framing signal without changing pass conditions',()=>{
  const tracker=new ExtendedExerciseTracker('front_raise',20,{},true);
  const img=frontRaiseImage(),step=1000/24;let t=0;
  // Nose barely signs the forward axis (face margin ≈1.25 of the rejection
  // threshold): measurable, but the framing preconditions are weak.
  const weak=raiseFrame(bothR(RS(90,170)),-.03);
  for(let c=0;c<6;c++){tracker.update(structuredClone(img),t,1,structuredClone(weak));t+=step;}
  assert.equal(tracker.diagnostics.stage,'calibrating');
  assert.equal(tracker.metrics.feedback,'这个角度方向不好判断——稍微转成斜侧面，让我看清你的头和双臂');
  assert.equal(tracker.metrics.poseFeedback.message,'这个角度方向不好判断——稍微转成斜侧面，让我看清你的头和双臂');
  // Pass conditions unchanged: the full 2 s start-pose hold is still required.
  for(let c=0;c<30;c++){tracker.update(structuredClone(img),t,1,raiseFrame(bothR(RREST)));t+=step;}
  assert.equal(tracker.diagnostics.stage,'calibrating');
  for(let c=0;c<33;c++){tracker.update(structuredClone(img),t,1,raiseFrame(bothR(RREST)));t+=step;}
  assert.equal(tracker.diagnostics.stage,'ready');
});
test('issue copy resolves by movement family',()=>{  assert.equal(poseIssueCopy('unstable_movement','hammer_curl').label,'手臂摆动偏大');
  assert.equal(poseIssueCopy('unstable_movement','hammer_curl').action,'慢一点，肘贴紧身体，把这一下做稳');
  assert.deepEqual(poseIssueCopy('unstable_movement','front_raise').joints,[11,12,13,14]);
  assert.equal(poseIssueCopy('poor_coordination','seated_curl').label,'两边节奏没对齐');
  assert.equal(poseIssueCopy('poor_coordination','bench_press').action,'慢一点，让两只手一起起、一起落');
  assert.deepEqual(poseIssueCopy('poor_coordination','hammer_curl').joints,[15,16]);
  // Non-upper-body types and a missing type keep the long-standing text exactly.
  assert.equal(poseIssueCopy('unstable_movement','squat').label,'支撑或落地不稳');
  assert.equal(poseIssueCopy('unstable_movement','standing_leg_curl').action,'不赶时间，慢一点，站稳了再来');
  assert.equal(poseIssueCopy('poor_coordination','squat').action,'慢一点，让手脚一起动');
  assert.equal(poseIssueCopy('unstable_movement').label,'支撑或落地不稳');
  // Other issues are family-neutral.
  assert.equal(poseIssueCopy('insufficient_range','hammer_curl').label,'动作幅度偏小');
});
test('framing copy only demands what the movement actually needs in frame',()=>{
  assert.equal(notSeenCopyFor('front_raise'),COPY_NOT_SEEN_UPPER);
  assert.match(COPY_NOT_SEEN_UPPER,/头和上半身/);
  assert.equal(notSeenCopyFor('squat'),COPY_NOT_SEEN);
  assert.equal(framingCopyFor('hammer_curl'),COPY_FRAMING_UPPER);
  assert.equal(framingCopyFor('squat'),COPY_FRAMING);
  const tracker=new ExtendedExerciseTracker('front_raise',20);
  tracker.update(null,0);
  assert.equal(tracker.metrics.feedback,COPY_NOT_SEEN_UPPER);
});
// --- Counting-mechanism repairs (2026-11-09; accuracy-phase0/counting-mechanisms-report.md) ---
test('front raise: a qualified effort whose return only grazes the start line is paid out when the next effort supersedes it (Lead 3b)',()=>{
  // FR-C's E12/E13 rebuilt: the first raise latches qualified, its descent
  // bottoms at 24° for a single frame — inside the ≤25° return zone but far
  // short of the 150 ms dwell that would confirm the return — and the second
  // raise's qualified peak supersedes the latch. Pre-repair the first latch
  // was silently overwritten and the pair counted once; the superseded
  // effort now pays out in order, so the pair counts twice.
  const specs=leftOnly([
    ...glideR(RREST,RS(95,170),10),...holdR(RS(95,170),4),
    ...glideR(RS(95,170),RS(26,170),7),RS(24,170),
    ...glideR(RS(26,170),RS(95,170),7),...holdR(RS(95,170),4),
    ...glideR(RS(95,170),RREST,8),...holdR(RREST,34),
  ]);
  assert.equal(driveRaise(specs).tracker.metrics.reps,2);
});
test('front raise: peak evidence is evaluated and recorded even when overshoot revokes the effort (Lead 3a)',()=>{
  // FR-C's E2 rebuilt at its marked geometry: a raise to 119° — over the
  // 115° band cap — with the elbow at its marked 145°. Pre-repair the
  // overshoot branch ran first and the evidence path never executed, so no
  // verdict existed for the effort at all. The rep is still revoked by the
  // overshoot (round-4 semantics unchanged), but the verdict is now
  // recorded — and at 145° the evidence itself qualifies: the band cap,
  // not the elbow, is what declines this rep.
  const straight=leftOnly([...glideR(RREST,RS(119,145),10),...holdR(RS(119,145),6),...glideR(RS(119,145),RREST,8),...holdR(RREST,34)]);
  const a=driveRaise(straight);
  assert.equal(a.tracker.metrics.reps,0);
  assert.equal(a.tracker.diagnostics.lastPeakEvidence,'qualified');
  // A genuinely bent overshoot records the opposite verdict.
  const bent=leftOnly([...glideR(RREST,RS(119,115),10),...holdR(RS(119,115),6),...glideR(RS(119,115),RREST,8),...holdR(RREST,34)]);
  const b=driveRaise(bent);
  assert.equal(b.tracker.metrics.reps,0);
  assert.equal(b.tracker.diagnostics.lastPeakEvidence,'revoked');
});
test('front raise: the overshoot gate judges the sampled extremum, not an unbounded refined one (Lead 2)',()=>{
  // Sampled peak 114° — inside the band — bracketed by 100° and 113° at the
  // stream's uniform cadence: the old parabola refinement judged this
  // episode at ≈115.4° and revoked it, a value no sample ever reached. The
  // gate now consumes the sampled extremum (114°), and the raise counts on
  // its (clean) evidence.
  const specs=leftOnly([
    ...glideR(RREST,RS(98,170),9),RS(100,170),RS(114,170),RS(113,170),RS(112,170),RS(100,170),
    ...glideR(RS(100,170),RREST,8),...holdR(RREST,34),
  ]);
  assert.equal(driveRaise(specs).tracker.metrics.reps,1);
});
test('hammer curls merge a bilateral effort whose fragmented plateau latched offset windows (Lead 1)',()=>{
  // HC-A's split rebuilt: both arms peak together, the left returns while
  // the right's channel exits the peak zone and re-enters it (two episodes
  // in one cycle, the cycle keeping the second). The kept windows sit
  // ~250 ms apart — outside the ±150 ms pair tolerance — so pre-repair the
  // one effort emitted as two singles. The right's discarded first episode
  // overlapped the left's window all along; the pair test now consults
  // every episode a cycle latched.
  const tracker=new ExtendedExerciseTracker('hammer_curl',20,{},true);
  const step=1000/24;let t=0;
  const feed=(l:number,r:number)=>{const raw=curlPose(l,r);tracker.update(raw,t,1,structuredClone(raw));t+=step;};
  for(let c=0;c<63;c++)feed(160,160);
  assert.equal(tracker.diagnostics.stage,'ready');
  const seq:[number,number][]=[
    [140,140],[118,118],[95,95],[80,80],[72,72],[68,68],
    [68,68],[68,68],[68,68],
    [95,70],[118,95],[146,90],[146,90],[146,90],[146,90],
    [146,76],[146,70],[146,70],
    [146,100],[146,125],[146,146],[146,146],[146,146],[146,146],
  ];
  for(const [l,r] of seq)feed(l,r);
  for(let c=0;c<40;c++)feed(160,160);
  assert.equal(tracker.metrics.reps,1);
  assert.equal(tracker.metrics.scoreAccumulator.count,1);
});
test('hammer curl in-flight cycles survive a form-rejection burst inside the preservation bound (Lead 1)',()=>{
  // HC-A's tilt-gate losses rebuilt: both arms are mid-plateau when a lean
  // (image tilt >35°) makes measure() reject six frames in a row. The
  // rejection still costs the ready latch — recalibration must be re-earned
  // at the start pose — but it no longer wipes the in-flight cycles, so the
  // interrupted rep completes on the return that follows. Pre-repair the
  // wipe plus the recalibration shadow made this rep invisible.
  const tracker=new ExtendedExerciseTracker('hammer_curl',20,{},true);
  const step=1000/24;let t=0;
  const feed=(l:number,r:number)=>{const raw=curlPose(l,r);tracker.update(raw,t,1,structuredClone(raw));t+=step;};
  const lean=(l:number,r:number)=>{const raw=curlPose(l,r);for(const i of [0,11,12,13,14,15,16])raw[i]={...raw[i],x:raw[i].x+.22};tracker.update(raw,t,1,structuredClone(raw));t+=step;};
  for(let c=0;c<63;c++)feed(160,160);
  assert.equal(tracker.diagnostics.stage,'ready');
  for(const e of [140,118,95,80,72,68])feed(e,e);
  for(let c=0;c<3;c++)feed(68,68);
  for(let c=0;c<6;c++)lean(68,68);
  for(const e of [85,100,118,132,146,146,146,146])feed(e,e);
  for(let c=0;c<50;c++)feed(160,160);
  assert.equal(tracker.metrics.reps,1);
  assert.equal(tracker.metrics.scoreAccumulator.count,1);
});
test('hammer curl upper-arm hint is suspended with its construct; the rep still counts',()=>{
  // Revised (round 5, workstream C): this fixture used to pin the hint's
  // sustained-deviation hysteresis (brief drift silent, sustained drift
  // speaks). The hint reads the suspended control term, so it no longer
  // surfaces at ANY duration; the hysteresis machinery remains in the
  // tracker for the record but drives no output. Counting is untouched.
  const r=run('hammer_curl',undefined,1,100);r.feed('neutral',3000);
  // Translate elbows and wrists outward together: upper-arm angle ≈40° (raw hint fires,
  // control penalty >25) while the elbow stays at the ≈25° peak flexion.
  const drift=(p:Point[])=>{p[13]={...p[13],x:p[13].x-.1};p[15]={...p[15],x:p[15].x-.1};p[14]={...p[14],x:p[14].x+.1};p[16]={...p[16],x:p[16].x+.1};};
  // A brief 300 ms drift does not raise the hint.
  r.feed('peak',300,drift);
  assert.doesNotMatch(r.tracker.metrics.feedback,/上臂贴紧一点点/);
  assert.doesNotMatch(r.tracker.metrics.poseFeedback.message,/上臂贴紧一点点/);
  // Neither does a sustained drift past 1 s — the construct is suspended.
  r.feed('peak',500);
  r.feed('peak',1300,drift);
  assert.doesNotMatch(r.tracker.metrics.feedback,/上臂贴紧一点点/);
  assert.doesNotMatch(r.tracker.metrics.poseFeedback.message,/上臂贴紧一点点/);
  // The rep still counts when the arms return.
  r.feed('neutral',1200);assert.equal(r.tracker.metrics.reps,1);
});
