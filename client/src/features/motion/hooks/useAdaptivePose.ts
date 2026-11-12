import {useCallback,useEffect,useRef,useState} from 'react';
import type {NormalizedLandmark as Point} from '@mediapipe/tasks-vision';
import {AdaptiveRecognition, loadPoseModelPreference} from '../lib/adaptiveRecognition';
import {usesMainThreadLite, decodedFrameCount, planPoseSession, loadPoseVerdict, savePoseVerdict, poseRungId, type PoseRung, type PoseSelectionSource} from '../lib/poseCompatibility';
import {waitForVideoFrame} from '../lib/videoReady';
import {openPoseTransport, poseModelLabel, type PoseTransport} from '../lib/poseTransport';
import {evaluateProbe, sustainedDegradation, percentile50, percentile95, type PoseFrame, type PoseModel, type PoseTelemetry, type ProbeFailureReason} from '../lib/poseProtocol';
import type {ExerciseMetrics,RecognitionDiagnostics} from '../lib/exerciseMetrics';
export type PoseFailurePhase='camera'|'model'|'framing'|'performance'|'inference';
export type AdaptiveOptions={type:string;key:string;target:number;restored:Partial<ExerciseMetrics>;warmWhenPaused?:boolean};
export type EngineSnapshot={metrics:ExerciseMetrics;diagnostics:RecognitionDiagnostics};
type Video=HTMLVideoElement&{requestVideoFrameCallback?:(cb:(now:number,metadata:{mediaTime:number})=>void)=>number;cancelVideoFrameCallback?:(id:number)=>void};
type Runtime={controller:AbortController;transport:PoseTransport|null;stream:MediaStream|null;runId:number;frameId:number;origin:number|null;lastMedia:number;lastDecoded:number;inFlight:boolean;callback:number;raf:boolean;forceRaf:boolean;appleCamera:boolean;playRetried:boolean;fallbackTimer:ReturnType<typeof setTimeout>|null;preparing:boolean;passive:boolean;probing:boolean;probePhase:'off'|'warm'|'measure';probeKind:'full'|'sanity';warmCount:number;warmSince:number;probeTimer:ReturnType<typeof setTimeout>|null;probeTimes:number[];latencies:number[];times:number[];slowSince:number|null;degradeReason:'fps'|'frame-age'|null;startedAt:number;lastReceived:number;lastSubmitted:number;model:PoseModel;engine:AdaptiveRecognition;key:string;finish:((ready:boolean)=>void)|null;timer:ReturnType<typeof setTimeout>|null;inferTimes:number[];experiment:PoseModel|null;recoveredFrom:PoseModel|null;ladder:PoseRung[];rungIndex:number;selection:PoseSelectionSource;events:string[];stepping:boolean};
const REASON_LABEL:Record<ProbeFailureReason,string>={'fps':'帧率不足','frame-age':'帧龄过高',stall:'推理停滞','init-error':'初始化失败','inference-error':'推理出错'};
const rungLabel=(rung:PoseRung)=>`${poseModelLabel[rung.model]}（${rung.path==='worker'?'Worker':'主线程'}）`;
/** Probe shape: warm-up results are discarded before the measurement window so
 * first-run shader/WASM compile can never contaminate the verdict (the first
 * experiment round's unexplained "未达标" is exactly that failure mode). A
 * sanity probe re-checks a cached verdict with a shorter window. */
const PROBE_SHAPE={full:{warmFrames:6,warmMs:4000,windowMs:2200,budgetMs:9000},sanity:{warmFrames:4,warmMs:3000,windowMs:1400,budgetMs:7000}} as const;
export function useAdaptivePose(active:boolean,options:AdaptiveOptions){
 const videoRef=useRef<HTMLVideoElement>(null),errorReason=useRef(''),opts=useRef(options),activeRef=useRef(active),runtime=useRef<Runtime|null>(null),serial=useRef(0),mounted=useRef(true),lastStats=useRef<{key:string;metrics:ExerciseMetrics}|null>(null);opts.current=options;activeRef.current=active;
 const [failurePhase,setFailurePhase]=useState<PoseFailurePhase|null>(null);
 const [status,setStatus]=useState<'idle'|'loading'|'ready'|'denied'|'error'>('idle');
 const [state,setState]=useState<{landmarks:Point[]|null;worldLandmarks:Point[]|null;frame:PoseFrame|null;engine:EngineSnapshot|null;key:string;telemetry:PoseTelemetry|null}>({landmarks:null,worldLandmarks:null,frame:null,engine:null,key:'',telemetry:null});
 const publish=(r:Runtime,reason:string,f?:PoseFrame)=>{if(!mounted.current||runtime.current!==r)return;lastStats.current={key:r.key,metrics:structuredClone(r.engine.metrics)};const elapsed=r.times.length>1?r.times[r.times.length-1]-r.times[0]:0;setState({landmarks:f?.landmarks||null,worldLandmarks:f?.worldLandmarks||null,frame:f||null,key:r.key,engine:{metrics:{...r.engine.metrics},diagnostics:{...r.engine.diagnostics}},telemetry:{model:r.model,mode:r.transport?.mode||null,fps:elapsed>0?(r.times.length-1)*1000/elapsed:0,latency:Number.isFinite(percentile95(r.latencies))?percentile95(r.latencies):0,latency50:Number.isFinite(percentile50(r.latencies))?percentile50(r.latencies):0,inference:Number.isFinite(percentile95(r.inferTimes))?percentile95(r.inferTimes):0,experiment:r.experiment,recoveredFrom:r.recoveredFrom,reason,preparing:r.preparing,lowPerformance:r.slowSince!==null&&performance.now()-r.slowSince>=3000,rung:poseRungId(r.ladder[r.rungIndex]),selection:r.selection,events:[...r.events]}});};
 const release=(r:Runtime)=>{r.runId=++serial.current;r.controller.abort();r.transport?.close();r.stream?.getTracks().forEach(t=>t.stop());if(r.timer)clearTimeout(r.timer);if(r.probeTimer)clearTimeout(r.probeTimer);if(r.fallbackTimer)clearTimeout(r.fallbackTimer);r.finish?.(false);r.finish=null;const v=videoRef.current as Video|null;if(v){if(r.raf)cancelAnimationFrame(r.callback);else v.cancelVideoFrameCallback?.(r.callback);v.srcObject=null;}};
 const stop=useCallback(()=>{const r=runtime.current;if(r){release(r);runtime.current=null;}if(mounted.current){setStatus('idle');setFailurePhase(null);setState(s=>({...s,landmarks:null,worldLandmarks:null,frame:null}));}},[]);
 const performanceFailure=(r:Runtime)=>{setFailurePhase('performance');r.engine.interrupt('画面有点跟不上，我先停在这里。这一组就先数到这儿，歇一下再试，或者改用手动记数。');activeRef.current=false;errorReason.current='这台设备刚才有点跟不上，我先停了下来。歇一下重新开始，或者改用手动记数就好。';release(r);setStatus('error');publish(r,errorReason.current);};
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
 const persistVerdict=(r:Runtime)=>{if(r.selection==='probe'||r.selection==='cache')savePoseVerdict(poseRungId(r.ladder[r.rungIndex]));};
 const recordStep=(r:Runtime,from:PoseRung,to:PoseRung,reason:ProbeFailureReason)=>{
  r.events=[...r.events,`${rungLabel(from)} 未达标（${REASON_LABEL[reason]}），已降级到 ${rungLabel(to)}`].slice(-5);
  if(r.experiment&&from.model!=='lite')r.recoveredFrom=from.model;
 };
 const openRung=async(r:Runtime):Promise<boolean>=>{
  const rung=r.ladder[r.rungIndex];r.model=rung.model;
  // The iOS Worker attempt gets tight init/first-frame bounds: a worker whose
  // GPU init deadlocks (the historical Safari failure) must be abandoned in
  // seconds so the ladder steps down, not after the desktop-grade timeouts.
  const transport=await openPoseTransport(rung.model,r.controller.signal,videoRef.current||undefined,{mainThread:rung.path==='main',...(r.appleCamera&&rung.path==='worker'?{initTimeoutMs:8000,firstFrameTimeoutMs:4000}:{})});
  if(runtime.current!==r||r.controller.signal.aborted){transport.close();return false;}
  r.transport=transport;return true;
 };
 const armProbe=(r:Runtime,kind:'full'|'sanity')=>{
  r.probing=true;r.probePhase='warm';r.probeKind=kind;r.warmCount=0;r.warmSince=performance.now();
  r.probeTimes=[];r.latencies=[];r.inferTimes=[];r.times=[];
  if(r.probeTimer)clearTimeout(r.probeTimer);
  r.probeTimer=setTimeout(()=>{void stepDown(r,'stall');},PROBE_SHAPE[kind].budgetMs);
 };
 /** The current rung is accepted: stop probing, remember the device verdict
  * (auto sessions only) and arm the usual preparation deadline. */
 const settleProbed=(r:Runtime)=>{
  r.probing=false;r.probePhase='off';
  if(r.probeTimer){clearTimeout(r.probeTimer);r.probeTimer=null;}
  persistVerdict(r);
  frameDeadline(r);
 };
 /** Move one rung down the ladder. Only the pose model changes: the
  * recognition engine carries over wholesale (see
  * AdaptiveRecognition.carryToRun), so calibration, the open cycle and the
  * landmark filters survive the swap and the set in progress never notices.
  * During preparation the next rung is probed before it is trusted;
  * mid-session the next rung simply takes over (degradation watching will
  * step down again if it also fails). A stall/init/inference failure on a
  * non-floor rung lands here too — falling back is a normal outcome, never a
  * frozen workout. */
 const stepDown=async(r:Runtime,reason:ProbeFailureReason)=>{
  if(runtime.current!==r||r.controller.signal.aborted||r.stepping)return;
  const from=r.ladder[r.rungIndex],next=r.ladder[r.rungIndex+1];
  if(!next){setFailurePhase('model');errorReason.current='识别没能启动起来，歇一下再试一次。';release(r);setStatus('error');publish(r,errorReason.current);return;}
  r.stepping=true;
  recordStep(r,from,next,reason);
  if(r.probeTimer){clearTimeout(r.probeTimer);r.probeTimer=null;}
  if(r.timer){clearTimeout(r.timer);r.timer=null;}
  r.probing=false;r.probePhase='off';
  const wasPreparing=r.preparing;
  r.runId=++serial.current;
  r.frameId=0;
  r.engine.carryToRun(r.runId);
  r.transport?.close();
  r.transport=null;
  r.inFlight=false;
  r.rungIndex++;
  r.model=next.model;
  r.times=[];
  r.latencies=[];
  r.inferTimes=[];
  r.probeTimes=[];
  r.slowSince=null;
  r.degradeReason=null;
  r.startedAt=performance.now();
  r.lastReceived=performance.now();
  publish(r,'刚才有点跟不上，正在换个更稳的方式');
  try{
   const opened=await openRung(r);
   r.stepping=false;
   if(!opened||runtime.current!==r||r.controller.signal.aborted)return;
   // The stall watchdog measures from the new path's first results, not from
   // when the (possibly slow) model download for this rung began.
   r.lastReceived=performance.now();
   if(r.rungIndex>=r.ladder.length-1){
    r.probing=false;r.probePhase='off';persistVerdict(r);
    if(wasPreparing)frameDeadline(r);
   }else if(wasPreparing){
    armProbe(r,'full');
   }else{
    persistVerdict(r);
   }
  }catch(error){
   r.stepping=false;
   if(runtime.current!==r||r.controller.signal.aborted)return;
   if(r.rungIndex<r.ladder.length-1){void stepDown(r,'init-error');return;}
   setFailurePhase('model');
   console.error(error);errorReason.current='识别没能启动起来，歇一下再试一次。';
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
   if(activeRef.current&&!r.preparing&&r.transport&&now-r.lastReceived>3000){
    // No results for 3 s: on a non-floor rung this is the stall watchdog —
    // abandon the path for this session and step down instead of freezing.
    if(r.rungIndex<r.ladder.length-1){void stepDown(r,'stall');}else performanceFailure(r);
    return;
   }
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
    if(r.probePhase==='warm'){
     r.warmCount++;
     const shape=PROBE_SHAPE[r.probeKind];
     if(r.warmCount>=shape.warmFrames||receivedAt-r.warmSince>=shape.warmMs){
      // Warm-up ends here; its timings are discarded with the arrays so the
      // measurement window judges steady-state speed only.
      r.probePhase='measure';r.probeTimes=[];r.latencies=[];r.inferTimes=[];r.times=[];
      publish(r,'正在检查识别速度',f);
     }else publish(r,'正在预热识别模型',f);
     return;
    }
    if(r.probePhase==='measure'){
     r.probeTimes.push(capturedAt);
     const shape=PROBE_SHAPE[r.probeKind];
     if(capturedAt-r.probeTimes[0]<shape.windowMs){publish(r,'正在检查识别速度',f);return;}
     const verdict=evaluateProbe(r.probeTimes,r.latencies,shape.windowMs);
     if(!verdict.pass){void stepDown(r,verdict.reason??'stall');return;}
     settleProbed(r);
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
     const instant=elapsed>2500?sustainedDegradation(fps,r.latencies.length>=20?percentile95(r.latencies):0):null;
     if(instant){if(r.degradeReason!==instant){r.degradeReason=instant;r.slowSince=receivedAt;}}else{r.degradeReason=null;r.slowSince=null;}
     if(r.degradeReason&&r.slowSince!==null&&receivedAt-r.slowSince>=3000){
      const reason=r.degradeReason;r.degradeReason=null;r.slowSince=null;
      if(r.rungIndex<r.ladder.length-1){void stepDown(r,reason);return;}
      if(reason==='fps'){performanceFailure(r);return;}
      // Frame-age at the floor: Lite has no lower rung; keep the set running.
     }
     publish(r,r.engine.metrics.feedback,f);
    }
   }).catch(e=>{if(r.controller.signal.aborted||runtime.current!==r||runId!==r.runId)return;if(r.probePhase!=='off'||r.rungIndex<r.ladder.length-1){void stepDown(r,'inference-error');return;}setFailurePhase('inference');console.error(e);errorReason.current='识别刚才断了一下，我先停在这里，歇一下再重新开始。';r.engine.interrupt(errorReason.current);release(r);setStatus('error');publish(r,errorReason.current);}).finally(()=>{if(r.transport===transport)r.inFlight=false;});
  };
  if(v.requestVideoFrameCallback&&!r.forceRaf){r.raf=false;r.callback=v.requestVideoFrameCallback(callback);r.fallbackTimer=setTimeout(()=>{if(r.controller.signal.aborted)return;v.cancelVideoFrameCallback?.(r.callback);r.forceRaf=true;callback(performance.now());},500);}else{r.raf=true;r.callback=requestAnimationFrame(callback);}
 };
 const start=useCallback(async(forceLite=false)=>{
  const appleCamera=usesMainThreadLite(navigator.userAgent,navigator.platform,navigator.maxTouchPoints);
  const plan=planPoseSession(loadPoseModelPreference(),appleCamera,forceLite,loadPoseVerdict());
  const previous=runtime.current;
  if(previous&&!forceLite&&!previous.controller.signal.aborted&&previous.key===opts.current.key&&status==='ready'&&performance.now()-previous.lastReceived<=200){
   const elapsed=previous.times.length>1?previous.times[previous.times.length-1]-previous.times[0]:0,fps=elapsed>0?(previous.times.length-1)*1000/elapsed:0;
   const nextRun=serial.current+1;
   if(fps>=8&&previous.engine.continuePrepared(nextRun)){serial.current=nextRun;previous.runId=nextRun;previous.frameId=0;previous.passive=false;publish(previous,'起始姿势已准备好，正在继续');return true;}
  }
  const oldStats=previous?.key===opts.current.key?previous.engine.metrics:lastStats.current?.key===opts.current.key?lastStats.current.metrics:undefined,saved=oldStats&&oldStats.reps>(opts.current.restored.reps||0)?oldStats:opts.current.restored;
  const startRungId=poseRungId(plan.ladder[plan.startRung]);
  const reuse=previous&&!previous.controller.signal.aborted&&previous.transport&&poseRungId(previous.ladder[previous.rungIndex])===startRungId;let r:Runtime;
  if(reuse){r=previous!;r.runId=++serial.current;r.frameId=0;r.preparing=true;r.passive=false;r.probing=false;r.probePhase='off';if(r.probeTimer){clearTimeout(r.probeTimer);r.probeTimer=null;}r.times=[];r.latencies=[];r.inferTimes=[];r.experiment=plan.experiment;r.recoveredFrom=null;r.ladder=plan.ladder;r.rungIndex=plan.startRung;r.selection=plan.selection;r.slowSince=null;r.degradeReason=null;r.startedAt=performance.now();r.key=opts.current.key;r.engine=new AdaptiveRecognition(opts.current.type,opts.current.target,saved,r.runId);r.finish?.(false);}
  else{if(previous)release(previous);const runId=++serial.current;r={controller:new AbortController(),transport:null,stream:null,runId,frameId:0,origin:null,lastMedia:-1,lastDecoded:-1,inFlight:false,callback:0,raf:true,forceRaf:false,appleCamera,playRetried:false,fallbackTimer:null,preparing:true,passive:false,probing:false,probePhase:'off',probeKind:'full',warmCount:0,warmSince:0,probeTimer:null,probeTimes:[],latencies:[],times:[],slowSince:null,degradeReason:null,startedAt:performance.now(),lastReceived:performance.now(),lastSubmitted:-Infinity,model:plan.ladder[plan.startRung].model,engine:new AdaptiveRecognition(opts.current.type,opts.current.target,saved,runId),key:opts.current.key,finish:null,timer:null,inferTimes:[],experiment:plan.experiment,recoveredFrom:null,ladder:plan.ladder,rungIndex:plan.startRung,selection:plan.selection,events:[],stepping:false};runtime.current=r;}
  let phase:PoseFailurePhase='camera';errorReason.current='';setFailurePhase(null);setStatus('loading');publish(r,reuse?'正在恢复识别':'正在准备摄像头');
  try{
   if(!reuse){
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:720},height:{ideal:960},aspectRatio:{ideal:3/4}},audio:false});
    if(r.controller.signal.aborted||!videoRef.current){stream.getTracks().forEach(t=>t.stop());return false;}r.stream=stream;videoRef.current.muted=true;videoRef.current.playsInline=true;videoRef.current.srcObject=stream;await videoRef.current.play();await waitForVideoFrame(videoRef.current,r.controller.signal);phase='model';
    publish(r,'正在准备识别');
    // Open the starting rung; an init failure steps down the ladder with its
    // reason recorded instead of jumping straight to Lite.
    for(;;){
     let opened=false;
     try{opened=await openRung(r);}catch(e){
      if(r.controller.signal.aborted)throw e;
      const next=r.ladder[r.rungIndex+1];
      if(!next)throw e;
      recordStep(r,r.ladder[r.rungIndex],next,'init-error');
      r.rungIndex++;
      continue;
     }
     if(!opened)return false;
     break;
    }
    if(r.controller.signal.aborted){r.transport?.close();return false;}
    schedule(r);
   }
   return await new Promise<boolean>(resolve=>{r.finish=resolve;if(reuse)frameDeadline(r);else if(r.rungIndex>=r.ladder.length-1)settleProbed(r);else armProbe(r,r.selection==='cache'?'sanity':'full');});
  }catch(e){if(r.controller.signal.aborted)return false;release(r);setFailurePhase(phase);if(!(e instanceof DOMException&&e.name==='NotAllowedError'))console.error(e);errorReason.current=e instanceof DOMException&&e.name==='NotAllowedError'?'摄像头权限被拒绝，请允许后重试':phase==='camera'?'没找到能用的摄像头，检查一下设备再试。':'识别没能准备好，检查一下网络，再试一次。';setStatus(e instanceof DOMException&&e.name==='NotAllowedError'?'denied':'error');publish(r,errorReason.current);return false;}
 },[status]);
 useEffect(()=>{const r=runtime.current;if(!r||r.preparing||r.controller.signal.aborted)return;if(!active){if(!opts.current.warmWhenPaused){r.passive=false;r.runId=++serial.current;r.engine.interrupt();publish(r,'我先停一下，等你回来继续');return;}if(r.key!==opts.current.key){r.passive=false;r.engine.interrupt();return;}const saved=structuredClone(r.engine.metrics);r.runId=++serial.current;r.frameId=0;r.engine=new AdaptiveRecognition(opts.current.type,opts.current.target,saved,r.runId);r.passive=true;r.times=[];publish(r,'已暂停 · 回到起始姿势后自动准备，不计次数或时长');}else{r.passive=false;r.startedAt=performance.now();r.lastReceived=performance.now();r.times=[];r.slowSince=null;r.degradeReason=null;}},[active,options.warmWhenPaused]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;const r=runtime.current;if(r)release(r);runtime.current=null;};},[]);
 useEffect(()=>{const hide=()=>{const r=runtime.current;if(document.hidden&&r&&!r.controller.signal.aborted){r.engine.interrupt('页面切到后台啦，我先停一下，回来我们接着练');errorReason.current='页面切到后台啦，我先停一下，回来我们接着练';release(r);setStatus('error');publish(r,errorReason.current);}};document.addEventListener('visibilitychange',hide);return()=>document.removeEventListener('visibilitychange',hide);},[]);
 return {videoRef,errorReason,status,failurePhase,start,stop,landmarks:state.landmarks,worldLandmarks:state.worldLandmarks,frame:state.frame,telemetry:state.telemetry,engine:state.key===options.key?state.engine:null};
}
