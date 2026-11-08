import type { NormalizedLandmark as Point } from '@mediapipe/tasks-vision';
import type { ExerciseMetrics, RecognitionDiagnostics } from '../motion/lib/exerciseMetrics';
import type { FormBreakdown, PoseIssue, ScoreAccumulator } from '../motion/types';
import { medianLandmarks, poseIssueCopy } from '../motion/lib/poseFeedback';
import { COPY_CALIBRATED, COPY_HALF_REP, COPY_OUT_OF_FRAME, notSeenCopyFor } from '../motion/lib/companionCopy';

export const PLAN_PROFILES = ['biceps_curl','lateral_raise','shoulder_press','bent_over_row','reverse_lunge','calf_raise','seated_calf_raise'] as const;
export type NewPlanProfile = typeof PLAN_PROFILES[number];
export const isNewPlanProfile = (value: string): value is NewPlanProfile => PLAN_PROFILES.includes(value as NewPlanProfile);
const axes = ['depth','stability','trunk','symmetry'] as const;
/** Fast-tempo cycle rules (2026-11-07, shared with extendedRecognition): peaks latch
 * on the first in-zone frame instead of dwelling 120 ms (sampled dwell made fast
 * reps uncountable), returns accumulate 150 ms inside a 500 ms window instead of one
 * unbroken hold — seeded with half the entry interval, the unbiased estimate of the
 * interpolated crossing, so frame-credit accounting does not lose a whole interval
 * per dwell at low frame rates — and a latched peak only completes when the
 * excursion lasted at least MIN_EXCURSION_MS so a brief peak blip still counts
 * nothing. */
const RETURN_HOLD_MS=150,RETURN_WINDOW_MS=500,RETURN_FRAME_CAP_MS=100,MIN_EXCURSION_MS=250;
const zero = (): FormBreakdown => ({depth:0,stability:0,trunk:0,symmetry:0});
const average = (acc:ScoreAccumulator):FormBreakdown => ({depth:Math.round(acc.depth/acc.count),stability:Math.round(acc.stability/acc.count),trunk:Math.round(acc.trunk/acc.count),symmetry:Math.round(acc.symmetry/acc.count)});
const clamp = (v:number) => Math.max(0,Math.min(100,v));
const mean = (a:number,b:number) => (a+b)/2;
const mid = (a:Point,b:Point):Point => ({x:mean(a.x,b.x),y:mean(a.y,b.y),z:mean(a.z||0,b.z||0),visibility:Math.min(a.visibility??0,b.visibility??0)});
const distance = (a:Point,b:Point) => Math.hypot(a.x-b.x,a.y-b.y);
const angle = (a:Point,b:Point,c:Point) => {
  const u=[a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0)],v=[c.x-b.x,c.y-b.y,(c.z||0)-(b.z||0)];
  return Math.acos(Math.max(-1,Math.min(1,u.reduce((n,x,i)=>n+x*v[i],0)/(Math.hypot(...u)*Math.hypot(...v)||1e-8))))*180/Math.PI;
};
export const PLAN_STAGE_COPY:Record<NewPlanProfile,[string,string,string,string]> = {
  biceps_curl:['伸臂就绪','双臂弯举中','漂亮，就是这个高度——慢慢放下来','好，放回啦，我确认一下'],
  lateral_raise:['垂臂就绪','双臂侧举中','到位啦——慢慢放下来','好，放回啦，我确认一下'],
  shoulder_press:['肩部起始位就绪','推举中','推到位啦——慢慢放回','好，放回啦，我确认一下'],
  bent_over_row:['俯身垂臂就绪','双臂拉起中','拉到位啦——慢慢放下来','好，放回啦，我确认一下'],
  reverse_lunge:['并脚站立就绪','后撤下沉中','到位啦——回到站立','好，站稳，我确认一下'],
  calf_raise:['脚跟落地就绪','提踵中','提到位啦——慢慢落跟','好，落稳，我确认一下'],
  seated_calf_raise:['脚跟落地就绪','提踵中','提到位啦——慢慢落跟','好，落稳，我确认一下'],
};
const needed = (type:NewPlanProfile) => type==='calf_raise'||type==='seated_calf_raise' ? [11,12,23,24,25,26,27,28,29,30,31,32] : type==='reverse_lunge' ? [11,12,23,24,25,26,27,28,29,30,31,32] : type==='bent_over_row' ? [11,12,13,14,15,16,23,24,25,26] : [11,12,13,14,15,16,23,24];
type Sample = {start:boolean;peak:boolean;amplitude:number;symmetry:number;posture:number;confidence:number;side?:'left'|'right';angle:number;basis:string;motion:string;hip:Point;torso:number;tilt:number;points:Point[];footScale:number;heels:number[];forward:Point};

/** Plan-only state machine. Does not alter the four standalone recognition algorithms. */
export class PlanExerciseTracker {
  metrics:ExerciseMetrics;
  diagnostics:RecognitionDiagnostics={fps:0,confidence:0,side:null,angle:null,stage:'calibrating',calibrationProgress:0,pairedSides:[],lastResetReason:null};
  private frames:Point[][]=[];
  private worldFrames:Point[][]=[];
  private at:number|null=null;
  private calibration:number|null=null;
  private baseline:Sample|null=null;
  private calibrated=false;
  private times:number[]=[];
  private peakSince:number|null=null;
  private peak:Sample|null=null;
  private returnSince:number|null=null;
  private retAnchor:number|null=null;
  private retAccum=0;
  private retPrevAt:number|null=null;
  private movementSince:number|null=null;
  private scoring=true;
  private freezeBridged=false;
  private maxTrunkShift=0;
  private previous:Sample|null=null;
  private maxStep=0;
  private controlAt:number|null=null;
  private controlAngle=0;
  private issues=new Set<PoseIssue>();
  requiredIndices(raw:Point[]){return needed(this.type)}
  constructor(readonly type:NewPlanProfile, targetReps=20, restored:Partial<ExerciseMetrics>={},readonly prefiltered=false,readonly armOnStart=false) {
    const acc={...zero(),count:0,total:0,...restored.scoreAccumulator};
    this.metrics={...restored,reps:Math.max(0,restored.reps||0),targetReps,formScore:acc.count?Math.round(acc.total/acc.count):0,perfectReps:restored.perfectReps||0,feedback:'站到起始姿势，陪我停两秒',phase:'standing',scoreAccumulator:acc,formBreakdown:acc.count?average(acc):zero(),correctionCounts:{out_of_frame:0,insufficient_depth:0,knee_instability:0,excessive_trunk_lean:0,asymmetry:0,insufficient_range:0,unstable_movement:0,body_alignment:0,poor_coordination:0,...restored.correctionCounts},lastRepIssues:[],repeatedIssue:null,poseFeedback:{status:'uncertain',confidence:0,issues:[],primaryIssue:null,affectedJoints:[],calibrated:false,message:'我在等你站好'}};
  }
  interrupt(reason='先停一下，继续时重新校准', feedback = reason) {
    this.frames=[];this.worldFrames=[];this.at=null;this.calibration=null;this.baseline=null;this.calibrated=false;this.times=[];this.resetCycle();this.previous=null;this.freezeBridged=false;
    this.diagnostics={...this.diagnostics,fps:0,confidence:0,stage:'tracking_lost',calibrationProgress:0,lastResetReason:reason};
    this.metrics={...this.metrics,phase:'standing',feedback,poseFeedback:{...this.metrics.poseFeedback,status:'uncertain',calibrated:false,message:feedback}};
    return this.metrics;
  }
  /** The adaptive wrapper deliberately held frames back (a ladder step-down
   * swapping the pose model — see AdaptiveRecognition.carryToRun); the next
   * frame gap is therefore known-benign and must not be read as a tracking
   * loss. Only arms when the pending gap actually exceeds the guard. Mirrors
   * ExtendedExerciseTracker.bridgeFreezeGap. */
  bridgeFreezeGap(now:number){if(this.at!==null&&now-this.at>750)this.freezeBridged=true;}
  private resetCycle(){this.peakSince=null;this.peak=null;this.returnSince=null;this.retAnchor=null;this.retAccum=0;this.retPrevAt=null;this.movementSince=null;this.scoring=true;this.maxTrunkShift=0;this.maxStep=0;this.controlAt=null;this.issues.clear();}
  private sample(raw:Point[],aspect:number,world:Point[]|null):Sample|null {
    const p=raw.map(v=>({...v,x:v.x*aspect,z:0}));
    const a=world?.length===raw.length&&world.every(v=>v&&[v.x,v.y,v.z].every(Number.isFinite))?world:p;
    const hip=mid(p[23],p[24]),shoulder=mid(p[11],p[12]),torso=Math.max(.02,distance(hip,shoulder));
    const elbows=[angle(a[11],a[13],a[15]),angle(a[12],a[14],a[16])],knee=[angle(a[23],a[25],a[27]),angle(a[24],a[26],a[28])];
    const tilt=Math.atan2(Math.abs(shoulder.x-hip.x),Math.abs(shoulder.y-hip.y))*180/Math.PI;
    const confidence=Math.min(...needed(this.type).map(i=>raw[i].visibility??0));
    const footScale=Math.max(.015,mean(distance(p[29],p[31]),distance(p[30],p[32])));
    const heels=[(p[29].y-p[31].y)/footScale,(p[30].y-p[32].y)/footScale];
    const forward={x:mean(p[31].x-p[29].x,p[32].x-p[30].x),y:0,z:0,visibility:1};
    let start=false,peak=false,amplitude=0,symmetry=100,posture=clamp(100-Math.max(0,tilt-12)*2),measured=mean(...elbows as [number,number]),basis='',motion='',side:'left'|'right'|undefined;
    if(this.type==='biceps_curl'){
      start=Math.min(...elbows)>=145;peak=Math.max(...elbows)<=80;amplitude=clamp((160-Math.max(...elbows))/95*100);symmetry=clamp(100-Math.abs(elbows[0]-elbows[1])*1.5);basis='双肘屈伸';motion=`肘角 ${Math.round(elbows[0])}° / ${Math.round(elbows[1])}°；弯举 ≤80°，放回 ≥145°`;
    }else if(this.type==='lateral_raise'){
      const raised=[angle(a[13],a[11],a[23]),angle(a[14],a[12],a[24])];measured=mean(raised[0],raised[1]);start=Math.max(...raised)<=25;peak=Math.min(...raised)>=65&&Math.max(...raised)<=120;amplitude=clamp(Math.min(...raised)/90*100);symmetry=clamp(100-Math.abs(raised[0]-raised[1])*1.5);basis='双上臂相对躯干抬举';motion=`抬举 ${Math.round(raised[0])}° / ${Math.round(raised[1])}°；侧举 ≥65°，放回 ≤25°`;
    }else if(this.type==='shoulder_press'){
      const hands=[(p[11].y-p[15].y)/torso,(p[12].y-p[16].y)/torso];start=Math.max(...elbows)<=125&&Math.min(...elbows)>=55&&Math.min(...hands)>=-.1&&Math.max(...hands)<.8;peak=Math.min(...elbows)>=150&&Math.min(...hands)>=.5;amplitude=clamp((Math.min(...elbows)-85)/80*100);symmetry=clamp(100-Math.abs(elbows[0]-elbows[1])*1.5);basis='双肘伸展＋双手超过肩部';motion=`肘角 ${Math.round(elbows[0])}° / ${Math.round(elbows[1])}°；推起 ≥150°`;
    }else if(this.type==='bent_over_row'){
      if(tilt<25||tilt>85)return null;
      start=Math.min(...elbows)>=145;peak=Math.max(...elbows)<=100;amplitude=clamp((160-Math.max(...elbows))/90*100);symmetry=clamp(100-Math.abs(elbows[0]-elbows[1])*1.5);posture=this.baseline?clamp(100-Math.abs(tilt-this.baseline.tilt)*3):100;basis='俯身姿势＋双肘屈伸';motion=`肘角 ${Math.round(elbows[0])}° / ${Math.round(elbows[1])}°；拉起 ≤100°`;
    }else if(this.type==='reverse_lunge'){
      const b=this.baseline,leg=Math.max(.04,mean(distance(p[23],p[27]),distance(p[24],p[28]))),direction=b?Math.sign(b.forward.x):Math.sign(forward.x);
      if(Math.abs((b||{forward}).forward.x)<torso*.035)return null;
      const retreat=b?[27,28].map(i=>-direction*((p[i].x-hip.x)-(b.points[i].x-b.hip.x))/leg):[0,0];
      side=retreat[0]>=retreat[1]?'left':'right';
      start=Math.min(...knee)>=150&&Math.max(...retreat)<.15;peak=!!b&&Math.max(...retreat)>=.22&&Math.min(...knee)<=125;
      measured=Math.min(...knee);amplitude=clamp((165-measured)/75*100);symmetry=clamp(100-Math.abs(p[11].y-p[12].y)/torso*160);basis='后撤脚位移＋屈膝，再返回起始脚位';motion=`${side==='left'?'左':'右'}侧后撤 ${Math.round(Math.max(...retreat)*100)}% 腿长，膝角 ${Math.round(measured)}°`;
    }else{
      // Calf raises share one heel channel; only the knee gate differs. The
      // standing profile demands straight knees (≥150°); the seated variant
      // (tier-2 expansion, exdb:1379) replaces that gate with the seated range
      // used by the seated profiles elsewhere (60–130°) — the heel/forefoot
      // geometry itself is posture-independent once normalized by foot length.
      if(footScale<torso*.06||(this.type==='seated_calf_raise'?(Math.min(...knee)<60||Math.max(...knee)>130):Math.min(...knee)<150))return null;
      const b=this.baseline,raise=b?heels.map((v,i)=>b.heels[i]-v):[0,0];
      // Toe-to-heel displacement rejects a camera translation or whole-body jump.
      if(b&&[31,32].some(i=>distance(p[i],b.points[i])>b.footScale*.4))return null;
      start=Math.max(...raise)<=.07;peak=!!b&&Math.min(...raise)>=.16;amplitude=clamp(Math.min(...raise)/.3*100);symmetry=clamp(100-Math.abs(raise[0]-raise[1])*180);measured=mean(raise[0],raise[1])*100;basis='脚跟相对前脚掌上升；前脚掌保持原位';motion=`双脚提踵 ${Math.round(raise[0]*100)}% / ${Math.round(raise[1]*100)}% 脚长；目标 ≥16%`;
    }
    return {start,peak,amplitude,symmetry,posture,confidence,side,angle:measured,basis,motion,hip,torso,tilt,points:p,footScale,heels,forward};
  }
  update(raw:Point[]|null,now:number,aspect=1,world:Point[]|null=null):ExerciseMetrics {
    if(!raw||raw.length<33||!Number.isFinite(now)||!Number.isFinite(aspect)||aspect<=0||raw.some(p=>!p||![p.x,p.y,p.visibility??0].every(Number.isFinite)))return this.interrupt('未检测到完整人体关键点',notSeenCopyFor(this.type));
    if(this.at!==null&&now<=this.at)return this.metrics;
    if(this.at!==null&&now-this.at>750){if(this.freezeBridged)this.freezeBridged=false;else this.interrupt('画面中断',COPY_HALF_REP);}
    const indices=needed(this.type);
    if(indices.some(i=>(raw[i].visibility??0)<.25||raw[i].x<0||raw[i].x>1||raw[i].y<0||raw[i].y>1))return this.interrupt('所需关节离开画面或被遮挡',COPY_OUT_OF_FRAME);
    this.frames=[...this.frames,raw].slice(-(this.prefiltered?1:5));const points=medianLandmarks(this.frames)!;
    if(indices.some(i=>(points[i].visibility??0)<.55))return this.interrupt('关键关节持续不清晰','我有点看不清——换个角度，让我看清你');
    // Use the same smoothed coordinate system for measurements, including world angles.
    // Image angles remain available when world landmarks cannot be trusted.
    this.worldFrames=world?.length===raw.length&&world.every(p=>p&&[p.x,p.y,p.z].every(Number.isFinite))?[...this.worldFrames,world].slice(-(this.prefiltered?1:5)):[];
    const smoothedWorld=this.worldFrames.length&&indices.every(i=>(raw[i].visibility??0)>=.7)?medianLandmarks(this.worldFrames):null;
    const f=this.sample(points,aspect,smoothedWorld);
    if(!f)return this.interrupt(this.type==='calf_raise'?'请让双脚跟和前脚掌清晰可见，保持前脚掌原位和膝盖伸直':this.type==='seated_calf_raise'?'请坐稳、双膝弯曲，让双脚跟和前脚掌清晰可见，保持前脚掌原位':this.type==='reverse_lunge'?'请斜侧面拍摄，让脚尖方向及后撤脚位清晰可见':'请保持斜侧面俯身姿势，让双臂清晰可见');
    const dt=this.at===null?0:now-this.at;this.at=now;this.times=[...this.times,now].filter(t=>now-t<=2000);
    this.diagnostics={...this.diagnostics,fps:this.times.length>1?Math.round((this.times.length-1)*1000/(now-this.times[0])):0,confidence:f.confidence,angle:f.angle,side:f.side||null,basis:f.basis,motion:f.motion};
    if(!this.calibrated){
      if(!f.start){this.calibration=null;this.baseline=null;}else {if(this.calibration===null)this.calibration=now;this.baseline=f;if(this.armOnStart||now-this.calibration>=2000)this.calibrated=true;}
      const progress=this.calibrated?1:this.calibration===null?0:Math.min(1,(now-this.calibration)/2000);
      this.diagnostics={...this.diagnostics,stage:this.calibrated?'ready':'calibrating',calibrationProgress:progress};
      this.metrics={...this.metrics,feedback:this.calibrated?COPY_CALIBRATED:f.start?`就快好啦，保持起始姿势（${Math.round(progress*100)}%）`:'先回到起始姿势，陪我停两秒',poseFeedback:{...this.metrics.poseFeedback,calibrated:this.calibrated,confidence:f.confidence,status:'uncertain'}};
      this.previous=f;return this.metrics;
    }
    if(!f.start){
      if(this.movementSince===null)this.movementSince=now;
      this.scoring=this.scoring&&f.confidence>=.7;
      this.maxTrunkShift=Math.max(this.maxTrunkShift,Math.abs(f.tilt-this.baseline!.tilt));
      // Measure control over a real time window; tiny React frame intervals must not
      // turn an ordinary smoothed pose update into an artificial speed spike.
      if(this.controlAt===null){this.controlAt=now;this.controlAngle=f.angle;}
      else if(now-this.controlAt>=100){this.maxStep=Math.max(this.maxStep,Math.abs(f.angle-this.controlAngle)/((now-this.controlAt)/1000));this.controlAt=now;this.controlAngle=f.angle;}
      if(f.posture<70)this.issues.add('body_alignment');
      if(f.symmetry<70)this.issues.add('poor_coordination');
    }
    // Returning to the start pose with no peak latched ends the excursion, so a later
    // brief peak is measured against its own excursion, not an earlier half rep.
    if(f.start&&!this.peak)this.movementSince=null;
    if(f.peak){if(this.peakSince===null)this.peakSince=now;if(!this.peak||f.amplitude>this.peak.amplitude)this.peak=f;}else this.peakSince=null;
    let completed=false;
    if(this.peak&&f.start){
      if(this.returnSince===null)this.returnSince=now;
      if(this.retAnchor===null||now-this.retAnchor>RETURN_WINDOW_MS){this.retAnchor=now;this.retAccum=this.retPrevAt!==null?Math.min(RETURN_FRAME_CAP_MS,now-this.retPrevAt)/2:0;}
      else if(this.retPrevAt!==null)this.retAccum+=Math.min(RETURN_FRAME_CAP_MS,now-this.retPrevAt);
      this.retPrevAt=now;
      if(this.retAccum>=RETURN_HOLD_MS){
        if(this.returnSince-(this.movementSince??this.returnSince)<MIN_EXCURSION_MS){this.resetCycle();}
        else if(this.metrics.reps<this.metrics.targetReps){
          const peak=this.peak,acc={...this.metrics.scoreAccumulator},counts={...this.metrics.correctionCounts};
          if(this.type==='reverse_lunge'){const k=peak.side==='left'?'leftReps':'rightReps';acc[k]=(acc[k]||0)+1;}
          const duration=(now-(this.movementSince??now))/1000;
          const breakdown={depth:peak.amplitude,stability:clamp(100-Math.max(0,this.maxStep-260)*.08-Math.max(0,.6-duration)*70),trunk:clamp(peak.posture-this.maxTrunkShift*1.5),symmetry:peak.symmetry};
          if(breakdown.stability<70)this.issues.add('unstable_movement');
          if(breakdown.depth<70)this.issues.add('insufficient_range');
          const score=Math.round(breakdown.depth*.35+breakdown.stability*.25+breakdown.trunk*.2+breakdown.symmetry*.2),repIssues=[...this.issues];
          const scored=this.scoring&&f.confidence>=.7;
          if(scored){acc.count++;acc.total+=score;axes.forEach(k=>acc[k]+=breakdown[k]);repIssues.forEach(k=>counts[k]++);}
          this.metrics={...this.metrics,reps:this.metrics.reps+1,lastRepScore:scored?score:null,scoreAccumulator:acc,formScore:acc.count?Math.round(acc.total/acc.count):0,formBreakdown:acc.count?average(acc):zero(),perfectReps:this.metrics.perfectReps+(scored&&score>=90?1:0),correctionCounts:counts,lastRepIssues:scored?repIssues:[],feedback:scored?`好，第 ${this.metrics.reps+1} 次记下啦 · 本次 ${score} 分`:`好，第 ${this.metrics.reps+1} 次记下啦 · 这次没看清，不评分`};
          completed=true;
        }
        this.resetCycle();
      }
    }else{this.returnSince=null;if(this.peak)this.retPrevAt=now;}
    const stage=this.metrics.reps>=this.metrics.targetReps?'complete':this.peak?(f.start?'returning':'peak'):f.start?'ready':f.peak?'peak':'moving';
    this.diagnostics={...this.diagnostics,stage,calibrationProgress:1};
    const issue=[...this.issues][0]||null;
    const message=stage==='complete'?'目标完成啦，漂亮':PLAN_STAGE_COPY[this.type][stage==='ready'?0:stage==='moving'?1:stage==='peak'?2:3];
    this.metrics={...this.metrics,phase:f.start?'standing':this.peak?'ascending':'descending',feedback:completed?this.metrics.feedback:message,poseFeedback:{status:f.confidence<.7?'uncertain':issue?'adjust':'stable',confidence:f.confidence,issues:issue?[issue]:[],primaryIssue:issue,affectedJoints:issue?poseIssueCopy(issue,this.type).joints:[],calibrated:true,message:issue?poseIssueCopy(issue,this.type).action:message}};
    this.previous=f;return this.metrics;
  }
}
