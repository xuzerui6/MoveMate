import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRecognitionTracker,isRecognitionType} from '../src/features/motion/lib/recognition';
import {LIBRARY_RECOGNITION,type LibraryRecognitionType} from '../src/features/gym/libraryRecognition';
import {isCameraExercise} from '../src/features/motion/lib/exercises';
import {libraryPose} from './fixtures/library-camera';
function run(type:LibraryRecognitionType,aspect=1,step=100,restored:any={}){
 const tracker=createRecognitionTracker(type,20,restored);let now=0;
 const feed=(stage:'neutral'|'peak',ms=1200,edit?:(f:ReturnType<typeof libraryPose>)=>void)=>{
  const f=libraryPose(type,stage),s=Math.min(1,aspect);f.landmarks=f.landmarks.map(p=>({...p,x:.5+(p.x-.5)*s/aspect,y:.5+(p.y-.5)*s}));edit?.(f);
  for(let t=0;t<ms;t+=step){now+=step;tracker.update(f.landmarks,now,aspect,f.worldLandmarks);}return tracker.metrics;
 };return {tracker,feed};
}
for(const type of Object.keys(LIBRARY_RECOGNITION) as LibraryRecognitionType[]){
 test(`${type}: full cycles at 5/10 FPS and portrait/landscape aspect`,()=>{
  assert.ok(isRecognitionType(type));assert.equal(isCameraExercise(type),false);
  for(const aspect of [9/16,16/9])for(const step of [100,200]){
   const r=run(type,aspect,step);r.feed('neutral',3200);assert.ok(r.tracker.metrics.poseFeedback.calibrated,r.tracker.metrics.feedback);
   for(let i=0;i<3;i++){r.feed('peak');r.feed('neutral');assert.equal(r.tracker.metrics.reps,i+1,r.tracker.metrics.feedback);}
   assert.equal(r.tracker.metrics.scoreAccumulator.count,3);
  }
 });
 test(`${type}: static/partial, pause, occlusion and reload preserve only complete repetitions`,()=>{
  const r=run(type);r.feed('neutral',3200);r.feed('neutral');assert.equal(r.tracker.metrics.reps,0);r.feed('peak',100);r.feed('neutral');assert.equal(r.tracker.metrics.reps,0);
  r.feed('peak');r.tracker.interrupt();r.feed('neutral',3200);assert.equal(r.tracker.metrics.reps,0);r.feed('peak');r.feed('neutral');assert.equal(r.tracker.metrics.reps,1);
  r.feed('peak');r.feed('peak',1200,f=>f.landmarks.forEach(p=>p.visibility=.1));r.feed('neutral',3200);assert.equal(r.tracker.metrics.reps,1);
  const restored=run(type,1,100,r.tracker.metrics);restored.feed('peak');assert.equal(restored.tracker.metrics.reps,1);restored.feed('neutral',3200);restored.feed('peak');restored.feed('neutral');assert.equal(restored.tracker.metrics.reps,2);
 });
}
test('bench press rejects upright pushing and moving body supports',()=>{
 const r=run('bench_press');r.feed('neutral',3200);r.feed('peak',1200,f=>{f.landmarks[23].x=.25;f.landmarks[24].x=.31;f.landmarks[23].y=.8;f.landmarks[24].y=.8;});r.feed('neutral',3200);assert.equal(r.tracker.metrics.reps,0);
 r.feed('peak',1200,f=>f.landmarks.forEach(p=>p.y+=.08));r.feed('neutral',3200);assert.equal(r.tracker.metrics.reps,0);
});
test('reverse fly rejects forward lifting, upright lateral raises and missing world coordinates',()=>{
 const r=run('reverse_fly');r.feed('neutral',3200);r.feed('peak',1200,f=>{for(const o of [0,1])for(const i of [13,15]){f.worldLandmarks![i+o].x=o?.2:-.2;f.worldLandmarks![i+o].z-=.4;}});r.feed('neutral');assert.equal(r.tracker.metrics.reps,0);
 r.feed('peak',1200,f=>{f.worldLandmarks=null});assert.match(r.tracker.metrics.feedback,/方向|三维/);assert.equal(r.tracker.metrics.reps,0);
 r.feed('neutral',3200);r.feed('peak',1200,f=>{for(const o of [0,1])f.landmarks[11+o].x=f.landmarks[23+o].x;});assert.equal(r.tracker.metrics.reps,0);assert.match(r.tracker.metrics.feedback,/俯身/);
});
test('an unscorable bench-press repetition is preserved without inventing a score',()=>{
 const r=run('bench_press');r.feed('neutral',3200);r.feed('peak',1200,f=>f.landmarks.forEach(p=>p.visibility=.65));r.feed('neutral');assert.equal(r.tracker.metrics.reps,1);assert.equal(r.tracker.metrics.scoreAccumulator.count,0);assert.equal(r.tracker.metrics.lastRepScore,null);
});
test('seated overhead extension rejects chest-level curls and standing without seated support',()=>{
 const r=run('seated_triceps_extension');r.feed('neutral',3200);r.feed('peak',1200,f=>{for(const o of [0,1])f.landmarks[13+o].y=.5});r.feed('neutral',3200);assert.equal(r.tracker.metrics.reps,0);
 r.feed('peak',1200,f=>{for(const o of [0,1]){f.landmarks[25+o].x=f.landmarks[23+o].x;f.landmarks[25+o].y=.73;}});r.feed('neutral',3200);assert.equal(r.tracker.metrics.reps,0);
});
