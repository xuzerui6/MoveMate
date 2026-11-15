/**
 * Hammer gate trace (round 3, 2026-11-15): the per-sample live capture that
 * rides the diagnostics payload with the gate counters. Covers completeness
 * (phases / angles / return-credit progress reconstruct a rep), the hard
 * caps (ring tail-keep at 2400 samples), and the tracking-loss
 * pending-cycle events + counters.
 *
 * Rig mirrors hammer-return-gate.test.ts (elbowPose fixtures, prefiltered
 * direct tracker, 24 fps frame steps).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ExtendedExerciseTracker} from '../src/features/motion/lib/extendedRecognition';
import type {NormalizedLandmark as Point} from '@mediapipe/tasks-vision';

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

function rig(rest=148){
  const tracker=new ExtendedExerciseTracker('hammer_curl',50,{},true);
  const step=1000/24;let t=0,cur=rest;
  const send=(deg:number)=>{const raw=elbowPose(deg);tracker.update(raw,t,1,structuredClone(raw));t+=step;};
  const hold=(deg:number,ms:number)=>{const n=Math.max(1,Math.round(ms/step));for(let i=0;i<n;i++)send(deg);cur=deg;};
  const ramp=(to:number,ms:number)=>{const from=cur,n=Math.max(2,Math.round(ms/step));for(let i=1;i<=n;i++)send(from+(to-from)*i/n);cur=to;};
  hold(rest,2600);
  assert.equal(tracker.diagnostics.stage,'ready','calibration must latch');
  return {tracker,hold,ramp,now:()=>t};
}

test('gate trace: a full rep is reconstructible — phases, angles and return credit all appear',()=>{
  const r=rig(148);
  r.ramp(70,450);r.ramp(150,450);r.hold(150,600);
  assert.equal(r.tracker.metrics.reps,1);
  const trace=r.tracker.gateTraceSnapshot();
  assert.ok(trace);assert.equal(trace.type,'hammer_curl');assert.equal(trace.v,1);
  assert.ok(trace.samples.length>30,`samples ${trace.samples.length}`);
  assert.equal(trace.t0,trace.samples[0][0]);
  for(let i=1;i<trace.samples.length;i++)assert.ok(trace.samples[i][0]>trace.samples[i-1][0]);
  const leftAngles=trace.samples.map(s=>s[1]);
  assert.ok(Math.max(...leftAngles)>=145,`max ${Math.max(...leftAngles)}`);
  assert.ok(Math.min(...leftAngles)<=82,`min ${Math.min(...leftAngles)}`);
  assert.ok(trace.samples.some(s=>s[4]===3),'a latched sample exists');
  assert.ok(trace.samples.some(s=>s[4]===4),'a completion sample exists');
  assert.ok(trace.samples.some(s=>s[5]>0),'return credit progress is recorded');
  assert.equal(trace.dropped,0);
});

test('gate trace: the 2400-sample cap tail-keeps — a long set keeps its END, not its start',()=>{
  const r=rig(148);
  r.hold(148,140000); // ~3360 gated frames at 24 fps, far beyond the cap
  r.hold(100,200);    // a distinctive tail the retained window must end with
  const trace=r.tracker.gateTraceSnapshot();
  assert.ok(trace);
  assert.equal(trace.samples.length,2400);
  assert.ok(trace.dropped>0,`dropped ${trace.dropped}`);
  const last=trace.samples[trace.samples.length-1];
  assert.ok(Math.abs(last[1]-100)<3,`tail sample angle ${last[1]}`);
  assert.ok(last[0]>trace.samples[0][0]);
});

test('gate trace: an interrupt over a pending cycle records a loss event; preserved cycles are kept, unpreserved ones are PARKED (round 4), not tallied lost',()=>{
  // Preserved: the bounded form-interrupt path keeps the cycle — event with
  // kept=true, no tally.
  const kept=rig(148);
  kept.ramp(70,450);kept.ramp(150,450);kept.hold(150,100);
  kept.tracker.interrupt('form','form',{preserveHammerCycle:true});
  const keptTrace=kept.tracker.gateTraceSnapshot();
  assert.ok(keptTrace);
  const keptEvents=keptTrace.events.filter(e=>e.k==='loss');
  assert.equal(keptEvents.length,2); // both sides were latched
  assert.ok(keptEvents.every(e=>e.kept===true));
  assert.deepEqual(kept.tracker.gateCountersSnapshot().pendingCyclesLost,[0,0]);

  // Parked: a hard interrupt over a mid-return cycle no longer destroys
  // it — the loss event records parked=true and NO loss tally moves;
  // set-end finalization (not run here) is the parked cycle's evaluator,
  // so neither parked tally has moved yet either.
  const lost=rig(148);
  lost.ramp(70,450);lost.ramp(150,450);lost.hold(150,100);
  lost.tracker.interrupt();
  const lostTrace=lost.tracker.gateTraceSnapshot();
  assert.ok(lostTrace);
  const lossEvents=lostTrace.events.filter(e=>e.k==='loss');
  assert.equal(lossEvents.length,2);
  for(const e of lossEvents){
    assert.equal(e.kept,false);
    assert.equal(e.parked,true);
    assert.ok(e.qualMs>0&&e.qualMs<150,`qual at loss ${e.qualMs}`); // partial credit, honestly short
    assert.ok(e.retMax>=145,`return max at loss ${e.retMax}`);
    assert.ok(e.peakElbow<=82,`peak at loss ${e.peakElbow}`);
  }
  assert.deepEqual(lost.tracker.gateCountersSnapshot().pendingCyclesLost,[0,0]);
  assert.deepEqual(lost.tracker.gateCountersSnapshot().parkedCyclesCredited,[0,0]);
  assert.deepEqual(lost.tracker.gateCountersSnapshot().parkedCyclesLost,[0,0]);
});

test('gate trace: non-hammer exercises record nothing',()=>{
  const tracker=new ExtendedExerciseTracker('seated_curl',10);
  assert.equal(tracker.gateTraceSnapshot(),null);
});
