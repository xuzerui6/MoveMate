import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPoseTransport,modelBytes} from '../src/features/motion/lib/poseTransport';
import models from '../src/features/motion/lib/pose-models.json';
function environment(t:any,failGPU=false,hold=false,failGPUFrame=false,failCdnWasm=false){
 const saved=Object.getOwnPropertyDescriptors(globalThis),instances:any[]=[];let closed=0;
 class WorkerStub {
  onmessage:any;onerror:any;terminated=false;delegate="";wasmAttempts:string[]=[];
  constructor(..._:any[]){instances.push(this);}
  postMessage(data:any){queueMicrotask(()=>{if(this.terminated)return;if(data.kind==='init'){this.delegate=data.delegate;this.wasmAttempts.push(data.wasm);this.onmessage?.({data:{id:data.id,...(failGPU&&data.delegate==='GPU'?{error:'GPU unavailable'}:failCdnWasm&&String(data.wasm).startsWith('https://pose.xzrcloud.xyz')?{error:'CDN wasm unavailable'}:{ready:true})}});}else if(!hold){data.image.close();this.onmessage?.({data:{id:data.id,...(failGPUFrame&&this.delegate==='GPU'?{error:'GPU first frame failed'}:{landmarks:[],worldLandmarks:[]})}});}});}
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
test('worker init receives the CDN WASM base first',async t=>{
 const env=environment(t),runtime=await openPoseTransport('lite',new AbortController().signal);
 assert.equal(runtime.mode,'worker-gpu');
 assert.deepEqual((env.instances[0] as any).wasmAttempts,['https://pose.xzrcloud.xyz/pose/wasm']);
 runtime.close();
});

test('a failed CDN WASM init retries with the origin base on the same worker',async t=>{
 const env=environment(t,false,false,false,true),runtime=await openPoseTransport('lite',new AbortController().signal);
 assert.equal(runtime.mode,'worker-gpu');
 assert.equal(env.instances.length,1);
 assert.deepEqual((env.instances[0] as any).wasmAttempts,['https://pose.xzrcloud.xyz/pose/wasm','http://localhost/pose/wasm']);
 runtime.close();
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

test('verified model bytes persist in the on-device cache; corrupt entries are dropped',async t=>{
 environment(t);
 const store=new Map<string,ArrayBuffer>();
 const cache={match:async(key:string)=>{const b=store.get(key);return b?new Response(b.slice(0)):undefined;},put:async(key:string,res:Response)=>{store.set(key,await res.arrayBuffer());},delete:async(key:string)=>store.delete(key)};
 Object.defineProperty(globalThis,'caches',{configurable:true,value:{open:async()=>cache}});
 t.after(()=>{Reflect.deleteProperty(globalThis,'caches');});
 const first=await modelBytes('lite',new AbortController().signal);assert.equal(first.byteLength,models.lite.bytes);assert.ok(store.has(models.lite.src));
 t.mock.method(globalThis,'fetch',async()=>{throw new TypeError('offline');});
 const second=await modelBytes('lite',new AbortController().signal);assert.equal(second.byteLength,models.lite.bytes);
 store.set(models.lite.src,new ArrayBuffer(8));
 t.mock.method(globalThis,'fetch',async(input:any)=>new Response(readFileSync(new URL('../public'+String(input),import.meta.url))));
 const third=await modelBytes('lite',new AbortController().signal);assert.equal(third.byteLength,models.lite.bytes);
});
test('a transient network failure falls back from the CDN to the origin; a size failure surfaces only after both routes fail',async t=>{
 environment(t);
 let calls=0;t.mock.method(globalThis,'fetch',async(input:any)=>{calls++;if(calls===1)throw new TypeError('fetch failed');return new Response(readFileSync(new URL('../public'+String(input),import.meta.url)));});
 const bytes=await modelBytes('lite',new AbortController().signal);assert.equal(bytes.byteLength,models.lite.bytes);assert.equal(calls,2);
 let bad=0;t.mock.method(globalThis,'fetch',async()=>{bad++;return new Response(new Uint8Array([1,2,3]));});
 await assert.rejects(modelBytes('full',new AbortController().signal),/大小/);assert.equal(bad,2);
});

test('corrupt CDN bytes fall back to the verified origin copy',async t=>{
 environment(t);
 const seen:string[]=[];
 t.mock.method(globalThis,'fetch',async(input:any)=>{seen.push(String(input));if(String(input).startsWith('https://pose.xzrcloud.xyz'))return new Response(new Uint8Array([9,9,9]));return new Response(readFileSync(new URL('../public'+String(input),import.meta.url)));});
 const bytes=await modelBytes('lite',new AbortController().signal);
 assert.equal(bytes.byteLength,models.lite.bytes);
 assert.ok(seen[0].startsWith('https://pose.xzrcloud.xyz/pose/'));
 assert.ok(seen.includes(models.lite.src));
});

// Initialization alone is insufficient: first inference may fail on a browser GPU.
test('worker first-frame failure is checked before readiness and falls back to CPU',async t=>{
 const env=environment(t,false,false,true),runtime=await openPoseTransport('full',new AbortController().signal,{} as any);
 assert.equal(runtime.mode,'worker-cpu');assert.equal(env.instances.length,2);assert.ok(env.instances[0].terminated);
 assert.deepEqual((await runtime.infer({} as any,performance.now()+100)).landmarks,[]);runtime.close();
});

test('heavy variant bytes are the pinned official file and it runs through the worker path',async t=>{
 environment(t);
 const bytes=await modelBytes('heavy',new AbortController().signal);
 assert.equal(bytes.byteLength,30664242);
 assert.equal(models.heavy.bytes,30664242);
 const runtime=await openPoseTransport('heavy',new AbortController().signal);
 assert.equal(runtime.mode,'worker-gpu');
 assert.deepEqual((await runtime.infer({} as any,100)).landmarks,[]);
 runtime.close();
});

test('a larger variant on the main thread does not touch the worker path',async t=>{
 const env=environment(t);
 // The main-thread branch loads the real Tasks Vision runtime, which Node cannot
 // execute; what matters here is that it is attempted (no Worker is constructed).
 await assert.rejects(openPoseTransport('heavy',new AbortController().signal,undefined,{mainThread:true}));
 assert.equal(env.instances.length,0);
});
