import {test} from 'node:test';
import assert from 'node:assert/strict';
import {waitForVideoFrame} from '../src/features/motion/lib/videoReady';
test('camera readiness waits for valid decoded dimensions instead of play resolution',async()=>{
 const video={readyState:1,videoWidth:0,videoHeight:0};let ready=false;
 const pending=waitForVideoFrame(video as HTMLVideoElement,new AbortController().signal,500).then(()=>ready=true);
 assert.equal(ready,false);Object.assign(video,{readyState:2,videoWidth:720,videoHeight:960});await pending;assert.equal(ready,true);
});
test('camera readiness cancels without a later successful start',async()=>{
 const c=new AbortController(),pending=waitForVideoFrame({readyState:1} as HTMLVideoElement,c.signal,500);c.abort();await assert.rejects(pending,/取消/);
});
test('missing camera frames report camera readiness rather than model failure',async()=>{
 await assert.rejects(waitForVideoFrame({readyState:1} as HTMLVideoElement,new AbortController().signal,10),/摄像头尚未输出/);
});
