import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AdaptiveRecognition,adaptiveEligible,loadRecognitionPreference,saveRecognitionPreference,selectNewRecognitionStrategy,selectRecognitionStrategy} from '../src/features/motion/lib/adaptiveRecognition';
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
  const r=replay(type,50,aspect);r.send(fixture(type),false);assert.ok(r.tracker.ready,r.tracker.metrics.feedback);assert.equal(r.tracker.metrics.reps,0);
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
 r.feed('neutral',3200,false);for(let i=0;i<6;i++)r.send(fixture('squat'),true,f=>{f.landmarks![27].x=1.1});assert.equal(r.tracker.ready,false);assert.equal(r.tracker.metrics.reps,0);
});
test('unstable preparation cannot award repetitions',()=>{
 const r=replay('squat');for(let i=0;i<70;i++)r.send(fixture('squat'),false,f=>f.landmarks!.forEach(p=>p.x+=(i%2?.08:-.08)));assert.equal(r.tracker.metrics.reps,0);
});
test('Full requires actual two-second throughput and bounded P95 delay',()=>{
 const fast=Array.from({length:70},(_,i)=>i*33.4);assert.ok(fullIsFast(fast,fast.map(()=>30)));assert.equal(fullIsFast([0,100], [10,10]),false);assert.equal(fullIsFast(fast,fast.map(()=>250)),false);assert.equal(fullIsFast(Array.from({length:24},(_,i)=>i*100),[20]),false);
 assert.equal(adaptiveEligible('standing_leg_curl'),false);
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

test('opening mid-squat does not count until the first complete cycle',()=>{
 const r=replay('squat');
 r.send(fixture('squat','peak'),false);
 assert.equal(r.tracker.ready,false);
 r.feed('neutral',1600);
 assert.equal(r.tracker.metrics.reps,0);
 r.cycle();
 assert.equal(r.tracker.metrics.reps,1);
});

for(const offset of [0,1])test(`squat counts consecutive cycles with only side ${offset} visible and omits scores`,()=>{
 const r=replay('squat');
 const hideOther=(f:PoseFrame)=>{for(const i of [11,23,25,27])f.landmarks![i+1-offset].x=1.1;};
 r.feed('neutral',200,false,hideOther);
 for(let i=0;i<2;i++){r.feed('peak',1600,true,hideOther);r.feed('neutral',1600,true,hideOther);}
 assert.equal(r.tracker.metrics.reps,2);
 assert.equal(r.tracker.metrics.scoreAccumulator.count,0);
 assert.equal(r.tracker.metrics.lastRepScore,null);
});

test('short occlusion of the tracked side freezes a squat and preserves its count',()=>{
 const r=replay('squat');r.feed('neutral',200,false);r.feed('peak',1600);
 r.send(fixture('squat','peak'),true,f=>{f.landmarks![27].x=1.1;});
 assert.match(r.tracker.metrics.feedback,/冻结/);
 r.feed('neutral',1600);
 assert.equal(r.tracker.metrics.reps,1);
 assert.equal(r.tracker.metrics.scoreAccumulator.count,0);
});

test('persistent loss of the tracked side cannot splice a half squat into a rep',()=>{
 const r=replay('squat');r.feed('neutral',200,false);r.feed('peak',1600);
 r.feed('peak',350,true,f=>{f.landmarks![27].x=1.1;});
 r.feed('neutral',1600,true,f=>{f.landmarks![27].x=1.1;});
 assert.equal(r.tracker.metrics.reps,0);
});

test('squat scoring accounts for trunk drift on the return despite a similar bottom pose',()=>{
 const steady=replay('squat'),drifting=replay('squat');
 for(const r of [steady,drifting]){r.feed('neutral',200,false);r.feed('peak',1600);}
 steady.feed('neutral',1600);
 let n=0;
 drifting.feed('neutral',1600,true,f=>{
  const drift=.13*Math.sin(Math.PI*Math.min(1,n++/12));
  f.landmarks![11].x+=drift;f.landmarks![12].x+=drift;
 });
 assert.equal(steady.tracker.metrics.reps,1);
 assert.equal(drifting.tracker.metrics.reps,1);
 assert.equal(drifting.tracker.metrics.scoreAccumulator.count,1);
 assert.ok(drifting.tracker.metrics.formBreakdown.trunk<steady.tracker.metrics.formBreakdown.trunk);
 assert.ok(drifting.tracker.metrics.formScore<steady.tracker.metrics.formScore);
});

test('a squat continues on its tracked side if the other side disappears mid-cycle',()=>{
 const r=replay('squat');
 r.feed('neutral',200,false);
 r.feed('peak',1600,true,f=>{f.landmarks![28].visibility=.2;});
 r.feed('neutral',1600);
 assert.equal(r.tracker.metrics.reps,1);
 assert.equal(r.tracker.metrics.scoreAccumulator.count,0);
 r.cycle();
 assert.equal(r.tracker.metrics.reps,2);
 assert.equal(r.tracker.metrics.scoreAccumulator.count,1);
});

test('automatic strategy uses device and exercise support for new records and respects saved strategies',()=>{
 assert.equal(selectRecognitionStrategy('squat',undefined,true),'adaptive-v1');
 assert.equal(selectRecognitionStrategy('squat',undefined,false),'legacy');
 assert.equal(selectRecognitionStrategy('standing_leg_curl',undefined,true),'legacy');
 assert.equal(selectRecognitionStrategy('squat','legacy',true),'legacy');
 assert.equal(selectRecognitionStrategy('squat','adaptive-v1',false),'adaptive-v1');
});

function hammerFreezeRig(){
 const tracker=new AdaptiveRecognition('hammer_curl',20,{},7);let now=0,id=0;
 let current=newDemonstrationPose('hammer_curl','neutral');
 const send=(landmarks:ReturnType<typeof newDemonstrationPose>['landmarks'],world:boolean,count=true)=>{
  const f:PoseFrame={runId:7,frameId:++id,capturedAt:now+=50,receivedAt:now+10,width:720,height:960,landmarks:landmarks.map(p=>({...p})),worldLandmarks:world?landmarks.map(p=>({...p})):null,model:'lite',mode:'main-cpu'};
  tracker.update(f,count);
 };
 // Landmarks and world landmarks are interpolated together so the world-basis shape
 // ratios evolve gradually, exactly as a real moving subject's would. Wrists travel on
 // an arc around the elbow: a straight-line blend would pass the wrist through the elbow
 // and collapse the forearm ratio, which the world-basis check rightly rejects.
 const feed=(stage:'neutral'|'peak',ms:number,count=true)=>{
  const from=current,to=newDemonstrationPose('hammer_curl',stage),steps=Math.max(1,Math.round(ms/50));
  for(let i=1;i<=steps;i++){
   const u=Math.min(1,i*50/600),lm=from.landmarks.map((p,j)=>({...p,x:p.x+(to.landmarks[j].x-p.x)*u,y:p.y+(to.landmarks[j].y-p.y)*u}));
   for(const o of [0,1]){
    const va={x:from.landmarks[15+o].x-from.landmarks[13+o].x,y:from.landmarks[15+o].y-from.landmarks[13+o].y},vb={x:to.landmarks[15+o].x-to.landmarks[13+o].x,y:to.landmarks[15+o].y-to.landmarks[13+o].y};
    const la=Math.hypot(va.x,va.y),lb=Math.hypot(vb.x,vb.y),ang=Math.atan2(va.y,va.x)+(Math.atan2(vb.y,vb.x)-Math.atan2(va.y,va.x))*u,len=la+(lb-la)*u;
    lm[15+o]={...lm[15+o],x:lm[13+o].x+Math.cos(ang)*len,y:lm[13+o].y+Math.sin(ang)*len};
   }
   send(lm,true,count);
  }
  current=to;
 };
 const freeze=(ms:number)=>{for(let t=0;t<ms;t+=50)send(current.landmarks,false);};
 return {tracker,feed,freeze};
}
test('hammer curl: a brief 3D-evidence freeze preserves the in-progress cycle',()=>{
 const r=hammerFreezeRig();r.feed('neutral',600);assert.ok(r.tracker.ready);r.feed('peak',1200);
 r.freeze(1000);
 assert.equal(r.tracker.ready,true);
 assert.equal(r.tracker.metrics.reps,0);
 assert.match(r.tracker.metrics.feedback,/三维依据暂不可靠，已冻结计数/);
 r.feed('neutral',1600);
 assert.equal(r.tracker.metrics.reps,1);
 assert.equal(r.tracker.metrics.scoreAccumulator.count,1);
});
test('hammer curl: a freeze outlasting the grace still voids the half rep',()=>{
 const r=hammerFreezeRig();r.feed('neutral',600);r.feed('peak',1200);
 r.freeze(1000);assert.equal(r.tracker.ready,true);assert.match(r.tracker.metrics.feedback,/冻结/);
 r.freeze(1700);
 assert.equal(r.tracker.ready,false);
 assert.equal(r.tracker.metrics.reps,0);
 // After recalibration a clean cycle counts exactly once: nothing was spliced.
 r.feed('neutral',800);assert.equal(r.tracker.ready,true);
 r.feed('peak',1200);r.feed('neutral',1600);
 assert.equal(r.tracker.metrics.reps,1);
});
test('device preference can force legacy for new records only and persists best-effort',()=>{
 assert.equal(selectNewRecognitionStrategy('squat','legacy',true),'legacy');
 assert.equal(selectNewRecognitionStrategy('squat','auto',true),'adaptive-v1');
 assert.equal(selectNewRecognitionStrategy('squat','auto',false),'legacy');
 assert.equal(selectNewRecognitionStrategy('standing_leg_curl','auto',true),'legacy');
 assert.equal(selectNewRecognitionStrategy('standing_leg_curl','legacy',true),'legacy');
 assert.doesNotThrow(()=>saveRecognitionPreference('legacy'));
 assert.ok(['auto','legacy'].includes(loadRecognitionPreference()));
 // A preference never rewrites a saved strategy.
 assert.equal(selectRecognitionStrategy('squat','adaptive-v1',false),'adaptive-v1');
});
