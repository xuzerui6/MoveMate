import {useCallback,useEffect,useRef,useState} from 'react';
import type {NormalizedLandmark as Point} from '@mediapipe/tasks-vision';
import {AdaptiveRecognition} from '../lib/adaptiveRecognition';
import {waitForVideoFrame} from '../lib/videoReady';
import {openPoseTransport,type PoseTransport} from '../lib/poseTransport';
import {fullIsFast,percentile95,type PoseFrame,type PoseModel,type PoseTelemetry} from '../lib/poseProtocol';
import type {ExerciseMetrics,RecognitionDiagnostics} from '../lib/exerciseMetrics';
export type PoseFailurePhase='camera'|'model'|'calibration'|'performance'|'inference';
export type AdaptiveOptions={type:string;key:string;target:number;restored:Partial<ExerciseMetrics>;warmWhenPaused?:boolean};
export type EngineSnapshot={metrics:ExerciseMetrics;diagnostics:RecognitionDiagnostics};
type Video=HTMLVideoElement&{requestVideoFrameCallback?:(cb:(now:number,metadata:{mediaTime:number})=>void)=>number;cancelVideoFrameCallback?:(id:number)=>void};
type Runtime={controller:AbortController;transport:PoseTransport|null;stream:MediaStream|null;runId:number;frameId:number;origin:number|null;lastMedia:number;lastDecoded:number;inFlight:boolean;callback:number;raf:boolean;forceRaf:boolean;fallbackTimer:ReturnType<typeof setTimeout>|null;preparing:boolean;passive:boolean;probing:boolean;probeTimes:number[];latencies:number[];times:number[];slowSince:number|null;startedAt:number;lastReceived:number;model:PoseModel;engine:AdaptiveRecognition;key:string;finish:((ready:boolean)=>void)|null;timer:ReturnType<typeof setTimeout>|null};
export function useAdaptivePose(active:boolean,options:AdaptiveOptions){
 const videoRef=useRef<HTMLVideoElement>(null),errorReason=useRef(''),opts=useRef(options),activeRef=useRef(active),runtime=useRef<Runtime|null>(null),serial=useRef(0),mounted=useRef(true),lastStats=useRef<{key:string;metrics:ExerciseMetrics}|null>(null);opts.current=options;activeRef.current=active;
 const [failurePhase,setFailurePhase]=useState<PoseFailurePhase|null>(null);
 const [status,setStatus]=useState<'idle'|'loading'|'ready'|'denied'|'error'>('idle');
 const [state,setState]=useState<{landmarks:Point[]|null;worldLandmarks:Point[]|null;frame:PoseFrame|null;engine:EngineSnapshot|null;key:string;telemetry:PoseTelemetry|null}>({landmarks:null,worldLandmarks:null,frame:null,engine:null,key:'',telemetry:null});
 const publish=(r:Runtime,reason:string,f?:PoseFrame)=>{if(!mounted.current||runtime.current!==r)return;lastStats.current={key:r.key,metrics:structuredClone(r.engine.metrics)};const elapsed=r.times.length>1?r.times[r.times.length-1]-r.times[0]:0;setState({landmarks:f?.landmarks||null,worldLandmarks:f?.worldLandmarks||null,frame:f||null,key:r.key,engine:{metrics:{...r.engine.metrics},diagnostics:{...r.engine.diagnostics}},telemetry:{model:r.model,mode:r.transport?.mode||null,fps:elapsed>0?(r.times.length-1)*1000/elapsed:0,latency:Number.isFinite(percentile95(r.latencies))?percentile95(r.latencies):0,reason,preparing:r.preparing,lowPerformance:r.slowSince!==null&&performance.now()-r.slowSince>=3000}});};
 const release=(r:Runtime)=>{r.runId=++serial.current;r.controller.abort();r.transport?.close();r.stream?.getTracks().forEach(t=>t.stop());if(r.timer)clearTimeout(r.timer);if(r.fallbackTimer)clearTimeout(r.fallbackTimer);r.finish?.(false);r.finish=null;const v=videoRef.current as Video|null;if(v){if(r.raf)cancelAnimationFrame(r.callback);else v.cancelVideoFrameCallback?.(r.callback);v.srcObject=null;}};
 const stop=useCallback(()=>{const r=runtime.current;if(r){release(r);runtime.current=null;}if(mounted.current){setStatus('idle');setFailurePhase(null);setState(s=>({...s,landmarks:null,worldLandmarks:null,frame:null}));}},[]);
 const performanceFailure=(r:Runtime)=>{setFailurePhase('performance');r.engine.interrupt('有效识别帧率过低，已冻结计数，请暂停后使用 Lite 或转手动');activeRef.current=false;errorReason.current='有效识别帧率低于 8 FPS，统计已冻结，请使用 Lite 重试或转手动';release(r);setStatus('error');publish(r,errorReason.current);};
 const calibrationDeadline=(r:Runtime)=>{if(r.timer)clearTimeout(r.timer);r.timer=setTimeout(()=>{
  if(runtime.current!==r||r.controller.signal.aborted)return;
  setFailurePhase('calibration');errorReason.current='模型已就绪，但起始姿势校准未完成：'+r.engine.metrics.feedback+'。请调整入镜后重试，或使用 Lite 兼容模式';
  release(r);setStatus('error');publish(r,errorReason.current);
 },30000);};
 const schedule=(r:Runtime)=>{
  const v=videoRef.current as Video|null;if(!v||r.controller.signal.aborted||runtime.current!==r)return;
  const callback=(_now:number,metadata?:{mediaTime:number})=>{
   if(r.controller.signal.aborted||runtime.current!==r)return;if(r.fallbackTimer)clearTimeout(r.fallbackTimer);
   schedule(r);const now=performance.now();
   if(activeRef.current&&!r.preparing&&r.transport&&now-r.lastReceived>3000){performanceFailure(r);return;}
   if(!r.transport||r.inFlight||v.readyState<2||(!r.preparing&&!activeRef.current&&!r.passive))return;
   if(r.passive&&!r.preparing&&!activeRef.current&&r.times.length&&now-r.times[r.times.length-1]<90)return;
   const decoded=v.getVideoPlaybackQuality?.().totalVideoFrames??(v as Video&{webkitDecodedFrameCount?:number}).webkitDecodedFrameCount;if(!metadata&&decoded!==undefined){if(decoded===r.lastDecoded)return;r.lastDecoded=decoded;}
   const media=metadata?.mediaTime??v.currentTime;if(media===r.lastMedia)return;if(r.transport.mode.startsWith('main')&&r.times.length&&now-r.times[r.times.length-1]<1000/15)return;
   r.lastMedia=media;r.origin??=now-media*1000;const capturedAt=Math.min(now,r.origin+media*1000),runId=r.runId,id=++r.frameId,width=v.videoWidth,height=v.videoHeight;r.inFlight=true;
   void r.transport.infer(v,capturedAt).then(async result=>{
    if(r.controller.signal.aborted||runtime.current!==r||runId!==r.runId)return;
    const receivedAt=performance.now(),f:PoseFrame={runId,frameId:id,capturedAt,receivedAt,width,height,...result,model:r.model,mode:r.transport!.mode};r.lastReceived=receivedAt;
    r.latencies=[...r.latencies,receivedAt-capturedAt].slice(-120);r.times=[...r.times,...(receivedAt-capturedAt<=250&&(!r.times.length||capturedAt>r.times[r.times.length-1])?[capturedAt]:[])].filter(t=>capturedAt-t<=2000);
    if(r.probing){r.engine.update(f,false);r.probeTimes.push(capturedAt);if(capturedAt-r.probeTimes[0]>=2200){if(r.timer)clearTimeout(r.timer);r.timer=null;
     if(!fullIsFast(r.probeTimes,r.latencies)){r.engine.interrupt('模型切换，重新确认起始姿势');r.transport!.close();r.model='lite';publish(r,'Full 未达到性能门槛，正在改用 Lite');r.transport=await openPoseTransport('lite',r.controller.signal,videoRef.current||undefined);r.times=[];r.latencies=[];}
     if(r.controller.signal.aborted)return;r.probing=false;calibrationDeadline(r);
     if(r.engine.ready&&r.engine.diagnostics.stage==='ready'){r.preparing=false;if(r.timer)clearTimeout(r.timer);r.finish?.(true);r.finish=null;setStatus('ready');}
    }publish(r,r.probing?'正在自动检查起始姿势与设备性能，不计时：'+r.engine.metrics.feedback:r.engine.metrics.feedback,r.model==='full'?f:undefined);return;}
    if(r.preparing){r.engine.update(f,false);publish(r,r.engine.metrics.feedback,f);if(r.engine.ready&&r.engine.diagnostics.stage==='ready'){const elapsed=r.times[r.times.length-1]-r.times[0],fps=elapsed>0?(r.times.length-1)*1000/elapsed:0;if(fps<8){setFailurePhase('performance');errorReason.current='准备阶段有效帧率低于 8 FPS，请改善设备性能或使用旧版／手动记录';release(r);setStatus('error');publish(r,errorReason.current);return;}r.preparing=false;if(r.timer)clearTimeout(r.timer);r.finish?.(true);r.finish=null;setStatus('ready');}return;}
    if(r.passive&&!activeRef.current){r.engine.update(f,false);publish(r,r.engine.ready&&r.engine.diagnostics.stage==='ready'?'已暂停 · 起始姿势已准备好，可直接继续':'已暂停 · 自动准备：'+r.engine.metrics.feedback,f);return;}
    if(activeRef.current){r.engine.update(f);const elapsed=capturedAt-r.startedAt,fps=r.times.length>1?(r.times.length-1)*1000/(r.times[r.times.length-1]-r.times[0]):0;
     if(elapsed>2500&&fps<8)r.slowSince??=receivedAt;else r.slowSince=null;
     if(r.slowSince!==null&&receivedAt-r.slowSince>=3000){performanceFailure(r);return;}publish(r,r.engine.metrics.feedback,f);
    }
   }).catch(e=>{if(r.controller.signal.aborted||runtime.current!==r||runId!==r.runId)return;setFailurePhase(r.probing?'model':'inference');errorReason.current=e instanceof Error?e.message:'姿态推理失败';r.engine.interrupt(errorReason.current);release(r);setStatus('error');publish(r,errorReason.current);}).finally(()=>{r.inFlight=false;});
  };
  if(v.requestVideoFrameCallback&&!r.forceRaf){r.raf=false;r.callback=v.requestVideoFrameCallback(callback);r.fallbackTimer=setTimeout(()=>{if(r.controller.signal.aborted)return;v.cancelVideoFrameCallback?.(r.callback);r.forceRaf=true;callback(performance.now(),{mediaTime:v.currentTime});},500);}else{r.raf=true;r.callback=requestAnimationFrame(callback);}
 };
 const start=useCallback(async(forceLite=false)=>{
  const previous=runtime.current;
  if(previous&&!forceLite&&!previous.controller.signal.aborted&&previous.key===opts.current.key&&status==='ready'&&performance.now()-previous.lastReceived<=200){
   const elapsed=previous.times.length>1?previous.times[previous.times.length-1]-previous.times[0]:0,fps=elapsed>0?(previous.times.length-1)*1000/elapsed:0;
   const nextRun=serial.current+1;
   if(fps>=8&&previous.engine.continuePrepared(nextRun)){serial.current=nextRun;previous.runId=nextRun;previous.frameId=0;previous.passive=false;publish(previous,'起始姿势已准备好，正在继续');return true;}
  }
  const oldStats=previous?.key===opts.current.key?previous.engine.metrics:lastStats.current?.key===opts.current.key?lastStats.current.metrics:undefined,saved=oldStats&&oldStats.reps>(opts.current.restored.reps||0)?oldStats:opts.current.restored;
  const reuse=previous&&!previous.controller.signal.aborted&&previous.transport&&(!forceLite||previous.model==='lite'&&previous.transport.mode.startsWith('main'));let r:Runtime;
  if(reuse){r=previous!;r.runId=++serial.current;r.frameId=0;r.preparing=true;r.passive=false;r.probing=false;r.times=[];r.latencies=[];r.slowSince=null;r.startedAt=performance.now();r.key=opts.current.key;r.engine=new AdaptiveRecognition(opts.current.type,opts.current.target,saved,r.runId);r.finish?.(false);}
  else{if(previous)release(previous);const runId=++serial.current;r={controller:new AbortController(),transport:null,stream:null,runId,frameId:0,origin:null,lastMedia:-1,lastDecoded:-1,inFlight:false,callback:0,raf:true,forceRaf:false,fallbackTimer:null,preparing:true,passive:false,probing:false,probeTimes:[],latencies:[],times:[],slowSince:null,startedAt:performance.now(),lastReceived:performance.now(),model:forceLite?'lite':'full',engine:new AdaptiveRecognition(opts.current.type,opts.current.target,saved,runId),key:opts.current.key,finish:null,timer:null};runtime.current=r;}
  let phase:PoseFailurePhase='camera';errorReason.current='';setFailurePhase(null);setStatus('loading');publish(r,'正在准备本地识别，不计时');
  try{
   if(!reuse){
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:720},height:{ideal:960},aspectRatio:{ideal:3/4}},audio:false});
    if(r.controller.signal.aborted||!videoRef.current){stream.getTracks().forEach(t=>t.stop());return false;}r.stream=stream;videoRef.current.muted=true;videoRef.current.playsInline=true;videoRef.current.srcObject=stream;await videoRef.current.play();await waitForVideoFrame(videoRef.current,r.controller.signal);phase='model';
    try{r.transport=await openPoseTransport(r.model,r.controller.signal,videoRef.current||undefined,{mainThread:forceLite});}catch(e){if(r.controller.signal.aborted)throw e;if(r.model==='lite')throw e;r.model='lite';publish(r,'Full 不可用，正在改用 Lite');r.transport=await openPoseTransport('lite',r.controller.signal,videoRef.current||undefined);}
    if(r.controller.signal.aborted){r.transport.close();return false;}r.probing=r.model==='full';schedule(r);
   }
   return await new Promise<boolean>(resolve=>{r.finish=resolve;if(!r.probing)calibrationDeadline(r);else r.timer=setTimeout(()=>{if(r.controller.signal.aborted)return;setFailurePhase('performance');errorReason.current='Full 性能测量未完成，请使用 Lite 兼容模式重试';release(r);setStatus('error');publish(r,errorReason.current);},12000);});
  }catch(e){if(r.controller.signal.aborted)return false;release(r);setFailurePhase(phase);errorReason.current=e instanceof DOMException&&e.name==='NotAllowedError'?'摄像头权限被拒绝，请允许后重试':e instanceof Error?e.message:'模型或摄像头准备失败';setStatus(e instanceof DOMException&&e.name==='NotAllowedError'?'denied':'error');publish(r,errorReason.current);return false;}
 },[status]);
 useEffect(()=>{const r=runtime.current;if(!r||r.preparing||r.controller.signal.aborted)return;if(!active){if(!opts.current.warmWhenPaused){r.passive=false;r.runId=++serial.current;r.engine.interrupt();publish(r,'识别已冻结，等待操作确认');return;}if(r.key!==opts.current.key){r.passive=false;r.engine.interrupt();return;}const saved=structuredClone(r.engine.metrics);r.runId=++serial.current;r.frameId=0;r.engine=new AdaptiveRecognition(opts.current.type,opts.current.target,saved,r.runId);r.passive=true;r.times=[];publish(r,'已暂停 · 回到起始姿势后自动准备，不计次数或时长');}else{r.passive=false;r.startedAt=performance.now();r.lastReceived=performance.now();r.times=[];r.slowSince=null;}},[active,options.warmWhenPaused]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;const r=runtime.current;if(r)release(r);runtime.current=null;};},[]);
 useEffect(()=>{const hide=()=>{const r=runtime.current;if(document.hidden&&r&&!r.controller.signal.aborted){r.engine.interrupt('页面已转入后台，已冻结识别，请返回后重新校准');errorReason.current='页面已转入后台，已冻结识别，请重新校准后继续';release(r);setStatus('error');publish(r,errorReason.current);}};document.addEventListener('visibilitychange',hide);return()=>document.removeEventListener('visibilitychange',hide);},[]);
 return {videoRef,errorReason,status,failurePhase,start,stop,landmarks:state.landmarks,worldLandmarks:state.worldLandmarks,frame:state.frame,telemetry:state.telemetry,engine:state.key===options.key?state.engine:null};
}
