import type {PoseLandmarker} from '@mediapipe/tasks-vision';
import type {PoseModel,PoseMode} from './poseProtocol';
import models from './pose-models.json';
export type PoseResult={landmarks:any;worldLandmarks:any};
export type PoseTransport={mode:PoseMode;infer:(video:HTMLVideoElement,timestamp:number)=>Promise<PoseResult>;close:()=>void};
export async function modelBytes(name:PoseModel,signal:AbortSignal){
 const item=models[name],response=await fetch(item.src,{signal});if(!response.ok)throw Error('模型文件读取失败');
 const bytes=await response.arrayBuffer();if(bytes.byteLength!==item.bytes)throw Error('模型大小校验失败');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==item.sha256)throw Error('模型完整性校验失败');return bytes;
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
export async function openPoseTransport(name:PoseModel,signal:AbortSignal,video?:HTMLVideoElement):Promise<PoseTransport>{
 if(name==='full'&&(typeof Worker==='undefined'||typeof createImageBitmap==='undefined'))throw Error('Full Worker 不可用，降级到 Lite');
 const bytes=await modelBytes(name,signal);
 for(const delegate of ['GPU','CPU'] as const){try{const candidate=await workerTransport(bytes,delegate,signal);try{if(video)await candidate.infer(video,performance.now());return candidate;}catch(e){candidate.close();throw e;}}catch(e){if(signal.aborted)throw e;}}
 if(name==='full')throw Error('Full Worker 不可用，降级到 Lite');
 const {FilesetResolver,PoseLandmarker}=await import('@mediapipe/tasks-vision');const vision=await FilesetResolver.forVisionTasks('/pose/wasm');let model:PoseLandmarker|null=null,mode:PoseMode='main-gpu';
 for(const delegate of ['GPU','CPU'] as const){try{model=await PoseLandmarker.createFromOptions(vision,{runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.55,minPosePresenceConfidence:.55,minTrackingConfidence:.55,baseOptions:{modelAssetBuffer:new Uint8Array(bytes),delegate}});mode=delegate==='GPU'?'main-gpu':'main-cpu';break;}catch(e){if(signal.aborted)throw e;}}
 if(!model)throw Error('Lite 模型初始化失败');const instance=model;let closed=false;
 const close=()=>{if(closed)return;closed=true;instance.close();signal.removeEventListener('abort',close);};signal.addEventListener('abort',close,{once:true});if(signal.aborted){close();throw Error('推理已取消');}
 return {mode,close,infer:async(video,timestamp)=>{if(closed)throw Error('推理已取消');const r=instance.detectForVideo(video,timestamp);return {landmarks:r.landmarks[0]||null,worldLandmarks:r.worldLandmarks[0]||null};}};
}
