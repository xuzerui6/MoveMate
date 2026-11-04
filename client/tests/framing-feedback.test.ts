import {test} from 'node:test';
import assert from 'node:assert/strict';
import {framingFeedback} from '../src/features/motion/lib/framingFeedback';
import {AdaptiveRecognition} from '../src/features/motion/lib/adaptiveRecognition';
import {recognitionDemonstration} from '../src/features/motion/lib/recognition';
const pose=()=>recognitionDemonstration('squat','neutral').landmarks;
test('framing names required ankles and bottom edge without mutating coordinates',()=>{
 const p=pose();p[27].y=1.04;p[28].y=1.02;const f=framingFeedback(p,[11,12,23,24,25,26,27,28]);assert.deepEqual(f?.affected,[27,28]);assert.match(f!.message,/左脚踝、右脚踝出画.*下沿/);assert.match(f!.message,/向下/);assert.equal(p[27].y,1.04);
});
test('irrelevant wrists outside the picture do not fail squat framing',()=>{
 const p=pose();p[15].x=-.1;assert.equal(framingFeedback(p,[11,12,23,24,25,26,27,28]),null);
});
test('upper and side edges provide appropriate guidance',()=>{
 const p=pose();p[11].y=-.05;assert.match(framingFeedback(p,[11])!.message,/上沿.*向上/);p[11].y=.3;p[11].x=1.1;assert.match(framingFeedback(p,[11])!.message,/侧边.*中央/);
});
test('adaptive preparation rejects out-of-frame ankles and highlights actual required joints',()=>{
 const engine=new AdaptiveRecognition('squat',20,{reps:2},1),p=pose();p[27].y=1.1;p[28].visibility=.2;
 engine.update({runId:1,frameId:1,capturedAt:100,receivedAt:110,width:720,height:960,landmarks:p,worldLandmarks:null,model:'lite',mode:'main-gpu'},false);
 assert.equal(engine.ready,false);assert.equal(engine.metrics.reps,2);assert.deepEqual(engine.metrics.poseFeedback.affectedJoints,[27]);assert.match(engine.metrics.feedback,/左脚踝出画/);
});
