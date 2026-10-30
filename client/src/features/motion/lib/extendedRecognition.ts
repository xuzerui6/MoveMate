import type {NormalizedLandmark as Point} from '@mediapipe/tasks-vision';
import type {ExerciseMetrics,RecognitionDiagnostics} from './exerciseMetrics';
import {medianLandmarks,POSE_ISSUE_COPY} from './poseFeedback';
import {emptyCorrectionCounts,emptyFormBreakdown} from './sessionMigration';
import {NEW_EXERCISES,type NewExerciseType} from './newExercises';
import type {PoseIssue} from '../types';

const cap=(n:number)=>Math.max(0,Math.min(100,n));
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));
const vector=(a:Point,b:Point)=>[a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0)];
const dot=(a:number[],b:number[])=>a.reduce((n,x,i)=>n+x*b[i],0);
const norm=(v:number[])=>v.map(x=>x/(Math.hypot(...v)||1));
const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const angle=(a:Point,b:Point,c:Point)=>Math.acos(Math.max(-1,Math.min(1,dot(norm(vector(a,b)),norm(vector(c,b))))))*180/Math.PI;
const mean=(a:number,b:number)=>(a+b)/2;
type Side='left'|'right';
type Measurement={start:boolean;peak:boolean;amplitude:number;angle:number;confidence:number;scorable:boolean;posture:number;symmetry:number;controlPenalty:number;hint?:string;side?:Side;basis:string;motion:string;points:Point[];torso:number;tilt:number};
const axes=['depth','stability','trunk','symmetry'] as const;
const sideJoints=(s:Side)=>s==='left'?[11,23,25,27]:[12,24,26,28];

/** Six new profiles only. Original four and original plan algorithms remain separate. */
export class ExtendedExerciseTracker {
  metrics:ExerciseMetrics;
  diagnostics:RecognitionDiagnostics={fps:0,confidence:0,side:null,angle:null,stage:'calibrating',calibrationProgress:0,pairedSides:[],lastResetReason:null};
  private frames:Point[][]=[];
  private worlds:Point[][]=[];
  private last:number|null=null;
  private calibration:number|null=null;
  private baseline:Measurement|null=null;
  private ready=false;
  private times:number[]=[];
  private side:Side|null=null;
  private cycleSide:Side|null=null;
  private peak:Measurement|null=null;
  private peakAt:number|null=null;
  private returnAt:number|null=null;
  private movingAt:number|null=null;
  private scoring=true;
  private previous:Measurement|null=null;
  private controlAt:number|null=null;
  private controlAngle=0;
  private speed=0;
  private shift=0;
  private controlPenalty=0;
  constructor(readonly type:NewExerciseType,targetReps=20,restored:Partial<ExerciseMetrics>={}){
    const acc={...emptyFormBreakdown(),count:0,total:0,...restored.scoreAccumulator};
    this.metrics={...restored,reps:Math.max(0,restored.reps||0),targetReps,perfectReps:restored.perfectReps||0,formScore:acc.count?Math.round(acc.total/acc.count):0,phase:'standing',feedback:NEW_EXERCISES[type].placement,scoreAccumulator:acc,formBreakdown:emptyFormBreakdown(),correctionCounts:{...emptyCorrectionCounts(),...restored.correctionCounts},lastRepIssues:[],repeatedIssue:null,poseFeedback:{status:'uncertain',confidence:0,issues:[],primaryIssue:null,affectedJoints:[],calibrated:false,message:'保持起始姿势两秒，准备校准'}};
    this.updateAverage();
  }
  private updateAverage(){const a=this.metrics.scoreAccumulator,b=emptyFormBreakdown();for(const k of axes)b[k]=a.count?Math.round(a[k]/a.count):0;this.metrics.formBreakdown=b;}
  private resetCycle(){this.peak=null;this.peakAt=null;this.returnAt=null;this.movingAt=null;this.cycleSide=null;this.scoring=true;this.speed=0;this.shift=0;this.controlPenalty=0;this.controlAt=null;}
  interrupt(reason='已暂停，继续后重新校准'){
    this.frames=[];this.worlds=[];this.last=null;this.calibration=null;this.baseline=null;this.ready=false;this.side=null;this.times=[];this.previous=null;this.resetCycle();
    this.diagnostics={...this.diagnostics,stage:'tracking_lost',fps:0,calibrationProgress:0,lastResetReason:reason};
    this.metrics={...this.metrics,phase:'standing',feedback:reason,poseFeedback:{...this.metrics.poseFeedback,status:'uncertain',calibrated:false,message:reason}};
    return this.metrics;
  }
  private needed(raw:Point[]):number[]{
    if(this.type==='romanian_deadlift'||this.type==='glute_bridge'){
      if(!this.side){const confidence=(s:Side)=>Math.min(...sideJoints(s).map(i=>raw[i]?.visibility||0));this.side=confidence('left')>=confidence('right')?'left':'right';}
      return sideJoints(this.side);
    }
    if(this.type==='standing_leg_curl')return [11,12,23,24,25,26,27,28];
    return [11,12,13,14,15,16,23,24,...(this.type==='front_raise'?[0]:[]),...(this.type==='triceps_kickback'?[25,26]:[])];
  }
  private measure(points:Point[],aspect:number,world:Point[]|null,required:number[]):Measurement|string{
    const p=points.map(v=>({...v,x:v.x*aspect,z:0}));
    const validWorld=world?.length===33&&world.every(v=>v&&[v.x,v.y,v.z].every(Number.isFinite))&&dist(world[11],world[23])>.04&&dist(world[11],world[23])<1.5;
    const a=validWorld?world!:p;
    const o=this.side==='right'?1:0,sh=p[11+o],hip=p[23+o];
    const torso=Math.max(.03,dist(sh,hip)),tilt=Math.atan2(Math.abs(sh.x-hip.x),Math.abs(sh.y-hip.y))*180/Math.PI;
    const confidence=Math.min(...required.map(i=>points[i].visibility??0));
    const elbows=[angle(a[11],a[13],a[15]),angle(a[12],a[14],a[16])];
    const knees=[angle(a[23],a[25],a[27]),angle(a[24],a[26],a[28])];
    let start=false,peak=false,amplitude=0,measured=0,posture=cap(100-Math.max(0,tilt-12)*2),symmetry=100,controlPenalty=0,side:Side|undefined=this.side||undefined,basis='',motion='',hint:string|undefined;
    if(this.type==='hammer_curl'){
      if(tilt>35)return '请直立站稳，保持双上臂在体侧';
      start=Math.min(...elbows)>=145;peak=Math.max(...elbows)<=80;measured=mean(elbows[0],elbows[1]);amplitude=cap((160-Math.max(...elbows))/95*100);symmetry=cap(100-Math.abs(elbows[0]-elbows[1])*1.5);basis='双肘屈伸；握法由本人按说明保持';motion=`双肘 ${Math.round(elbows[0])}° / ${Math.round(elbows[1])}°；弯举≤80°、放回≥145°`;
      controlPenalty=Math.max(0,Math.max(angle(a[13],a[11],a[23]),angle(a[14],a[12],a[24]))-15)*1.5;
      if(controlPenalty>25)hint='请让上臂靠近体侧，不要抬肩或摆动上臂借力';
    }else if(this.type==='front_raise'){
      if(!validWorld)return '暂时无法判断前举方向，请斜侧面拍摄，让头部和双臂清晰可见';
      const mid=(i:number,j:number):Point=>({...a[i],x:mean(a[i].x,a[j].x),y:mean(a[i].y,a[j].y),z:mean(a[i].z,a[j].z)});
      const shoulder=mid(11,12),pelvis=mid(23,24),lateral=norm(vector(a[12],a[11]));let forward=norm(cross(lateral,vector(shoulder,pelvis)));
      const face=dot(vector(a[0],shoulder),forward);
      if(Math.abs(face)<dist(shoulder,pelvis)*.06||dist(a[11],a[12])<.05)return '前举方向不清晰，请调整为斜侧面并让头部入镜';
      if(face<0)forward=forward.map(v=>-v);
      const raised=[angle(a[13],a[11],a[23]),angle(a[14],a[12],a[24])];
      const direction=[0,1].every(i=>{const v=vector(a[15+i],a[11+i]),n=Math.hypot(...v);return dot(v,forward)>n*.6&&Math.abs(dot(v,lateral))<n*.55;});
      start=Math.max(...raised)<=25;peak=Math.min(...raised)>=65&&Math.max(...raised)<=115&&direction&&Math.min(...elbows)>=140;
      measured=mean(raised[0],raised[1]);amplitude=cap(Math.min(...raised)/90*100);symmetry=cap(100-Math.abs(raised[0]-raised[1])*1.5);basis='双臂抬举角＋身体前向运动平面';motion=`抬臂 ${Math.round(raised[0])}° / ${Math.round(raised[1])}°；${direction?'前举方向已确认':'尚未确认前举方向，侧举不计数'}`;
      controlPenalty=Math.max(0,170-Math.min(...elbows))*1.5;
      if(!start&&!direction)hint='尚未确认前举方向；请向身体前方抬臂，侧平举不计入';
    }else if(this.type==='triceps_kickback'){
      if(tilt<25||tilt>85)return '请先屈髋俯身，双上臂靠近躯干，屈肘准备';
      const upper=[angle(a[13],a[11],a[23]),angle(a[14],a[12],a[24])];
      start=Math.min(...elbows)>=55&&Math.max(...elbows)<=125&&Math.max(...upper)<=55;
      peak=Math.min(...elbows)>=150&&Math.max(...upper)<=45;measured=mean(elbows[0],elbows[1]);amplitude=cap((Math.min(...elbows)-80)/90*100);symmetry=cap(100-Math.abs(elbows[0]-elbows[1])*1.5);posture=this.baseline?cap(100-Math.abs(tilt-this.baseline.tilt)*3):100;basis='俯身姿态＋双肘向后伸展，上臂保持体侧';motion=`双肘 ${Math.round(elbows[0])}° / ${Math.round(elbows[1])}°；伸肘≥150°`;
      controlPenalty=Math.max(0,Math.max(...upper)-15)*1.5;
    }else if(this.type==='romanian_deadlift'){
      const hinge=angle(a[11+o],a[23+o],a[25+o]),knee=knees[o];
      start=hinge>=155&&knee>=145;peak=hinge<=115&&knee>=145;
      if(knee<135)return '膝盖弯曲过多，请保持膝自然微屈，以髋后移完成动作；深蹲不计入';
      if(this.baseline&&dist(p[27+o],this.baseline.points[27+o])>this.baseline.torso*.18)return '脚位或画面移动，请站稳后重新校准';
      measured=hinge;amplitude=cap((175-hinge)/80*100);posture=cap(100-Math.max(0,150-knee)*2);basis='髋折叠角＋膝部保持微屈＋脚位稳定';motion=`髋角 ${Math.round(hinge)}°，膝角 ${Math.round(knee)}°；不要求触地`;
      symmetry=cap(100-Math.abs(knees[0]-knees[1])*1.5);
      if(knee<145)hint='膝盖弯曲较多，请保持微屈并将髋向后移，深蹲不计入';
    }else if(this.type==='glute_bridge'){
      const hinge=angle(a[11+o],a[23+o],a[25+o]),knee=knees[o],b=this.baseline;
      if(tilt<45||knee<45||knee>135)return '请仰卧屈膝、双脚踩地，摄像头降低并侧面拍摄';
      if(b&&[11+o,27+o].some(i=>dist(p[i],b.points[i])>b.torso*.14))return '肩部、脚位或画面移动，请恢复支撑后重新校准';
      const rise=b?(b.points[23+o].y-p[23+o].y)/b.torso:0;
      start=hinge<=145&&Math.abs(rise)<=.07;peak=!!b&&hinge>=155&&rise>=.18;measured=hinge;amplitude=cap((hinge-95)/75*100);posture=cap(100-Math.abs(175-hinge)*2);symmetry=b?cap(100-Math.max(dist(p[11+o],b.points[11+o]),dist(p[27+o],b.points[27+o]))/b.torso*200):100;basis='肩与脚部固定支撑＋髋部抬起＋肩髋膝连线';motion=`髋角 ${Math.round(hinge)}°，抬髋 ${Math.round(rise*100)}% 躯干长`;
    }else{
      if(tilt>30)return '请保持直立，避免俯身或抬起大腿代替后屈腿';
      const candidate:Side=knees[0]<=knees[1]?'left':'right';side=this.cycleSide||candidate;const k=side==='left'?0:1,support=1-k;
      if(this.cycleSide&&knees[support]<135)return '请先放回本侧再换腿，未完成动作已丢弃';
      const hips=angle(a[11+k],a[23+k],a[25+k]);start=Math.min(...knees)>=150;
      peak=knees[k]<=95&&knees[support]>=145&&hips>=150;
      measured=knees[k];amplitude=cap((170-knees[k])/95*100);posture=cap(100-Math.max(0,170-hips)*2);basis='单侧膝屈伸＋大腿保持向下＋另一腿支撑';motion=`${side==='left'?'左':'右'}膝 ${Math.round(knees[k])}°，髋角 ${Math.round(hips)}°；抬大腿不计数`;
      symmetry=cap(100-Math.max(0,165-knees[support])*3-(this.baseline?dist(p[27+support],this.baseline.points[27+support])/torso*120:0));
      if(!start&&hips<150)hint='请让大腿保持向下，脚跟向后抬起，向前抬膝不计入';
    }
    const scorable=confidence>=.7&&[11,12,23,24,...(this.type==='romanian_deadlift'||this.type==='glute_bridge'?[25,26,27,28]:[])].every(i=>(points[i].visibility??0)>=.7);
    return {start,peak,amplitude,angle:measured,confidence,scorable,posture,symmetry,controlPenalty,hint,side,basis,motion,points:p,torso,tilt};
  }
  update(raw:Point[]|null,now:number,aspect=1,world:Point[]|null=null):ExerciseMetrics{
    if(!raw||raw.length!==33||!Number.isFinite(now)||!Number.isFinite(aspect)||aspect<=0||raw.some(p=>!p||![p.x,p.y,p.visibility??0].every(Number.isFinite)))return this.interrupt('未检测到完整人体关键点，请调整入镜范围');
    if(this.last!==null&&now<=this.last)return this.metrics;
    if(this.last!==null&&now-this.last>750)this.interrupt('画面中断，半程动作已丢弃');
    const required=this.needed(raw);
    if(required.some(i=>(raw[i].visibility??0)<.25||raw[i].x<0||raw[i].x>1||raw[i].y<0||raw[i].y>1))return this.interrupt('必要关节离开画面或被遮挡，半程动作已丢弃');
    this.frames=[...this.frames,raw].slice(-5);const smooth=medianLandmarks(this.frames)!;
    if(required.some(i=>(smooth[i].visibility??0)<.55))return this.interrupt('必要关节持续不清晰，请调整角度');
    this.worlds=world?.length===33&&world.every(p=>p&&[p.x,p.y,p.z].every(Number.isFinite))?[...this.worlds,world].slice(-5):[];
    const f=this.measure(smooth,aspect,this.worlds.length?medianLandmarks(this.worlds):null,required);
    if(typeof f==='string')return this.interrupt(f);
    this.last=now;this.times=[...this.times,now].filter(t=>now-t<=2000);
    this.diagnostics={...this.diagnostics,fps:this.times.length>1?Math.round((this.times.length-1)*1000/(now-this.times[0])):0,confidence:f.confidence,side:f.side||null,angle:f.angle,basis:f.basis,motion:f.motion};
    if(!this.ready){
      if(!f.start){this.calibration=null;this.baseline=null;}else{if(this.calibration===null)this.calibration=now;this.baseline=f;if(now-this.calibration>=2000)this.ready=true;}
      const progress=this.calibration===null?0:Math.min(1,(now-this.calibration)/2000);this.diagnostics={...this.diagnostics,stage:this.ready?'ready':'calibrating',calibrationProgress:progress};
      const message=this.ready?'校准完成，可以开始完整动作':f.start?`保持起始姿势，校准 ${Math.round(progress*100)}%`:'请回到本动作起始姿势，保持两秒';
      this.metrics={...this.metrics,feedback:message,poseFeedback:{...this.metrics.poseFeedback,status:'uncertain',calibrated:this.ready,confidence:f.confidence,message}};return this.metrics;
    }
    if(!f.start){
      if(this.movingAt===null){this.movingAt=now;if(this.type==='standing_leg_curl')this.cycleSide=f.side||null;}
      this.scoring=this.scoring&&f.scorable;this.shift=Math.max(this.shift,Math.abs(f.tilt-this.baseline!.tilt));
      this.controlPenalty=Math.max(this.controlPenalty,f.controlPenalty);
      if(this.controlAt===null){this.controlAt=now;this.controlAngle=f.angle;}else if(now-this.controlAt>=100){this.speed=Math.max(this.speed,Math.abs(f.angle-this.controlAngle)*1000/(now-this.controlAt));this.controlAt=now;this.controlAngle=f.angle;}
    }
    if(f.peak){if(this.peakAt===null)this.peakAt=now;if(now-this.peakAt>=120&&(!this.peak||f.amplitude>this.peak.amplitude))this.peak=f;}else this.peakAt=null;
    let completed=false;
    if(this.peak&&f.start){
      if(this.returnAt===null)this.returnAt=now;
      if(now-this.returnAt>=150){
        if(this.metrics.reps<this.metrics.targetReps){
          const acc={...this.metrics.scoreAccumulator},duration=(now-(this.movingAt??now))/1000;
          if(this.type==='standing_leg_curl'){const key=this.peak.side==='left'?'leftReps':'rightReps';acc[key]=(acc[key]||0)+1;}
          const breakdown={depth:this.peak.amplitude,stability:cap(100-Math.max(0,this.speed-260)*.08-Math.max(0,.6-duration)*70-this.controlPenalty),trunk:cap(this.peak.posture-(this.type==='romanian_deadlift'||this.type==='glute_bridge'?0:this.shift*1.5)),symmetry:this.peak.symmetry};
          const score=Math.round(breakdown.depth*.35+breakdown.stability*.25+breakdown.trunk*.2+breakdown.symmetry*.2),scored=this.scoring&&f.scorable,issues:PoseIssue[]=[];
          if(breakdown.depth<70)issues.push('insufficient_range');if(breakdown.stability<70)issues.push('unstable_movement');if(breakdown.trunk<70)issues.push('body_alignment');if(breakdown.symmetry<70)issues.push('poor_coordination');
          const counts={...this.metrics.correctionCounts};if(scored){acc.count++;acc.total+=score;axes.forEach(k=>acc[k]+=breakdown[k]);issues.forEach(k=>counts[k]++);}
          this.metrics={...this.metrics,reps:this.metrics.reps+1,lastRepScore:scored?score:null,scoreAccumulator:acc,perfectReps:this.metrics.perfectReps+(scored&&score>=90?1:0),formScore:acc.count?Math.round(acc.total/acc.count):0,correctionCounts:counts,lastRepIssues:scored?issues:[],feedback:scored?`已记录第 ${this.metrics.reps+1} 次 · 本次 ${score} 分`:`已记录第 ${this.metrics.reps+1} 次 · 本次无法评分`};this.updateAverage();completed=true;
        }this.resetCycle();
      }
    }else this.returnAt=null;
    const stage=this.metrics.reps>=this.metrics.targetReps?'complete':this.peak?(f.start?'returning':'peak'):f.start?'ready':'moving';
    const copy=NEW_EXERCISES[this.type].stages,message=stage==='complete'?'已完成本组目标':f.hint||copy[stage==='ready'?0:stage==='moving'?1:stage==='peak'?2:3]+(stage==='moving'?' · 幅度尚未确认':'');
    const issue:PoseIssue|null=f.controlPenalty>30?'unstable_movement':f.posture<70?'body_alignment':f.symmetry<70?'poor_coordination':null;
    this.diagnostics={...this.diagnostics,stage};this.metrics={...this.metrics,phase:f.start?'standing':this.peak?'ascending':'descending',feedback:completed?this.metrics.feedback:message,poseFeedback:{status:!f.scorable?'uncertain':issue?'adjust':'stable',confidence:f.confidence,issues:issue?[issue]:[],primaryIssue:issue,affectedJoints:issue?POSE_ISSUE_COPY[issue].joints:[],calibrated:true,message:f.hint|| (issue?POSE_ISSUE_COPY[issue].action:message)}};this.previous=f;return this.metrics;
  }
}
