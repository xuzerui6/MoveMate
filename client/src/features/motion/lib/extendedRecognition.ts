import type {NormalizedLandmark as Point} from '@mediapipe/tasks-vision';
import type {ExerciseMetrics,RecognitionDiagnostics} from './exerciseMetrics';
import {medianLandmarks,POSE_ISSUE_COPY} from './poseFeedback';
import {emptyCorrectionCounts,emptyFormBreakdown} from './sessionMigration';
import {NEW_EXERCISES,type NewExerciseType} from './newExercises';
import {LIBRARY_RECOGNITION} from '../../gym/libraryRecognition';
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
type Measurement={start:boolean;peak:boolean;amplitude:number;angle:number;confidence:number;scorable:boolean;posture:number;symmetry:number;controlPenalty:number;hint?:string;side?:Side;basis:string;motion:string;points:Point[];torso:number;tilt:number;elbows?:[number,number];raiseSides?:[RaiseSide,RaiseSide]};
/** Per-arm front-raise channel: shoulder-flexion angle, whether that arm's wrist
 * direction is forward-dominant, and that arm's elbow angle. */
type RaiseSide={raised:number;forward:boolean;elbow:number};
type SideCycle={movingAt:number|null;peakStart:number|null;peakEnd:number;peakElbow:number;peakAmp:number;peakPosture:number;peakOther:number;peakOk:boolean;track:PeakTrack;prevAt:number|null;prevAngle:number;returnSince:number|null;returnAccum:number;scoring:boolean;controlMax:number;shiftMax:number;speedMax:number;sampleAt:number|null;sampleAngle:number};
type SideCompletion={side:number;at:number;peakStart:number;peakEnd:number;peakAmp:number;peakPosture:number;peakOther:number;peakElbow:number;duration:number;scoring:boolean;control:number;shift:number;speed:number};
const freshSideCycle=():SideCycle=>({movingAt:null,peakStart:null,peakEnd:0,peakElbow:180,peakAmp:0,peakPosture:100,peakOther:180,peakOk:true,track:freshPeakTrack(),prevAt:null,prevAngle:180,returnSince:null,returnAccum:0,scoring:true,controlMax:0,shiftMax:0,speedMax:0,sampleAt:null,sampleAngle:180});
/** In-zone dwell of one frame interval under linear interpolation between samples:
 * the interpolated entry time and how many ms of [prevAt, now] the signal spent
 * inside the zone. Crediting frames by whole intervals undercounts at low frame
 * rates (a true 200 ms dwell sampled at 15 FPS yields only 2 intervals = 133 ms),
 * which is the same sampling leak as the peak side, one gate later. */
function zonePortion(prev:number,cur:number,threshold:number,above:boolean,prevAt:number,now:number):{start:number;ms:number}{
  const dt=now-prevAt;if(dt<=0)return {start:now,ms:0};
  const inPrev=above?prev>=threshold:prev<=threshold,inCur=above?cur>=threshold:cur<=threshold;
  if(inPrev&&inCur)return {start:prevAt,ms:dt};
  if(!inPrev&&!inCur)return {start:now,ms:0};
  const tc=prevAt+dt*((threshold-prev)/(cur-prev));
  return inCur?{start:tc,ms:now-tc}:{start:prevAt,ms:tc-prevAt};
}
/** Return confirmation (hammer-curl tuning from the 2026-11-06 on-device retest):
 * accumulate 150 ms at/above the start angle inside a 500 ms window, so elbow jitter
 * around the threshold can no longer stall a rep at the confirm stage. Per-frame credit
 * is capped so a stalled frame stream cannot manufacture hold time. The generic cycle
 * in this file and the plan tracker reuse the same rule since 2026-11-07. */
const RETURN_HOLD_MS=150,RETURN_WINDOW_MS=500,RETURN_FRAME_CAP_MS=100;
/** Fast-tempo peak confirmation (2026-11-07 on-device report: counting is right at a
 * normal tempo but fast reps are missed). The old rule demanded sampled frames dwell
 * inside the peak zone for 120 ms; on a raised-cosine trajectory a 75° peak dwells
 * ≤80° for only 0.156·T (≈109 ms at 0.7 s/rep, before sampling phase eats up to two
 * frame intervals), so fast reps were structurally uncountable — synthetic-trajectory
 * replay measured 0/10 at 1.0 s/rep, 75° peak, 24 FPS. Peaks are now confirmed by the
 * sub-frame interpolated zone crossing: entry/exit times and the extremum come from
 * linear crossing interpolation plus a parabola through the samples bracketing the
 * extremum. Angle thresholds are unchanged; only the time/sampling layer moved.
 * One guard keeps the crossing rule from trusting noise: the interpolated dwell must
 * reach PEAK_MIN_DWELL_MS — a one-frame landmark spike interpolates to ≲21 ms of
 * dwell at ≥15 FPS, while a genuine 0.7 s/rep curl dwells ≥50 ms even with a 79°
 * peak. (Upstream, the production paths always pre-filter landmarks — TimeFilter in
 * the adaptive path, median-of-5 in the legacy path — so a raw one-frame spike does
 * not reach this code intact anyway.) Interpolation is only trusted across sample
 * gaps ≤ PEAK_GAP_MS; wider (freeze-bridged) gaps fall back to the sampled extremum. */
const PEAK_MIN_DWELL_MS=25,PEAK_GAP_MS=150;
/** Generic-cycle anti-fabrication guard: a latched peak only completes when the whole
 * excursion (leaving the start pose → first frame back at it) lasted at least this
 * long, so a brief peak blip during an otherwise stationary hold still counts
 * nothing. Mirrors the jumping-jack 250 ms motion guard in exerciseMetrics. */
const MIN_EXCURSION_MS=250;
/** Sub-frame peak-episode tracker over a depth signal (depth ≥ 0 = inside the peak
 * zone, larger = deeper). Feed every frame; `best` fires on the frame that is the
 * deepest sample so far (callers snapshot that frame's posture/validity), and
 * `closed` reports the episode's interpolated entry/exit times and refined extremum
 * when the signal leaves the zone. */
type PeakTrack={prevAt:number|null;prevDepth:number;open:boolean;start:number;best:number;bestAt:number;beforeAt:number;beforeDepth:number;afterAt:number|null;afterDepth:number;gap:boolean};
function freshPeakTrack():PeakTrack{return {prevAt:null,prevDepth:0,open:false,start:0,best:-Infinity,bestAt:0,beforeAt:0,beforeDepth:0,afterAt:null,afterDepth:0,gap:false};}
type PeakClose={start:number;end:number;depth:number;valid:boolean};
function feedPeakTrack(tr:PeakTrack,now:number,depth:number):{best:boolean;closed:PeakClose|null}{
  let best=false,closed:PeakClose|null=null;
  const prevAt=tr.prevAt,prevDepth=tr.prevDepth;
  if(prevAt!==null&&now-prevAt>PEAK_GAP_MS&&tr.open)tr.gap=true;
  if(!tr.open&&depth>=0){
    if(prevAt!==null&&prevDepth<0){
      const span=depth-prevDepth;
      tr.start=prevAt+(now-prevAt)*(span>0?(0-prevDepth)/span:0);
      tr.beforeAt=prevAt;tr.beforeDepth=prevDepth;
    }else{tr.start=now;tr.beforeAt=now;tr.beforeDepth=depth;}
    tr.open=true;tr.gap=false;tr.best=-Infinity;tr.bestAt=now;tr.afterAt=null;
  }
  if(tr.open){
    if(depth>tr.best){
      if(prevAt!==null){tr.beforeAt=prevAt;tr.beforeDepth=prevDepth;}
      tr.best=depth;tr.bestAt=now;tr.afterAt=null;best=true;
    }else if(tr.afterAt===null&&now>tr.bestAt){tr.afterAt=now;tr.afterDepth=depth;}
  }
  if(tr.open&&prevAt!==null&&prevDepth>=0&&depth<0){
    const span=prevDepth-depth,end=prevAt+(now-prevAt)*(span>0?prevDepth/span:0);
    let depthEst=tr.best;
    if(!tr.gap&&tr.best>-Infinity){
      // Parabola through the samples bracketing the extremum (the closing frame is
      // the after-sample when none was recorded) refines the extremum depth.
      const t2=tr.afterAt??now,y2=tr.afterAt!==null?tr.afterDepth:depth;
      const h1=tr.bestAt-tr.beforeAt,h2=t2-tr.bestAt;
      if(h1>0&&h2>0){
        const y0=tr.beforeDepth,y1=tr.best,a=((y2-y1)+(h2/h1)*(y0-y1))/(h2*(h1+h2));
        if(a<0){
          const b=a*h1-(y0-y1)/h1,u=Math.max(-h1,Math.min(h2,-b/(2*a)));
          depthEst=Math.max(y1,y1+b*u+a*u*u);
        }
      }
    }
    closed={start:tr.start,end,depth:depthEst,valid:end-tr.start>=PEAK_MIN_DWELL_MS};
    tr.open=false;
  }
  tr.prevAt=now;tr.prevDepth=depth;
  return {best,closed};
}
/** The upper-arm form hint is advisory only; it is shown after a sustained deviation and the
 * sustain timer restarts only after the arms have been back at the sides briefly (hysteresis),
 * so a seated low-camera setup cannot make it flap. It never gates cycle progression. */
const UPPER_ARM_SUSTAIN_MS=1000,UPPER_ARM_CLEAR_MS=300;
const axes=['depth','stability','trunk','symmetry'] as const;
type ExtendedType=NewExerciseType|'bench_press'|'reverse_fly'|'seated_triceps_extension'|'barbell_deadlift'|'incline_bench_press'|'seated_curl'|'seated_lateral_raise'|'lying_triceps_extension';
const definitions={...NEW_EXERCISES,...LIBRARY_RECOGNITION};
const sideJoints=(s:Side)=>s==='left'?[11,23,25,27]:[12,24,26,28];

/** Extended profiles. Original four and original plan algorithms remain separate. */
export class ExtendedExerciseTracker {
  metrics:ExerciseMetrics;
  diagnostics:RecognitionDiagnostics={fps:0,confidence:0,side:null,angle:null,stage:'calibrating',calibrationProgress:0,pairedSides:[],lastResetReason:null};
  private frames:Point[][]=[];
  private worlds:Point[][]=[];
  private last:number|null=null;
  private calibration:number|null=null;
  /** Start-pose hold time banked across interruptions of the hold itself: calibration
   * progress is latched (pause, never rewind) so a user who starts moving mid-calibration
   * — e.g. following a stray hint — no longer loses the 42%→13% they had earned. Only a
   * real tracking loss (interrupt) clears the bank. */
  private calibrationBank=0;
  private baseline:Measurement|null=null;
  private ready=false;
  private times:number[]=[];
  private side:Side|null=null;
  private cycleSide:Side|null=null;
  private peak:Measurement|null=null;
  private peakAt:number|null=null;
  private returnAt:number|null=null;
  private retSince:number|null=null;
  private retAccum=0;
  private retPrevAt:number|null=null;
  private movingAt:number|null=null;
  private scoring=true;
  private previous:Measurement|null=null;
  private controlAt:number|null=null;
  private controlAngle=0;
  private speed=0;
  private shift=0;
  private controlPenalty=0;
  private hammerSides:[SideCycle,SideCycle]=[freshSideCycle(),freshSideCycle()];
  private hammerPending:SideCompletion|null=null;
  private raiseSides:[SideCycle,SideCycle]=[freshSideCycle(),freshSideCycle()];
  private raisePending:SideCompletion|null=null;
  private upperArmDevAt:number|null=null;
  private upperArmClearAt:number|null=null;
  private freezeBridged=false;
  requiredIndices(raw:Point[]){return this.needed(raw)}
  constructor(readonly type:ExtendedType,targetReps=20,restored:Partial<ExerciseMetrics>={},readonly prefiltered=false,readonly armOnStart=false){
    const acc={...emptyFormBreakdown(),count:0,total:0,...restored.scoreAccumulator};
    this.metrics={...restored,reps:Math.max(0,restored.reps||0),targetReps,perfectReps:restored.perfectReps||0,formScore:acc.count?Math.round(acc.total/acc.count):0,phase:'standing',feedback:definitions[type].placement,scoreAccumulator:acc,formBreakdown:emptyFormBreakdown(),correctionCounts:{...emptyCorrectionCounts(),...restored.correctionCounts},lastRepIssues:[],repeatedIssue:null,poseFeedback:{status:'uncertain',confidence:0,issues:[],primaryIssue:null,affectedJoints:[],calibrated:false,message:'保持起始姿势两秒，准备校准'}};
    this.updateAverage();
  }
  private updateAverage(){const a=this.metrics.scoreAccumulator,b=emptyFormBreakdown();for(const k of axes)b[k]=a.count?Math.round(a[k]/a.count):0;this.metrics.formBreakdown=b;}
  private resetCycle(){this.peak=null;this.peakAt=null;this.returnAt=null;this.retSince=null;this.retAccum=0;this.retPrevAt=null;this.movingAt=null;this.cycleSide=null;this.scoring=true;this.speed=0;this.shift=0;this.controlPenalty=0;this.controlAt=null;this.hammerSides=[freshSideCycle(),freshSideCycle()];this.hammerPending=null;this.raiseSides=[freshSideCycle(),freshSideCycle()];this.raisePending=null;this.upperArmDevAt=null;this.upperArmClearAt=null;this.freezeBridged=false;}
  /** The adaptive wrapper deliberately froze frames during a hammer-curl evidence freeze
   * (see AdaptiveRecognition); the next frame gap is therefore known-benign and must not be
   * read as a tracking loss. Only arms when the pending gap actually exceeds the guard. */
  bridgeFreezeGap(now:number){if(this.last!==null&&now-this.last>750)this.freezeBridged=true;}
  /** Advisory upper-arm hint gating: visible only while a deviation has been sustained for
   * UPPER_ARM_SUSTAIN_MS; brief clearances (< UPPER_ARM_CLEAR_MS) neither hide it nor reset
   * the sustain timer, so the hint cannot flap frame to frame. */
  private upperArmHintVisible(deviating:boolean,now:number):boolean{
    if(deviating){this.upperArmClearAt=null;if(this.upperArmDevAt===null)this.upperArmDevAt=now;}
    else{if(this.upperArmClearAt===null)this.upperArmClearAt=now;if(now-this.upperArmClearAt>=UPPER_ARM_CLEAR_MS)this.upperArmDevAt=null;}
    return this.upperArmDevAt!==null&&now-this.upperArmDevAt>=UPPER_ARM_SUSTAIN_MS;
  }
  interrupt(reason='已暂停，继续后重新校准'){
    this.frames=[];this.worlds=[];this.last=null;this.calibration=null;this.calibrationBank=0;this.baseline=null;this.ready=false;this.side=null;this.times=[];this.previous=null;this.resetCycle();
    this.diagnostics={...this.diagnostics,stage:'tracking_lost',fps:0,calibrationProgress:0,lastResetReason:reason};
    this.metrics={...this.metrics,phase:'standing',feedback:reason,poseFeedback:{...this.metrics.poseFeedback,status:'uncertain',calibrated:false,message:reason}};
    return this.metrics;
  }
  private needed(raw:Point[]):number[]{
    if(this.type==='seated_curl'||this.type==='seated_lateral_raise'||this.type==='lying_triceps_extension')return [11,12,13,14,15,16,23,24,25,26,27,28];
    if(this.type==='bench_press'||this.type==='incline_bench_press'||this.type==='seated_triceps_extension')return [11,12,13,14,15,16,23,24,25,26,27,28];
    if(this.type==='reverse_fly')return [11,12,13,14,15,16,23,24,25,26];
    if(this.type==='barbell_deadlift'){
      const joints=(s:Side)=>[...sideJoints(s),s==='left'?13:14,s==='left'?15:16];
      if(!this.side){const confidence=(s:Side)=>Math.min(...joints(s).map(i=>raw[i]?.visibility||0));this.side=confidence('left')>=confidence('right')?'left':'right';}
      return joints(this.side);
    }
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
    let perSide:[number,number]|undefined;
    let raiseData:[RaiseSide,RaiseSide]|undefined;
    if(this.type==='seated_curl'||this.type==='seated_lateral_raise'){
      const hips=[angle(a[11],a[23],a[25]),angle(a[12],a[24],a[26])];
      if(tilt>30||hips.some(v=>v<60||v>130)||knees.some(v=>v<55||v>140))return '请坐稳、双脚支撑并调整为斜侧面，让屈膝坐姿清楚可见；站姿不计入';
      const raised=[angle(a[13],a[11],a[23]),angle(a[14],a[12],a[24])];
      if(this.type==='seated_curl'){
        if(Math.max(...raised)>45)return '请让上臂靠近体侧，避免抬肩或向前抬起上臂';
        start=Math.min(...elbows)>=145;peak=Math.max(...elbows)<=80;measured=mean(elbows[0],elbows[1]);amplitude=cap((160-Math.max(...elbows))/95*100);symmetry=cap(100-Math.abs(elbows[0]-elbows[1])*1.5);controlPenalty=Math.max(0,Math.max(...raised)-15)*1.5;
        basis='屈膝坐姿＋上臂靠近体侧＋双肘屈伸';motion=`双肘 ${Math.round(elbows[0])}° / ${Math.round(elbows[1])}°；伸臂≥145°，弯举≤80°`;
      }else{
        if(!validWorld)return '暂时无法确认侧举方向，请调整拍摄角度并让双臂清晰入镜';
        const lateral=norm(vector(a[12],a[11])),spread=[0,1].every(i=>{const v=vector(a[15+i],a[11+i]);return dot(v,lateral)*(i?1:-1)>Math.hypot(...v)*.65;});
        start=Math.max(...raised)<=25&&Math.min(...elbows)>=140;peak=Math.min(...raised)>=65&&Math.max(...raised)<=115&&Math.min(...elbows)>=140&&spread;
        measured=mean(raised[0],raised[1]);amplitude=cap(Math.min(...raised)/90*100);symmetry=cap(100-Math.abs(raised[0]-raised[1])*1.5);controlPenalty=Math.max(0,165-Math.min(...elbows));
        basis='屈膝坐姿＋双臂侧向展开＋肘部微屈';motion=`抬臂 ${Math.round(raised[0])}° / ${Math.round(raised[1])}°；${spread?'向两侧展开已确认':'尚未确认侧举方向，前举不计入'}`;
        if(!start&&!spread)hint='请向身体两侧抬臂，向前抬臂不计入侧平举';
      }
    }else if(this.type==='lying_triceps_extension'){
      if(tilt<60)return '请平躺平凳、双脚支撑；直立或坐姿伸肘不计入';
      if(this.baseline&&[11,12,23,24,27,28].some(i=>dist(p[i],this.baseline!.points[i])>this.baseline!.torso*.18))return '身体支撑或画面移动，请稳定后重新校准';
      const upper=[angle(a[13],a[11],a[23]),angle(a[14],a[12],a[24])];
      if(upper.some(v=>v<60||v>120)||[0,1].some(i=>p[13+i].y>=p[11+i].y-torso*.15))return '请保持双上臂在胸部上方；卧推式移动上臂不计入臂屈伸';
      const headward=[0,1].every(i=>{const v=vector(a[15+i],a[13+i]);return dot(v,norm(vector(a[11+i],a[23+i])))>Math.hypot(...v)*.3;});
      start=Math.min(...elbows)>=150;peak=Math.max(...elbows)<=95&&headward;
      measured=mean(elbows[0],elbows[1]);amplitude=cap((170-Math.max(...elbows))/90*100);symmetry=cap(100-Math.abs(elbows[0]-elbows[1])*1.5);posture=this.baseline?cap(100-Math.abs(tilt-this.baseline.tilt)*3):100;controlPenalty=Math.max(...upper.map(v=>Math.abs(v-90)));
      basis='平躺支撑＋上臂保持胸上方＋屈肘向头部下放';motion=`双肘 ${Math.round(elbows[0])}° / ${Math.round(elbows[1])}°；${headward?'向头部下放已确认':'尚未确认向头部下放方向'}`;
    }else if(this.type==='barbell_deadlift'){
      const hinge=angle(a[11+o],a[23+o],a[25+o]),knee=knees[o],shin=Math.max(.04,dist(p[25+o],p[27+o]));
      if(elbows[o]<150)return '请保持跟踪侧手臂伸直、手靠近小腿；弯举不计入硬拉';
      if(this.baseline&&dist(p[27+o],this.baseline.points[27+o])>this.baseline.torso*.16)return '脚位或画面移动，请重新保持起始姿势校准';
      start=hinge>=45&&hinge<=130&&knee>=75&&knee<=145&&p[15+o].y>=p[25+o].y+shin*.1&&p[15+o].y<=p[27+o].y+shin*.3;
      peak=hinge>=160&&knee>=160&&p[15+o].y>p[23+o].y;
      measured=hinge;amplitude=cap((Math.min(hinge,knee)-130)/45*100);posture=cap(100-Math.max(0,165-Math.min(hinge,knee))*2);symmetry=cap(100-Math.abs(knees[0]-knees[1])*1.5);
      basis='低位屈髋屈膝＋手臂伸直＋站直后返回起始位';motion=`髋角 ${Math.round(hinge)}°，膝角 ${Math.round(knee)}°；需在手接近小腿的低位校准`;
      if(!this.ready&&!start)hint='请回到屈髋屈膝、双臂伸直、手接近小腿的低位，保持两秒';
    }else if(this.type==='bench_press'||this.type==='incline_bench_press'){
      if(this.type==='bench_press'&&tilt<60)return '请平躺平凳并从斜侧面拍摄；坐姿推举不计入卧推';
      if(this.type==='incline_bench_press'&&(tilt<30||tilt>60))return '请调整为侧面或斜侧面，让肩背贴凳的斜躺姿态清楚可见；平躺与直立推举不计入';
      if([0,1].some(i=>p[15+i].y>p[11+i].y-torso*.08))return '请让手腕、肘和肩清晰可见，双手保持在胸部上方';
      if(this.baseline&&[11,12,23,24,27,28].some(i=>dist(p[i],this.baseline!.points[i])>this.baseline!.torso*.18))return '支撑或画面移动，请稳定身体后重新校准';
      start=Math.min(...elbows)>=155;peak=Math.min(...elbows)>=55&&Math.max(...elbows)<=110;
      measured=mean(elbows[0],elbows[1]);amplitude=cap((175-Math.max(...elbows))/90*100);symmetry=cap(100-Math.abs(elbows[0]-elbows[1])*1.5);posture=this.baseline?cap(100-Math.abs(tilt-this.baseline.tilt)*3):100;
      basis='平躺支撑＋双肘屈伸＋双手位于胸部上方';motion=`双肘 ${Math.round(elbows[0])}° / ${Math.round(elbows[1])}°；推起≥155°，下放≤110°`;
    }else if(this.type==='seated_triceps_extension'){
      const upper=[angle(a[13],a[11],a[23]),angle(a[14],a[12],a[24])],hips=[angle(a[11],a[23],a[25]),angle(a[12],a[24],a[26])];
      if(tilt>30||hips.some(v=>v<60||v>130)||knees.some(v=>v<55||v>140))return '请坐稳、双脚支撑并调整为斜侧面，让坐姿和双臂清楚可见';
      if(Math.min(...upper)<140)return '请保持双上臂在耳侧上方；胸前弯举不计入';
      start=Math.min(...elbows)>=150;peak=Math.max(...elbows)<=95;
      measured=mean(elbows[0],elbows[1]);amplitude=cap((170-Math.max(...elbows))/90*100);symmetry=cap(100-Math.abs(elbows[0]-elbows[1])*1.5);controlPenalty=Math.max(0,170-Math.min(...upper));
      basis='屈膝坐姿＋上臂保持头上＋双肘屈伸';motion=`双肘 ${Math.round(elbows[0])}° / ${Math.round(elbows[1])}°；伸肘≥150°，屈肘≤95°`;
    }else if(this.type==='reverse_fly'){
      if(!validWorld)return '暂时无法确认双臂展开方向，请正面斜侧拍摄并让双臂入镜';
      if(tilt<30||tilt>85)return '请屈髋俯身并保持稳定，直立侧平举不计入';
      const lateral=norm(vector(a[12],a[11])),raised=[angle(a[13],a[11],a[23]),angle(a[14],a[12],a[24])];
      const spread=[0,1].every(i=>{const v=vector(a[15+i],a[11+i]),n=Math.hypot(...v);return dot(v,lateral)*(i?1:-1)>n*.65;});
      start=[0,1].every(i=>p[15+i].y>p[11+i].y+torso*.3&&Math.abs(dot(norm(vector(a[15+i],a[11+i])),lateral))<.35)&&Math.min(...elbows)>=140;
      peak=Math.min(...raised)>=65&&Math.max(...raised)<=115&&Math.min(...elbows)>=140&&spread;
      measured=mean(raised[0],raised[1]);amplitude=cap(Math.min(...raised)/90*100);symmetry=cap(100-Math.abs(raised[0]-raised[1])*1.5);posture=this.baseline?cap(100-Math.abs(tilt-this.baseline.tilt)*3):100;controlPenalty=Math.max(0,165-Math.min(...elbows));
      basis='俯身姿态＋双臂向身体两侧打开＋肘部微屈';motion=`双臂展开 ${Math.round(raised[0])}° / ${Math.round(raised[1])}°；${spread?'侧向展开已确认':'尚未确认向两侧展开'}`;
      if(!start&&!spread)hint='请向身体两侧打开双臂；向前抬臂不计入反向飞鸟';
    }else if(this.type==='hammer_curl'){
      if(tilt>35)return '请直立站稳，保持双上臂在体侧';
      start=Math.min(...elbows)>=145;peak=Math.max(...elbows)<=80;measured=mean(elbows[0],elbows[1]);amplitude=cap((160-Math.max(...elbows))/95*100);symmetry=cap(100-Math.abs(elbows[0]-elbows[1])*1.5);perSide=[elbows[0],elbows[1]];basis='双肘屈伸；握法由本人按说明保持';motion=`双肘 ${Math.round(elbows[0])}° / ${Math.round(elbows[1])}°；弯举≤80°、放回≥145°`;
      controlPenalty=Math.max(0,Math.max(angle(a[13],a[11],a[23]),angle(a[14],a[12],a[24]))-15)*1.5;
      if(controlPenalty>25)hint='请让上臂靠近体侧，不要抬肩或摆动上臂借力';
    }else if(this.type==='front_raise'){
      if(!validWorld)return '暂时无法判断前举方向，请斜侧面拍摄，让头部和双臂清晰可见';
      const mid=(i:number,j:number):Point=>({...a[i],x:mean(a[i].x,a[j].x),y:mean(a[i].y,a[j].y),z:mean(a[i].z,a[j].z)});
      const shoulder=mid(11,12),pelvis=mid(23,24),lateral=norm(vector(a[12],a[11]));let forward=norm(cross(lateral,vector(shoulder,pelvis)));
      const face=dot(vector(a[0],shoulder),forward);
      if(Math.abs(face)<dist(shoulder,pelvis)*.06||dist(a[11],a[12])<.05)return '前举方向不清晰，请调整为斜侧面并让头部入镜';
      if(face<0)forward=forward.map(v=>-v);
      // Raised angle (2026-11-07 round 2): the shoulder→wrist direction projected
      // onto the body sagittal plane (torso-down axis × forward axis), NOT the 3D
      // elbow angle against the same-side hip. Replaying the production model over
      // the failed retest's footage showed the world-landmark ELBOW is the weak
      // link for a toward-camera raise: its forward extent recovers only ~50–65%
      // of the anatomical upper-arm length with a spurious downward pull, so the
      // elbow-based angle under-reads a shoulder-height raise by up to ~20° on
      // individual frames (worse side). The wrist vector spans both segments, so
      // the same absolute distortion is a far smaller angular error: on the same
      // straight-arm peak frames its sagittal angle read median 91° (p25 84°)
      // against the elbow channel's 88° (p25 80°) — and with exact synthetic
      // landmarks both definitions read exactly the true angle, so the gate band
      // below is unchanged. Form is still guarded by the elbow ≥140° peak rule:
      // the wrist line may only stand in for the upper arm while the arm is near
      // straight. A lateral raise now fails twice — its wrist vector has almost
      // no sagittal projection (angle ≈0–30°) AND it is not forward-dominant.
      const down=norm(vector(pelvis,shoulder));
      const raised=[0,1].map(i=>{const v=vector(a[15+i],a[11+i]);return Math.max(0,Math.min(180,Math.atan2(dot(v,forward),dot(v,down))*180/Math.PI));});
      // Direction is judged per arm and must be forward-DOMINANT: the wrist vector
      // clears the forward cone (dot > 0.6|v|) and its forward component beats its
      // lateral component, so a diagonal-forward raise passes while a true lateral
      // raise — lateral-dominant by construction — never does. The old both-arms
      // `every` test (plus a 0.55 lateral cap) made single-arm raises impossible:
      // a resting arm's downward wrist vector is never "forward". Counting is per
      // side in updateFrontRaise; the aggregate peak below is diagnostics only.
      raiseData=[0,1].map(i=>{const v=vector(a[15+i],a[11+i]),n=Math.hypot(...v),f=dot(v,forward);return {raised:raised[i],forward:f>n*.6&&f>Math.abs(dot(v,lateral)),elbow:elbows[i]};}) as [RaiseSide,RaiseSide];
      const direction=raiseData.every(s=>s.forward);
      start=Math.max(...raised)<=25;peak=Math.min(...raised)>=65&&Math.max(...raised)<=115&&direction&&Math.min(...elbows)>=140;
      measured=mean(raised[0],raised[1]);amplitude=cap(Math.min(...raised)/90*100);symmetry=cap(100-Math.abs(raised[0]-raised[1])*1.5);basis='逐侧矢状面抬举角（肩→腕）＋前向主导方向';motion=`抬臂 ${Math.round(raised[0])}° / ${Math.round(raised[1])}°；${direction?'双臂前举方向已确认':raiseData.some(s=>s.forward)?'单臂前举方向已确认':'尚未确认前举方向，侧举不计数'}`;
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
    const scorable=confidence>=.7&&[11,12,23,24,...(this.type==='romanian_deadlift'||this.type==='glute_bridge'||this.type==='barbell_deadlift'?[25,26,27,28]:[])].every(i=>(points[i].visibility??0)>=.7);
    return {start,peak,amplitude,angle:measured,confidence,scorable,posture,symmetry,controlPenalty,hint,side,basis,motion,points:p,torso,tilt,elbows:perSide,raiseSides:raiseData};
  }
  private emitHammerRep(parts:SideCompletion[],f:Measurement):boolean{
    if(this.metrics.reps>=this.metrics.targetReps)return false;
    const pair=parts.length===2;
    const depth=pair?Math.min(parts[0].peakAmp,parts[1].peakAmp):parts[0].peakAmp;
    const posture=pair?Math.min(parts[0].peakPosture,parts[1].peakPosture):parts[0].peakPosture;
    const control=Math.max(...parts.map(p=>p.control)),shift=Math.max(...parts.map(p=>p.shift)),speed=Math.max(...parts.map(p=>p.speed)),duration=Math.max(...parts.map(p=>p.duration));
    const symmetry=pair?cap(100-Math.abs(parts[0].peakElbow-parts[1].peakElbow)*1.5):cap(100-Math.max(0,140-parts[0].peakOther)*1.2);
    const breakdown={depth,stability:cap(100-Math.max(0,speed-260)*.08-Math.max(0,.6-duration)*70-control),trunk:cap(posture-shift*1.5),symmetry};
    const score=Math.round(breakdown.depth*.35+breakdown.stability*.25+breakdown.trunk*.2+breakdown.symmetry*.2),scored=parts.every(p=>p.scoring)&&f.scorable,issues:PoseIssue[]=[];
    if(breakdown.depth<70)issues.push('insufficient_range');if(breakdown.stability<70)issues.push('unstable_movement');if(breakdown.trunk<70)issues.push('body_alignment');if(breakdown.symmetry<70)issues.push('poor_coordination');
    const acc={...this.metrics.scoreAccumulator},counts={...this.metrics.correctionCounts};
    if(scored){acc.count++;acc.total+=score;axes.forEach(k=>acc[k]+=breakdown[k]);issues.forEach(k=>counts[k]++);}
    this.metrics={...this.metrics,reps:this.metrics.reps+1,lastRepScore:scored?score:null,scoreAccumulator:acc,perfectReps:this.metrics.perfectReps+(scored&&score>=90?1:0),formScore:acc.count?Math.round(acc.total/acc.count):0,correctionCounts:counts,lastRepIssues:scored?issues:[],feedback:scored?`已记录第 ${this.metrics.reps+1} 次 · 本次 ${score} 分`:`已记录第 ${this.metrics.reps+1} 次 · 本次无法评分`};
    this.updateAverage();
    return true;
  }
  /** Hammer curls count per side: an alternating curl scores one rep per arm, while two sides whose peaks overlap merge into a single synchronized rep. */
  private updateHammerCurl(f:Measurement,now:number):ExerciseMetrics{
    const elbows=f.elbows!;
    let completed=false;
    if(this.hammerPending&&now-this.hammerPending.at>600){const pending=this.hammerPending;this.hammerPending=null;if(this.emitHammerRep([pending],f))completed=true;}
    for(const s of [0,1] as const){
      const cyc=this.hammerSides[s],e=elbows[s],other=elbows[1-s];
      // Peak confirmation by sub-frame crossing (depth ≥ 0 ⇔ elbow ≤80°): the episode
      // refines the true peak between samples, so a fast rep whose sampled frames
      // merely clip the zone still confirms — with its interpolated depth scored.
      const ev=feedPeakTrack(cyc.track,now,80-e);
      if(ev.best){cyc.peakPosture=f.posture;cyc.peakOther=other;}
      if(ev.closed?.valid){cyc.peakStart=ev.closed.start;cyc.peakEnd=ev.closed.end;cyc.peakElbow=80-ev.closed.depth;cyc.peakAmp=cap((160-cyc.peakElbow)/95*100);}
      // Return confirmation: accumulate the interpolated in-zone dwell (≥145°) inside
      // a 500 ms window, so elbow jitter cannot stall the rep and coarse sampling
      // cannot shrink a genuine dwell below the hold (see zonePortion).
      const portion=cyc.prevAt===null?{start:now,ms:0}:zonePortion(cyc.prevAngle,e,145,true,cyc.prevAt,now);
      let replaced=false;
      if(cyc.peakStart!==null&&portion.ms>0){
        if(cyc.returnSince===null||portion.start-cyc.returnSince>RETURN_WINDOW_MS){cyc.returnSince=portion.start;cyc.returnAccum=0;}
        cyc.returnAccum+=Math.min(RETURN_FRAME_CAP_MS,portion.ms);
        if(cyc.returnAccum>=RETURN_HOLD_MS){
          const done:SideCompletion={side:s,at:now,peakStart:cyc.peakStart,peakEnd:cyc.peakEnd,peakAmp:cyc.peakAmp,peakPosture:cyc.peakPosture,peakOther:cyc.peakOther,peakElbow:cyc.peakElbow,duration:(now-(cyc.movingAt??now))/1000,scoring:cyc.scoring,control:cyc.controlMax,shift:cyc.shiftMax,speed:cyc.speedMax};
          this.hammerSides[s]=freshSideCycle();replaced=true;
          if(this.hammerPending){
            const pending=this.hammerPending;
            const overlap=done.peakStart<=pending.peakEnd+150&&pending.peakStart<=done.peakEnd+150;
            if(pending.side!==s&&overlap){this.hammerPending=null;if(this.emitHammerRep([pending,done],f))completed=true;}
            else{this.hammerPending=null;if(this.emitHammerRep([pending],f))completed=true;this.hammerPending=done;}
          }else this.hammerPending=done;
        }
      }
      if(!replaced){
        if(e>=145){if(cyc.peakStart===null&&cyc.movingAt!==null){this.hammerSides[s]=freshSideCycle();replaced=true;}}
        else{
          if(cyc.movingAt===null)cyc.movingAt=now;
          cyc.scoring=cyc.scoring&&f.scorable;
          cyc.controlMax=Math.max(cyc.controlMax,f.controlPenalty);
          cyc.shiftMax=Math.max(cyc.shiftMax,Math.abs(f.tilt-this.baseline!.tilt));
          if(cyc.sampleAt===null){cyc.sampleAt=now;cyc.sampleAngle=e;}
          else if(now-cyc.sampleAt>=100){cyc.speedMax=Math.max(cyc.speedMax,Math.abs(e-cyc.sampleAngle)*1000/(now-cyc.sampleAt));cyc.sampleAt=now;cyc.sampleAngle=e;}
        }
      }
      const cur=this.hammerSides[s];
      cur.prevAt=now;cur.prevAngle=e;
      if(replaced){cur.track.prevAt=now;cur.track.prevDepth=80-e;}
    }
    const anyPeak=this.hammerSides.some(c=>c.peakStart!==null||c.track.open)||this.hammerPending!==null;
    const stage=this.metrics.reps>=this.metrics.targetReps?'complete':anyPeak?(f.start?'returning':'peak'):f.start?'ready':'moving';
    const copy=definitions[this.type].stages;
    const nearPeak=stage==='moving'&&elbows.every(e=>e>80)&&elbows.some(e=>e<=105);
    // The raw per-frame hint (controlPenalty>25 in measure) is gated through the sustained-
    // deviation hysteresis before it may surface; scoring still uses the raw penalty.
    const hint=f.hint&&this.upperArmHintVisible(f.controlPenalty>25,now)?f.hint:undefined;
    const message=stage==='complete'?'已完成本组目标':completed?this.metrics.feedback:nearPeak?'幅度接近了，再举高一点，举到接近肩膀再放回':(hint||copy[stage==='ready'?0:stage==='moving'?1:stage==='peak'?2:3]+(stage==='moving'?' · 幅度尚未确认':''));
    const issue:PoseIssue|null=f.controlPenalty>30?'unstable_movement':f.posture<70?'body_alignment':null;
    this.diagnostics={...this.diagnostics,stage};
    this.metrics={...this.metrics,phase:f.start?'standing':anyPeak?'ascending':'descending',feedback:completed?this.metrics.feedback:message,poseFeedback:{status:!f.scorable?'uncertain':issue?'adjust':'stable',confidence:f.confidence,issues:issue?[issue]:[],primaryIssue:issue,affectedJoints:issue?POSE_ISSUE_COPY[issue].joints:[],calibrated:true,message:hint||(issue?POSE_ISSUE_COPY[issue].action:message)}};
    return this.metrics;
  }
  private emitFrontRaiseRep(parts:SideCompletion[],f:Measurement):boolean{
    if(this.metrics.reps>=this.metrics.targetReps)return false;
    const pair=parts.length===2;
    const depth=pair?Math.min(parts[0].peakAmp,parts[1].peakAmp):parts[0].peakAmp;
    const posture=pair?Math.min(parts[0].peakPosture,parts[1].peakPosture):parts[0].peakPosture;
    const control=Math.max(...parts.map(p=>p.control)),shift=Math.max(...parts.map(p=>p.shift)),speed=Math.max(...parts.map(p=>p.speed)),duration=Math.max(...parts.map(p=>p.duration));
    // For front raise, peakElbow stores the side's raised angle at its best amplitude
    // and peakOther the other side's raised angle at that moment: a pair is symmetric
    // when both sides peaked at the same height, a single when the other arm stayed down.
    const symmetry=pair?cap(100-Math.abs(parts[0].peakElbow-parts[1].peakElbow)*1.5):cap(100-Math.max(0,parts[0].peakOther-25)*1.2);
    const breakdown={depth,stability:cap(100-Math.max(0,speed-260)*.08-Math.max(0,.6-duration)*70-control),trunk:cap(posture-shift*1.5),symmetry};
    const score=Math.round(breakdown.depth*.35+breakdown.stability*.25+breakdown.trunk*.2+breakdown.symmetry*.2),scored=parts.every(p=>p.scoring)&&f.scorable,issues:PoseIssue[]=[];
    if(breakdown.depth<70)issues.push('insufficient_range');if(breakdown.stability<70)issues.push('unstable_movement');if(breakdown.trunk<70)issues.push('body_alignment');if(breakdown.symmetry<70)issues.push('poor_coordination');
    const acc={...this.metrics.scoreAccumulator},counts={...this.metrics.correctionCounts};
    if(scored){acc.count++;acc.total+=score;axes.forEach(k=>acc[k]+=breakdown[k]);issues.forEach(k=>counts[k]++);}
    this.metrics={...this.metrics,reps:this.metrics.reps+1,lastRepScore:scored?score:null,scoreAccumulator:acc,perfectReps:this.metrics.perfectReps+(scored&&score>=90?1:0),formScore:acc.count?Math.round(acc.total/acc.count):0,correctionCounts:counts,lastRepIssues:scored?issues:[],feedback:scored?`已记录第 ${this.metrics.reps+1} 次 · 本次 ${score} 分`:`已记录第 ${this.metrics.reps+1} 次 · 本次无法评分`};
    this.updateAverage();
    return true;
  }
  /** Front raises count per side, mirroring hammer curls: each arm independently runs
   * start (raised ≤25°) → peak (raised 65–115°, elbow ≥140°, that arm forward-dominant)
   * → return to start. Overlapping peaks merge into one synchronized rep; non-overlapping
   * count one per arm, so single-arm and alternating raises count — while a single-arm
   * LATERAL raise never satisfies the forward-dominance test and stays rejected. */
  private updateFrontRaise(f:Measurement,now:number):ExerciseMetrics{
    const sides=f.raiseSides!;
    let completed=false;
    if(this.raisePending&&now-this.raisePending.at>600){const pending=this.raisePending;this.raisePending=null;if(this.emitFrontRaiseRep([pending],f))completed=true;}
    for(const s of [0,1] as const){
      const cyc=this.raiseSides[s],side=sides[s],other=sides[1-s],v=side.raised;
      // Crossing confirmation like hammer curl's (depth ≥ 0 ⇔ raised ≥65°). The band
      // conditions (elbow ≥140°, forward-dominant) and the 115° band cap are judged at
      // the interpolated extremum instead of across a 120 ms sampled hold, which a
      // fast raise — or one flickering condition frame — could never satisfy.
      const ev=feedPeakTrack(cyc.track,now,v-65);
      if(ev.best){cyc.peakPosture=f.posture;cyc.peakOther=other.raised;cyc.peakOk=side.elbow>=140&&side.forward;}
      if(ev.closed?.valid&&cyc.peakOk&&65+ev.closed.depth<=115){cyc.peakStart=ev.closed.start;cyc.peakEnd=ev.closed.end;cyc.peakElbow=65+ev.closed.depth;cyc.peakAmp=cap(cyc.peakElbow/90*100);}
      // Return confirmation accumulates the interpolated in-zone dwell (raised ≤25°)
      // inside a 500 ms window, like hammer curl's (see zonePortion).
      const portion=cyc.prevAt===null?{start:now,ms:0}:zonePortion(cyc.prevAngle,v,25,false,cyc.prevAt,now);
      let replaced=false;
      if(cyc.peakStart!==null&&portion.ms>0){
        if(cyc.returnSince===null||portion.start-cyc.returnSince>RETURN_WINDOW_MS){cyc.returnSince=portion.start;cyc.returnAccum=0;}
        cyc.returnAccum+=Math.min(RETURN_FRAME_CAP_MS,portion.ms);
        if(cyc.returnAccum>=RETURN_HOLD_MS){
          const done:SideCompletion={side:s,at:now,peakStart:cyc.peakStart,peakEnd:cyc.peakEnd,peakAmp:cyc.peakAmp,peakPosture:cyc.peakPosture,peakOther:cyc.peakOther,peakElbow:cyc.peakElbow,duration:(now-(cyc.movingAt??now))/1000,scoring:cyc.scoring,control:cyc.controlMax,shift:cyc.shiftMax,speed:cyc.speedMax};
          this.raiseSides[s]=freshSideCycle();replaced=true;
          if(this.raisePending){
            const pending=this.raisePending;
            const overlap=done.peakStart<=pending.peakEnd+150&&pending.peakStart<=done.peakEnd+150;
            if(pending.side!==s&&overlap){this.raisePending=null;if(this.emitFrontRaiseRep([pending,done],f))completed=true;}
            else{this.raisePending=null;if(this.emitFrontRaiseRep([pending],f))completed=true;this.raisePending=done;}
          }else this.raisePending=done;
        }
      }
      if(!replaced){
        if(v<=25){if(cyc.peakStart===null&&cyc.movingAt!==null){this.raiseSides[s]=freshSideCycle();replaced=true;}}
        else{
          if(cyc.movingAt===null)cyc.movingAt=now;
          cyc.scoring=cyc.scoring&&f.scorable;
          cyc.controlMax=Math.max(cyc.controlMax,Math.max(0,170-side.elbow)*1.5);
          cyc.shiftMax=Math.max(cyc.shiftMax,Math.abs(f.tilt-this.baseline!.tilt));
          if(cyc.sampleAt===null){cyc.sampleAt=now;cyc.sampleAngle=v;}
          else if(now-cyc.sampleAt>=100){cyc.speedMax=Math.max(cyc.speedMax,Math.abs(v-cyc.sampleAngle)*1000/(now-cyc.sampleAt));cyc.sampleAt=now;cyc.sampleAngle=v;}
        }
      }
      const cur=this.raiseSides[s];
      cur.prevAt=now;cur.prevAngle=v;
      if(replaced){cur.track.prevAt=now;cur.track.prevDepth=v-65;}
    }
    const anyPeak=this.raiseSides.some(c=>c.peakStart!==null||c.track.open)||this.raisePending!==null;
    const stage=this.metrics.reps>=this.metrics.targetReps?'complete':anyPeak?(f.start?'returning':'peak'):f.start?'ready':'moving';
    const copy=definitions[this.type].stages;
    const nearPeak=stage==='moving'&&sides.every(s=>s.raised<65)&&sides.some(s=>s.raised>=45);
    const message=stage==='complete'?'已完成本组目标':completed?this.metrics.feedback:nearPeak?'幅度接近了，再举高一点，举到接近肩膀再放回':(f.hint||copy[stage==='ready'?0:stage==='moving'?1:stage==='peak'?2:3]+(stage==='moving'?' · 幅度尚未确认':''));
    const issue:PoseIssue|null=f.posture<70?'body_alignment':null;
    this.diagnostics={...this.diagnostics,stage};
    this.metrics={...this.metrics,phase:f.start?'standing':anyPeak?'ascending':'descending',feedback:completed?this.metrics.feedback:message,poseFeedback:{status:!f.scorable?'uncertain':issue?'adjust':'stable',confidence:f.confidence,issues:issue?[issue]:[],primaryIssue:issue,affectedJoints:issue?POSE_ISSUE_COPY[issue].joints:[],calibrated:true,message:f.hint||(issue?POSE_ISSUE_COPY[issue].action:message)}};
    return this.metrics;
  }
  update(raw:Point[]|null,now:number,aspect=1,world:Point[]|null=null):ExerciseMetrics{
    if(!raw||raw.length!==33||!Number.isFinite(now)||!Number.isFinite(aspect)||aspect<=0||raw.some(p=>!p||![p.x,p.y,p.visibility??0].every(Number.isFinite)))return this.interrupt('未检测到完整人体关键点，请调整入镜范围');
    if(this.last!==null&&now<=this.last)return this.metrics;
    if(this.last!==null&&now-this.last>750){if(this.freezeBridged)this.freezeBridged=false;else this.interrupt('画面中断，半程动作已丢弃');}
    const required=this.needed(raw);
    if(required.some(i=>(raw[i].visibility??0)<.25||raw[i].x<0||raw[i].x>1||raw[i].y<0||raw[i].y>1))return this.interrupt('必要关节离开画面或被遮挡，半程动作已丢弃');
    this.frames=[...this.frames,raw].slice(-(this.prefiltered?1:5));const smooth=medianLandmarks(this.frames)!;
    // Front raise reads every angle from world landmarks (validity gated separately in
    // measure), while kneeling systematically tanks image-space hip visibility — so for
    // front raise the hips leave the smoothed-visibility reset set. The raw gate above
    // still catches a total loss, and the nose stays gated: it signs the forward axis.
    const smoothGate=this.type==='front_raise'?required.filter(i=>i!==23&&i!==24):required;
    if(smoothGate.some(i=>(smooth[i].visibility??0)<.55))return this.interrupt('必要关节持续不清晰，请调整角度');
    this.worlds=world?.length===33&&world.every(p=>p&&[p.x,p.y,p.z].every(Number.isFinite))?[...this.worlds,world].slice(-(this.prefiltered?1:5)):[];
    const f=this.measure(smooth,aspect,this.worlds.length?medianLandmarks(this.worlds):null,required);
    if(typeof f==='string')return this.interrupt(f);
    this.last=now;this.times=[...this.times,now].filter(t=>now-t<=2000);
    this.diagnostics={...this.diagnostics,fps:this.times.length>1?Math.round((this.times.length-1)*1000/(now-this.times[0])):0,confidence:f.confidence,side:f.side||null,angle:f.angle,basis:f.basis,motion:f.motion};
    if(!this.ready){
      // Latched calibration: a non-start frame PAUSES the 2 s hold and banks the time
      // already held instead of zeroing it (the 2026-11-07 front-raise retest showed
      // progress falling 42%→26%→13% as the user raised their arms to test). Once the
      // banked + current hold reaches 2 s the tracker is ready and stays ready until
      // a real tracking loss interrupts it.
      if(!f.start){if(this.calibration!==null){this.calibrationBank+=now-this.calibration;this.calibration=null;}this.baseline=null;}else{if(this.calibration===null)this.calibration=now;this.baseline=f;if(this.armOnStart||this.calibrationBank+(now-this.calibration)>=2000)this.ready=true;}
      const progress=this.ready?1:Math.min(1,(this.calibrationBank+(this.calibration===null?0:now-this.calibration))/2000);this.diagnostics={...this.diagnostics,stage:this.ready?'ready':'calibrating',calibrationProgress:progress};
      // Front raise must not surface its direction hint before calibration completes:
      // at rest the direction test is always false, so the hint kept ordering the user
      // to raise an arm — and raising it zeroed the calibration they were holding.
      const calibHint=this.type==='front_raise'?undefined:f.hint;
      const message=this.ready?'已识别起始姿势，可以开始完整动作':f.start?`保持起始姿势，校准 ${Math.round(progress*100)}%`:calibHint||(this.armOnStart?'请回到本动作起始姿势':'请回到本动作起始姿势，保持两秒');
      this.metrics={...this.metrics,feedback:message,poseFeedback:{...this.metrics.poseFeedback,status:'uncertain',calibrated:this.ready,confidence:f.confidence,message}};return this.metrics;
    }
    if(this.type==='hammer_curl')return this.updateHammerCurl(f,now);
    if(this.type==='front_raise')return this.updateFrontRaise(f,now);
    if(!f.start){
      if(this.movingAt===null){this.movingAt=now;if(this.type==='standing_leg_curl')this.cycleSide=f.side||null;}
      this.scoring=this.scoring&&f.scorable;this.shift=Math.max(this.shift,Math.abs(f.tilt-this.baseline!.tilt));
      this.controlPenalty=Math.max(this.controlPenalty,f.controlPenalty);
      if(this.controlAt===null){this.controlAt=now;this.controlAngle=f.angle;}else if(now-this.controlAt>=100){this.speed=Math.max(this.speed,Math.abs(f.angle-this.controlAngle)*1000/(now-this.controlAt));this.controlAt=now;this.controlAngle=f.angle;}
    }
    // Returning to the start pose with no peak latched ends the excursion, so a later
    // brief peak is measured against its own excursion, not an earlier half rep.
    if(f.start&&!this.peak)this.movingAt=null;
    // Peak latching (2026-11-07 fast-tempo fix): the first frame inside the peak zone
    // latches the peak and the best-amplitude frame is retained while the zone lasts.
    // The old 120 ms sampled dwell made fast reps uncountable (see feedPeakTrack note);
    // fabrication is still impossible because completion additionally requires the
    // MIN_EXCURSION_MS excursion and the accumulated return below.
    if(f.peak){if(this.peakAt===null)this.peakAt=now;if(!this.peak||f.amplitude>this.peak.amplitude)this.peak=f;}else this.peakAt=null;
    let completed=false;
    if(this.peak&&f.start){
      if(this.returnAt===null)this.returnAt=now;
      // Return confirmation accumulates like the per-side cycles (150 ms inside a
      // 500 ms window) instead of one unbroken 150 ms hold.
      if(this.retSince===null||now-this.retSince>RETURN_WINDOW_MS){this.retSince=now;this.retAccum=this.retPrevAt!==null?Math.min(RETURN_FRAME_CAP_MS,now-this.retPrevAt)/2:0;}
      else if(this.retPrevAt!==null)this.retAccum+=Math.min(RETURN_FRAME_CAP_MS,now-this.retPrevAt);
      this.retPrevAt=now;
      if(this.retAccum>=RETURN_HOLD_MS){
        if(this.returnAt-(this.movingAt??this.returnAt)<MIN_EXCURSION_MS){this.resetCycle();}
        else if(this.metrics.reps<this.metrics.targetReps){
          const acc={...this.metrics.scoreAccumulator},duration=(now-(this.movingAt??now))/1000;
          if(this.type==='standing_leg_curl'){const key=this.peak.side==='left'?'leftReps':'rightReps';acc[key]=(acc[key]||0)+1;}
          const breakdown={depth:this.peak.amplitude,stability:cap(100-Math.max(0,this.speed-260)*.08-Math.max(0,.6-duration)*70-this.controlPenalty),trunk:cap(this.peak.posture-(this.type==='romanian_deadlift'||this.type==='glute_bridge'||this.type==='barbell_deadlift'?0:this.shift*1.5)),symmetry:this.peak.symmetry};
          const score=Math.round(breakdown.depth*.35+breakdown.stability*.25+breakdown.trunk*.2+breakdown.symmetry*.2),scored=this.scoring&&f.scorable,issues:PoseIssue[]=[];
          if(breakdown.depth<70)issues.push('insufficient_range');if(breakdown.stability<70)issues.push('unstable_movement');if(breakdown.trunk<70)issues.push('body_alignment');if(breakdown.symmetry<70)issues.push('poor_coordination');
          const counts={...this.metrics.correctionCounts};if(scored){acc.count++;acc.total+=score;axes.forEach(k=>acc[k]+=breakdown[k]);issues.forEach(k=>counts[k]++);}
          this.metrics={...this.metrics,reps:this.metrics.reps+1,lastRepScore:scored?score:null,scoreAccumulator:acc,perfectReps:this.metrics.perfectReps+(scored&&score>=90?1:0),formScore:acc.count?Math.round(acc.total/acc.count):0,correctionCounts:counts,lastRepIssues:scored?issues:[],feedback:scored?`已记录第 ${this.metrics.reps+1} 次 · 本次 ${score} 分`:`已记录第 ${this.metrics.reps+1} 次 · 本次无法评分`};this.updateAverage();completed=true;
        }this.resetCycle();
      }
    }else{this.returnAt=null;if(this.peak)this.retPrevAt=now;}
    const stage=this.metrics.reps>=this.metrics.targetReps?'complete':this.peak?(f.start?'returning':'peak'):f.start?'ready':'moving';
    const copy=definitions[this.type].stages,message=stage==='complete'?'已完成本组目标':f.hint||copy[stage==='ready'?0:stage==='moving'?1:stage==='peak'?2:3]+(stage==='moving'?' · 幅度尚未确认':'');
    const issue:PoseIssue|null=f.controlPenalty>30?'unstable_movement':f.posture<70?'body_alignment':f.symmetry<70?'poor_coordination':null;
    this.diagnostics={...this.diagnostics,stage};this.metrics={...this.metrics,phase:f.start?'standing':this.peak?'ascending':'descending',feedback:completed?this.metrics.feedback:message,poseFeedback:{status:!f.scorable?'uncertain':issue?'adjust':'stable',confidence:f.confidence,issues:issue?[issue]:[],primaryIssue:issue,affectedJoints:issue?POSE_ISSUE_COPY[issue].joints:[],calibrated:true,message:f.hint|| (issue?POSE_ISSUE_COPY[issue].action:message)}};this.previous=f;return this.metrics;
  }
}
