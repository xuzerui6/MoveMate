import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {NormalizedLandmark as Point} from '@mediapipe/tasks-vision';
import {createRecognitionTracker} from '../src/features/motion/lib/recognition';
import {adaptiveEligible} from '../src/features/motion/lib/adaptiveRecognition';
import {libraryPose} from './fixtures/library-camera';

/** Synthetic landmark replays for the tier-2 recognition expansion
 * (2026-11-08): seven new cycle definitions. Labelled replay only, never a
 * claim of real-camera validation. Clean/half/static behaviour per entry,
 * plus the alternation gate for mountain climbers and stance switching for
 * split squats. */
const lib=(type:string,stage:'neutral'|'peak'='neutral')=>libraryPose(type,stage).landmarks as Point[];
function run(type:string){
  const tracker=createRecognitionTracker(type,20);let now=0;
  const feed=(pose:Point[],ms=1200)=>{for(let t=0;t<ms;t+=100){now+=100;tracker.update(pose,now,1,null);}};
  const cycle=(peak:Point[],neutral:Point[])=>{feed(peak);feed(neutral);};
  return {tracker,feed,cycle,calibrate:(neutral:Point[])=>feed(neutral,3200)};
}
const blank=():Point[]=>Array.from({length:33},()=>({x:.5,y:.2,z:0,visibility:1}));
const put=(p:Point[],i:number,x:number,y:number)=>{p[i]={x,y,z:0,visibility:1};};

// --- lying leg raise (0620) -------------------------------------------------
test('lying leg raise: clean cycles count; a half lift and a sit-up do not',()=>{
  const r=run('lying_leg_raise'),n=lib('lying_leg_raise'),pk=lib('lying_leg_raise','peak');
  r.calibrate(n);assert.ok(r.tracker.metrics.poseFeedback.calibrated,r.tracker.metrics.feedback);
  r.cycle(pk,n);r.cycle(pk,n);assert.equal(r.tracker.metrics.reps,2);
  assert.equal(r.tracker.metrics.scoreAccumulator.count,2);
  // Half lift: legs stop at hip ≈115°, short of the ≤100° peak.
  const half=blank();
  for(const o of [0,1]){const d=o*.02;put(half,11+o,.22+d,.55);put(half,13+o,.20+d,.68);put(half,15+o,.30+d,.72);put(half,23+o,.48+d,.57);put(half,25+o,.60+d,.36);put(half,27+o,.78+d,.16);}
  r.cycle(half,n);assert.equal(r.tracker.metrics.reps,2);
  // Legs fully up but the torso curls with them (sit-up): the shoulder/hip
  // centre leaves the calibrated baseline — a form rejection, not a rep.
  const situp=pk.map(q=>({...q}));for(const o of [0,1]){situp[11+o]={...situp[11+o],x:.36+o*.02,y:.46};}
  r.cycle(situp,n);assert.equal(r.tracker.metrics.reps,2);
});

// --- upright row (0437) ------------------------------------------------------
test('upright row: clean cycles count; a half pull and a shrug do not',()=>{
  const r=run('upright_row'),n=lib('upright_row'),pk=lib('upright_row','peak');
  r.calibrate(n);assert.ok(r.tracker.metrics.poseFeedback.calibrated,r.tracker.metrics.feedback);
  r.cycle(pk,n);r.cycle(pk,n);assert.equal(r.tracker.metrics.reps,2);
  // Half pull: elbows only reach ≈140°, wrists stay below the hip line.
  const half=blank();
  for(const o of [0,1]){const d=o*.12;put(half,11+o,.44+d,.30);put(half,23+o,.45+d,.55);put(half,25+o,.45+d,.74);put(half,27+o,.45+d,.90);put(half,13+o,.40+d,.38);put(half,15+o,.43+d,.50);}
  r.cycle(half,n);assert.equal(r.tracker.metrics.reps,2);
  // Shrug only: wrists rise a little with straight elbows — neither the
  // elbow gate nor the hand-rise gate is met.
  const shrug=blank();
  for(const o of [0,1]){const d=o*.12;put(shrug,11+o,.44+d,.30);put(shrug,23+o,.45+d,.55);put(shrug,25+o,.45+d,.74);put(shrug,27+o,.45+d,.90);put(shrug,13+o,.435+d,.44);put(shrug,15+o,.44+d,.44);}
  r.cycle(shrug,n);assert.equal(r.tracker.metrics.reps,2);
  // Static peak pose from the start never calibrates, so it cannot count.
  const s=run('upright_row');s.feed(pk,3200);assert.equal(s.tracker.metrics.poseFeedback.calibrated,false);s.cycle(pk,n);assert.equal(s.tracker.metrics.reps,0);
});

// --- mountain climbers (0630) ------------------------------------------------
type LegState='ext'|'tuck';
function climberPose(left:LegState,right:LegState):Point[]{
  const p=blank();
  for(const o of [0,1]){const d=o*.02;put(p,11+o,.28+d,.40);put(p,13+o,.29+d,.58);put(p,15+o,.30+d,.76);put(p,23+o,.50+d,.43);
    const st=o===0?left:right;
    if(st==='tuck'){put(p,25+o,.36+d,.58);put(p,27+o,.48+d,.76);}
    else{put(p,25+o,.70+d,.46);put(p,27+o,.88+d,.50);}}
  return p;
}
test('mountain climbers: alternating drives count per side without double-counting',()=>{
  const r=run('mountain_climber'),n=climberPose('ext','ext');
  r.calibrate(n);assert.ok(r.tracker.metrics.poseFeedback.calibrated,r.tracker.metrics.feedback);
  // One long left tuck is one drive, not several.
  r.feed(climberPose('tuck','ext'),2400);r.feed(n);assert.equal(r.tracker.metrics.reps,1);
  assert.equal(r.tracker.metrics.scoreAccumulator.leftReps,1);
  r.cycle(climberPose('ext','tuck'),n);assert.equal(r.tracker.metrics.reps,2);
  assert.equal(r.tracker.metrics.scoreAccumulator.rightReps,1);
  r.cycle(climberPose('tuck','ext'),n);assert.equal(r.tracker.metrics.reps,3);
  assert.equal(r.tracker.metrics.scoreAccumulator.leftReps,2);
  // The alternating partner stayed extended at each peak: coordination axis high.
  assert.ok(r.tracker.metrics.formBreakdown.symmetry>=90,`symmetry ${r.tracker.metrics.formBreakdown.symmetry}`);
});
test('mountain climbers: both legs tucked together is not an alternating drive',()=>{
  const r=run('mountain_climber'),n=climberPose('ext','ext');
  r.calibrate(n);
  r.cycle(climberPose('tuck','tuck'),n);
  assert.equal(r.tracker.metrics.reps,0);
  // And alternating still works afterwards.
  r.cycle(climberPose('tuck','ext'),n);assert.equal(r.tracker.metrics.reps,1);
});
test('mountain climbers: standing knee drives are rejected — no plank, no count',()=>{
  const p=blank();
  for(const o of [0,1]){put(p,11+o,.45,.18);put(p,13+o,.45,.36);put(p,15+o,.45,.54);put(p,23+o,.46,.46);put(p,25+o,.46,.68);put(p,27+o,.46,.90);}
  const r=run('mountain_climber');r.feed(p,3200);
  assert.equal(r.tracker.metrics.poseFeedback.calibrated,false);
  assert.match(r.tracker.metrics.feedback,/俯撑/);
  const tucked=p.map(q=>({...q}));put(tucked,25,.36,.52);put(tucked,27,.48,.68);
  r.cycle(tucked,p);assert.equal(r.tracker.metrics.reps,0);
});

// --- split squat (0410) -------------------------------------------------------
// Switching stance = exchanging the two leg chains (the right leg steps
// forward); merely mirroring the frame would keep the same leg in front.
const swapLegs=(pose:Point[])=>{const out=pose.map(q=>({...q}));for(const [a,b] of [[23,24],[25,26],[27,28],[29,30],[31,32]] as const){out[a]={...pose[b]};out[b]={...pose[a]};}return out;};
test('split squat: front-leg cycles count per stance side; switching stance switches the counted leg',()=>{
  const r=run('split_squat'),n=lib('split_squat'),pk=lib('split_squat','peak');
  r.calibrate(n);assert.ok(r.tracker.metrics.poseFeedback.calibrated,r.tracker.metrics.feedback);
  r.cycle(pk,n);r.cycle(pk,n);assert.equal(r.tracker.metrics.reps,2);
  assert.equal(r.tracker.metrics.scoreAccumulator.leftReps,2);
  assert.equal(r.tracker.metrics.scoreAccumulator.rightReps||0,0);
  // Swap the stance: the right leg becomes the front leg and counts.
  r.cycle(swapLegs(pk),swapLegs(n));assert.equal(r.tracker.metrics.reps,3);
  assert.equal(r.tracker.metrics.scoreAccumulator.rightReps,1);
});
test('split squat: a rear-leg-only dip cannot count, and a mid-cycle stance swap voids the abandoned half rep',()=>{
  const r=run('split_squat'),n=lib('split_squat'),pk=lib('split_squat','peak');
  r.calibrate(n);
  // Body sinks on the rear leg only: front knee stays ≈173°.
  const rearDip=blank();
  for(const o of [0,1]){put(rearDip,11+o,.46+o*.03,.30);put(rearDip,13+o,.45+o*.03,.46);put(rearDip,15+o,.45+o*.03,.62);}
  put(rearDip,23,.44,.52);put(rearDip,24,.52,.52);put(rearDip,25,.475,.71);put(rearDip,27,.50,.90);
  put(rearDip,26,.40,.68);put(rearDip,28,.24,.62);put(rearDip,29,.46,.905);put(rearDip,31,.55,.905);put(rearDip,30,.20,.625);put(rearDip,32,.29,.625);
  r.cycle(rearDip,n);assert.equal(r.tracker.metrics.reps,0);
  // Start a left-front descent, swap stance mid-way, finish on the right:
  // only the right rep lands.
  r.feed(pk,600);r.feed(swapLegs(n),600);r.cycle(swapLegs(pk),swapLegs(n));
  assert.equal(r.tracker.metrics.reps,1);
  assert.equal(r.tracker.metrics.scoreAccumulator.rightReps,1);
  assert.equal(r.tracker.metrics.scoreAccumulator.leftReps||0,0);
});

// --- seated calf raise (1379) --------------------------------------------------
test('seated calf raise: seated cycles count; a standing pose is not a seat, a half raise does not count',()=>{
  const r=run('seated_calf_raise'),n=lib('seated_calf_raise'),pk=lib('seated_calf_raise','peak');
  r.calibrate(n);assert.ok(r.tracker.metrics.poseFeedback.calibrated,r.tracker.metrics.feedback);
  r.cycle(pk,n);r.cycle(pk,n);assert.equal(r.tracker.metrics.reps,2);
  assert.equal(r.tracker.metrics.scoreAccumulator.count,2);
  // Half raise: heel lift ratio ≈0.13, below the 0.16 peak gate.
  const half=n.map(q=>({...q}));for(const o of [0,1]){half[29+o]={...half[29+o],y:.848};half[27+o]={...half[27+o],y:.752};}
  r.cycle(half,n);assert.equal(r.tracker.metrics.reps,2);
  // Standing with straight knees never satisfies the seated sample.
  const s=run('seated_calf_raise');s.feed(lib('barbell_good_morning'),3200);
  assert.equal(s.tracker.metrics.poseFeedback.calibrated,false);
  assert.match(s.tracker.metrics.feedback,/坐/);
});

// --- barbell good morning (0044) ----------------------------------------------
test('barbell good morning: hinge cycles count through the romanian definition; a knee-bent squat hinge is rejected',()=>{
  const r=run('barbell_good_morning'),n=lib('barbell_good_morning'),pk=lib('barbell_good_morning','peak');
  r.calibrate(n);assert.ok(r.tracker.metrics.poseFeedback.calibrated,r.tracker.metrics.feedback);
  r.cycle(pk,n);r.cycle(pk,n);assert.equal(r.tracker.metrics.reps,2);
  assert.equal(r.tracker.metrics.scoreAccumulator.count,2);
  // Same hip hinge but the knees fold to ≈117°: the romanian knee guard
  // (form rejection below 135°) interrupts instead of counting.
  const squatty=blank();
  for(const o of [0,1]){const d=o*.02;put(squatty,11+o,.72+d,.40);put(squatty,23+o,.47+d,.53);put(squatty,13+o,.70+d,.54);put(squatty,15+o,.68+d,.68);put(squatty,25+o,.60+d,.68);put(squatty,27+o,.51+d,.90);}
  r.cycle(squatty,n);assert.equal(r.tracker.metrics.reps,2);
});

// --- bench dip (0129) -----------------------------------------------------------
test('bench dip: clean cycles count; a shallow dip (elbows ≈148°) does not',()=>{
  const r=run('bench_dip'),n=lib('bench_dip'),pk=lib('bench_dip','peak');
  r.calibrate(n);assert.ok(r.tracker.metrics.poseFeedback.calibrated,r.tracker.metrics.feedback);
  r.cycle(pk,n);r.cycle(pk,n);assert.equal(r.tracker.metrics.reps,2);
  assert.equal(r.tracker.metrics.scoreAccumulator.count,2);
  // Shoulders drop but the elbows stay near-straight: the elbow gate blocks.
  const half=blank();
  for(const o of [0,1]){const d=o*.02;put(half,11+o,.40+d,.355);put(half,23+o,.45+d,.565);put(half,25+o,.63+d,.575);put(half,27+o,.64+d,.88);put(half,13+o,.315+d,.46);put(half,15+o,.30+d,.58);}
  r.cycle(half,n);assert.equal(r.tracker.metrics.reps,2);
  // Static peak from the start never calibrates.
  const s=run('bench_dip');s.feed(pk,3200);assert.equal(s.tracker.metrics.poseFeedback.calibrated,false);
});

// --- adaptive eligibility -------------------------------------------------------
test('tier-2 adaptive eligibility: only the isomorphic romanian clone joins; new definitions stay legacy',()=>{
  // exdb:0044 is routed onto the romanian_deadlift definition itself (the
  // survey's explicit isomorphic clone), so its profile name is eligible
  // exactly like tier 1's dumbbell_deadlift bind. The other six are new
  // cycle definitions and stay on the legacy path.
  assert.equal(adaptiveEligible('barbell_good_morning'),true);
  for(const type of ['lying_leg_raise','upright_row','mountain_climber','split_squat','seated_calf_raise','bench_dip'])assert.equal(adaptiveEligible(type),false,type);
});
