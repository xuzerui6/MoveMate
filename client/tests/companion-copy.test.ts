import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  BANNED_COPY_WORDS,
  buildSetReveal,
  milestoneLine,
  repDoneLine,
  workoutDoneLine,
  COPY_CALIBRATION_PAUSED,
  COPY_CALIBRATED,
  COPY_HALF_REP,
  COPY_HINT_RANGE,
  COPY_HINT_TEMPO,
  COPY_HINT_UPPER_ARM,
  COPY_NOT_SEEN,
  COPY_OUT_OF_FRAME,
  COPY_SUBJECT_SWITCH,
  COPY_PEAK_CURL,
  COPY_SET_BETTER,
  COPY_SET_WORSE,
  COPY_UNCLEAR,
  COPY_WAIT_START,
  COPY_WORKOUT_DONE,
  COPY_DEPTH_SHALLOW_LIMIT,
} from '../src/features/motion/lib/companionCopy';
import {POSE_ISSUE_COPY} from '../src/features/motion/lib/poseFeedback';
import {jointTier, segmentGrade} from '../src/features/motion/lib/displayPose';

const AXES=['屈肘幅度','上臂控制','躯干稳定','双臂协调'];
const fb=(depth:number,stability:number,trunk:number,symmetry:number)=>({depth,stability,trunk,symmetry});

test('companion copy never uses banned engineering words',()=>{
  const lines=[COPY_CALIBRATION_PAUSED,COPY_CALIBRATED,COPY_HALF_REP,COPY_HINT_RANGE,COPY_HINT_TEMPO,COPY_HINT_UPPER_ARM,COPY_NOT_SEEN,COPY_OUT_OF_FRAME,COPY_SUBJECT_SWITCH,COPY_PEAK_CURL,COPY_SET_BETTER,COPY_SET_WORSE,COPY_UNCLEAR,COPY_WAIT_START,COPY_WORKOUT_DONE,
    ...Object.values(POSE_ISSUE_COPY).map(c=>c.action)];
  for(const line of lines)for(const word of BANNED_COPY_WORDS)assert.ok(!line.includes(word),`「${line}」不应包含「${word}」`);
});

test('set reveal praises only a real improvement and names the axis',()=>{
  const r=buildSetReveal(fb(80,70,70,70),fb(60,70,70,70),{reps:12,unit:'次',scored:true,axisLabels:{depth:AXES[0],stability:AXES[1],trunk:AXES[2],symmetry:AXES[3]}});
  assert.match(r.progressLine,/先说进步：屈肘幅度比上一组好了一截（60 → 80）/);
  assert.equal(r.improvedAxis,'depth');
  assert.match(r.goalLine,/下一组小目标（就一个）/);
});

test('set reveal never stars a quiet axis in the improvement claim (hammer depth, Codex round-7 Q3)',()=>{
  // Depth "improved" 92 → 100 while trunk improved 70 → 78: without
  // the quiet rule the praise would star 屈肘幅度 — an affirmative
  // depth-quality claim the ceiling-pinned channel cannot validate.
  // The claim must land on the trunk improvement instead.
  const labels={depth:AXES[0],stability:AXES[1],trunk:AXES[2],symmetry:AXES[3]};
  const r=buildSetReveal(fb(100,70,78,70),fb(92,70,70,70),{reps:12,unit:'次',scored:true,axisLabels:labels,quietAxes:['depth']});
  assert.match(r.progressLine,/先说进步：躯干稳定比上一组好了一截（70 → 78）/);
  assert.equal(r.improvedAxis,'trunk');
  // A depth-only "improvement" produces no praise line at all — the
  // reveal falls back to the steady factual line.
  const only=buildSetReveal(fb(100,70,70,70),fb(92,70,70,70),{reps:12,unit:'次',scored:true,axisLabels:labels,quietAxes:['depth']});
  assert.ok(!only.progressLine.includes('先说进步'),`no depth praise may be printed, got: ${only.progressLine}`);
  assert.equal(only.improvedAxis,null);
  // The limitation copy itself obeys the copy red lines.
  for(const word of BANNED_COPY_WORDS)assert.ok(!COPY_DEPTH_SHALLOW_LIMIT.includes(word));
});

test('set reveal catches a regression without blame words',()=>{
  const r=buildSetReveal(fb(50,70,70,70),fb(80,70,70,70),{reps:12,unit:'次',scored:true});
  assert.equal(r.progressLine,COPY_SET_WORSE);
  assert.match(r.goalLine,/小一点的目标/);
  for(const word of BANNED_COPY_WORDS)assert.ok(!r.progressLine.includes(word));
});

test('set reveal falls back to facts without a previous set',()=>{
  const r=buildSetReveal(fb(80,70,70,70),null,{reps:12,unit:'次',scored:true});
  assert.match(r.progressLine,/12 次/);
  assert.ok(!r.progressLine.includes('上一组'));
});

test('set reveal stays factual when the set was not scored',()=>{
  const r=buildSetReveal(fb(0,0,0,0),fb(80,70,70,70),{reps:9,unit:'次',scored:false});
  assert.match(r.progressLine,/9 次/);
  assert.match(r.progressLine,/不评分/);
  assert.ok(!r.progressLine.includes('上一组'));
});

test('milestones fire only on real counts',()=>{
  assert.equal(milestoneLine(5,10),'一半啦，保持住');
  assert.equal(milestoneLine(9,10),'最后一个，陪你一起——起！');
  assert.equal(milestoneLine(10,10),null);
  assert.equal(milestoneLine(3,10),null);
  assert.equal(milestoneLine(4,0),null);
});

test('workout-done line adds the streak only when it is real',()=>{
  assert.equal(workoutDoneLine(1),COPY_WORKOUT_DONE);
  assert.match(workoutDoneLine(5),/连续运动第 5 天/);
  assert.equal(repDoneLine(3,'次'),'好，第 3 次。节奏就这样');
});

test('skeleton segments grade on the weaker endpoint visibility',()=>{
  assert.equal(segmentGrade(.9,.5),'solid');
  assert.equal(segmentGrade(.9,.49),'uncertain');
  assert.equal(segmentGrade(.3,.9),'uncertain');
  assert.equal(segmentGrade(.29,.9),'hidden');
  assert.equal(segmentGrade(undefined,.9),'hidden');
});

test('skeleton joint tiers follow the V4-B primary set',()=>{
  assert.equal(jointTier(11),'primary');
  assert.equal(jointTier(16),'primary');
  assert.equal(jointTier(23),'secondary');
  assert.equal(jointTier(0),'secondary');
});
