import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { ExerciseTracker, analyzeExerciseFrame } from '../src/features/motion/lib/exerciseMetrics'
import { CAMERA_EXERCISES, type CameraExerciseType } from '../src/features/motion/lib/exercises'
import { localReply, buildSystemPrompt } from '../src/features/motion/lib/coachPolicy'
import { calculateDailyMissionProgress } from '../src/features/motion/lib/rewards'
import type { WorkoutSession } from '../src/features/motion/types'

// Independent landmark fixtures, not model predictions or real-camera recordings.
function frame(type:CameraExerciseType, state='rest') {
  const points:NormalizedLandmark[]=Array.from({length:33},()=>({x:.5,y:.15,z:0,visibility:.95}))
  const put=(i:number,x:number,y:number)=>{points[i]={x,y,z:0,visibility:.95}}
  for(const [i,x,y] of [[11,.39,.29],[12,.61,.29],[13,.37,.45],[14,.63,.45],[15,.37,.66],[16,.63,.66],[23,.44,.54],[24,.56,.54],[25,.44,.73],[26,.56,.73],[27,.44,.91],[28,.56,.91]])put(i,x,y)
  if(type==='squat'&&state!=='rest') {
    for(const [i,x,y] of [[11,.39,.42],[12,.61,.42],[23,.44,.69],[24,.56,.69],[25,.27,.69],[26,.73,.69],[27,.27,.91],[28,.73,.91]])put(i,x,y)
  }
  if(type==='jumping_jack'&&state!=='rest') {
    for(const [i,x,y] of [[13,.29,.23],[14,.71,.23],[15,.2,.09],[16,.8,.09],[27,.2,.91],[28,.8,.91]])put(i,x,y)
  }
  if(type==='high_knees'&&state!=='rest') {
    const offset=state==='right'?1:0;put(25+offset,offset?.56:.44,.44);put(27+offset,offset?.56:.44,.62)
  }
  if(type==='push_up') {
    for(const o of [0,1]){put(11+o,.23,state==='rest'?.31:.45);put(13+o,state==='rest'?.23:.36,state==='rest'?.455:.51);put(15+o,.23,.60);put(23+o,.54,state==='rest'?.40:.47);put(27+o,.86,state==='rest'?.49:.49)}
  }
  return points
}
function playback(type:CameraExerciseType, restored?:any) {
  const tracker=new ExerciseTracker(type,20,restored);let now=0
  const hold=(points:NormalizedLandmark[]|null,ms=1000)=>{for(let i=0;i<ms;i+=100){now+=100;tracker.update(points,now,1)}}
  const rep=()=>{if(type==='high_knees'){hold(frame(type,'left'));hold(frame(type));hold(frame(type,'right'));hold(frame(type))}else{hold(frame(type,'peak'));hold(frame(type))}}
  const calibrate=()=>hold(frame(type),2600)
  return {tracker,hold,rep,calibrate}
}
for(const type of Object.keys(CAMERA_EXERCISES) as CameraExerciseType[]) {
  test(`${type}: full cycles count, neutral jitter and isolated peaks do not`,()=>{
    const p=playback(type);p.calibrate();p.hold(frame(type),2000);assert.equal(p.tracker.metrics.reps,0)
    p.rep();p.rep();assert.equal(p.tracker.metrics.reps,2)
    assert.equal(p.tracker.metrics.scoreAccumulator.count,2)
    assert.ok(p.tracker.metrics.formScore>0&&p.tracker.metrics.formScore<=100)
  })
  test(`${type}: tracking loss, interruption and reload discard partial cycles`,()=>{
    const p=playback(type);p.calibrate();p.rep();p.hold(frame(type,'peak'));p.hold(null);p.calibrate()
    assert.equal(p.tracker.metrics.reps,1);p.rep();assert.equal(p.tracker.metrics.reps,2)
    p.hold(frame(type,'peak'));p.tracker.interrupt();p.calibrate();assert.equal(p.tracker.metrics.reps,2)
    const r=playback(type,p.tracker.metrics);r.calibrate();assert.equal(r.tracker.metrics.reps,2);r.rep()
    assert.equal(r.tracker.metrics.reps,3);assert.equal(r.tracker.metrics.scoreAccumulator.count,3)
    assert.equal(r.tracker.metrics.formScore,Math.round(r.tracker.metrics.scoreAccumulator.total/3))
  })
  test(`${type}: low visibility cannot score or count; target remains capped`,()=>{
    const p=playback(type);p.calibrate()
    const hidden=frame(type,'peak').map(v=>({...v,visibility:.1}));p.hold(hidden);p.calibrate();assert.equal(p.tracker.metrics.reps,0)
    for(let i=0;i<22;i++)p.rep();assert.equal(p.tracker.metrics.reps,20);assert.equal(p.tracker.metrics.scoreAccumulator.count,20)
  })
  test(`${type}: geometry is invariant under image aspect changes`,()=>{
    const points=frame(type,'peak'),wide=points.map(v=>({...v,x:v.x/2+.25}))
    const a=analyzeExerciseFrame(type,points,1),b=analyzeExerciseFrame(type,wide,2)
    assert.ok(a&&b);assert.equal(a.peak,b.peak);assert.ok(Math.abs(a.score-b.score)<1)
  })
}
test('high knees: repeated left leg never substitutes the missing right leg',()=>{
  const p=playback('high_knees');p.calibrate()
  for(let i=0;i<3;i++){p.hold(frame('high_knees','left'));p.hold(frame('high_knees'))}
  assert.equal(p.tracker.metrics.reps,0);p.hold(frame('high_knees','right'));p.hold(frame('high_knees'));assert.equal(p.tracker.metrics.reps,1)
})
test('short spikes and incomplete opening do not count jumping jacks',()=>{
  const p=playback('jumping_jack');p.calibrate();p.hold(frame('jumping_jack','peak'),100);p.hold(frame('jumping_jack'));assert.equal(p.tracker.metrics.reps,0)
  const handsDown=frame('jumping_jack','peak');handsDown[15].y=.66;handsDown[16].y=.66;p.hold(handsDown);p.hold(frame('jumping_jack'));assert.equal(p.tracker.metrics.reps,0)
})
test('push-up side occlusion is allowed; standing arm bends are rejected',()=>{
  const points=frame('push_up','peak');for(const i of [12,14,16,24,28])points[i].visibility=.1
  assert.ok(analyzeExerciseFrame('push_up',points));assert.equal(analyzeExerciseFrame('push_up',frame('squat')),null)
})
test('poor body alignment lowers push-up score and appears in feedback',()=>{
  const good=frame('push_up','peak'),bad=frame('push_up','peak');bad[23].y=.7;bad[24].y=.7
  const a=analyzeExerciseFrame('push_up',good)!,b=analyzeExerciseFrame('push_up',bad)!
  assert.ok(b.score<a.score);assert.ok(b.issues.includes('body_alignment'))
})
test('legacy squat statistics and local coach distinguish actions and units',()=>{
  const context={exerciseType:'high_knees' as const,countUnit:'组',reps:2,targetReps:20,phase:'standing',durationSeconds:20,bpm:null,active:true}
  assert.match(localReply('多少',context),/2 组/);assert.match(localReply('怎么做',context),/左右/);assert.match(buildSystemPrompt(context),/高抬腿/)
  const history=['squat','high_knees','jumping_jack'].map(exerciseType=>({exerciseType,reps:4,source:'camera',startTime:new Date().toISOString(),zone3Seconds:0,formScore:90})) as WorkoutSession[]
  assert.equal(calculateDailyMissionProgress(history).squatReps,4)
})
