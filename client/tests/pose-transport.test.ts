import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPoseTransport,modelBytes} from '../src/features/motion/lib/poseTransport';
import models from '../src/features/motion/lib/pose-models.json';
function environment(t:any,failGPU=false,hold=false,failGPUFrame=false){
 const saved=Object.getOwnPropertyDescriptors(globalThis),instances:any[]=[];let closed=0;
 class WorkerStub {
  onmessage:any;onerror:any;terminated=false;delegate="";
  constructor(..._:any[]){instances.push(this);}
  postMessage(data:any){queueMicrotask(()=>{if(this.terminated)return;if(data.kind==='init'){this.delegate=data.delegate;this.onmessage?.({data:{id:data.id,...(failGPU&&data.delegate==='GPU'?{error:'GPU unavailable'}:{ready:true})}});}else if(!hold){data.image.close();this.onmessage?.({data:{id:data.id,...(failGPUFrame&&this.delegate==='GPU'?{error:'GPU first frame failed'}:{landmarks:[],worldLandmarks:[]})}});}});}
  terminate(){this.terminated=true;}
 }
 Object.defineProperty(globalThis,'Worker',{configurable:true,value:WorkerStub});Object.defineProperty(globalThis,'OffscreenCanvas',{configurable:true,value:class{}});Object.defineProperty(globalThis,'location',{configurable:true,value:{origin:'http://localhost'}});
 Object.defineProperty(globalThis,'createImageBitmap',{configurable:true,value:async()=>({close(){closed++;}})});
 t.mock.method(globalThis,'fetch',async(input:any)=>new Response(readFileSync(new URL('../public'+String(input),import.meta.url))));
 t.after(()=>{for(const k of ['Worker','OffscreenCanvas','location','createImageBitmap']){if(saved[k])Object.defineProperty(globalThis,k,saved[k]);else Reflect.deleteProperty(globalThis,k);}});
 return {instances,closed:()=>closed};
}
test('worker GPU initialization, frame transfer and disposal release worker and image',async t=>{
 const env=environment(t),control=new AbortController(),runtime=await openPoseTransport('full',control.signal);assert.equal(runtime.mode,'worker-gpu');assert.deepEqual((await runtime.infer({} as any,100)).landmarks,[]);assert.ok(env.closed()>0);runtime.close();assert.ok(env.instances.every(w=>w.terminated));
});
test('worker GPU failure falls back to worker CPU and closes rejected worker',async t=>{
 const env=environment(t,true),runtime=await openPoseTransport('lite',new AbortController().signal);assert.equal(runtime.mode,'worker-cpu');assert.equal(env.instances.length,2);assert.ok(env.instances[0].terminated);runtime.close();assert.ok(env.instances[1].terminated);
});
test('aborting an in-flight worker frame rejects it and prevents later use',async t=>{
 const env=environment(t,false,true),control=new AbortController(),runtime=await openPoseTransport('lite',control.signal);const frame=runtime.infer({} as any,100);await Promise.resolve();control.abort();await assert.rejects(frame,/取消/);assert.ok(env.instances.every(w=>w.terminated));await assert.rejects(runtime.infer({} as any,200),/取消/);
});
test('model file size and checksum failures stop initialization',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response(new Uint8Array([1,2,3])));await assert.rejects(modelBytes('lite',new AbortController().signal),/大小/);
 const bytes=new Uint8Array(models.lite.bytes);t.mock.method(globalThis,'fetch',async()=>new Response(bytes));await assert.rejects(modelBytes('lite',new AbortController().signal),/完整性/);
});

// Initialization alone is insufficient: first inference may fail on a browser GPU.
test('worker first-frame failure is checked before readiness and falls back to CPU',async t=>{
 const env=environment(t,false,false,true),runtime=await openPoseTransport('full',new AbortController().signal,{} as any);
 assert.equal(runtime.mode,'worker-cpu');assert.equal(env.instances.length,2);assert.ok(env.instances[0].terminated);
 assert.deepEqual((await runtime.infer({} as any,performance.now()+100)).landmarks,[]);runtime.close();
});
