import {createRecognitionTracker} from './recognition';
import {FrameOrder,TimeFilter,type PoseFrame} from './poseProtocol';
import type {ExerciseMetrics} from './exerciseMetrics';
import type {NormalizedLandmark as Point} from '@mediapipe/tasks-vision';
import {framingFeedback} from './framingFeedback';
import {COPY_BASIS_UNSTABLE,COPY_HALF_REP,COPY_SUBJECT_SWITCH,COPY_UNCLEAR,notSeenCopyFor} from './companionCopy';
import type {PoseModelPreference} from './poseCompatibility';
import {analyzeSquatFrame,squatSideVisible} from './squatMetrics';
export const adaptiveEligible=(type:string)=>['squat','jumping_jack','push_up','high_knees','biceps_curl','hammer_curl','barbell_curl','reverse_barbell_curl','seated_curl','shoulder_press','neutral_seated_press','bent_over_row','barbell_row','bench_press','incline_bench_press','barbell_deadlift','romanian_deadlift','goblet_squat','barbell_back_squat','barbell_front_squat','dumbbell_standing_press','barbell_military_press','dumbbell_deadlift','barbell_good_morning'].includes(type);
/** A saved session takes precedence over detection on the current device. */
export function selectRecognitionStrategy(type: string, saved?: unknown, adaptiveAvailable = typeof globalThis.crypto?.subtle?.digest === 'function') {
 if(saved !== undefined)return saved === 'adaptive-v1' ? 'adaptive-v1' : 'legacy';
 return adaptiveAvailable && adaptiveEligible(type) ? 'adaptive-v1' : 'legacy';
}
export type RecognitionPreference = 'auto' | 'legacy';
const recognitionPreferenceKey = 'movemate:recognition-preference';
/** Device-local escape hatch for new records only; never stored on the server. */
export function loadRecognitionPreference(): RecognitionPreference {
 try { return globalThis.localStorage?.getItem(recognitionPreferenceKey) === 'legacy' ? 'legacy' : 'auto'; } catch { return 'auto'; }
}
export function saveRecognitionPreference(preference: RecognitionPreference) {
 try { globalThis.localStorage?.setItem(recognitionPreferenceKey, preference); } catch { /* best-effort device preference */ }
}
const poseModelPreferenceKey = 'movemate:pose-model-experiment';
/** Device-local experiment switch for the MediaPipe model variant. 'auto' is the shipped
 * behaviour; Full/Heavy are larger official variants A/B-tested on this device only. */
export function loadPoseModelPreference(): PoseModelPreference {
 try { const value = globalThis.localStorage?.getItem(poseModelPreferenceKey); return value === 'lite' || value === 'full' || value === 'heavy' ? value : 'auto'; } catch { return 'auto'; }
}
export function savePoseModelPreference(preference: PoseModelPreference) {
 try { globalThis.localStorage?.setItem(poseModelPreferenceKey, preference); } catch { /* best-effort device preference */ }
}
/** The preference can only force legacy for a new record; saved strategies still win via selectRecognitionStrategy. */
export function selectNewRecognitionStrategy(type: string, preference: RecognitionPreference, adaptiveAvailable = typeof globalThis.crypto?.subtle?.digest === 'function') {
 if(preference === 'legacy') return 'legacy' as const;
 return selectRecognitionStrategy(type, undefined, adaptiveAvailable);
}
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));
/** Hammer curls only (2026-11-06 on-device retest): an evidence freeze — 3D basis lost or
 * joints briefly unclear — preserves the in-progress per-side cycles for this grace instead
 * of voiding them at the generic 200 ms limit. Matches the tracker's own 2 s calibration /
 * diagnostics windows; a freeze that outlasts it still voids the half rep as before. */
const HAMMER_FREEZE_GRACE_MS=2000;
export class AdaptiveRecognition {
 private base:ReturnType<typeof createRecognitionTracker>;
 private order:FrameOrder;private image=new TimeFilter();private world=new TimeFilter();
 private weak:number|null=null;private weakWorld:number|null=null;private source:boolean|null=null;private shape:number[]|null=null;private previous:Point[]|null=null;private previousShoulder=11;
 private stepBridge=false;
 private frozenAt:number|null=null;private lastFreezeAt:number|null=null;
 private width=0;private height=0;private scoring=true;
 usableFrame=false;
 constructor(readonly type:string,readonly target:number,readonly restored:Partial<ExerciseMetrics>,runId:number){this.base=createRecognitionTracker(type,target,restored,true,true);this.order=new FrameOrder(runId);}
 get metrics(){return this.base.metrics;}
 get diagnostics(){return this.base.diagnostics;}
 get ready(){return this.base.metrics.poseFeedback.calibrated;}
 /** Reuse only a fully prepared neutral phase; never carry a paused partial cycle. */
 continuePrepared(runId:number){
  if(!this.ready||this.diagnostics.stage!=='ready')return false;
  this.order=new FrameOrder(runId);this.image.reset();this.world.reset();return true;
 }
 /** A ladder step-down swaps only the pose model (see useAdaptivePose): this
  * engine — the tracker with its calibration bank and open cycle, both
  * landmark TimeFilters, and the wrapper's framing state — carries over
  * untouched, so the switch is invisible to the measurement. Three seams are
  * re-sewn explicitly: frame order rebinds to the new run (frame ids
  * restart; the captured-at high-water mark survives, so pre-swap frames
  * stay rejected); the 2D/3D basis is re-established from the new rung's
  * first frame instead of reading the estimator change itself as a basis
  * flip (the flip guard resumes from there); and the transport gap is
  * bridged past the tracker's frame-gap guard on the next measured frame,
  * the same one-shot bridge the hammer evidence freeze uses. The bridge flag
  * is consumed only when a frame actually reaches the tracker, and a tracker
  * interrupt in between resets its gap reference, which neutralises a stale
  * flag on its own. */
 carryToRun(runId:number){this.order.rebind(runId);this.source=null;this.stepBridge=true;}

 interrupt(reason='识别已暂停，继续后识别下一个完整动作'){
  this.usableFrame=false;
  this.base.interrupt(reason);this.image.reset();this.world.reset();this.previous=null;this.shape=null;this.source=null;this.weak=null;this.weakWorld=null;this.scoring=true;this.frozenAt=null;this.lastFreezeAt=null;
 }
 /** Hammer-curl evidence freeze: hold the frozen message and feed nothing to the base
  * tracker, so its per-side cycle state (including an already-reached peak) survives.
  * Past the grace the half rep is voided with the caller's usual reason. */
 private freezeHammer(capturedAt:number,message:string,expiredReason:string){
  if(this.frozenAt===null){this.frozenAt=capturedAt;this.lastFreezeAt=capturedAt;}
  if(capturedAt-this.frozenAt>HAMMER_FREEZE_GRACE_MS){this.frozenAt=null;return this.reject(expiredReason);}
  const frozen=message;
  this.base.metrics={...this.metrics,feedback:frozen,poseFeedback:{...this.metrics.poseFeedback,status:'uncertain',message:frozen}};
  return this.metrics;
 }
 private reject(reason:string){this.interrupt(reason);return this.metrics;}
 private freezeSquat(capturedAt:number,_message:string,affectedJoints:number[]=[]){
  this.weak??=capturedAt;
  if(capturedAt-this.weak>200)return this.reject(COPY_HALF_REP);
  this.scoring=false;
  this.base.metrics={...this.metrics,feedback:COPY_UNCLEAR,poseFeedback:{...this.metrics.poseFeedback,status:'uncertain',message:COPY_UNCLEAR,affectedJoints}};
  return this.metrics;
 }
 update(f:PoseFrame,count=true){
  this.usableFrame=false;
  if(!this.order.accept(f))return this.metrics;
  if(this.width&&(f.width!==this.width||f.height!==this.height))this.interrupt('画面变了一下，回到起始姿势，我们重新开始');this.width=f.width;this.height=f.height;
  const raw=f.landmarks;
  if(!raw||raw.length!==33||raw.some(p=>!p||![p.x,p.y,p.visibility??0].every(Number.isFinite)))return this.type==='squat'?this.freezeSquat(f.capturedAt,'未检测到可用的深蹲关节'):this.reject(notSeenCopyFor(this.type));
  const needed=this.base.requiredIndices(raw);
  const framing=framingFeedback(raw,needed);
  if(this.type==='squat'){
   const side=needed.includes(12)?'right':'left';
   if(!squatSideVisible(raw,side)){
    // Start-up guidance can immediately name the missing joints; only an armed cycle gets a grace period.
    if(this.ready)return this.freezeSquat(f.capturedAt,framing?.message||'跟踪侧关节不够清晰',framing?.affected);
    if(!framing)return this.reject('让我看清你同一侧的肩、髋、膝和脚踝');
   }
  }
  if(framing){this.reject(framing.message);this.base.metrics.poseFeedback={...this.metrics.poseFeedback,affectedJoints:framing.affected};return this.metrics;}
  if(needed.some(i=>(raw[i].visibility??0)<.55)){
   if(this.type==='hammer_curl')return this.freezeHammer(f.capturedAt,COPY_UNCLEAR,COPY_HALF_REP);
   this.weak??=f.capturedAt;if(f.capturedAt-this.weak>200)return this.reject(COPY_HALF_REP);
   this.base.metrics={...this.metrics,feedback:COPY_UNCLEAR,poseFeedback:{...this.metrics.poseFeedback,status:'uncertain',message:COPY_UNCLEAR}};return this.metrics;
  }
  if(this.weak!==null&&f.capturedAt-this.weak>200)this.interrupt(COPY_HALF_REP);this.weak=null;
  const shoulder=this.type==='squat'&&needed.includes(12)?12:11,hip=shoulder+12;
  const aspect=f.width/f.height,scale=Math.hypot((raw[shoulder].x-raw[hip].x)*aspect,raw[shoulder].y-raw[hip].y);
  if(scale<.06)return this.reject('画面里你显得有点小，靠近一点点，让我看清楚你');
  if(this.previous&&this.previousShoulder===shoulder){const last=this.previous,old=Math.max(.04,Math.hypot((last[shoulder].x-last[hip].x)*aspect,last[shoulder].y-last[hip].y));
   // Subject-switch verdict (2026-11-09 walking test): the pose teleported
   // (hip-centroid step beyond the position guard's own bound) AND changed
   // shape (shoulder width outside the band two similar framings of the
   // same body stay in) between consecutive ACCEPTED frames — the model
   // most likely locked onto a different person. Say so and drop to the
   // finding-you state (reject interrupts the tracker) instead of silently
   // continuing the set on someone else. Position-only jumps keep the
   // existing copy and behaviour exactly.
   const centroidStep=Math.hypot(((raw[23].x+raw[24].x)-(last[23].x+last[24].x))/2*aspect,((raw[23].y+raw[24].y)-(last[23].y+last[24].y))/2),shoulderWidth=Math.hypot((raw[11].x-raw[12].x)*aspect,raw[11].y-raw[12].y),lastShoulderWidth=Math.max(.02,Math.hypot((last[11].x-last[12].x)*aspect,last[11].y-last[12].y)),widthRatio=shoulderWidth/lastShoulderWidth;
   if(centroidStep>old*.5&&(widthRatio<.75||widthRatio>1.33))return this.reject(COPY_SUBJECT_SWITCH);
   if(Math.hypot((raw[hip].x-last[hip].x)*aspect,raw[hip].y-last[hip].y)>old*.5||scale/old<.75||scale/old>1.25)return this.reject('位置变了一下，回到起始姿势，我们重新来');}
  const w=f.worldLandmarks,pairs=[[11,13],[13,15],[12,14],[14,16],[23,25],[25,27],[24,26],[26,28]].filter(pair=>pair.every(i=>needed.includes(i)));
  let world=w?.length===33&&w.every(p=>p&&[p.x,p.y,p.z].every(Number.isFinite))&&needed.every(i=>(raw[i].visibility??0)>=.7&&(w[i].visibility??raw[i].visibility??0)>=.7)?w:null;
  if(world){const torso=distance(world[shoulder],world[hip]),ratios=pairs.map(([a,b])=>distance(world![a],world![b])/torso);if(torso<.04||torso>1.5||ratios.some((r,i)=>r<.15||r>2.5||this.shape&&Math.abs(r/this.shape[i]-1)>.25))world=null;else this.shape=ratios;}
  if(['jumping_jack','push_up','high_knees'].includes(this.type))world=null;
  if(world&&['goblet_squat','barbell_back_squat','barbell_front_squat'].includes(this.type)&&analyzeSquatFrame(raw,aspect,world)?.angleSource!=='world')world=null;
  if(this.source===true&&!world){
   if(this.type==='hammer_curl')return this.freezeHammer(f.capturedAt,COPY_BASIS_UNSTABLE,'光线有点欺负人，先回到起始姿势，我们重新稳一稳');
   this.weakWorld??=f.capturedAt;if(f.capturedAt-this.weakWorld<=200){this.base.metrics={...this.metrics,feedback:COPY_BASIS_UNSTABLE,poseFeedback:{...this.metrics.poseFeedback,status:'uncertain',message:COPY_BASIS_UNSTABLE}};return this.metrics;}
  }
  else this.weakWorld=null;
  const source=!!world;
  if(this.source!==null&&source!==this.source){
   // Within a hammer-curl freeze episode (or its grace tail) a basis flip is the freeze
   // resolving, not a tracking change: accept it and let the preserved cycle continue.
   const tolerated=this.type==='hammer_curl'&&(this.frozenAt!==null||(this.lastFreezeAt!==null&&f.capturedAt-this.lastFreezeAt<=HAMMER_FREEZE_GRACE_MS));
   if(!tolerated)this.interrupt('光线有点欺负人，先回到起始姿势，我们重新稳一稳');
  }
  this.source=source;
  this.previousShoulder=shoulder;
  this.previous=raw.map(p=>({...p}));
  if(this.type==='hammer_curl'&&this.frozenAt!==null){
   const gap=f.capturedAt-this.frozenAt;this.frozenAt=null;
   // No frames at all arrived during the freeze and it outlasted the grace: void as usual.
   if(gap>HAMMER_FREEZE_GRACE_MS)return this.reject(COPY_HALF_REP);
   // The base tracker's own frame-gap guard must not void what the freeze preserved.
   (this.base as {bridgeFreezeGap?:(now:number)=>void}).bridgeFreezeGap?.(f.capturedAt);
  }
  if(this.stepBridge){this.stepBridge=false;(this.base as {bridgeFreezeGap?:(now:number)=>void}).bridgeFreezeGap?.(f.capturedAt);}
  const before=structuredClone(this.metrics),stage=this.diagnostics.stage;
  this.base.update(this.image.apply(raw,f.capturedAt),f.capturedAt,aspect,world?this.world.apply(world,f.capturedAt):null);
  this.usableFrame=this.diagnostics.stage!=='tracking_lost';
  if(stage!=='ready'||this.diagnostics.stage!=='ready'){
   const weakScore=this.type==='squat'
    ? !squatSideVisible(raw,'left',.7)||!squatSideVisible(raw,'right',.7)
    : needed.some(i=>(raw[i].visibility??0)<.7);
   if(weakScore)this.scoring=false;
  }
  if(this.metrics.reps>before.reps){if(!this.scoring){const sides=this.metrics.scoreAccumulator;this.base.metrics={...this.metrics,scoreAccumulator:{...before.scoreAccumulator,...(sides.leftReps!==undefined?{leftReps:sides.leftReps,rightReps:sides.rightReps}: {})},formScore:before.formScore,formBreakdown:before.formBreakdown,axisAssessment:before.axisAssessment,perfectReps:before.perfectReps,correctionCounts:before.correctionCounts,lastRepScore:null,lastRepIssues:[],feedback:'记下啦 · 刚才有点没看清，这次不评分'};}this.scoring=true;}
  if(!count&&this.metrics.reps>before.reps){this.base=createRecognitionTracker(this.type,this.target,before,true,true);this.interrupt('刚才还在准备阶段，先回到起始姿势，我们正式开始');return this.metrics;}
  return this.metrics;
 }
}
