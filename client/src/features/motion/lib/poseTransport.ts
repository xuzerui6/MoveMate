import type {PoseLandmarker} from '@mediapipe/tasks-vision';
import type {PoseModel,PoseMode} from './poseProtocol';
import models from './pose-models.json';
export type PoseResult={landmarks:any;worldLandmarks:any};
export type PoseTransport={mode:PoseMode;infer:(video:HTMLVideoElement,timestamp:number)=>Promise<PoseResult>;close:()=>void};
type ModelItem=(typeof models)[PoseModel];
const modelCacheName='pose-models-v1';
const digestHex=async(bytes:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
/** Verified model bytes persist on-device; the pinned sha256 revalidates every read, so a stale entry can never be used. */
async function readModelCache(item:ModelItem):Promise<ArrayBuffer|null>{
 try{
  if(typeof caches==='undefined')return null;
  const cache=await caches.open(modelCacheName),hit=await cache.match(item.src);if(!hit)return null;
  const bytes=await hit.arrayBuffer();
  if(bytes.byteLength!==item.bytes||await digestHex(bytes)!==item.sha256){await cache.delete(item.src);return null;}
  return bytes;
 }catch{return null;}
}
async function writeModelCache(item:ModelItem,bytes:ArrayBuffer){
 try{if(typeof caches==='undefined')return;const cache=await caches.open(modelCacheName);await cache.put(item.src,new Response(bytes.slice(0),{headers:{'Content-Type':'application/octet-stream'}}));}catch{/* the cache is best-effort */}
}
async function fetchModelBytes(name:PoseModel,item:ModelItem,signal:AbortSignal){
 const download=new AbortController(),cancel=()=>download.abort();signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
 const timeout=setTimeout(cancel,60000);
 try{
  const response=await fetch(item.src,{signal:download.signal});if(!response.ok)throw Error(`${name==='full'?'Full':'Lite'} 模型文件读取失败（${response.status}）`);
  const bytes=await response.arrayBuffer();if(bytes.byteLength!==item.bytes)throw Error('模型大小校验失败');
  if(await digestHex(bytes)!==item.sha256)throw Error('模型完整性校验失败');return bytes;
 }catch(e){if(download.signal.aborted&&!signal.aborted)throw Error('模型下载超时，请检查网络后重试');throw e;}
 finally{clearTimeout(timeout);signal.removeEventListener('abort',cancel);}
}
export async function modelBytes(name:PoseModel,signal:AbortSignal){
 const item=models[name],cached=await readModelCache(item);if(cached)return cached;
 let lastError:unknown;
 // One automatic retry for transient network failures; checksum/size failures are final.
 for(let attempt=0;attempt<2;attempt++){
  try{const bytes=await fetchModelBytes(name,item,signal);await writeModelCache(item,bytes);return bytes;}
  catch(e){if(signal.aborted)throw e;if(e instanceof Error&&(e.message.includes('大小')||e.message.includes('完整性')||e.message.includes('读取失败')))throw e;lastError=e;}
 }
 throw lastError;
}
async function workerTransport(bytes:ArrayBuffer,delegate:'GPU'|'CPU',signal:AbortSignal):Promise<PoseTransport>{
 if(typeof Worker==='undefined'||typeof createImageBitmap==='undefined'||(delegate==='GPU'&&typeof OffscreenCanvas==='undefined'))throw Error('浏览器不支持此 Worker 方式');
 // The pinned Tasks Vision WASM loader uses importScripts. Vite bundles this as IIFE.
 const worker=new Worker(new URL('./pose.worker.ts',import.meta.url),{type:'classic'}),pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();let next=0,closed=false,firstFrame=true;
 const close=()=>{if(closed)return;closed=true;worker.terminate();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('推理已取消'));}pending.clear();signal.removeEventListener('abort',close);};signal.addEventListener('abort',close,{once:true});
 const fail=(message:string)=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error(message));}pending.clear();};worker.onerror=()=>fail('Worker 推理初始化失败');
 worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);clearTimeout(p.timer);data.error?p.reject(Error(data.error)):p.resolve(data);};
 const call=(data:any,transfer:Transferable[]=[])=>new Promise<any>((resolve,reject)=>{if(closed||signal.aborted){reject(Error('推理已取消'));return;}const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('推理响应超时'));},data.kind==='init'?12000:firstFrame?8000:1000);pending.set(id,{resolve,reject,timer});try{worker.postMessage({...data,id},transfer);}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}});
 try{const copy=bytes.slice(0);await call({kind:'init',bytes:copy,delegate,wasm:new URL('/pose/wasm',location.origin).href},[copy]);}catch(e){close();throw e;}
 return {mode:delegate==='GPU'?'worker-gpu':'worker-cpu',close,infer:async(video,timestamp)=>{const image=await createImageBitmap(video);if(closed||signal.aborted){image.close();throw Error('推理已取消');}try{const result=await call({kind:'frame',image,timestamp},[image]);firstFrame=false;return result;}catch(e){image.close();throw e;}}};
}
export async function openPoseTransport(name:PoseModel,signal:AbortSignal,video?:HTMLVideoElement,options:{mainThread?:boolean}={}):Promise<PoseTransport>{
 if(name==='full'&&(typeof Worker==='undefined'||typeof createImageBitmap==='undefined'))throw Error('Full Worker 不可用，降级到 Lite');
 const bytes=await modelBytes(name,signal);
 if(!options.mainThread)for(const delegate of ['GPU','CPU'] as const){try{const candidate=await workerTransport(bytes,delegate,signal);try{if(video)await candidate.infer(video,performance.now());return candidate;}catch(e){candidate.close();throw e;}}catch(e){if(signal.aborted)throw e;}}
 if(name==='full')throw Error('Full Worker 不可用，降级到 Lite');
 const {FilesetResolver,PoseLandmarker}=await import('@mediapipe/tasks-vision');const vision=await FilesetResolver.forVisionTasks('/pose/wasm');let model:PoseLandmarker|null=null,mode:PoseMode='main-gpu';
 for(const delegate of ['GPU','CPU'] as const){try{model=await PoseLandmarker.createFromOptions(vision,{runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.55,minPosePresenceConfidence:.55,minTrackingConfidence:.55,baseOptions:{modelAssetBuffer:new Uint8Array(bytes),delegate}});mode=delegate==='GPU'?'main-gpu':'main-cpu';if(signal.aborted)throw Error('推理已取消');if(video)model.detectForVideo(video,performance.now());break;}catch(e){model?.close();model=null;if(signal.aborted)throw e;}}
 if(!model)throw Error('Lite 模型初始化失败');const instance=model;let closed=false;
 const close=()=>{if(closed)return;closed=true;instance.close();signal.removeEventListener('abort',close);};signal.addEventListener('abort',close,{once:true});if(signal.aborted){close();throw Error('推理已取消');}
 return {mode,close,infer:async(video,timestamp)=>{if(closed)throw Error('推理已取消');const r=instance.detectForVideo(video,timestamp);return {landmarks:r.landmarks[0]||null,worldLandmarks:r.worldLandmarks[0]||null};}};
}
