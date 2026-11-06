import {useCallback,useEffect,useRef,useState} from 'react';
import type {NormalizedLandmark as Point} from '@mediapipe/tasks-vision';
import {AdaptiveRecognition, loadPoseModelPreference} from '../lib/adaptiveRecognition';
import {usesMainThreadLite, decodedFrameCount, planPoseSession} from '../lib/poseCompatibility';
import {waitForVideoFrame} from '../lib/videoReady';
import {openPoseTransport,type PoseTransport} from '../lib/poseTransport';
import {fullIsFast,percentile50,percentile95,type PoseFrame,type PoseModel,type PoseTelemetry} from '../lib/poseProtocol';
import type {ExerciseMetrics,RecognitionDiagnostics} from '../lib/exerciseMetrics';
export type PoseFailurePhase='camera'|'model'|'framing'|'performance'|'inference';
export type AdaptiveOptions={type:string;key:string;target:number;restored:Partial<ExerciseMetrics>;warmWhenPaused?:boolean};
export type EngineSnapshot={metrics:ExerciseMetrics;diagnostics:RecognitionDiagnostics};
type Video=HTMLVideoElement&{requestVideoFrameCallback?:(cb:(now:number,metadata:{mediaTime:number})=>void)=>number;cancelVideoFrameCallback?:(id:number)=>void};
type Runtime={controller:AbortController;transport:PoseTransport|null;stream:MediaStream|null;runId:number;frameId:number;origin:number|null;lastMedia:number;lastDecoded:number;inFlight:boolean;callback:number;raf:boolean;forceRaf:boolean;appleCamera:boolean;playRetried:boolean;fallbackTimer:ReturnType<typeof setTimeout>|null;preparing:boolean;passive:boolean;probing:boolean;probeTimes:number[];latencies:number[];times:number[];slowSince:number|null;startedAt:number;lastReceived:number;lastSubmitted:number;model:PoseModel;engine:AdaptiveRecognition;key:string;finish:((ready:boolean)=>void)|null;timer:ReturnType<typeof setTimeout>|null;inferTimes:number[];experiment:PoseModel|null;recoveredFrom:PoseModel|null};
export function useAdaptivePose(active:boolean,options:AdaptiveOptions){
 const videoRef=useRef<HTMLVideoElement>(null),errorReason=useRef(''),opts=useRef(options),activeRef=useRef(active),runtime=useRef<Runtime|null>(null),serial=useRef(0),mounted=useRef(true),lastStats=useRef<{key:string;metrics:ExerciseMetrics}|null>(null);opts.current=options;activeRef.current=active;
 const [failurePhase,setFailurePhase]=useState<PoseFailurePhase|null>(null);
 const [status,setStatus]=useState<'idle'|'loading'|'ready'|'denied'|'error'>('idle');
 const [state,setState]=useState<{landmarks:Point[]|null;worldLandmarks:Point[]|null;frame:PoseFrame|null;engine:EngineSnapshot|null;key:string;telemetry:PoseTelemetry|null}>({landmarks:null,worldLandmarks:null,frame:null,engine:null,key:'',telemetry:null});
 const publish=(r:Runtime,reason:string,f?:PoseFrame)=>{if(!mounted.current||runtime.current!==r)return;lastStats.current={key:r.key,metrics:structuredClone(r.engine.metrics)};const elapsed=r.times.length>1?r.times[r.times.length-1]-r.times[0]:0;setState({landmarks:f?.landmarks||null,worldLandmarks:f?.worldLandmarks||null,frame:f||null,key:r.key,engine:{metrics:{...r.engine.metrics},diagnostics:{...r.engine.diagnostics}},telemetry:{model:r.model,mode:r.transport?.mode||null,fps:elapsed>0?(r.times.length-1)*1000/elapsed:0,latency:Number.isFinite(percentile95(r.latencies))?percentile95(r.latencies):0,latency50:Number.isFinite(percentile50(r.latencies))?percentile50(r.latencies):0,inference:Number.isFinite(percentile95(r.inferTimes))?percentile95(r.inferTimes):0,experiment:r.experiment,recoveredFrom:r.recoveredFrom,reason,preparing:r.preparing,lowPerformance:r.slowSince!==null&&performance.now()-r.slowSince>=3000}});};
 const release=(r:Runtime)=>{r.runId=++serial.current;r.controller.abort();r.transport?.close();r.stream?.getTracks().forEach(t=>t.stop());if(r.timer)clearTimeout(r.timer);if(r.fallbackTimer)clearTimeout(r.fallbackTimer);r.finish?.(false);r.finish=null;const v=videoRef.current as Video|null;if(v){if(r.raf)cancelAnimationFrame(r.callback);else v.cancelVideoFrameCallback?.(r.callback);v.srcObject=null;}};
 const stop=useCallback(()=>{const r=runtime.current;if(r){release(r);runtime.current=null;}if(mounted.current){setStatus('idle');setFailurePhase(null);setState(s=>({...s,landmarks:null,worldLandmarks:null,frame:null}));}},[]);
 const performanceFailure=(r:Runtime)=>{setFailurePhase('performance');r.engine.interrupt('有效识别帧率过低，已冻结计数，请暂停后使用 Lite 或转手动');activeRef.current=false;errorReason.current='有效识别帧率低于 8 FPS，统计已冻结，请使用 Lite 重试或转手动';release(r);setStatus('error');publish(r,errorReason.current);};
 const frameDeadline=(r:Runtime)=>{if(r.timer)clearTimeout(r.timer);r.timer=setTimeout(()=>{
  if(runtime.current!==r||r.controller.signal.aborted)return;
  const now=performance.now();
  if(now-r.lastSubmitted>3000){
   setFailurePhase('camera');
   errorReason.current='摄像头没有持续提供新画面，请保持页面在前台并重新开启摄像头。';
  }else if(r.times.filter(time=>now-time<=1000).length<8){
   setFailurePhase('performance');
   errorReason.current='识别未收到及时的画面结果，请关闭占用设备的应用后重试。';
  }else{
   setFailurePhase('framing');
   errorReason.current=r.engine.metrics.feedback;
  }
  release(r);setStatus('error');publish(r,errorReason.current);
 },30000);};
 const fallbackToLite=async(r:Runtime)=>{
  if(runtime.current!==r||r.controller.signal.aborted||!r.probing)return;
  r.probing=false;
  if(r.timer)clearTimeout(r.timer);
  r.timer=null;
  r.runId=++serial.current;
  r.frameId=0;
  const completed=r.engine.metrics;
  r.engine=new AdaptiveRecognition(opts.current.type,opts.current.target,completed,r.runId);
  r.transport?.close();
  r.transport=null;
  r.inFlight=false;
  if(r.model!=='lite')r.recoveredFrom=r.model;
  r.model='lite';
  r.times=[];
  r.latencies=[];
  r.inferTimes=[];
  r.probeTimes=[];
  publish(r,'正在准备轻量识别');
  try{
   const transport=await openPoseTransport('lite',r.controller.signal,videoRef.current||undefined,{mainThread:true});
   if(runtime.current!==r||r.controller.signal.aborted){transport.close();return;}
   r.transport=transport;
   frameDeadline(r);
  }catch(error){
   if(runtime.current!==r||r.controller.signal.aborted)return;
   setFailurePhase('model');
   errorReason.current=error instanceof Error?error.message:'Lite 模型加载失败，请重试。';
   release(r);
   setStatus('error');
   publish(r,errorReason.current);
  }
 };
 const schedule=(r:Runtime)=>{
  const v=videoRef.current as Video|null;if(!v||r.controller.signal.aborted||runtime.current!==r)return;
  let consumed=false;
  const callback=(_now:number,metadata?:{mediaTime:number})=>{
   if(consumed||r.controller.signal.aborted||runtime.current!==r)return;
   consumed=true;if(r.fallbackTimer)clearTimeout(r.fallbackTimer);
   const now=performance.now();
   if(r.appleCamera&&metadata&&metadata.mediaTime<=r.lastMedia&&now-r.lastSubmitted>500){
    // Some inline streams keep firing callbacks with a stale media timestamp.
    r.forceRaf=true;
    metadata=undefined;
   }
   schedule(r);
   if(r.appleCamera&&r.preparing&&r.transport&&v.paused&&!r.playRetried){
    r.playRetried=true;
    void v.play().catch(()=>undefined);
   }
   if(activeRef.current&&!r.preparing&&r.transport&&now-r.lastReceived>3000){performanceFailure(r);return;}
   if(!r.transport||r.inFlight||v.readyState<2||(!r.preparing&&!activeRef.current&&!r.passive))return;
   if(r.passive&&!r.preparing&&!activeRef.current&&r.times.length&&now-r.times[r.times.length-1]<90)return;
   const decoded=decodedFrameCount(v.getVideoPlaybackQuality?.().totalVideoFrames,(v as Video&{webkitDecodedFrameCount?:number}).webkitDecodedFrameCount);
   const media=metadata?.mediaTime??v.currentTime;
   if(!Number.isFinite(media)||media<=r.lastMedia)return;
   if(!metadata&&!r.appleCamera&&decoded!==null&&decoded<=r.lastDecoded)return;
   if(r.transport.mode.startsWith('main')&&now-r.lastSubmitted<1000/15)return;
   if(decoded!==null)r.lastDecoded=decoded;
   r.lastSubmitted=now;
   r.lastMedia=media;
   r.origin??=now-media*1000;
   const capturedAt=Math.min(now,r.origin+media*1000),runId=r.runId,id=++r.frameId,width=v.videoWidth,height=v.videoHeight;
   const transport=r.transport;
   r.inFlight=true;
   const inferStartedAt=performance.now();
   void transport.infer(v,capturedAt).then(result=>{
    r.inferTimes=[...r.inferTimes,performance.now()-inferStartedAt].slice(-120);
    if(r.controller.signal.aborted||runtime.current!==r||runId!==r.runId)return;
    const receivedAt=performance.now(),f:PoseFrame={runId,frameId:id,capturedAt,receivedAt,width,height,...result,model:r.model,mode:r.transport!.mode};r.lastReceived=receivedAt;
    r.latencies=[...r.latencies,receivedAt-capturedAt].slice(-120);r.times=[...r.times,...(receivedAt-capturedAt<=250&&(!r.times.length||capturedAt>r.times[r.times.length-1])?[capturedAt]:[])].filter(t=>capturedAt-t<=2000);
    if(r.probing){
     r.probeTimes.push(capturedAt);
     if(capturedAt-r.probeTimes[0]<2200){publish(r,'正在检查识别速度',f);return;}
     if(!fullIsFast(r.probeTimes,r.latencies)){void fallbackToLite(r);return;}
     r.probing=false;
     frameDeadline(r);
    }
    if(r.preparing){
     if(receivedAt-capturedAt>250)return;
     r.engine.update(f,false);
     if(!r.engine.usableFrame){publish(r,r.engine.metrics.feedback,f);return;}
     r.preparing=false;
     if(r.timer)clearTimeout(r.timer);
     r.finish?.(true);
     r.finish=null;
     setStatus('ready');
     publish(r,r.engine.metrics.feedback,f);
     return;
    }
    if(r.passive&&!activeRef.current){r.engine.update(f,false);publish(r,r.engine.ready&&r.engine.diagnostics.stage==='ready'?'已暂停 · 起始姿势已准备好，可直接继续':'已暂停 · 自动准备：'+r.engine.metrics.feedback,f);return;}
    if(activeRef.current){r.engine.update(f);const elapsed=capturedAt-r.startedAt,fps=r.times.length>1?(r.times.length-1)*1000/(r.times[r.times.length-1]-r.times[0]):0;
     if(elapsed>2500&&fps<8)r.slowSince??=receivedAt;else r.slowSince=null;
     if(r.slowSince!==null&&receivedAt-r.slowSince>=3000){performanceFailure(r);return;}publish(r,r.engine.metrics.feedback,f);
    }
   }).catch(e=>{if(r.controller.signal.aborted||runtime.current!==r||runId!==r.runId)return;if(r.probing){void fallbackToLite(r);return;}setFailurePhase('inference');errorReason.current=e instanceof Error?e.message:'姿态推理失败';r.engine.interrupt(errorReason.current);release(r);setStatus('error');publish(r,errorReason.current);}).finally(()=>{if(r.transport===transport)r.inFlight=false;});
  };
  if(v.requestVideoFrameCallback&&!r.forceRaf){r.raf=false;r.callback=v.requestVideoFrameCallback(callback);r.fallbackTimer=setTimeout(()=>{if(r.controller.signal.aborted)return;v.cancelVideoFrameCallback?.(r.callback);r.forceRaf=true;callback(performance.now());},500);}else{r.raf=true;r.callback=requestAnimationFrame(callback);}
 };
 const start=useCallback(async(forceLite=false)=>{
  const appleCamera=usesMainThreadLite(navigator.userAgent,navigator.platform,navigator.maxTouchPoints);
  const plan=planPoseSession(loadPoseModelPreference(),appleCamera,forceLite);
  const mainThread=plan.mainThread;
  const previous=runtime.current;
  if(previous&&!forceLite&&!previous.controller.signal.aborted&&previous.key===opts.current.key&&status==='ready'&&performance.now()-previous.lastReceived<=200){
   const elapsed=previous.times.length>1?previous.times[previous.times.length-1]-previous.times[0]:0,fps=elapsed>0?(previous.times.length-1)*1000/elapsed:0;
   const nextRun=serial.current+1;
   if(fps>=8&&previous.engine.continuePrepared(nextRun)){serial.current=nextRun;previous.runId=nextRun;previous.frameId=0;previous.passive=false;publish(previous,'起始姿势已准备好，正在继续');return true;}
  }
  const oldStats=previous?.key===opts.current.key?previous.engine.metrics:lastStats.current?.key===opts.current.key?lastStats.current.metrics:undefined,saved=oldStats&&oldStats.reps>(opts.current.restored.reps||0)?oldStats:opts.current.restored;
  const reuse=previous&&!previous.controller.signal.aborted&&previous.transport&&previous.model===plan.model&&(!mainThread||previous.transport.mode.startsWith('main'));let r:Runtime;
  if(reuse){r=previous!;r.runId=++serial.current;r.frameId=0;r.preparing=true;r.passive=false;r.probing=false;r.times=[];r.latencies=[];r.inferTimes=[];r.experiment=plan.experiment;r.recoveredFrom=null;r.slowSince=null;r.startedAt=performance.now();r.key=opts.current.key;r.engine=new AdaptiveRecognition(opts.current.type,opts.current.target,saved,r.runId);r.finish?.(false);}
  else{if(previous)release(previous);const runId=++serial.current;r={controller:new AbortController(),transport:null,stream:null,runId,frameId:0,origin:null,lastMedia:-1,lastDecoded:-1,inFlight:false,callback:0,raf:true,forceRaf:false,appleCamera,playRetried:false,fallbackTimer:null,preparing:true,passive:false,probing:false,probeTimes:[],latencies:[],times:[],slowSince:null,startedAt:performance.now(),lastReceived:performance.now(),lastSubmitted:-Infinity,model:plan.model,engine:new AdaptiveRecognition(opts.current.type,opts.current.target,saved,runId),key:opts.current.key,finish:null,timer:null,inferTimes:[],experiment:plan.experiment,recoveredFrom:null};runtime.current=r;}
  let phase:PoseFailurePhase='camera';errorReason.current='';setFailurePhase(null);setStatus('loading');publish(r,reuse?'正在恢复识别':'正在准备摄像头');
  try{
   if(!reuse){
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:720},height:{ideal:960},aspectRatio:{ideal:3/4}},audio:false});
    if(r.controller.signal.aborted||!videoRef.current){stream.getTracks().forEach(t=>t.stop());return false;}r.stream=stream;videoRef.current.muted=true;videoRef.current.playsInline=true;videoRef.current.srcObject=stream;await videoRef.current.play();await waitForVideoFrame(videoRef.current,r.controller.signal);phase='model';
    publish(r,'正在准备识别');
    try{r.transport=await openPoseTransport(r.model,r.controller.signal,videoRef.current||undefined,{mainThread});}catch(e){if(r.controller.signal.aborted)throw e;if(r.model==='lite')throw e;r.recoveredFrom=r.model;r.model='lite';publish(r,'正在准备轻量识别');r.transport=await openPoseTransport('lite',r.controller.signal,videoRef.current||undefined,{mainThread:true});}
    if(r.controller.signal.aborted){r.transport.close();return false;}r.probing=r.model!=='lite';schedule(r);
   }
   return await new Promise<boolean>(resolve=>{r.finish=resolve;if(!r.probing)frameDeadline(r);else r.timer=setTimeout(()=>void fallbackToLite(r),12000);});
  }catch(e){if(r.controller.signal.aborted)return false;release(r);setFailurePhase(phase);errorReason.current=e instanceof DOMException&&e.name==='NotAllowedError'?'摄像头权限被拒绝，请允许后重试':e instanceof Error?e.message:'模型或摄像头准备失败';setStatus(e instanceof DOMException&&e.name==='NotAllowedError'?'denied':'error');publish(r,errorReason.current);return false;}
 },[status]);
 useEffect(()=>{const r=runtime.current;if(!r||r.preparing||r.controller.signal.aborted)return;if(!active){if(!opts.current.warmWhenPaused){r.passive=false;r.runId=++serial.current;r.engine.interrupt();publish(r,'识别已冻结，等待操作确认');return;}if(r.key!==opts.current.key){r.passive=false;r.engine.interrupt();return;}const saved=structuredClone(r.engine.metrics);r.runId=++serial.current;r.frameId=0;r.engine=new AdaptiveRecognition(opts.current.type,opts.current.target,saved,r.runId);r.passive=true;r.times=[];publish(r,'已暂停 · 回到起始姿势后自动准备，不计次数或时长');}else{r.passive=false;r.startedAt=performance.now();r.lastReceived=performance.now();r.times=[];r.slowSince=null;}},[active,options.warmWhenPaused]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;const r=runtime.current;if(r)release(r);runtime.current=null;};},[]);
 useEffect(()=>{const hide=()=>{const r=runtime.current;if(document.hidden&&r&&!r.controller.signal.aborted){r.engine.interrupt('页面已转入后台，已冻结识别，请返回后继续训练');errorReason.current='页面已转入后台，已冻结识别，请返回后继续训练';release(r);setStatus('error');publish(r,errorReason.current);}};document.addEventListener('visibilitychange',hide);return()=>document.removeEventListener('visibilitychange',hide);},[]);
 return {videoRef,errorReason,status,failurePhase,start,stop,landmarks:state.landmarks,worldLandmarks:state.worldLandmarks,frame:state.frame,telemetry:state.telemetry,engine:state.key===options.key?state.engine:null};
}
