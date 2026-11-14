import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ExtendedExerciseTracker} from '../src/features/motion/lib/extendedRecognition';
import {AdaptiveRecognition} from '../src/features/motion/lib/adaptiveRecognition';
import {createRecognitionTracker,newDemonstrationPose,recognitionDemonstration} from '../src/features/motion/lib/recognition';
import type {PoseFrame} from '../src/features/motion/lib/poseProtocol';
import type {NormalizedLandmark as Point} from '@mediapipe/tasks-vision';
const copy=<T,>(p:T):T=>structuredClone(p);

/** Hammer through the production factory (median-smoothed path), 50 ms steps. */
function runHammer(step=50){
 const tracker=createRecognitionTracker('hammer_curl',20) as ExtendedExerciseTracker;
 let now=0;
 const feed=(stage:'neutral'|'peak',duration:number,change?:(p:Point[])=>void)=>{
  const input=newDemonstrationPose('hammer_curl',stage);change?.(input.landmarks);
  for(let t=0;t<duration;t+=step){tracker.update(copy(input.landmarks),now,1,copy(input.worldLandmarks));now+=step;}
 };
 return {tracker,feed};
}

test('gate counters: hammer tilt-gate rejections are counted by their reason',()=>{
 const tracker=new ExtendedExerciseTracker('hammer_curl',20,{},true);
 const neutral=newDemonstrationPose('hammer_curl','neutral').landmarks;
 let now=1000;
 const frame=(p:Point[])=>tracker.update(copy(p),now+=50,1,null);
 for(let i=0;i<44;i++)frame(neutral);
 assert.equal(tracker.diagnostics.stage,'ready');
 assert.equal(tracker.gateCountersSnapshot().calibrationRelatches,0);
 // Shoulders shifted sideways: torso tilt ≈46°, past the 35° form gate.
 const tilted=neutral.map(p=>({...p}));tilted[11]={...tilted[11],x:tilted[11].x+.28};tilted[12]={...tilted[12],x:tilted[12].x+.28};
 for(let i=0;i<3;i++)frame(tilted);
 const c=tracker.gateCountersSnapshot();
 assert.equal(c.formInterrupts['请直立站稳，保持双上臂在体侧'],3);
 assert.deepEqual(c.softInterrupts,{});
 assert.equal(tracker.metrics.reps,0);
});

test('gate counters: calibration re-latch after a hard interrupt counts once',()=>{
 const tracker=new ExtendedExerciseTracker('hammer_curl',20,{},true);
 const neutral=newDemonstrationPose('hammer_curl','neutral').landmarks;
 let now=1000;
 const frame=(p:Point[])=>tracker.update(copy(p),now+=50,1,null);
 for(let i=0;i<44;i++)frame(neutral);
 assert.equal(tracker.diagnostics.stage,'ready');
 assert.equal(tracker.gateCountersSnapshot().calibrationRelatches,0);
 tracker.interrupt('暂停');
 for(let i=0;i<70;i++)frame(neutral);
 assert.equal(tracker.diagnostics.stage,'ready');
 assert.equal(tracker.gateCountersSnapshot().calibrationRelatches,1);
});

test('gate counters: peaks and returns are counted per side; a peak without a return widens the gap',()=>{
 const r=runHammer();r.feed('neutral',3000);assert.equal(r.tracker.diagnostics.stage,'ready');
 r.feed('peak',1200);r.feed('neutral',1200);
 assert.equal(r.tracker.metrics.reps,1);
 let c=r.tracker.gateCountersSnapshot();
 assert.deepEqual(c.peaksConfirmed,[1,1]);assert.deepEqual(c.returnsConfirmed,[1,1]);
 // Second effort: both sides peak again, then the set is interrupted before
 // either side confirms a return (a short neutral feed closes the peak
 // episodes but is far under the 150 ms return hold).
 r.feed('peak',1200);r.feed('neutral',200);
 c=r.tracker.gateCountersSnapshot();
 assert.deepEqual(c.peaksConfirmed,[2,2]);assert.deepEqual(c.returnsConfirmed,[1,1]);
 r.tracker.interrupt('暂停');
 assert.equal(r.tracker.metrics.reps,1);
});

test('gate counters: a hammer pending completion wiped by an interrupt is counted',()=>{
 const r=runHammer();
 const neutralPose=newDemonstrationPose('hammer_curl','neutral').landmarks;
 const holdRight=(p:Point[])=>{p[14]={...neutralPose[14]};p[16]={...neutralPose[16]};};
 r.feed('neutral',3000);assert.equal(r.tracker.diagnostics.stage,'ready');
 r.feed('peak',1200,holdRight);
 r.feed('neutral',400,holdRight);
 // The left side completed alone and sits in hammerPending (it would emit
 // as a single after 600 ms); the interrupt lands first and wipes it.
 assert.equal(r.tracker.metrics.reps,0);
 r.tracker.interrupt('暂停');
 const c=r.tracker.gateCountersSnapshot();
 assert.equal(c.hammerPendingWipes,1);
 assert.deepEqual(c.peaksConfirmed,[1,0]);
 assert.deepEqual(c.returnsConfirmed,[1,0]);
 r.feed('neutral',2000);
 assert.equal(r.tracker.metrics.reps,0);
});

test('gate counters: the adaptive wrapper counts framing rejects',()=>{
 const engine=new AdaptiveRecognition('squat',20,{reps:2},1);
 const p=recognitionDemonstration('squat','neutral').landmarks;p[27].y=1.1;p[28].visibility=.2;
 engine.update({runId:1,frameId:1,capturedAt:100,receivedAt:110,width:720,height:960,landmarks:p,worldLandmarks:null,model:'lite',mode:'main-gpu'},false);
 assert.equal(engine.gateCountersSnapshot().framingRejects,1);
});

function hammerFreezeRig(){
 const tracker=new AdaptiveRecognition('hammer_curl',20,{},7);let now=0,id=0;
 let current=newDemonstrationPose('hammer_curl','neutral');
 const send=(landmarks:ReturnType<typeof newDemonstrationPose>['landmarks'],world:boolean,count=true)=>{
  const f:PoseFrame={runId:7,frameId:++id,capturedAt:now+=50,receivedAt:now+10,width:720,height:960,landmarks:landmarks.map(p=>({...p})),worldLandmarks:world?landmarks.map(p=>({...p})):null,model:'lite',mode:'main-cpu'};
  tracker.update(f,count);
 };
 const feed=(stage:'neutral'|'peak',ms:number,count=true)=>{
  const from=current,to=newDemonstrationPose('hammer_curl',stage),steps=Math.max(1,Math.round(ms/50));
  for(let i=1;i<=steps;i++){
   const u=Math.min(1,i*50/600),lm=from.landmarks.map((p,j)=>({...p,x:p.x+(to.landmarks[j].x-p.x)*u,y:p.y+(to.landmarks[j].y-p.y)*u}));
   for(const o of [0,1]){
    const va={x:from.landmarks[15+o].x-from.landmarks[13+o].x,y:from.landmarks[15+o].y-from.landmarks[13+o].y},vb={x:to.landmarks[15+o].x-to.landmarks[13+o].x,y:to.landmarks[15+o].y-to.landmarks[13+o].y};
    const la=Math.hypot(va.x,va.y),lb=Math.hypot(vb.x,va.y),ang=Math.atan2(va.y,va.x)+(Math.atan2(vb.y,vb.x)-Math.atan2(va.y,va.x))*u,len=la+(lb-la)*u;
    lm[15+o]={...lm[15+o],x:lm[13+o].x+Math.cos(ang)*len,y:lm[13+o].y+Math.sin(ang)*len};
   }
   send(lm,true,count);
  }
  current=to;
 };
 const freeze=(ms:number)=>{for(let t=0;t<ms;t+=50)send(current.landmarks,false);};
 return {tracker,feed,freeze};
}
test('gate counters: wrapper freeze episodes and frozen time are measured, base counters merge in',()=>{
 const r=hammerFreezeRig();r.feed('neutral',600);assert.ok(r.tracker.ready);r.feed('peak',1200);
 r.freeze(1000);
 let c=r.tracker.gateCountersSnapshot();
 assert.equal(c.freezeEpisodes,1);
 r.feed('neutral',1600);
 assert.equal(r.tracker.metrics.reps,1);
 c=r.tracker.gateCountersSnapshot();
 assert.equal(c.freezeEpisodes,1);
 assert.ok(c.frozenMs>=800&&c.frozenMs<=1400,'frozenMs='+c.frozenMs);
 // Merged from the base tracker: the completed bilateral rep confirmed both sides.
 assert.deepEqual(c.peaksConfirmed,[1,1]);
 assert.deepEqual(c.returnsConfirmed,[1,1]);
});
