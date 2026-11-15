/**
 * Hammer round 4 (2026-11-15, set-3 verdict): latched cycles survive
 * tracking blackouts, and the gate trace learns to attribute blackouts.
 *
 * Set 3's trace proved the old loss policy was a counting bug in its own
 * right: the set's ONE bilateral latch (live tops 76.4°/79.6°) was wiped
 * 1.3 s into a 6.4 s sample blackout although the samples that resumed
 * at 155°/162° proved he had extended inside it — and by set end nothing
 * was pending, so finalization had nothing to save. Now an interrupt
 * PARKS a peak-latched cycle per side; the parked cycle keeps collecting
 * return evidence from post-gap measured frames (the gap itself is
 * unknown evidence — no credit, no window advance, fresh evidence
 * demanded after it), and finalizeSetEnd settles it with the same
 * predicate as the live loop. Unlatched cycles keep the old wipe.
 *
 * The same round adds the attribution events the set-3 trace lacked:
 * wrapper freeze start/end and gate presence lost/found transitions, so
 * the next blackout can be blamed on a layer from the trace alone.
 *
 * Rigs mirror hammer-set-end.test.ts (per-side direct tracker) and
 * hammer-return-gate.test.ts (AdaptiveRecognition wrapper).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ExtendedExerciseTracker} from '../src/features/motion/lib/extendedRecognition';
import {AdaptiveRecognition} from '../src/features/motion/lib/adaptiveRecognition';
import {GateTraceBuffer} from '../src/features/motion/lib/gateTrace';
import type {PoseFrame} from '../src/features/motion/lib/poseProtocol';
import type {NormalizedLandmark as Point} from '@mediapipe/tasks-vision';

function elbowPoseLR(leftDeg:number,rightDeg:number):Point[]{
  const p:Point[]=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}));
  const put=(i:number,x:number,y:number)=>{p[i]={x,y,z:0,visibility:1};};
  put(0,.5,.16);
  for(const o of [0,1]){
    const deg=o===0?leftDeg:rightDeg;
    const sx=.40+o*.20,hx=.43+o*.14;
    put(11+o,sx,.30);put(23+o,hx,.56);put(25+o,hx,.74);put(27+o,hx,.92);put(13+o,sx,.48);
    const f=(180-deg)*Math.PI/180,dir=o?-1:1;
    put(15+o,sx+dir*.18*Math.sin(f),.48+.18*Math.cos(f));
  }
  return p;
}

function rig(rest=148){
  const tracker=new ExtendedExerciseTracker('hammer_curl',50,{},true);
  const step=1000/24;let t=0;let curL=rest,curR=rest;
  const send=(l:number,r:number)=>{const raw=elbowPoseLR(l,r);tracker.update(raw,t,1,structuredClone(raw));t+=step;};
  const hold=(l:number,r:number,ms:number)=>{const n=Math.max(1,Math.round(ms/step));for(let i=0;i<n;i++)send(l,r);curL=l;curR=r;};
  const rampBoth=(to:number,ms:number)=>{const fromL=curL,fromR=curR,n=Math.max(2,Math.round(ms/step));for(let i=1;i<=n;i++)send(fromL+(to-fromL)*i/n,fromR+(to-fromR)*i/n);curL=to;curR=to;};
  hold(rest,rest,2600);
  assert.equal(tracker.diagnostics.stage,'ready','calibration must latch');
  return {tracker,hold,rampBoth};
}

test('parked (a): set-3 shape — latched cycles survive a blackout and count at set end on post-gap extension',()=>{
  const r=rig(148);
  r.rampBoth(70,450);              // bilateral curl: both peaks latch
  r.rampBoth(89,450);              // partial return — still flexed, no qualifying credit (set 3 read 89° at the blackout)
  r.hold(89,89,200);
  r.tracker.interrupt();           // the blackout swallows the gate mid-return
  // Parked, not destroyed — and the record says how far the return had got.
  assert.deepEqual(r.tracker.gateCountersSnapshot().pendingCyclesLost,[0,0]);
  const losses=r.tracker.gateTraceSnapshot()!.events.filter(e=>e.k==='loss');
  assert.equal(losses.length,2);
  for(const e of losses){assert.equal(e.parked,true);assert.ok(e.retMax>=85&&e.retMax<=93,`retMax at park ${e.retMax}`);}
  // He re-appears at rest and the set re-latches; the post-gap samples at
  // ≥145° are the parked cycles' return evidence (set 3 resumed at 155/162°).
  r.hold(148,148,2600);
  r.hold(155,155,500);
  assert.equal(r.tracker.metrics.reps,0,'a parked cycle never counts mid-set');
  r.tracker.finalizeSetEnd();
  assert.equal(r.tracker.metrics.reps,1,'the parked bilateral cycle counts at set end');
  const c=r.tracker.gateCountersSnapshot();
  assert.deepEqual(c.returnsConfirmed,[1,1]);
  assert.deepEqual(c.parkedCyclesCredited,[1,1]);
  assert.deepEqual(c.parkedCyclesLost,[0,0]);
  const trace=r.tracker.gateTraceSnapshot();assert.ok(trace);
  const ends=trace.events.filter(e=>e.k==='end'&&e.parked);
  assert.equal(ends.length,2);
  for(const e of ends)assert.equal(e.counted,true);
  const summary=trace.events.filter(e=>e.k==='end'&&e.final);
  assert.equal(summary.length,1);
  assert.equal(summary[0].parkedSeen,2);assert.equal(summary[0].parkedCredited,2);assert.equal(summary[0].parkedDropped,0);
});

test('parked (b): blackout with no post-gap extension evidence — the parked cycles drop at set end',()=>{
  const r=rig(148);
  r.rampBoth(70,450);r.rampBoth(89,450);r.hold(89,89,200);
  r.tracker.interrupt();
  // Frames come back, but never the start pose: the set never re-latches,
  // no gated frame is ever processed again, and no sample ever shows the
  // arms extended — the parked cycles have only their pre-gap evidence
  // (qual 0), which satisfies nothing.
  r.hold(100,100,1500);
  r.tracker.finalizeSetEnd();
  assert.equal(r.tracker.metrics.reps,0);
  const c=r.tracker.gateCountersSnapshot();
  assert.deepEqual(c.parkedCyclesCredited,[0,0]);
  assert.deepEqual(c.parkedCyclesLost,[1,1]);
  const trace=r.tracker.gateTraceSnapshot();assert.ok(trace);
  const ends=trace.events.filter(e=>e.k==='end'&&e.parked);
  assert.equal(ends.length,2);
  for(const e of ends)assert.equal(e.counted,false);
  const summary=trace.events.filter(e=>e.k==='end'&&e.final);
  assert.equal(summary.length,1);
  assert.equal(summary[0].parkedSeen,2);assert.equal(summary[0].parkedDropped,2);
});

test('parked (c): an UNLATCHED cycle keeps the old loss behaviour — no park, no event, nothing to evaluate',()=>{
  const r=rig(148);
  r.rampBoth(70,150);   // dive into the peak zone and stop mid-zone: episodes open, nothing has latched
  r.tracker.interrupt();
  const trace0=r.tracker.gateTraceSnapshot();assert.ok(trace0);
  assert.equal(trace0.events.filter(e=>e.k==='loss').length,0,'an unlatched cycle leaves no loss event');
  assert.deepEqual(r.tracker.gateCountersSnapshot().pendingCyclesLost,[0,0]);
  r.tracker.finalizeSetEnd();
  assert.equal(r.tracker.metrics.reps,0);
  const summary=r.tracker.gateTraceSnapshot()!.events.filter(e=>e.k==='end'&&e.final);
  assert.equal(summary.length,1);
  assert.equal(summary[0].parkedSeen,0);
});

test('parked (c2): one slot per side — a second latched cycle that cannot park is lost exactly as before',()=>{
  const r=rig(148);
  r.rampBoth(70,450);r.rampBoth(89,450);r.hold(89,89,200);
  r.tracker.interrupt();                        // pair #1 parks
  r.hold(148,148,2600);                         // re-latch; pair #1 starts collecting extension credit
  r.rampBoth(72,450);r.rampBoth(95,450);r.hold(95,95,150);   // pair #2 latches, partial return
  r.tracker.interrupt();                        // slots occupied → pair #2 is destroyed
  assert.deepEqual(r.tracker.gateCountersSnapshot().pendingCyclesLost,[1,1]);
  const losses=r.tracker.gateTraceSnapshot()!.events.filter(e=>e.k==='loss');
  assert.equal(losses.length,4);
  assert.deepEqual(losses.map(e=>e.parked),[true,true,false,false]);
  r.hold(148,148,2600);r.hold(155,155,500);     // re-latch again; more extension evidence for pair #1
  r.tracker.finalizeSetEnd();
  assert.equal(r.tracker.metrics.reps,1,'only the parked pair can count');
  const c=r.tracker.gateCountersSnapshot();
  assert.deepEqual(c.parkedCyclesCredited,[1,1]);
  assert.deepEqual(c.parkedCyclesLost,[0,0]);
});

test('parked (d): an uninterrupted set is untouched — no parks, no transition events, the summary still records the call',()=>{
  const r=rig(148);
  r.rampBoth(70,450);r.rampBoth(150,450);r.hold(150,150,600);
  assert.equal(r.tracker.metrics.reps,1);
  r.tracker.finalizeSetEnd();
  assert.equal(r.tracker.metrics.reps,1);
  const c=r.tracker.gateCountersSnapshot();
  assert.deepEqual(c.parkedCyclesCredited,[0,0]);
  assert.deepEqual(c.parkedCyclesLost,[0,0]);
  assert.deepEqual(c.pendingCyclesLost,[0,0]);
  const trace=r.tracker.gateTraceSnapshot();assert.ok(trace);
  assert.equal(trace.events.filter(e=>e.k==='freeze'||e.k==='presence').length,0);
  const summary=trace.events.filter(e=>e.k==='end'&&e.final);
  assert.equal(summary.length,1);
  assert.equal(summary[0].parkedSeen,0);assert.equal(summary[0].pendingFlushed,false);
});

test('trace attribution: an interrupt and the next measured frame bracket the blackout as presence lost → found',()=>{
  const r=rig(148);
  r.tracker.interrupt('画面中断');
  r.hold(148,148,100);   // the first measured frames after the loss re-acquire
  const trace=r.tracker.gateTraceSnapshot();assert.ok(trace);
  const presence=trace.events.filter(e=>e.k==='presence');
  assert.equal(presence.length,2);
  assert.equal(presence[0].phase,'lost');
  assert.equal(presence[0].reason,'画面中断');
  assert.equal(presence[1].phase,'found');
  assert.ok(presence[1].t>presence[0].t,`found ${presence[1].t} after lost ${presence[0].t}`);
});

/** Production-path rig: AdaptiveRecognition over elbowPose PoseFrames
 * (mirrors hammer-return-gate.test.ts). */
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

test('trace attribution: a wrapper evidence freeze brackets as freeze start → end and never touches presence',()=>{
  const r=wrapperRig();
  r.ramp(70,700);r.hold(70,250);
  r.ramp(150,700);r.hold(150,50);
  r.freeze(400);
  r.hold(150,900);
  assert.equal(r.engine.metrics.reps,1,'the frozen-mid-return rep still completes as before');
  const trace=r.engine.gateTraceSnapshot();assert.ok(trace);
  const freezes=trace.events.filter(e=>e.k==='freeze');
  assert.equal(freezes.length,2);
  assert.equal(freezes[0].phase,'start');
  assert.equal(freezes[1].phase,'end');
  assert.ok(freezes[1].t-freezes[0].t>=300,`freeze span ${freezes[1].t-freezes[0].t}`);
  assert.equal(trace.events.filter(e=>e.k==='presence').length,0,'a pure freeze never interrupts the gate');
});

test('trace buffer: duplicate transitions coalesce and the event cap evicts transitions before cycle records',()=>{
  const buf=new GateTraceBuffer();
  buf.push(1000,150,150,1,0,0,0,0);
  buf.addEvent({k:'presence',t:1000,phase:'lost',reason:'x'});
  buf.addEvent({k:'presence',t:1010,phase:'lost',reason:'y'});   // same kind+phase as the last event: dropped
  buf.addEvent({k:'presence',t:1020,phase:'found'});
  const snap=buf.snapshot('hammer_curl');assert.ok(snap);
  assert.deepEqual(snap.events.map(e=>e.phase),['lost','found']);

  const buf2=new GateTraceBuffer();
  buf2.push(1000,150,150,1,0,0,0,0);
  buf2.addEvent({k:'loss',t:1000,side:0,kept:false,parked:true,peakElbow:76,qualMs:0,retMax:89});
  for(let i=0;i<100;i++)buf2.addEvent({k:'freeze',t:2000+i*100,phase:i%2?'end':'start'});
  const snap2=buf2.snapshot('hammer_curl');assert.ok(snap2);
  assert.ok(snap2.events.length<=64,`events ${snap2.events.length}`);
  assert.ok(snap2.events.some(e=>e.k==='loss'),'the cycle record survives a transition flood');
});
