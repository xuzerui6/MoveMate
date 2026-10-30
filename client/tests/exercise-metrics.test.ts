import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { ExerciseTracker, analyzeExerciseFrame } from '../src/features/motion/lib/exerciseMetrics'
import { BASE_CAMERA_EXERCISES as CAMERA_EXERCISES, type BaseCameraExerciseType as CameraExerciseType } from '../src/features/motion/lib/exercises'
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
  test(`${type}: continuous cycles survive marginal confidence noise at varied FPS and camera aspects`,()=>{
    for(const fps of [5,10,30])for(const aspect of [.75,16/9]) {
      const tracker=new ExerciseTracker(type);let now=0,n=0;const dt=1000/fps
      const map=(p:NormalizedLandmark[])=>p.map(v=>({...v,x:.5+(v.x-.5)*.8/aspect,y:.5+(v.y-.5)*.8}))
      const rest=frame(type),stages=type==='high_knees'?['left','right']:['peak']
      const send=(p:NormalizedLandmark[],noise=false)=>{
        now+=dt;const points=map(p)
        if(noise&&++n%Math.max(3,fps)===0){points[27].visibility=.5;points[28].visibility=.5}
        tracker.update(points,now,aspect)
      }
      for(let t=0;t<3000;t+=dt)send(rest)
      assert.ok(tracker.metrics.poseFeedback.calibrated)
      for(let cycle=0;cycle<3;cycle++)for(const stage of stages){
        const peak=frame(type,stage)
        for(let t=0;t<3000;t+=dt){
          const u=(1-Math.cos(2*Math.PI*t/3000))/2
          send(rest.map((v,i)=>({...v,x:v.x+(peak[i].x-v.x)*u,y:v.y+(peak[i].y-v.y)*u})),true)
        }
      }
      for(let t=0;t<1000;t+=dt)send(rest,true)
      assert.equal(tracker.metrics.reps,3,`${fps} FPS, aspect ${aspect}`)
      assert.equal(tracker.metrics.scoreAccumulator.count,3)
      assert.equal(tracker.diagnostics.lastResetReason,null)
      assert.ok(tracker.diagnostics.fps>0)
    }
  })
  test(`${type}: sustained marginal confidence and stale frames discard partial movements`,()=>{
    const p=playback(type);p.calibrate();p.rep();p.hold(frame(type,'peak'))
    const marginal=frame(type,'peak');marginal[27].visibility=.5;marginal[28].visibility=.5
    p.hold(marginal,600);assert.equal(p.tracker.metrics.poseFeedback.calibrated,false)
    assert.match(p.tracker.diagnostics.lastResetReason!,/脚踝/)
    p.calibrate();assert.equal(p.tracker.metrics.reps,1);p.rep();assert.equal(p.tracker.metrics.reps,2)
    // A resumed video after a long frame gap cannot finish the previous half rep.
    p.tracker.update(frame(type,'peak'),100000);p.tracker.update(frame(type),100100)
    assert.equal(p.tracker.metrics.reps,2);assert.match(p.tracker.diagnostics.lastResetReason!,/画面更新中断/)
    assert.ok(!('diagnostics' in p.tracker.metrics))
    assert.ok(!('frameTimes' in p.tracker.metrics))
  })
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

test('push-up locks one visible side throughout a rep despite the far side becoming more confident',()=>{
  const p=playback('push_up'),rest=frame('push_up'),peak=frame('push_up','peak')
  for(const i of [12,14,16,24,28])rest[i].visibility=.7
  p.hold(rest,3000);assert.equal(p.tracker.diagnostics.side,'left')
  for(const i of [12,14,16,24,28])peak[i]={...rest[i],visibility:.99}
  for(const i of [11,13,15,23,27])peak[i].visibility=.8
  p.hold(peak);assert.equal(p.tracker.diagnostics.side,'left');assert.equal(p.tracker.metrics.phase,'bottom')
  p.hold(rest);assert.equal(p.tracker.metrics.reps,1)
})

test('high knees reports each side and never restores a lost half pair',()=>{
  const p=playback('high_knees');p.calibrate();p.hold(frame('high_knees','left'));p.hold(frame('high_knees'))
  assert.equal(p.tracker.metrics.reps,0);assert.deepEqual(p.tracker.diagnostics.pairedSides,['left']);assert.match(p.tracker.metrics.feedback,/左.*右/)
  p.hold(null);assert.deepEqual(p.tracker.diagnostics.pairedSides,[])
  p.calibrate();p.hold(frame('high_knees','right'));p.hold(frame('high_knees'));assert.equal(p.tracker.metrics.reps,0)
  p.hold(frame('high_knees','left'));p.hold(frame('high_knees'));assert.equal(p.tracker.metrics.reps,1)
})

test('malformed landmarks and out-of-order frames never produce a score or a count',()=>{
  const p=playback('squat');p.calibrate();const bad=frame('squat','peak');bad[25].x=NaN
  assert.doesNotThrow(()=>p.hold(bad));assert.equal(p.tracker.metrics.reps,0)
  assert.match(p.tracker.diagnostics.lastResetReason!,/不完整/)
  p.calibrate();const previous=p.tracker.metrics;p.tracker.update(frame('squat','peak'),0);assert.equal(p.tracker.metrics,previous)
})
test('poor body alignment lowers push-up score and appears in feedback',()=>{
  const good=frame('push_up','peak'),bad=frame('push_up','peak');bad[23].y=.7;bad[24].y=.7
  const a=analyzeExerciseFrame('push_up',good)!,b=analyzeExerciseFrame('push_up',bad)!
  assert.ok(b.score<a.score);assert.ok(b.issues.includes('body_alignment'))
})

test('a complete movement with a low form score still counts once',()=>{
  const p=playback('push_up');p.calibrate();const bad=frame('push_up','peak');bad[23].y=.7;bad[24].y=.7
  p.hold(bad);p.hold(frame('push_up'));assert.equal(p.tracker.metrics.reps,1)
  assert.ok(p.tracker.metrics.formScore<90);assert.equal(p.tracker.metrics.perfectReps,0)
})
test('legacy squat statistics and local coach distinguish actions and units',()=>{
  const context={exerciseType:'high_knees' as const,countUnit:'组',reps:2,targetReps:20,phase:'standing',durationSeconds:20,bpm:null,active:true}
  assert.match(localReply('多少',context),/2 组/);assert.match(localReply('怎么做',context),/左右/);assert.match(buildSystemPrompt(context),/高抬腿/)
  const history=['squat','high_knees','jumping_jack'].map(exerciseType=>({exerciseType,reps:4,source:'camera',startTime:new Date().toISOString(),zone3Seconds:0,formScore:90})) as WorkoutSession[]
  assert.equal(calculateDailyMissionProgress(history).squatReps,4)
})
