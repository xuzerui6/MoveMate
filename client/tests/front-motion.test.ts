import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { ExerciseTracker } from '../src/features/motion/lib/exerciseMetrics'
import { analyzeSquatFrame } from '../src/features/motion/lib/squatMetrics'

// Independent, frontal projections: knees remain at 180 degrees in the image
// even when the 3D legs bend into a squat. These are not camera recordings.
function frontSquat(down=false) {
  const p:NormalizedLandmark[]=Array.from({length:33},()=>({x:.5,y:.15,z:0,visibility:.99}))
  for(const [o,x] of [[0,.43],[1,.57]]){
    p[11+o]={...p[0],x,y:down?.44:.29}
    p[23+o]={...p[0],x,y:down?.69:.54}
    p[25+o]={...p[0],x,y:down?.79:.73}
    p[27+o]={...p[0],x,y:.91}
  }
  return p
}
function worldSquat(down=false,yaw=0) {
  const p:NormalizedLandmark[]=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:.99}))
  for(const [o,x] of [[0,-.1],[1,.1]]){
    p[23+o]={...p[0],x,y:0,z:0}
    p[25+o]={...p[0],x,y:down?.2:.3,z:down?-.12:0}
    p[27+o]={...p[0],x,y:down?.4:.6,z:0}
  }
  return p.map(v=>({...v,x:v.x*Math.cos(yaw)-v.z*Math.sin(yaw),z:v.x*Math.sin(yaw)+v.z*Math.cos(yaw)}))
}
function player(type:'squat'|'jumping_jack') {
  const tracker=new ExerciseTracker(type);let now=0
  const hold=(p:NormalizedLandmark[],ms:number,w:NormalizedLandmark[]|null=null)=>{
    for(let n=0;n<ms;n+=1000/30){now+=1000/30;tracker.update(p,now,1,w)}
  }
  return {tracker,hold}
}
test('frontal squats use world knee angles in three camera orientations',()=>{
  assert.equal(Math.round(analyzeSquatFrame(frontSquat(true))!.kneeAngle),180)
  for(const yaw of [0,Math.PI/4,Math.PI/2]){
    const p=player('squat');p.hold(frontSquat(),2600,worldSquat(false,yaw))
    for(let rep=0;rep<3;rep++){p.hold(frontSquat(true),600,worldSquat(true,yaw));p.hold(frontSquat(),600,worldSquat(false,yaw))}
    assert.equal(p.tracker.metrics.reps,3)
    assert.equal(p.tracker.diagnostics.basis,'三维膝角')
    assert.ok(p.tracker.metrics.formScore>=0&&p.tracker.metrics.formScore<=100)
  }
})
test('frontal squats without world coordinates count body descent and return, not knee projection',()=>{
  const p=player('squat');p.hold(frontSquat(),2600)
  p.hold(frontSquat(true),600);p.hold(frontSquat(),600)
  assert.equal(p.tracker.metrics.reps,1)
  assert.match(p.tracker.diagnostics.basis!,/髋部位移/)
  p.hold(frontSquat(true),500);p.tracker.interrupt();p.hold(frontSquat(),2600)
  assert.equal(p.tracker.metrics.reps,1)
})
test('camera translation, zoom, and small frontal bends do not count as squats',()=>{
  const p=player('squat'),rest=frontSquat();p.hold(rest,2600)
  const small=frontSquat();for(const i of [11,12,23,24])small[i].y+=.025
  p.hold(small,600);p.hold(rest,600)
  p.hold(rest.map(v=>({...v,y:v.y-.10})),600);p.hold(rest,600)
  p.hold(rest.map(v=>({...v,x:.5+(v.x-.5)*.65,y:.5+(v.y-.5)*.65})),600);p.hold(rest,600)
  assert.equal(p.tracker.metrics.reps,0)
})
function jack(open=false,arms=true,feet=true) {
  const p=frontSquat()
  for(const [o,sign] of [[0,-1],[1,1]]){
    p[11+o].x=.5+sign*.11
    p[13+o]={...p[0],x:.5+sign*.18,y:open&&arms?.23:.45}
    p[15+o]={...p[0],x:.5+sign*.24,y:open&&arms?.12:.66}
    p[27+o].x=.5+sign*.11*(open&&feet?1.75:1.3)
  }
  return p
}
test('jumping jacks calibrate a natural stance and count brief open phases without holding the top',()=>{
  const p=player('jumping_jack');p.hold(jack(),2600)
  assert.ok(p.tracker.metrics.poseFeedback.calibrated)
  for(let rep=0;rep<3;rep++){
    p.hold(jack(true,true,false),150)
    p.hold(jack(true),120)
    p.hold(jack(true,false,true),150)
    p.hold(jack(),250)
  }
  assert.equal(p.tracker.metrics.reps,3)
})
test('visible raised upper arms can count when wrists leave the frame',()=>{
  const p=player('jumping_jack');p.hold(jack(),2600)
  const open=jack(true);for(const i of [15,16]){open[i].y=-.03;open[i].visibility=.2}
  p.hold(open,500);p.hold(jack(),400)
  assert.equal(p.tracker.metrics.reps,1)
})
test('arms-only, legs-only, and a stationary open pose never count jumping jacks',()=>{
  const p=player('jumping_jack');p.hold(jack(),2600)
  for(let n=0;n<2;n++){
    p.hold(jack(true,true,false),500);p.hold(jack(),400)
    p.hold(jack(true,false,true),500);p.hold(jack(),400)
  }
  assert.equal(p.tracker.metrics.reps,0)
  const uncalibrated=player('jumping_jack');uncalibrated.hold(jack(true),3000)
  assert.equal(uncalibrated.tracker.metrics.reps,0)
})
