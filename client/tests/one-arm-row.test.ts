import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {NormalizedLandmark as Point} from '@mediapipe/tasks-vision';
import {createRecognitionTracker} from '../src/features/motion/lib/recognition';

/** Synthetic landmarks for the tier-1 one-arm row (exdb:0292): bent-over torso
 * from the bent_over_row fixture geometry, arms driven per side. The working
 * side cycles hang (elbow ≈180°) → pulled (elbow ≤100°); the support side is
 * scripted independently. Labelled replay only, never real-camera evidence. */
type ArmState='hang'|'pulled'|'half';
function rowPose(left:ArmState,right:ArmState,upright=false):Point[]{
  const p:Point[]=Array.from({length:33},()=>({x:.5,y:.2,z:0,visibility:1}));
  const put=(i:number,x:number,y:number)=>{p[i]={x,y,z:0,visibility:1};};
  for(const o of [0,1]){
    const d=o*.07,sx=upright?.44:0.58,sy=upright?.20:.38;
    put(11+o,sx+d,sy+o*.02);put(23+o,.40+d,.55+o*.02);put(25+o,.40+d,.74+o*.02);put(27+o,.40+d,.90);
    const state=o===0?left:right;
    if(state==='pulled'){put(13+o,sx-.12+d,sy-.15+o*.02);put(15+o,sx-.03+d,sy-.09+o*.02);}
    else if(state==='half'){put(13+o,sx+d,sy+.14+o*.02);put(15+o,sx-.121+d,sy+.21+o*.02);}
    else{put(13+o,sx+d,sy+.14+o*.02);put(15+o,sx+d,sy+.28+o*.02);}
  }
  return p;
}
function run(){
  const tracker=createRecognitionTracker('one_arm_row',20);let now=0;
  const feed=(pose:Point[],ms=1200)=>{for(let t=0;t<ms;t+=100){now+=100;tracker.update(pose,now,1,null);}};
  const cycle=(working:'left'|'right')=>{feed(rowPose(working==='left'?'pulled':'hang',working==='right'?'pulled':'hang'));feed(rowPose('hang','hang'));};
  return {tracker,feed,cycle,calibrate:()=>feed(rowPose('hang','hang'),3200)};
}

test('one-arm row: clean reps count per working side; the still support side never counts',()=>{
  const r=run();r.calibrate();assert.ok(r.tracker.metrics.poseFeedback.calibrated,r.tracker.metrics.feedback);
  for(let i=0;i<3;i++){r.cycle('left');assert.equal(r.tracker.metrics.reps,i+1,r.tracker.metrics.feedback);}
  assert.equal(r.tracker.metrics.scoreAccumulator.count,3);
  assert.equal(r.tracker.metrics.scoreAccumulator.leftReps,3);
  assert.equal(r.tracker.metrics.scoreAccumulator.rightReps||0,0);
  // A disciplined support arm keeps the support-stability axis high.
  assert.ok(r.tracker.metrics.formBreakdown.symmetry>=90,`symmetry ${r.tracker.metrics.formBreakdown.symmetry}`);
});

test('one-arm row: switching the working side between reps counts each side once',()=>{
  const r=run();r.calibrate();
  r.cycle('left');assert.equal(r.tracker.metrics.reps,1);
  r.cycle('right');assert.equal(r.tracker.metrics.reps,2);
  r.cycle('right');assert.equal(r.tracker.metrics.reps,3);
  assert.equal(r.tracker.metrics.scoreAccumulator.leftReps,1);
  assert.equal(r.tracker.metrics.scoreAccumulator.rightReps,2);
});

test('one-arm row: a half pull (elbow ≈120°) does not count',()=>{
  const r=run();r.calibrate();
  r.feed(rowPose('half','hang'));r.feed(rowPose('hang','hang'));
  r.feed(rowPose('hang','half'));r.feed(rowPose('hang','hang'));
  assert.equal(r.tracker.metrics.reps,0);
});

test('one-arm row: rowing upright is rejected as a form error, not counted',()=>{
  const r=run();
  r.feed(rowPose('hang','hang',true),3200);
  assert.equal(r.tracker.metrics.poseFeedback.calibrated,false);
  assert.match(r.tracker.metrics.feedback,/俯身/);
  r.feed(rowPose('pulled','hang',true));r.feed(rowPose('hang','hang',true));
  assert.equal(r.tracker.metrics.reps,0);
});

test('one-arm row: a wandering support arm cannot block or fake the rep, but costs support stability',()=>{
  const r=run();r.calibrate();
  // Support side flexes to ≈120° while the working side pulls: no rep for the
  // support side, the working rep still lands, and the fourth axis drops.
  r.feed(rowPose('pulled','half'));r.feed(rowPose('hang','hang'));
  assert.equal(r.tracker.metrics.reps,1);
  assert.equal(r.tracker.metrics.scoreAccumulator.rightReps||0,0);
  assert.ok(r.tracker.metrics.formBreakdown.symmetry<50,`symmetry ${r.tracker.metrics.formBreakdown.symmetry}`);
});
