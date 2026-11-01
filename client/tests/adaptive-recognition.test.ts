import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AdaptiveRecognition,adaptiveEligible,approvedAdaptiveCombinations} from '../src/features/motion/lib/adaptiveRecognition';
import {FrameOrder,fullIsFast,TimeFilter,type PoseFrame} from '../src/features/motion/lib/poseProtocol';
import {recognitionDemonstration,newDemonstrationPose} from '../src/features/motion/lib/recognition';
import {planPose} from './fixtures/plan-camera';
import {libraryPose} from './fixtures/library-camera';
function fixture(type:string,stage='neutral'){
 if(['squat','jumping_jack','push_up','high_knees'].includes(type))return recognitionDemonstration(type as any,stage as any);
 if(['hammer_curl','romanian_deadlift'].includes(type))return newDemonstrationPose(type as any,stage as any);
 if(['biceps_curl','shoulder_press','bent_over_row'].includes(type))return {landmarks:planPose(type as any,stage as any),worldLandmarks:null};
 return libraryPose(type as any,stage==='neutral'?'neutral':'peak');
}
function replay(type:string,dt=1000/20,aspect=.75,restored:any={}){
 const tracker=new AdaptiveRecognition(type,20,restored,1);let now=0,id=0,run=1,previous=fixture(type);let last:PoseFrame;
 const send=(pose:ReturnType<typeof fixture>,count=true,edit?:(f:PoseFrame)=>void)=>{
  const scale=Math.min(1,aspect)*.7;
  const f:PoseFrame={runId:run,frameId:++id,capturedAt:now+=dt,receivedAt:now+10,width:aspect*960,height:960,landmarks:pose.landmarks.map(p=>({...p,x:.5+(p.x-.5)*scale/aspect,y:.5+(p.y-.5)*scale})),worldLandmarks:pose.worldLandmarks,model:'lite',mode:'worker-cpu'};edit?.(f);last=f;tracker.update(f,count);
 };
 const feed=(stage:string,ms=1200,count=true,edit?:(f:PoseFrame)=>void)=>{const next=fixture(type,stage),start=previous;for(let t=0;t<ms;t+=dt){const u=Math.min(1,t/600);send({landmarks:start.landmarks.map((p,i)=>({...p,x:p.x+(next.landmarks[i].x-p.x)*u,y:p.y+(next.landmarks[i].y-p.y)*u})),worldLandmarks:next.worldLandmarks},count,edit);}previous=next;};
 return {tracker,feed,send,useRun:(value:number)=>{run=value},last:()=>last!,cycle:()=>{for(const stage of type==='high_knees'?['left','neutral','right','neutral']:['peak','neutral'])feed(stage,1600);}};
}
for(const type of ['squat','jumping_jack','push_up','high_knees','biceps_curl','hammer_curl','seated_curl','shoulder_press','bent_over_row','bench_press','incline_bench_press','barbell_deadlift','romanian_deadlift'])test(`${type}: adaptive capture-time cycles and stable preparation retain statistics`,()=>{
 for(const aspect of [.75,16/9]){
  const r=replay(type,50,aspect);r.feed('neutral',3200,false);assert.ok(r.tracker.ready,r.tracker.metrics.feedback);assert.equal(r.tracker.metrics.reps,0);
  r.cycle();assert.equal(r.tracker.metrics.reps,1,r.tracker.metrics.feedback);
  r.tracker.interrupt();r.feed('neutral',3200,false);assert.equal(r.tracker.metrics.reps,1);r.cycle();assert.equal(r.tracker.metrics.reps,2,r.tracker.metrics.feedback);
 }
});
test('duplicate, out-of-order, stale, wrong-run frames are never accepted',()=>{
 const r=replay('squat');r.feed('neutral',3200,false);const f=r.last();const order=new FrameOrder(1);assert.ok(order.accept(f));assert.equal(order.accept(f),false);assert.equal(order.accept({...f,frameId:f.frameId-1}),false);assert.equal(order.accept({...f,runId:2,frameId:999}),false);assert.equal(order.accept({...f,frameId:999,capturedAt:f.capturedAt+1,receivedAt:f.capturedAt+400}),false);
 const reps=r.tracker.metrics.reps;r.tracker.update({...f,frameId:999,capturedAt:f.capturedAt+1,receivedAt:f.capturedAt+400});assert.equal(r.tracker.metrics.reps,reps);
});
test('brief weak tracking freezes without clearing calibration; sustained loss drops the half rep',()=>{
 const r=replay('squat');r.feed('neutral',3200,false);
 for(let i=0;i<3;i++)r.send(fixture('squat'),true,f=>f.landmarks!.forEach(p=>p.visibility=.4));assert.ok(r.tracker.ready);assert.match(r.tracker.metrics.feedback,/冻结/);
 for(let i=0;i<4;i++)r.send(fixture('squat'),true,f=>f.landmarks!.forEach(p=>p.visibility=.4));assert.equal(r.tracker.ready,false);assert.equal(r.tracker.metrics.reps,0);
 r.feed('neutral',3200,false);r.feed('peak');r.tracker.interrupt();r.feed('neutral',3200,false);assert.equal(r.tracker.metrics.reps,0);
});
test('dimensions, coordinate-source changes and frame exit invalidate partial cycles',()=>{
 const r=replay('squat');r.feed('neutral',3200,false);r.feed('peak');r.send(fixture('squat','peak'),true,f=>{f.worldLandmarks=f.landmarks!.map(p=>({...p}));});assert.equal(r.tracker.metrics.reps,0);assert.equal(r.tracker.ready,false);
 r.feed('neutral',3200,false);r.send(fixture('squat'),true,f=>{f.landmarks![27].x=1.1});assert.equal(r.tracker.ready,false);assert.equal(r.tracker.metrics.reps,0);
});
test('unstable preparation cannot start or award repetitions',()=>{
 const r=replay('squat');for(let i=0;i<70;i++)r.send(fixture('squat'),false,f=>f.landmarks!.forEach(p=>p.x+=(i%2?.08:-.08)));assert.equal(r.tracker.ready,false);assert.equal(r.tracker.metrics.reps,0);
});
test('Full requires actual two-second throughput and bounded P95 delay',()=>{
 const fast=Array.from({length:70},(_,i)=>i*33.4);assert.ok(fullIsFast(fast,fast.map(()=>30)));assert.equal(fullIsFast([0,100], [10,10]),false);assert.equal(fullIsFast(fast,fast.map(()=>250)),false);assert.equal(fullIsFast(Array.from({length:24},(_,i)=>i*100),[20]),false);
 assert.equal(approvedAdaptiveCombinations.length,0);assert.equal(adaptiveEligible('standing_leg_curl'),false);
});
test('time filter keeps raw confidence and bounded outputs at varying frame rates',()=>{
 for(const dt of [33,66,125]){const f=new TimeFilter(),p=fixture('squat').landmarks;f.apply(p,0);const moved=p.map(v=>({...v,x:v.x+.03,visibility:.4}));const result=f.apply(moved,dt);assert.equal(result[11].visibility,.4);assert.ok(result[11].x>p[11].x&&result[11].x<moved[11].x);}
});

test('tiny body framing cannot pass stable calibration',()=>{
 const r=replay('squat');for(let i=0;i<70;i++)r.send(fixture('squat'),false,f=>f.landmarks!.forEach(p=>{p.x=.5+(p.x-.5)*.05;p.y=.5+(p.y-.5)*.05;}));
 assert.equal(r.tracker.ready,false);assert.equal(r.tracker.metrics.reps,0);assert.match(r.tracker.metrics.feedback,/过小/);
});

test('background preparation reuses a neutral calibrated pose and rejects pre-resume frames',()=>{
 const r=replay('squat');r.feed('neutral',3200,false);assert.ok(r.tracker.ready);const old=r.last();assert.ok(r.tracker.continuePrepared(2));r.useRun(2);
 r.tracker.update({...old,frameId:999,capturedAt:old.capturedAt+10,receivedAt:old.capturedAt+20});assert.equal(r.tracker.metrics.reps,0);
 r.cycle();assert.equal(r.tracker.metrics.reps,1);
});
test('a paused partial cycle cannot be reused as a prepared start',()=>{
 const r=replay('squat');r.feed('neutral',3200,false);r.feed('peak',1600,false);assert.equal(r.tracker.continuePrepared(2),false);assert.equal(r.tracker.metrics.reps,0);
});
test('completed movements during passive preparation never increase stored counts or scores',()=>{
 const r=replay('squat');r.feed('neutral',3200,false);for(let i=0;i<3;i++){r.feed('peak',1600,false);r.feed('neutral',3200,false);}assert.equal(r.tracker.metrics.reps,0);assert.equal(r.tracker.metrics.scoreAccumulator.count,0);
});
