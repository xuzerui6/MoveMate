import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ExtendedExerciseTracker} from '../src/features/motion/lib/extendedRecognition';
import {AdaptiveRecognition} from '../src/features/motion/lib/adaptiveRecognition';
import type {PoseFrame} from '../src/features/motion/lib/poseProtocol';
import type {NormalizedLandmark as Point} from '@mediapipe/tasks-vision';

/**
 * Hammer-curl return gate, round 2 (2026-11-14) — the regression contract from
 * the Codex consult (2026-11-14-hammer-return-gate, Section 5), adapted to the
 * repo's synthetic trajectory fixtures. The failure being fixed: Edward's
 * instrumented 22:50 set performed 10 bilateral reps and counted 7 —
 * returnsConfirmed [7,7] against peaksConfirmed [9,10] — because the absolute
 * ≥145° return dwell is unreachable when the bottom-edge channel reads a full
 * re-extension as ~135–140°, and freezes kept breaking the wall-clock window.
 * Fixtures are synthetic landmark sequences, never camera evidence.
 */
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

/** Direct prefiltered tracker (the production base), exact elbow geometry. */
function directRig(rest:number,world=true,fps=24){
  const tracker=new ExtendedExerciseTracker('hammer_curl',50,{},true);
  const step=1000/fps;let t=0,cur=rest;
  const send=(deg:number,w:boolean)=>{
    const raw=elbowPose(deg);
    tracker.update(raw,t,1,w?structuredClone(raw):null);t+=step;
  };
  const hold=(deg:number,ms:number,w=world)=>{const n=Math.max(1,Math.round(ms/step));for(let i=0;i<n;i++)send(deg,w);cur=deg;};
  const ramp=(to:number,ms:number,w=world)=>{const from=cur,n=Math.max(2,Math.round(ms/step));for(let i=1;i<=n;i++)send(from+(to-from)*i/n,w);cur=to;};
  const rep=(peak:number,ret:number,holdMs=600,w=world)=>{ramp(peak,450,w);ramp(ret,450,w);hold(ret,holdMs,w);};
  hold(rest,2600);
  assert.equal(tracker.diagnostics.stage,'ready','calibration must latch');
  return {tracker,hold,ramp,rep};
}

test('return gate: tonight\u2019s signature — anchor ~148°, full returns reading ~140° — counts every rep, classified relative',()=>{
  const r=directRig(148);
  for(let i=0;i<10;i++)r.rep(70,140);
  assert.equal(r.tracker.metrics.reps,10);
  const c=r.tracker.gateCountersSnapshot();
  assert.deepEqual(c.peaksConfirmed,[10,10]);
  assert.deepEqual(c.returnsConfirmed,[10,10]);
  assert.deepEqual(c.returnCompletionsRelative,[10,10]);
  assert.deepEqual(c.returnCompletionsAbsolute,[0,0]);
  assert.deepEqual(c.cycleReplacements,[0,0]);
  assert.ok(Math.abs((c.returnAnchor[0]??0)-148)<0.6&&Math.abs((c.returnAnchor[1]??0)-148)<0.6,`anchors ${c.returnAnchor}`);
  assert.deepEqual(c.returnThreshold,[138,138]);
  assert.deepEqual(c.returnBasis,['world','world']);
  assert.equal(c.returnMaxima[0].length,10);
  assert.ok(c.returnMaxima[0].every(v=>v>=138&&v<=142),`maxima ${c.returnMaxima[0]}`);
});

test('return gate: a high anchor still demands the absolute 145° — returns to 138° never complete',()=>{
  const r=directRig(165);
  for(let i=0;i<10;i++)r.rep(70,138);
  assert.equal(r.tracker.metrics.reps,0);
  const c=r.tracker.gateCountersSnapshot();
  assert.deepEqual(c.returnsConfirmed,[0,0]);
  assert.deepEqual(c.returnCompletionsRelative,[0,0]);
  assert.ok(Math.abs((c.returnAnchor[0]??0)-165)<0.6,`anchor ${c.returnAnchor}`);
  assert.deepEqual(c.returnThreshold,[145,145]);
  // Each new distinct peak discards the previous uncompleted cycle.
  assert.ok(c.cycleReplacements[0]>=8&&c.cycleReplacements[1]>=8,`replacements ${c.cycleReplacements}`);
  assert.ok(c.returnMaxima[0].length>=8);
});

test('return gate: returns to 130° against a 138° threshold give zero completions',()=>{
  const r=directRig(148);
  for(let i=0;i<4;i++)r.rep(70,130);
  assert.equal(r.tracker.metrics.reps,0);
  const c=r.tracker.gateCountersSnapshot();
  assert.deepEqual(c.returnsConfirmed,[0,0]);
  assert.deepEqual(c.returnCompletionsAbsolute,[0,0]);
  assert.deepEqual(c.returnCompletionsRelative,[0,0]);
});

test('return gate: partial returns at or below 115° give zero completions, with or without a reopening',()=>{
  const a=directRig(148);
  for(let i=0;i<3;i++)a.rep(70,115);
  assert.equal(a.tracker.metrics.reps,0);
  assert.deepEqual(a.tracker.gateCountersSnapshot().returnsConfirmed,[0,0]);
  // 100° never reaches the 110° reopening line: no discard, cycles fold as
  // fragments of one excursion — still zero completions.
  const b=directRig(148);
  for(let i=0;i<3;i++)b.rep(70,100);
  assert.equal(b.tracker.metrics.reps,0);
  const c=b.tracker.gateCountersSnapshot();
  assert.deepEqual(c.returnsConfirmed,[0,0]);
  assert.deepEqual(c.cycleReplacements,[0,0]);
});

test('return gate: successively lower plateaus do not ratchet the anchor down',()=>{
  const r=directRig(148);
  r.rep(70,142);r.rep(70,140);r.rep(70,134);r.rep(70,130);
  assert.equal(r.tracker.metrics.reps,2);
  const c=r.tracker.gateCountersSnapshot();
  assert.deepEqual(c.returnsConfirmed,[2,2]);
  assert.deepEqual(c.returnCompletionsRelative,[2,2]);
  // The anchor is frozen at the calibration value after all four plateaus.
  assert.ok(Math.abs((c.returnAnchor[0]??0)-148)<0.6,`anchor ${c.returnAnchor}`);
  assert.deepEqual(c.returnThreshold,[138,138]);
  assert.ok(c.cycleReplacements[0]>=1,`replacements ${c.cycleReplacements}`);
});

test('return gate: returns that genuinely reach past 145° complete via the absolute route',()=>{
  const r=directRig(170);
  for(let i=0;i<3;i++)r.rep(70,165);
  assert.equal(r.tracker.metrics.reps,3);
  const c=r.tracker.gateCountersSnapshot();
  assert.deepEqual(c.returnCompletionsAbsolute,[3,3]);
  assert.deepEqual(c.returnCompletionsRelative,[0,0]);
  assert.deepEqual(c.returnThreshold,[145,145]);
});

test('return gate: an unstable calibration hold signs no anchor — absolute route only',()=>{
  const tracker=new ExtendedExerciseTracker('hammer_curl',50,{},true);
  const step=1000/24;let t=0,cur=152;
  const send=(deg:number)=>{const raw=elbowPose(deg);tracker.update(raw,t,1,structuredClone(raw));t+=step;};
  // Alternating 146°/158°: start pose throughout, but p90−p10 = 12° > 10°.
  for(let i=0;i<63;i++)send(i%2?158:146);
  assert.equal(tracker.diagnostics.stage,'ready');
  const hold=(deg:number,ms:number)=>{const n=Math.max(1,Math.round(ms/step));for(let i=0;i<n;i++)send(deg);cur=deg;};
  const ramp=(to:number,ms:number)=>{const from=cur,n=Math.max(2,Math.round(ms/step));for(let i=1;i<=n;i++)send(from+(to-from)*i/n);cur=to;};
  const rep=(ret:number)=>{ramp(70,450);ramp(ret,450);hold(ret,600);};
  rep(138);rep(138);
  assert.equal(tracker.metrics.reps,0);
  rep(160);rep(160);
  assert.equal(tracker.metrics.reps,2);
  const c=tracker.gateCountersSnapshot();
  assert.deepEqual(c.returnAnchor,[null,null]);
  assert.deepEqual(c.returnThreshold,[145,145]);
  assert.deepEqual(c.returnCompletionsAbsolute,[2,2]);
  assert.deepEqual(c.returnCompletionsRelative,[0,0]);
});

test('return gate: return evidence separated by more than 500 ms of measured time cannot accumulate',()=>{
  const r=directRig(148);
  r.ramp(70,450);r.ramp(140,450);r.hold(140,100);   // ~100 ms of credit, then gone
  r.ramp(120,300);r.hold(120,600);                    // window lapses in measured time
  r.ramp(140,300);r.hold(140,100);                    // a second, separate ~100 ms
  r.ramp(120,300);r.hold(120,100);
  assert.equal(r.tracker.metrics.reps,0);
  const c=r.tracker.gateCountersSnapshot();
  assert.ok(c.returnWindowExpirations[0]>=1&&c.returnWindowExpirations[1]>=1,`expirations ${c.returnWindowExpirations}`);
  r.ramp(140,300);r.hold(140,500);                    // one honest dwell completes it
  assert.equal(r.tracker.metrics.reps,1);
  assert.deepEqual(r.tracker.gateCountersSnapshot().returnsConfirmed,[1,1]);
});

test('return gate: measurement-basis change clears return evidence; the relative route needs an anchor for the new basis',()=>{
  const r=directRig(148,true);
  r.rep(70,140);                                      // world, relative — counts
  assert.equal(r.tracker.metrics.reps,1);
  r.rep(70,140,600,false);                            // image basis: no image anchor, 140° < 145°
  assert.equal(r.tracker.metrics.reps,1);
  let c=r.tracker.gateCountersSnapshot();
  assert.deepEqual(c.returnBasis,['image','image']);
  assert.deepEqual(c.returnCompletionsRelative,[1,1]);
  r.rep(70,140);                                      // world anchor is still there
  assert.equal(r.tracker.metrics.reps,2);
  // Mid-cycle flip: world credit at 140°, then image frames at 150° — the
  // world credit is cleared at the flip; the image side must earn its own
  // absolute 150 ms, and the completion classifies as absolute.
  r.ramp(70,450,true);r.ramp(140,450,true);r.hold(140,100,true);
  r.ramp(150,300,false);r.hold(150,700,false);
  assert.equal(r.tracker.metrics.reps,3);
  c=r.tracker.gateCountersSnapshot();
  assert.deepEqual(c.returnCompletionsAbsolute,[1,1]);
  assert.deepEqual(c.returnCompletionsRelative,[2,2]);
});

test('return gate: image-basis calibration signs an image anchor and relative returns count',()=>{
  const r=directRig(148,false);
  for(let i=0;i<3;i++)r.rep(70,140);
  assert.equal(r.tracker.metrics.reps,3);
  const c=r.tracker.gateCountersSnapshot();
  assert.deepEqual(c.returnBasis,['image','image']);
  assert.deepEqual(c.returnCompletionsRelative,[3,3]);
  assert.deepEqual(c.returnThreshold,[138,138]);
});

test('return gate: arm-swing oscillation that never reaches the peak zone counts nothing',()=>{
  const r=directRig(160);
  for(let i=0;i<6;i++){r.ramp(105,300);r.ramp(160,300);}
  r.hold(160,600);
  assert.equal(r.tracker.metrics.reps,0);
  const c=r.tracker.gateCountersSnapshot();
  assert.deepEqual(c.peaksConfirmed,[0,0]);
  assert.deepEqual(c.returnsConfirmed,[0,0]);
});

/** Production-path rig: AdaptiveRecognition over elbowPose PoseFrames. */
function wrapperRig(){
  const engine=new AdaptiveRecognition('hammer_curl',50,{},3);
  let t=0,id=0,cur=148;
  const send=(deg:number,world:boolean)=>{
    const raw=elbowPose(deg);
    const f:PoseFrame={runId:3,frameId:++id,capturedAt:t+=50,receivedAt:t+10,width:720,height:960,landmarks:raw,worldLandmarks:world?structuredClone(raw):null,model:'lite',mode:'main-cpu'};
    engine.update(f,true);
  };
  const hold=(deg:number,ms:number)=>{const n=Math.max(1,Math.round(ms/50));for(let i=0;i<n;i++)send(deg,true);cur=deg;};
  const ramp=(to:number,ms:number)=>{const from=cur,n=Math.max(2,Math.round(ms/50));for(let i=1;i<=n;i++)send(from+(to-from)*i/n,true);cur=to;};
  const freeze=(ms:number)=>{const n=Math.max(1,Math.round(ms/50));for(let i=0;i<n;i++)send(cur,false);};
  hold(148,1500);
  assert.ok(engine.ready,'wrapper calibration must latch');
  return {engine,hold,ramp,freeze};
}

for(const freezeMs of [50,150,400,1000]){
  test(`return gate (wrapper): a ${freezeMs} ms freeze mid-return preserves the cycle; frozen time earns no credit`,()=>{
    const r=wrapperRig();
    r.ramp(70,700);r.hold(70,250);                    // the filtered signal needs a real peak dwell
    r.ramp(140,700);r.hold(140,50);                   // partial credit (<150 ms), then the freeze
    r.freeze(freezeMs);
    r.hold(140,900);                                  // fresh post-resume evidence completes it
    assert.equal(r.engine.metrics.reps,1);
    const c=r.engine.gateCountersSnapshot();
    assert.deepEqual(c.returnsConfirmed,[1,1]);
    assert.deepEqual(c.freezeInvalidatedCycles,[0,0]);
    assert.deepEqual(c.returnCompletionsRelative,[1,1]);
    assert.ok(c.frozenMs>=freezeMs-100,`frozenMs ${c.frozenMs}`);
  });
}

test('return gate (wrapper): cumulative frozen time over 2000 ms inside one cycle invalidates it to the re-arm',()=>{
  const r=wrapperRig();
  r.ramp(70,700);r.hold(70,250);
  r.ramp(140,700);r.hold(140,50);
  r.freeze(1200);r.hold(140,50);                     // resume briefly — 1200 ms cumulative is still under the cap
  r.freeze(1200);r.hold(140,400);                    // second resume crosses 2400 ms cumulative
  assert.equal(r.engine.metrics.reps,0);
  const c=r.engine.gateCountersSnapshot();
  assert.ok(c.freezeInvalidatedCycles[0]+c.freezeInvalidatedCycles[1]>=1,`invalidated ${c.freezeInvalidatedCycles}`);
  assert.deepEqual(c.returnsConfirmed,[0,0]);
  assert.notEqual(r.engine.diagnostics.stage,'ready');
});

test('return gate (wrapper): a freeze cannot validate an unproven one-frame peak',()=>{
  const r=wrapperRig();
  r.hold(75,50);                                     // a single frame dips into the peak zone
  r.freeze(400);                                     // frozen time must not stretch its dwell
  r.hold(148,1200);
  assert.equal(r.engine.metrics.reps,0);
  const c=r.engine.gateCountersSnapshot();
  assert.deepEqual(c.peaksConfirmed,[0,0]);
  assert.deepEqual(c.returnsConfirmed,[0,0]);
});

test('return gate (wrapper): a peak already proven before the freeze survives it',()=>{
  const r=wrapperRig();
  r.ramp(70,600);r.hold(70,400);                     // measured dwell proves the peak pre-freeze
  r.freeze(400);
  r.ramp(140,600);r.hold(140,900);
  assert.equal(r.engine.metrics.reps,1);
  const c=r.engine.gateCountersSnapshot();
  assert.deepEqual(c.peaksConfirmed,[1,1]);
  assert.deepEqual(c.returnsConfirmed,[1,1]);
  assert.deepEqual(c.freezeInvalidatedCycles,[0,0]);
});
