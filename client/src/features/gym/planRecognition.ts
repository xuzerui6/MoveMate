import type { NormalizedLandmark as Point } from '@mediapipe/tasks-vision';
import type { ExerciseMetrics, RecognitionDiagnostics } from '../motion/lib/exerciseMetrics';
import type { FormBreakdown, PoseIssue, ScoreAccumulator } from '../motion/types';
import { medianLandmarks, POSE_ISSUE_COPY } from '../motion/lib/poseFeedback';

export const PLAN_PROFILES = ['biceps_curl','lateral_raise','shoulder_press','bent_over_row','reverse_lunge','calf_raise'] as const;
export type NewPlanProfile = typeof PLAN_PROFILES[number];
export const isNewPlanProfile = (value: string): value is NewPlanProfile => PLAN_PROFILES.includes(value as NewPlanProfile);
const axes = ['depth','stability','trunk','symmetry'] as const;
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
  biceps_curl:['伸臂就绪','双臂弯举中','弯举幅度确认，请放回','伸臂确认'],
  lateral_raise:['垂臂就绪','双臂侧举中','抬举幅度确认，请放回','垂臂确认'],
  shoulder_press:['肩部起始位就绪','推举中','推起幅度确认，请放回','肩部起始位确认'],
  bent_over_row:['俯身垂臂就绪','双臂拉起中','拉起幅度确认，请放回','垂臂确认'],
  reverse_lunge:['并脚站立就绪','后撤下沉中','弓步幅度确认，请返回站立','返回站立确认'],
  calf_raise:['脚跟落地就绪','提踵中','提踵幅度确认，请落跟','落跟确认'],
};
const needed = (type:NewPlanProfile) => type==='calf_raise' ? [11,12,23,24,25,26,27,28,29,30,31,32] : type==='reverse_lunge' ? [11,12,23,24,25,26,27,28,29,30,31,32] : type==='bent_over_row' ? [11,12,13,14,15,16,23,24,25,26] : [11,12,13,14,15,16,23,24];
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
  private movementSince:number|null=null;
  private scoring=true;
  private maxTrunkShift=0;
  private previous:Sample|null=null;
  private maxStep=0;
  private controlAt:number|null=null;
  private controlAngle=0;
  private issues=new Set<PoseIssue>();
  constructor(readonly type:NewPlanProfile, targetReps=20, restored:Partial<ExerciseMetrics>={}) {
    const acc={...zero(),count:0,total:0,...restored.scoreAccumulator};
    this.metrics={...restored,reps:Math.max(0,restored.reps||0),targetReps,formScore:acc.count?Math.round(acc.total/acc.count):0,perfectReps:restored.perfectReps||0,feedback:'保持起始姿势两秒，准备校准',phase:'standing',scoreAccumulator:acc,formBreakdown:acc.count?average(acc):zero(),correctionCounts:{out_of_frame:0,insufficient_depth:0,knee_instability:0,excessive_trunk_lean:0,asymmetry:0,insufficient_range:0,unstable_movement:0,body_alignment:0,poor_coordination:0,...restored.correctionCounts},lastRepIssues:[],repeatedIssue:null,poseFeedback:{status:'uncertain',confidence:0,issues:[],primaryIssue:null,affectedJoints:[],calibrated:false,message:'等待起始姿势'}};
  }
  interrupt(reason='已暂停，继续后重新校准') {
    this.frames=[];this.worldFrames=[];this.at=null;this.calibration=null;this.baseline=null;this.calibrated=false;this.times=[];this.resetCycle();this.previous=null;
    this.diagnostics={...this.diagnostics,fps:0,confidence:0,stage:'tracking_lost',calibrationProgress:0,lastResetReason:reason};
    this.metrics={...this.metrics,phase:'standing',feedback:reason,poseFeedback:{...this.metrics.poseFeedback,status:'uncertain',calibrated:false,message:reason}};
    return this.metrics;
  }
  private resetCycle(){this.peakSince=null;this.peak=null;this.returnSince=null;this.movementSince=null;this.scoring=true;this.maxTrunkShift=0;this.maxStep=0;this.controlAt=null;this.issues.clear();}
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
      if(footScale<torso*.06||Math.min(...knee)<150)return null;
      const b=this.baseline,raise=b?heels.map((v,i)=>b.heels[i]-v):[0,0];
      // Toe-to-heel displacement rejects a camera translation or whole-body jump.
      if(b&&[31,32].some(i=>distance(p[i],b.points[i])>b.footScale*.4))return null;
      start=Math.max(...raise)<=.07;peak=!!b&&Math.min(...raise)>=.16;amplitude=clamp(Math.min(...raise)/.3*100);symmetry=clamp(100-Math.abs(raise[0]-raise[1])*180);measured=mean(raise[0],raise[1])*100;basis='脚跟相对前脚掌上升；前脚掌保持原位';motion=`双脚提踵 ${Math.round(raise[0]*100)}% / ${Math.round(raise[1]*100)}% 脚长；目标 ≥16%`;
    }
    return {start,peak,amplitude,symmetry,posture,confidence,side,angle:measured,basis,motion,hip,torso,tilt,points:p,footScale,heels,forward};
  }
  update(raw:Point[]|null,now:number,aspect=1,world:Point[]|null=null):ExerciseMetrics {
    if(!raw||raw.length<33||!Number.isFinite(now)||!Number.isFinite(aspect)||aspect<=0||raw.some(p=>!p||![p.x,p.y,p.visibility??0].every(Number.isFinite)))return this.interrupt('未检测到完整人体关键点，请调整入镜范围');
    if(this.at!==null&&now<=this.at)return this.metrics;
    if(this.at!==null&&now-this.at>750)this.interrupt('画面中断，半程动作已丢弃');
    const indices=needed(this.type);
    if(indices.some(i=>(raw[i].visibility??0)<.25||raw[i].x<0||raw[i].x>1||raw[i].y<0||raw[i].y>1))return this.interrupt('所需关节离开画面或被遮挡，半程动作已丢弃');
    this.frames=[...this.frames,raw].slice(-5);const points=medianLandmarks(this.frames)!;
    if(indices.some(i=>(points[i].visibility??0)<.55))return this.interrupt('关键关节持续不清晰，请调整拍摄角度');
    // Use the same smoothed coordinate system for measurements, including world angles.
    // Image angles remain available when world landmarks cannot be trusted.
    this.worldFrames=world?.length===raw.length&&world.every(p=>p&&[p.x,p.y,p.z].every(Number.isFinite))?[...this.worldFrames,world].slice(-5):[];
    const smoothedWorld=this.worldFrames.length&&indices.every(i=>(raw[i].visibility??0)>=.7)?medianLandmarks(this.worldFrames):null;
    const f=this.sample(points,aspect,smoothedWorld);
    if(!f)return this.interrupt(this.type==='calf_raise'?'请让双脚跟和前脚掌清晰可见，保持前脚掌原位和膝盖伸直':this.type==='reverse_lunge'?'请斜侧面拍摄，让脚尖方向及后撤脚位清晰可见':'请保持斜侧面俯身姿势，让双臂清晰可见');
    const dt=this.at===null?0:now-this.at;this.at=now;this.times=[...this.times,now].filter(t=>now-t<=2000);
    this.diagnostics={...this.diagnostics,fps:this.times.length>1?Math.round((this.times.length-1)*1000/(now-this.times[0])):0,confidence:f.confidence,angle:f.angle,side:f.side||null,basis:f.basis,motion:f.motion};
    if(!this.calibrated){
      if(!f.start){this.calibration=null;this.baseline=null;}else {if(this.calibration===null)this.calibration=now;this.baseline=f;if(now-this.calibration>=2000)this.calibrated=true;}
      const progress=this.calibration===null?0:Math.min(1,(now-this.calibration)/2000);
      this.diagnostics={...this.diagnostics,stage:this.calibrated?'ready':'calibrating',calibrationProgress:progress};
      this.metrics={...this.metrics,feedback:this.calibrated?'校准完成，可以开始完整动作':f.start?`保持起始姿势，正在校准 ${Math.round(progress*100)}%`:'请先回到本动作的起始姿势',poseFeedback:{...this.metrics.poseFeedback,calibrated:this.calibrated,confidence:f.confidence,status:'uncertain'}};
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
    if(f.peak){if(this.peakSince===null)this.peakSince=now;if(now-this.peakSince>=120&&(!this.peak||f.amplitude>this.peak.amplitude))this.peak=f;}else this.peakSince=null;
    let completed=false;
    if(this.peak&&f.start){
      if(this.returnSince===null)this.returnSince=now;
      if(now-this.returnSince>=150){
        if(this.metrics.reps<this.metrics.targetReps){
          const peak=this.peak,acc={...this.metrics.scoreAccumulator},counts={...this.metrics.correctionCounts};
          if(this.type==='reverse_lunge'){const k=peak.side==='left'?'leftReps':'rightReps';acc[k]=(acc[k]||0)+1;}
          const duration=(now-(this.movementSince??now))/1000;
          const breakdown={depth:peak.amplitude,stability:clamp(100-Math.max(0,this.maxStep-260)*.08-Math.max(0,.6-duration)*70),trunk:clamp(peak.posture-this.maxTrunkShift*1.5),symmetry:peak.symmetry};
          if(breakdown.stability<70)this.issues.add('unstable_movement');
          if(breakdown.depth<70)this.issues.add('insufficient_range');
          const score=Math.round(breakdown.depth*.35+breakdown.stability*.25+breakdown.trunk*.2+breakdown.symmetry*.2),repIssues=[...this.issues];
          const scored=this.scoring&&f.confidence>=.7;
          if(scored){acc.count++;acc.total+=score;axes.forEach(k=>acc[k]+=breakdown[k]);repIssues.forEach(k=>counts[k]++);}
          this.metrics={...this.metrics,reps:this.metrics.reps+1,lastRepScore:scored?score:null,scoreAccumulator:acc,formScore:acc.count?Math.round(acc.total/acc.count):0,formBreakdown:acc.count?average(acc):zero(),perfectReps:this.metrics.perfectReps+(scored&&score>=90?1:0),correctionCounts:counts,lastRepIssues:scored?repIssues:[],feedback:scored?`已记录第 ${this.metrics.reps+1} 次 · 本次 ${score} 分`:`已记录第 ${this.metrics.reps+1} 次 · 关键点不够清晰，本次无法评分`};
          completed=true;
        }
        this.resetCycle();
      }
    }else this.returnSince=null;
    const stage=this.metrics.reps>=this.metrics.targetReps?'complete':this.peak?(f.start?'returning':'peak'):f.start?'ready':f.peak?'peak':'moving';
    this.diagnostics={...this.diagnostics,stage,calibrationProgress:1};
    const issue=[...this.issues][0]||null;
    const message=stage==='complete'?'已完成本组目标':PLAN_STAGE_COPY[this.type][stage==='ready'?0:stage==='moving'?1:stage==='peak'?2:3];
    this.metrics={...this.metrics,phase:f.start?'standing':this.peak?'ascending':'descending',feedback:completed?this.metrics.feedback:message,poseFeedback:{status:f.confidence<.7?'uncertain':issue?'adjust':'stable',confidence:f.confidence,issues:issue?[issue]:[],primaryIssue:issue,affectedJoints:issue?POSE_ISSUE_COPY[issue].joints:[],calibrated:true,message:issue?POSE_ISSUE_COPY[issue].action:message}};
    this.previous=f;return this.metrics;
  }
}
