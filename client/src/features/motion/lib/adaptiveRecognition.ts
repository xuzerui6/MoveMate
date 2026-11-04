import {createRecognitionTracker} from './recognition';
import {FrameOrder,TimeFilter,type PoseFrame} from './poseProtocol';
import type {ExerciseMetrics} from './exerciseMetrics';
import type {NormalizedLandmark as Point} from '@mediapipe/tasks-vision';
import {framingFeedback} from './framingFeedback';
import {analyzeSquatFrame,squatSideVisible} from './squatMetrics';
export const adaptiveEligible=(type:string)=>['squat','jumping_jack','push_up','high_knees','biceps_curl','hammer_curl','barbell_curl','reverse_barbell_curl','seated_curl','shoulder_press','neutral_seated_press','bent_over_row','barbell_row','bench_press','incline_bench_press','barbell_deadlift','romanian_deadlift','goblet_squat','barbell_back_squat','barbell_front_squat'].includes(type);
// Empty until real iPhone Safari / Windows Chrome comparisons pass. No automatic rollout.
export const approvedAdaptiveCombinations:readonly string[]=[];
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));
export class AdaptiveRecognition {
 private base:ReturnType<typeof createRecognitionTracker>;
 private order:FrameOrder;private image=new TimeFilter();private world=new TimeFilter();
 private weak:number|null=null;private weakWorld:number|null=null;private source:boolean|null=null;private shape:number[]|null=null;private previous:Point[]|null=null;private previousShoulder=11;
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

 interrupt(reason='识别已暂停，继续后识别下一个完整动作'){
  this.usableFrame=false;
  this.base.interrupt(reason);this.image.reset();this.world.reset();this.previous=null;this.shape=null;this.source=null;this.weak=null;this.weakWorld=null;this.scoring=true;
 }
 private reject(reason:string){this.interrupt(reason);return this.metrics;}
 private freezeSquat(capturedAt:number,message:string,affectedJoints:number[]=[]){
  this.weak??=capturedAt;
  if(capturedAt-this.weak>200)return this.reject(message+'，半程动作已丢弃');
  this.scoring=false;
  this.base.metrics={...this.metrics,feedback:message+'，已冻结计数',poseFeedback:{...this.metrics.poseFeedback,status:'uncertain',message,affectedJoints}};
  return this.metrics;
 }
 update(f:PoseFrame,count=true){
  this.usableFrame=false;
  if(!this.order.accept(f))return this.metrics;
  if(this.width&&(f.width!==this.width||f.height!==this.height))this.interrupt('画面尺寸改变，请回到起始姿势');this.width=f.width;this.height=f.height;
  const raw=f.landmarks;
  if(!raw||raw.length!==33||raw.some(p=>!p||![p.x,p.y,p.visibility??0].every(Number.isFinite)))return this.type==='squat'?this.freezeSquat(f.capturedAt,'未检测到可用的深蹲关节'):this.reject('未检测到完整人体，请调整入镜范围');
  const needed=this.base.requiredIndices(raw);
  const framing=framingFeedback(raw,needed);
  if(this.type==='squat'){
   const side=needed.includes(12)?'right':'left';
   if(!squatSideVisible(raw,side)){
    // Start-up guidance can immediately name the missing joints; only an armed cycle gets a grace period.
    if(this.ready)return this.freezeSquat(f.capturedAt,framing?.message||'跟踪侧关节不够清晰',framing?.affected);
    if(!framing)return this.reject('请让同一侧的肩、髋、膝和脚踝清晰入镜');
   }
  }
  if(framing){this.reject(framing.message);this.base.metrics.poseFeedback={...this.metrics.poseFeedback,affectedJoints:framing.affected};return this.metrics;}
  if(needed.some(i=>(raw[i].visibility??0)<.55)){
   this.weak??=f.capturedAt;if(f.capturedAt-this.weak>200)return this.reject('必要关节持续不清晰，半程动作已丢弃');
   this.base.metrics={...this.metrics,feedback:'关节暂时不清晰，已冻结计数',poseFeedback:{...this.metrics.poseFeedback,status:'uncertain',message:'关节暂时不清晰，已冻结计数'}};return this.metrics;
  }
  if(this.weak!==null&&f.capturedAt-this.weak>200)this.interrupt('跟踪中断，半程动作已丢弃');this.weak=null;
  const shoulder=this.type==='squat'&&needed.includes(12)?12:11,hip=shoulder+12;
  const aspect=f.width/f.height,scale=Math.hypot((raw[shoulder].x-raw[hip].x)*aspect,raw[shoulder].y-raw[hip].y);
  if(scale<.06)return this.reject('人体在画面中过小，请靠近摄像头并保持必要关节入镜');
  if(this.previous&&this.previousShoulder===shoulder){const last=this.previous,old=Math.max(.04,Math.hypot((last[shoulder].x-last[hip].x)*aspect,last[shoulder].y-last[hip].y));if(Math.hypot((raw[hip].x-last[hip].x)*aspect,raw[hip].y-last[hip].y)>old*.5||scale/old<.75||scale/old>1.25)return this.reject('人体位置或尺度突变，请回到起始姿势');}
  const w=f.worldLandmarks,pairs=[[11,13],[13,15],[12,14],[14,16],[23,25],[25,27],[24,26],[26,28]].filter(pair=>pair.every(i=>needed.includes(i)));
  let world=w?.length===33&&w.every(p=>p&&[p.x,p.y,p.z].every(Number.isFinite))&&needed.every(i=>(raw[i].visibility??0)>=.7&&(w[i].visibility??raw[i].visibility??0)>=.7)?w:null;
  if(world){const torso=distance(world[shoulder],world[hip]),ratios=pairs.map(([a,b])=>distance(world![a],world![b])/torso);if(torso<.04||torso>1.5||ratios.some((r,i)=>r<.15||r>2.5||this.shape&&Math.abs(r/this.shape[i]-1)>.25))world=null;else this.shape=ratios;}
  if(['jumping_jack','push_up','high_knees'].includes(this.type))world=null;
  if(world&&['goblet_squat','barbell_back_squat','barbell_front_squat'].includes(this.type)&&analyzeSquatFrame(raw,aspect,world)?.angleSource!=='world')world=null;
  if(this.source===true&&!world){this.weakWorld??=f.capturedAt;if(f.capturedAt-this.weakWorld<=200){this.base.metrics={...this.metrics,feedback:'三维依据暂不可靠，已冻结计数',poseFeedback:{...this.metrics.poseFeedback,status:'uncertain',message:'三维依据暂不可靠，已冻结计数'}};return this.metrics;}}
  else this.weakWorld=null;
  const source=!!world;if(this.source!==null&&source!==this.source)this.interrupt('二维／三维判断依据改变，请回到起始姿势');this.source=source;
  this.previousShoulder=shoulder;
  this.previous=raw.map(p=>({...p}));
  const before=structuredClone(this.metrics),stage=this.diagnostics.stage;
  this.base.update(this.image.apply(raw,f.capturedAt),f.capturedAt,aspect,world?this.world.apply(world,f.capturedAt):null);
  this.usableFrame=this.diagnostics.stage!=='tracking_lost';
  if(stage!=='ready'||this.diagnostics.stage!=='ready'){
   const weakScore=this.type==='squat'
    ? !squatSideVisible(raw,'left',.7)||!squatSideVisible(raw,'right',.7)
    : needed.some(i=>(raw[i].visibility??0)<.7);
   if(weakScore)this.scoring=false;
  }
  if(this.metrics.reps>before.reps){if(!this.scoring){const sides=this.metrics.scoreAccumulator;this.base.metrics={...this.metrics,scoreAccumulator:{...before.scoreAccumulator,...(sides.leftReps!==undefined?{leftReps:sides.leftReps,rightReps:sides.rightReps}: {})},formScore:before.formScore,formBreakdown:before.formBreakdown,perfectReps:before.perfectReps,correctionCounts:before.correctionCounts,lastRepScore:null,lastRepIssues:[],feedback:'完整动作已记录，本次画面数据不足，无法评分'};}this.scoring=true;}
  if(!count&&this.metrics.reps>before.reps){this.base=createRecognitionTracker(this.type,this.target,before,true,true);this.interrupt('准备阶段不计次数，请重新保持起始姿势');return this.metrics;}
  return this.metrics;
 }
}
