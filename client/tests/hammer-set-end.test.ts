/**
 * Hammer set-end finalization (round 3, 2026-11-15): when the user ends the
 * set, the gate first settles what its already-collected samples prove —
 * a completed return still parked in the 600 ms pairing window is flushed
 * and counted; a pending cycle whose samples satisfy the return rule is
 * completed through the same pairing path; anything short of the rule —
 * including a return truncated by tracking loss — stays uncounted. No
 * evidence is ever manufactured at set end.
 *
 * Rig mirrors hammer-return-gate.test.ts, extended with per-side angles so
 * unilateral reps can park a pending single.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ExtendedExerciseTracker} from '../src/features/motion/lib/extendedRecognition';
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
  const rampSide=(side:0|1,to:number,ms:number)=>{const fromL=curL,fromR=curR,n=Math.max(2,Math.round(ms/step));for(let i=1;i<=n;i++){const v=(side===0?fromL:fromR)+(to-(side===0?fromL:fromR))*i/n;send(side===0?v:fromL,side===1?v:fromR);}if(side===0)curL=to;else curR=to;};
  const rampBoth=(to:number,ms:number)=>{const fromL=curL,fromR=curR,n=Math.max(2,Math.round(ms/step));for(let i=1;i<=n;i++)send(fromL+(to-fromL)*i/n,fromR+(to-fromR)*i/n);curL=to;curR=to;};
  hold(rest,rest,2600);
  assert.equal(tracker.diagnostics.stage,'ready','calibration must latch');
  return {tracker,hold,rampSide,rampBoth};
}

test('set end: a completed return parked in the pairing window is flushed and counted',()=>{
  const r=rig(148);
  // One side only: curl and fully return. Its completion parks as the
  // pending single (no pair partner); without finalization it would wait
  // for a frame 600 ms later that a stopped set never sends.
  r.rampSide(0,70,450);r.rampSide(0,150,450);r.hold(150,148,600);
  assert.deepEqual(r.tracker.gateCountersSnapshot().returnsConfirmed,[1,0]);
  assert.equal(r.tracker.metrics.reps,0,'still parked before set end');
  r.tracker.finalizeSetEnd();
  assert.equal(r.tracker.metrics.reps,1,'the parked completion counts at set end');
});

test('set end: staggered unilateral reps — the in-loop single emits, the parked one flushes at set end',()=>{
  const r=rig(148);
  r.rampSide(0,70,450);r.rampSide(0,150,450);r.hold(150,148,600);   // side 0 completes, parks
  r.rampSide(1,70,450);r.rampSide(1,150,450);r.hold(148,150,600);   // side 1 completes: side 0 emits as a single, side 1 parks
  assert.equal(r.tracker.metrics.reps,1);
  r.tracker.finalizeSetEnd();
  assert.equal(r.tracker.metrics.reps,2);
});

test('set end: a pending cycle whose return never reached the rule is NOT counted, and the evaluation is on the record',()=>{
  const r=rig(148);
  r.rampBoth(70,450);r.rampBoth(140,450);r.hold(140,140,600); // returns to 140° only — below the absolute 145°
  r.tracker.finalizeSetEnd();
  assert.equal(r.tracker.metrics.reps,0);
  assert.deepEqual(r.tracker.gateCountersSnapshot().returnsConfirmed,[0,0]);
  const trace=r.tracker.gateTraceSnapshot();
  assert.ok(trace);
  const ends=trace.events.filter(e=>e.k==='end'&&!e.final);
  assert.equal(ends.length,2);
  for(const e of ends){assert.equal(e.counted,false);assert.ok(e.retMax>=138&&e.retMax<=142,`retMax ${e.retMax}`);}
  // Round 4: the call also left its summary record — finalization ran,
  // and there was nothing parked for it to settle.
  const summary=trace.events.filter(e=>e.k==='end'&&e.final);
  assert.equal(summary.length,1);
  assert.equal(summary[0].parkedSeen,0);
});

test('set end: a return truncated by tracking loss stays uncounted — loss creates no evidence',()=>{
  const r=rig(148);
  r.rampBoth(70,450);r.rampBoth(150,450);r.hold(150,150,100); // ~100 ms of qualifying dwell: honestly short of 150 ms
  r.tracker.interrupt(); // tracking loss: round 4 PARKS the pending cycles instead of destroying them
  // Parked, not lost: no loss tally, and the loss events say so.
  assert.deepEqual(r.tracker.gateCountersSnapshot().pendingCyclesLost,[0,0]);
  const trace0=r.tracker.gateTraceSnapshot();
  assert.ok(trace0);
  const losses=trace0.events.filter(e=>e.k==='loss');
  assert.equal(losses.length,2);
  for(const e of losses){assert.equal(e.kept,false);assert.equal(e.parked,true);assert.ok(e.qualMs>0&&e.qualMs<150,`qual at loss ${e.qualMs}`);}
  // No post-gap evidence ever arrives, so finalization evaluates the
  // parked cycles on their pre-gap samples alone: ~100 ms is short of
  // the rule and stays uncounted — parking preserves the QUESTION, it
  // does not manufacture the answer.
  r.tracker.finalizeSetEnd();
  assert.equal(r.tracker.metrics.reps,0);
  assert.deepEqual(r.tracker.gateCountersSnapshot().returnsConfirmed,[0,0]);
  assert.deepEqual(r.tracker.gateCountersSnapshot().parkedCyclesCredited,[0,0]);
  assert.deepEqual(r.tracker.gateCountersSnapshot().parkedCyclesLost,[1,1]);
  const trace=r.tracker.gateTraceSnapshot();
  assert.ok(trace);
  const ends=trace.events.filter(e=>e.k==='end'&&e.parked);
  assert.equal(ends.length,2);
  for(const e of ends)assert.equal(e.counted,false);
  const summary=trace.events.filter(e=>e.k==='end'&&e.final);
  assert.equal(summary.length,1);
  assert.equal(summary[0].parkedSeen,2);assert.equal(summary[0].parkedCredited,0);assert.equal(summary[0].parkedDropped,2);
});

test('set end: finalization is a no-op for other exercises and before any frame',()=>{
  const other=new ExtendedExerciseTracker('seated_curl',10);
  assert.equal(other.finalizeSetEnd(),false);
  const fresh=new ExtendedExerciseTracker('hammer_curl',10);
  assert.equal(fresh.finalizeSetEnd(),false);
  assert.equal(fresh.metrics.reps,0);
});
