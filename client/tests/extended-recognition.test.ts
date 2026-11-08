import test from 'node:test';
import assert from 'node:assert/strict';
import {ExtendedExerciseTracker,sustainedPeak,type TimedSpan} from '../src/features/motion/lib/extendedRecognition';
import {newDemonstrationPose,createRecognitionTracker} from '../src/features/motion/lib/recognition';
import {poseIssueCopy} from '../src/features/motion/lib/poseFeedback';
import {COPY_FRAMING,COPY_FRAMING_UPPER,COPY_NOT_SEEN,COPY_NOT_SEEN_UPPER,framingCopyFor,notSeenCopyFor} from '../src/features/motion/lib/companionCopy';
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
test('hammer curls score loosely synchronized bilateral peaks peak-to-peak',()=>{
  const tracker=new ExtendedExerciseTracker('hammer_curl',20,{},true);
  const step=1000/24;let t=0;
  const feed=(l:number,r:number)=>{const raw=curlPose(l,r);tracker.update(raw,t,1,structuredClone(raw));t+=step;};
  for(let c=0;c<63;c++)feed(160,160);
  assert.equal(tracker.diagnostics.stage,'ready');
  // ≈2 s bilateral curls peaking at 79°, the right side ≈375 ms behind: outside
  // the 150 ms merge overlap (both reps emit as singles) but inside the 800 ms
  // peak window. The old instantaneous peakOther read the right elbow mid-flight
  // (≈100°) and scored ≈50 for these symmetric curls.
  const P=48,OFF=9;
  const wave=(k:number)=>{const u=(k%P)/P;return 160-81*(1-Math.cos(2*Math.PI*u))/2;};
  for(let rep=0;rep<3;rep++)for(let k=0;k<P;k++)feed(wave(k),wave(k-OFF));
  for(let c=0;c<40;c++)feed(160,160);
  assert.equal(tracker.metrics.reps,6);
  assert.ok(tracker.metrics.formBreakdown.symmetry>=85,`symmetry ${tracker.metrics.formBreakdown.symmetry} should be peak-to-peak (≈100), not peakOther (≈50)`);
});
test('hammer curls keep peakOther symmetry for true alternating curls',()=>{
  const tracker=new ExtendedExerciseTracker('hammer_curl',20,{},true);
  const step=1000/24;let t=0;
  const feed=(l:number,r:number)=>{const raw=curlPose(l,r);tracker.update(raw,t,1,structuredClone(raw));t+=step;};
  for(let c=0;c<63;c++)feed(160,160);
  // Arms alternate whole cycles (≈1.2 s each): peaks land ≈1.2 s apart, far
  // outside the 800 ms window, so the resting-arm formula still applies — and
  // the resting arm is fully extended at the other's peak.
  const P=29;
  const wave=(k:number)=>{const u=(k%P)/P;return 160-85*(1-Math.cos(2*Math.PI*u))/2;};
  for(let k=0;k<4*P;k++){
    const leftTurn=Math.floor(k/P)%2===0;
    feed(leftTurn?wave(k):160,leftTurn?160:wave(k));
  }
  for(let c=0;c<40;c++)feed(160,160);
  assert.equal(tracker.metrics.reps,4);
  assert.ok(tracker.metrics.formBreakdown.symmetry>=90,`alternating symmetry ${tracker.metrics.formBreakdown.symmetry} should stay high via peakOther`);
});
test('hammer curls keep the peakOther penalty when the resting arm is held half-bent',()=>{
  const tracker=new ExtendedExerciseTracker('hammer_curl',20,{},true);
  const step=1000/24;let t=0;
  const feed=(l:number,r:number)=>{const raw=curlPose(l,r);tracker.update(raw,t,1,structuredClone(raw));t+=step;};
  for(let c=0;c<63;c++)feed(160,160);
  assert.equal(tracker.diagnostics.stage,'ready');
  // True single-arm work: the right arm never peaks (held at 95°), so no peer
  // peak exists and the formula is untouched: 100 − (140−95)×1.2 = 46.
  const P=48;
  const wave=(k:number)=>{const u=(k%P)/P;return 160-85*(1-Math.cos(2*Math.PI*u))/2;};
  for(let rep=0;rep<2;rep++)for(let k=0;k<P;k++)feed(wave(k),95);
  for(let c=0;c<40;c++)feed(160,95);
  assert.equal(tracker.metrics.reps,2);
  const sym=tracker.metrics.formBreakdown.symmetry;
  assert.ok(sym>=43&&sym<=49,`symmetry ${sym} should stay ≈46 where peakOther legitimately applies`);
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
  assert.ok(sustained.metrics.lastRepIssues.includes('unstable_movement'));
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
test('front raise singles score peak-to-peak when the other side peaked within 800 ms',()=>{
  const tracker=new ExtendedExerciseTracker('front_raise',20,{},true);
  const step=1000/24;let t=0;const img=raiseImage();
  const feed=(l:number,r:number)=>{tracker.update(structuredClone(img),t,1,raiseWorld2(l,r));t+=step;};
  for(let c=0;c<63;c++)feed(10,10);
  assert.equal(tracker.diagnostics.stage,'ready');
  // One bilateral effort, loosely synchronized: left peaks at 76°, the right
  // ≈708 ms later at 68°. The peaks miss the merge overlap, so both reps emit
  // as singles — scored peak-to-peak (≈88), not by the other arm's height at
  // the peak instant (which would read ≈100 and hide the real difference).
  const P=48,OFF=17;
  const wave=(k:number,peak:number)=>{const u=(k%P)/P;return 10+(peak-10)*(1-Math.cos(2*Math.PI*u))/2;};
  for(let k=0;k<P;k++)feed(wave(k,76),wave(k-OFF,68));
  for(let c=0;c<48;c++)feed(10,10);
  assert.equal(tracker.metrics.reps,2);
  const sym=tracker.metrics.formBreakdown.symmetry;
  assert.ok(sym>=82&&sym<=94,`symmetry ${sym} should be ≈88 peak-to-peak (76° vs 68°)`);
});
test('issue copy resolves by movement family',()=>{
  assert.equal(poseIssueCopy('unstable_movement','hammer_curl').label,'手臂摆动偏大');
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
test('hammer curl upper-arm hint needs a sustained deviation and never blocks the rep',()=>{
  const r=run('hammer_curl',undefined,1,100);r.feed('neutral',3000);
  // Translate elbows and wrists outward together: upper-arm angle ≈40° (raw hint fires,
  // control penalty >25) while the elbow stays at the ≈25° peak flexion.
  const drift=(p:Point[])=>{p[13]={...p[13],x:p[13].x-.1};p[15]={...p[15],x:p[15].x-.1};p[14]={...p[14],x:p[14].x+.1};p[16]={...p[16],x:p[16].x+.1};};
  // A brief 300 ms drift must not raise the hint (the retest's seated setup flapped it).
  r.feed('peak',300,drift);
  assert.doesNotMatch(r.tracker.metrics.feedback,/上臂贴紧一点点/);
  assert.doesNotMatch(r.tracker.metrics.poseFeedback.message,/上臂贴紧一点点/);
  // Clear long enough for the sustain timer to reset, then drift sustained past 1 s.
  r.feed('peak',500);
  r.feed('peak',1300,drift);
  assert.match(r.tracker.metrics.feedback,/上臂贴紧一点点/);
  // The hint is advisory only: the rep still counts when the arms return.
  r.feed('neutral',1200);assert.equal(r.tracker.metrics.reps,1);
});
