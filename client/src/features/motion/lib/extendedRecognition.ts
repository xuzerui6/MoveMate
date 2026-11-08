import type {NormalizedLandmark as Point} from '@mediapipe/tasks-vision';
import type {ExerciseMetrics,RecognitionDiagnostics} from './exerciseMetrics';
import {medianLandmarks,poseIssueCopy} from './poseFeedback';
import { COPY_CALIBRATED, COPY_HALF_REP, COPY_OUT_OF_FRAME, notSeenCopyFor } from './companionCopy';
import {emptyCorrectionCounts,emptyFormBreakdown,medianOf} from './sessionMigration';
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
type Measurement={start:boolean;peak:boolean;amplitude:number;angle:number;confidence:number;scorable:boolean;posture:number;symmetry:number;controlPenalty:number;hint?:string;side?:Side;basis:string;motion:string;points:Point[];torso:number;tilt:number;elbows?:[number,number];raiseSides?:[RaiseSide,RaiseSide];framing?:'ok'|'weak'};
/** Per-arm front-raise channel: shoulder-flexion angle, whether that arm's wrist
 * direction is forward-dominant, whether it is lateral-dominant (the lateral
 * component at least the forward one — the mirror image of the forward test),
 * and that arm's elbow angle. */
type RaiseSide={raised:number;forward:boolean;latDom:boolean;elbow:number};
/** One measured frame's front-raise evidence for one arm (round 4): the form
 * channels the peak-evidence rule judges, sampled while the arm is engaged. */
type RaiseSample={t:number;raised:number;elbow:number;fwd:boolean;lat:boolean};
/** A run of consecutive same-verdict direction samples (direction latch). */
type SustainRun={start:number;last:number;n:number}|null;
type SideCycle={movingAt:number|null;peakStart:number|null;peakEnd:number;peakElbow:number;peakAmp:number;peakPosture:number;peakOther:number;track:PeakTrack;prevAt:number|null;prevAngle:number;returnSince:number|null;returnAccum:number;scoring:boolean;controlMax:number;shiftMax:number;speedMax:number;sampleAt:number|null;sampleAngle:number;controlSamples:TimedValue[];speedSpans:TimedSpan[];samples:RaiseSample[];overshoot:boolean;dirLatched:boolean;dirMixed:boolean;dirTurned:boolean;fwdRun:SustainRun;latRun:SustainRun};
type SideCompletion={side:number;at:number;peakStart:number;peakEnd:number;peakAmp:number;peakPosture:number;peakOther:number;peakElbow:number;duration:number;scoring:boolean;control:number;shift:number;speed:number};
/** One side's confirmed peak: midpoint time + peak value in the movement's peak units (see lastPeak). */
type PeakMark={at:number;value:number};
const freshSideCycle=():SideCycle=>({movingAt:null,peakStart:null,peakEnd:0,peakElbow:180,peakAmp:0,peakPosture:100,peakOther:180,track:freshPeakTrack(),prevAt:null,prevAngle:180,returnSince:null,returnAccum:0,scoring:true,controlMax:0,shiftMax:0,speedMax:0,sampleAt:null,sampleAngle:180,controlSamples:[],speedSpans:[],samples:[],overshoot:false,dirLatched:false,dirMixed:false,dirTurned:false,fwdRun:null,latRun:null});
/** Timestamped stability evidence: a point sample of the control penalty (held
 * until the next sample) or one angular-velocity window with its true span. */
type TimedValue={t:number;v:number};
export type TimedSpan={start:number;end:number;v:number};
/** A stability deviation only counts against a rep when it was SUSTAINED for at
 * least this long (round 3, 2026-11-08): the old cycle maxima let one jitter frame
 * — a 100 ms velocity window or a single control-penalty spike — set the whole
 * rep's penalty, and the longer (slower) a cycle ran, the higher its maxima
 * climbed. Thresholds are unchanged; only the aggregation moved from "worst
 * instant" to "worst sustained level", mirroring the live hint path, which has
 * always required a sustained deviation (UPPER_ARM_SUSTAIN_MS) before speaking. */
const SUSTAIN_MS=150;
/** Calibration staleness guard: the bank preserved across gate interrupts expires
 * when no start-pose frame has been seen for this long while still calibrating. */
const CALIBRATION_STALE_MS=10000;
/** Two peaks this close in time are one bilateral effort for symmetry purposes,
 * even when their peak windows did not overlap enough to merge into a paired rep
 * (the merge test tolerates only ≈ dwell + 150 ms of offset). */
const PEAK_PAIR_WINDOW_MS=800;
/** The highest value whose samples ≥ v cover one continuous span of ≥ SUSTAIN_MS.
 * A single 100 ms speed window cannot prove sustainment on its own; two
 * consecutive windows (span-union ≥ 150 ms) can. Control point samples are first
 * expanded to spans by controlSpans(). With too little evidence (< 3 samples) or
 * no value reaching the span, the raw maximum is returned, so short cycles score
 * exactly as before. */
export function sustainedPeak(spans:TimedSpan[],fallback:number):number{
  if(spans.length<3)return fallback;
  const values=[...new Set(spans.map(s=>s.v))].sort((a,b)=>b-a);
  for(const v of values){
    let runStart:number|null=null,runEnd=0,cover=0;
    for(const s of spans){
      if(s.v>=v){
        if(runStart===null||s.start>runEnd+1){runStart=s.start;runEnd=s.end;}
        else runEnd=Math.max(runEnd,s.end);
        cover=Math.max(cover,runEnd-runStart);
      }else runStart=null;
    }
    if(cover>=SUSTAIN_MS)return v;
  }
  return fallback;
}
/** Expands per-frame control samples into zero-order-hold spans. The final
 * sample's hold is capped at its predecessor's interval (≤ SUSTAIN_MS): the peak
 * and return phases that follow it are not evidence about the moving phase. */
function controlSpans(samples:TimedValue[],end:number):TimedSpan[]{
  const spans:TimedSpan[]=[];
  for(let i=0;i<samples.length;i++){
    const t=samples[i].t;
    const next=i+1<samples.length?samples[i+1].t:Math.min(end,t+Math.min(i>0?t-samples[i-1].t:100,SUSTAIN_MS));
    spans.push({start:t,end:Math.max(t,next),v:samples[i].v});
  }
  return spans;
}
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
/** Front-raise peak evidence (round 4, 2026-11-08 — Muse×Codex converged plan,
 * calibrated on the replay of Edward's 2026-11-08 retest recording). Rounds ≤3
 * judged the whole peak by the single deepest sample (peakOk): the two in-band
 * raises in that recording died exactly there — deepest frames read elbow
 * 137°/138° while adjacent frames read 144–156° fully qualified. The elbow
 * channel reads systematically low (≈ −20° under a loose sleeve; only 36% of
 * raised ≥65° frames reach 140°), so qualification now comes from a peak-bound
 * evidence segment instead of one frame — with the 140° standard itself unmoved:
 *  (a) same-frame JOINT evidence — elbow ≥140° AND forward-dominant in one sample;
 *  (b) bound to the peak — samples must lie within PEAK_EVIDENCE_BAND_DEG of the
 *      sampled maximum and PEAK_EVIDENCE_WINDOW_MS of its moment, connected to
 *      it by a chain of sample gaps no larger than the stream's cadence allows
 *      (see evaluatePeakEvidence; no importing evidence across a hole);
 *  (c) sustained — ≥2 joint-qualified samples spanning ≥ EVIDENCE_MIN_SPAN_MS;
 *      no single frame, however good, extends or substitutes;
 *  (d) revocable — the sampled-max sample itself carrying clear counter-evidence
 *      (elbow < EVIDENCE_CLEAR_BENT_DEG or lateral-dominant) disqualifies the
 *      peak outright, and a sustained run of clear counter-evidence inside the
 *      neighbourhood revokes it. A lone non-max counter sample is bridged as
 *      jitter only; wherever a short burst is indistinguishable from a glitch
 *      and would decide alone, the rule stays conservative.
 * Window calibration: at the replay's 10 fps sampling a ±100 ms window holds at
 * most one sample on each side of the max, while the two proven in-band raises
 * carry their qualified support +200/+300 ms after the max (a held plateau at
 * 105–107°, inside the 10° band) — a ±100 ms window would encode the sampling
 * rate rather than the movement. ±300 ms (≈ ±7 frames at the device's 21–24 fps)
 * bounds the plateau; the angle band, the gap chain and the counter-evidence
 * rules do the discriminating — every negative in the replay (3 overshoots, the
 * goalpost raise, the lateral raise) is still rejected by them, not the window.
 * EVIDENCE_CLEAR_BENT_DEG sits 10° under the standard: the observed jitter dips
 * (137°/138°) must not read as counter-evidence, while a genuinely bent peak
 * (≈115° in the fixtures, 88–120° sustained in the replay's goalpost raise)
 * clears it by a wide margin. */
const PEAK_EVIDENCE_WINDOW_MS=300,PEAK_EVIDENCE_BAND_DEG=10,EVIDENCE_MIN_SPAN_MS=50,EVIDENCE_CLEAR_BENT_DEG=130;
/** Cycle preservation on soft interrupts (round 4, front raise only): a short
 * detection/visibility hole keeps the open cycle and its accumulated evidence;
 * the bound is the hammer-curl freeze-grace precedent (2000 ms). The replay's
 * killing hole measured ≈0.8 s; a longer interruption voids the cycle exactly
 * as before. Preservation never fabricates: feedPeakTrack's gap rule disables
 * the parabola across holes, evidence runs break on gaps > PEAK_GAP_MS, and
 * return credit stays capped per interval. The hammer-curl peer-peak memory
 * (below) reuses the same bound and the same hole clock: 2000 ms is also the
 * adaptive wrapper's hammer evidence-freeze grace (HAMMER_FREEZE_GRACE_MS), so
 * both layers agree on how long a hole may last before state is void. */
const CYCLE_PRESERVE_MS=2000;
export type PeakEvidenceVerdict='qualified'|'revoked'|'insufficient';
/** Judges one closed front-raise peak episode from its sampled evidence.
 * `best`/`bestAt` are the episode's sampled maximum raised angle and its time. */
export function evaluatePeakEvidence(samples:RaiseSample[],bestAt:number,best:number):PeakEvidenceVerdict{
  const idx=samples.findIndex(s=>s.t===bestAt);
  if(idx<0)return 'insufficient';
  const band=best-PEAK_EVIDENCE_BAND_DEG;
  // The chain break keeps evidence from being imported across a detection
  // hole; a hole is a gap large relative to the stream's own cadence, not an
  // absolute 150 ms — at a steady 5 fps every gap is 200 ms and the raw cap
  // would make qualification unsatisfiable (the same sampling-rate trap as
  // the time window). Cadence = median gap among the samples near the peak;
  // the replay's 800 ms hole still breaks the chain at its 100 ms cadence
  // (limit 200 ms), and device-rate streams keep the plain 150 ms cap.
  const gaps:number[]=[];
  for(let i=1;i<samples.length;i++){const g=samples[i].t-samples[i-1].t;if(g>0&&Math.abs(samples[i].t-bestAt)<=1000)gaps.push(g);}
  gaps.sort((a,b)=>a-b);
  const cadence=gaps.length?gaps[Math.floor(gaps.length/2)]:0;
  const chainGap=Math.min(1000,Math.max(PEAK_GAP_MS,cadence*2));
  let lo=idx,hi=idx;
  while(lo>0){const a=samples[lo-1],b=samples[lo];if(b.t-a.t>chainGap||a.raised<band||bestAt-a.t>PEAK_EVIDENCE_WINDOW_MS)break;lo--;}
  while(hi<samples.length-1){const a=samples[hi],b=samples[hi+1];if(b.t-a.t>chainGap||b.raised<band||b.t-bestAt>PEAK_EVIDENCE_WINDOW_MS)break;hi++;}
  const near=samples.slice(lo,hi+1);
  const counter=(s:RaiseSample)=>s.elbow<EVIDENCE_CLEAR_BENT_DEG||s.lat;
  if(counter(samples[idx]))return 'revoked';
  let runStart:number|null=null,runN=0;
  for(const s of near){
    if(counter(s)){if(runStart===null){runStart=s.t;runN=1;}else runN++;if(runN>=2&&s.t-runStart>=EVIDENCE_MIN_SPAN_MS)return 'revoked';}
    else{runStart=null;runN=0;}
  }
  const ok=near.filter(s=>s.elbow>=140&&s.fwd);
  return ok.length>=2&&ok[ok.length-1].t-ok[0].t>=EVIDENCE_MIN_SPAN_MS?'qualified':'insufficient';
}
/** Blocker-driven front-raise hints (round 4): the live hint names the gate
 * that is actually blocking the rep, in companion voice, most-blocking first —
 * replacing the bilateral-aggregate direction hint, which fired 112 times in
 * the replay session including during correctly performed single-arm raises. */
const COPY_RAISE_OVERSHOOT='举得有点高啦——到肩膀高就好';
const COPY_RAISE_TURNED='刚刚转成侧边啦——前平举要朝正前方抬';
const COPY_RAISE_ELBOW='手肘再伸直一点点，整条手臂一起抬';
const COPY_RAISE_DIRECTION='尚未确认前举方向；请向身体前方抬臂，侧平举不计入';
const COPY_RAISE_DEAD_ZONE='继续抬臂，方向待确认';
/** Below ≈36.9° elevation the forward cone (dot > 0.6|v|) cannot pass by
 * construction — sin θ ≤ 0.6 — so failing direction there is geometry, not user
 * error; the hint asks for more height instead of naming a direction fault. */
const DIRECTION_DEAD_ZONE_DEG=37;
/** C-lite framing signal (round 4): during calibration, the face-margin ratio
 * (how decisively the nose signs the forward axis; measure() rejects below 1)
 * surfaces as this copy when it is thin (< 2) — the framing preconditions are
 * weak. Calibration pass conditions are unchanged, and a comfortable margin
 * claims nothing stronger than the ordinary start-pose copy: the signal can
 * say 满足/不足/无法确认， never that the angle "measures accurately". */
const COPY_FRAMING_WEAK='这个角度方向不好判断——稍微转成斜侧面，让我看清你的头和双臂';
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
  /** Last time a start-pose frame was measured. Drives the calibration staleness
   * guard (round 3): gate interrupts inside update() now PRESERVE the bank, so
   * without an expiry a user could bank 50%, walk away for a minute and resume —
   * the bank only survives while set-up is plausibly still in progress. */
  private lastStartAt:number|null=null;
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
  /** Each side's most recent confirmed peak (midpoint time + peak value in the
   * movement's peak units: elbow angle for hammer curls, raised angle for front
   * raises). Lets a rep that emits as a single still score symmetry peak-to-peak
   * when the other side peaked at nearly the same time (round 3). For hammer
   * curls this record is the peer-peak memory: soft interrupts preserve it
   * (folded with any peak evidence the open cycles hold) while the hole is
   * short — see peerPeakSnapshot and softInterrupt. */
  private lastPeak:[PeakMark|null,PeakMark|null]=[null,null];
  /** When the current detection hole began (the last measured frame's time).
   * Drives cycle preservation in softInterrupt (round 4, front raise) and
   * peer-peak preservation (hammer curl); cleared by the next successfully
   * measured frame or any hard interrupt. */
  private cycleHoleStart:number|null=null;
  /** Generic-path stability evidence, aggregated by sustainedPeak at completion. */
  private controlSamples:TimedValue[]=[];
  private speedSpans:TimedSpan[]=[];
  private upperArmDevAt:number|null=null;
  private upperArmClearAt:number|null=null;
  private freezeBridged=false;
  requiredIndices(raw:Point[]){return this.needed(raw)}
  constructor(readonly type:ExtendedType,targetReps=20,restored:Partial<ExerciseMetrics>={},readonly prefiltered=false,readonly armOnStart=false){
    const acc={...emptyFormBreakdown(),count:0,total:0,...restored.scoreAccumulator};
    this.metrics={...restored,reps:Math.max(0,restored.reps||0),targetReps,perfectReps:restored.perfectReps||0,formScore:acc.count?Math.round(acc.total/acc.count):0,phase:'standing',feedback:definitions[type].placement,scoreAccumulator:acc,formBreakdown:emptyFormBreakdown(),correctionCounts:{...emptyCorrectionCounts(),...restored.correctionCounts},lastRepIssues:[],repeatedIssue:null,poseFeedback:{status:'uncertain',confidence:0,issues:[],primaryIssue:null,affectedJoints:[],calibrated:false,message:'站到起始姿势，陪我停两秒'}};
    this.updateAverage();
  }
  private updateAverage(){const a=this.metrics.scoreAccumulator,b=emptyFormBreakdown();for(const k of axes)b[k]=a.count?Math.round(a[k]/a.count):0;
    // Symmetry is the one axis that does not aggregate by mean when per-rep
    // values were recorded (hammer curls record them in emitHammerRep): the
    // set value is the median of the per-rep symmetry values, so one rep whose
    // elbow channel was struck by episodic noise cannot drag the whole set.
    // Accumulators without recorded values (every other movement, and hammer
    // sets restored from before this field existed) keep the mean above.
    const values=a.symmetryValues;if(values&&values.length)b.symmetry=Math.round(medianOf(values));
    this.metrics.formBreakdown=b;}
  private resetCycle(){this.peak=null;this.peakAt=null;this.returnAt=null;this.retSince=null;this.retAccum=0;this.retPrevAt=null;this.movingAt=null;this.cycleSide=null;this.scoring=true;this.speed=0;this.shift=0;this.controlPenalty=0;this.controlAt=null;this.hammerSides=[freshSideCycle(),freshSideCycle()];this.hammerPending=null;this.raiseSides=[freshSideCycle(),freshSideCycle()];this.raisePending=null;this.lastPeak=[null,null];this.controlSamples=[];this.speedSpans=[];this.upperArmDevAt=null;this.upperArmClearAt=null;this.freezeBridged=false;}
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
  interrupt(reason='先停一下，继续时重新校准',feedback=reason,opts?:{preserveCalibration?:boolean;preserveReady?:boolean;preserveCycle?:boolean;preservePeerPeak?:boolean}){
    // preserveCalibration (round 3): the calibration bank, the open hold segment
    // and the calibration baseline survive. The baseline is calibration state
    // too — the per-side updaters dereference it unconditionally once ready, so
    // clearing it while calibration persists would break the next rep.
    // preserveReady additionally keeps a latched ready (only the transient
    // visibility gates use it — see softInterrupt). Everything else (frames,
    // worlds, cycle state, side, diagnostics) resets exactly as a hard
    // interrupt. Session-level callers (pause/end, the adaptive wrapper) never
    // pass opts and keep the hard behaviour.
    // preserveCycle (round 4, front raise only, soft interrupts within
    // CYCLE_PRESERVE_MS): the per-side raise cycles, a pending completion and
    // the last-peak record additionally survive, so a short hole cannot kill
    // an open, already-qualified segment.
    // preservePeerPeak (hammer curl, soft interrupts within the same bound):
    // only the peer-peak memory survives — the snapshot folds each side's
    // completed record together with whatever peak evidence its still-open
    // cycle holds, so a hole cannot erase a peak the peer already produced.
    // The cycles and any pending completion still reset exactly as before.
    const preserve=!!opts?.preserveCalibration;
    const bank=preserve?this.calibrationBank:0,segment=preserve?this.calibration:null,ready=preserve&&opts?.preserveReady?this.ready:false,baseline=preserve?this.baseline:null,progress=preserve?this.diagnostics.calibrationProgress:0;
    const keepCycle=!!opts?.preserveCycle;
    const raiseSides=keepCycle?this.raiseSides:null,raisePending=keepCycle?this.raisePending:null,lastPeak=keepCycle?this.lastPeak:null;
    const peerPeaks=opts?.preservePeerPeak?this.peerPeakSnapshot():null;
    this.frames=[];this.worlds=[];this.last=null;this.calibration=segment;this.calibrationBank=bank;this.baseline=baseline;this.ready=ready;this.side=null;this.times=[];this.previous=null;this.resetCycle();
    if(keepCycle&&raiseSides&&lastPeak){this.raiseSides=raiseSides;this.raisePending=raisePending;this.lastPeak=lastPeak;}
    if(peerPeaks)this.lastPeak=peerPeaks;
    if(!keepCycle&&!peerPeaks)this.cycleHoleStart=null;
    this.diagnostics={...this.diagnostics,stage:'tracking_lost',fps:0,calibrationProgress:progress,lastResetReason:reason};
    this.metrics={...this.metrics,phase:'standing',feedback,poseFeedback:{...this.metrics.poseFeedback,status:'uncertain',calibrated:ready,message:feedback}};
    return this.metrics;
  }
  /** Transient-gate interrupt inside update(): the frame stream hiccupped — a
   * joint left the frame, a brief occlusion, a dropped frame. During set-up that
   * is normal user behaviour (stepping back into frame, turning, test-raising an
   * arm), and round 2's bank survived only measured non-start frames, so every
   * hiccup rewound calibration to zero and a dorm set-up could never finish it
   * (2026-11-08 retest: 46% banked, then wiped repeatedly; 70 s of raises, 0
   * counted). Calibration AND a latched ready now survive these interrupts; the
   * one expiry is staleness — no start-pose frame for over CALIBRATION_STALE_MS
   * while still calibrating clears the bank, so a walked-away session cannot
   * resume stale progress. Once ready, ready persists for the rest of the
   * session against transient gates. */
  private softInterrupt(reason:string,now:number,feedback:string=reason){
    if(!this.ready&&this.lastStartAt!==null&&now-this.lastStartAt>CALIBRATION_STALE_MS){this.calibrationBank=0;this.calibration=null;}
    // Round 4: for front raise, a transient gate also preserves the in-flight
    // cycle while the hole is short (CYCLE_PRESERVE_MS from the last measured
    // frame). A longer hole — or any non-soft interrupt — voids the cycle
    // exactly as before. Hammer curls preserve only the peer-peak memory over
    // the same hole and bound (the diagnosis: resetCycle wiping lastPeak on
    // every transient gate is what starved the round-3 peak-to-peak rescue);
    // their cycles still reset, so no rep can be fabricated across a hole.
    let preserveCycle=false,preservePeerPeak=false;
    if(this.type==='front_raise'||this.type==='hammer_curl'){
      if(this.cycleHoleStart===null)this.cycleHoleStart=this.last??now;
      const withinHole=now-this.cycleHoleStart<=CYCLE_PRESERVE_MS;
      if(this.type==='front_raise')preserveCycle=withinHole;else preservePeerPeak=withinHole;
      if(!withinHole)this.cycleHoleStart=null;
    }
    return this.interrupt(reason,feedback,{preserveCalibration:true,preserveReady:true,preserveCycle,preservePeerPeak});
  }
  /** Form-rejection interrupt: measure() judged the pose itself invalid (wrong
   * posture family, direction unconfirmed, baseline moved, side switched
   * mid-cycle). The banked calibration progress survives — set-up was not the
   * problem — but a latched ready does NOT: several rejections explicitly demand
   * recalibration, and staying armed would let smoothing-transition frames
   * fabricate a rep out of the rejected pose (the standing-leg-curl side-switch
   * case). Recalibration then re-earns the hold on top of the preserved bank. */
  private formInterrupt(reason:string,now:number){
    if(!this.ready&&this.lastStartAt!==null&&now-this.lastStartAt>CALIBRATION_STALE_MS){this.calibrationBank=0;this.calibration=null;}
    return this.interrupt(reason,reason,{preserveCalibration:true});
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
    let framing:'ok'|'weak'|undefined;
    if(this.type==='seated_curl'||this.type==='seated_lateral_raise'){
      const hips=[angle(a[11],a[23],a[25]),angle(a[12],a[24],a[26])];
      if(tilt>30||hips.some(v=>v<60||v>130)||knees.some(v=>v<55||v>140))return '请坐稳、双脚支撑并调整为斜侧面，让屈膝坐姿清楚可见；站姿不计入';
      const raised=[angle(a[13],a[11],a[23]),angle(a[14],a[12],a[24])];
      if(this.type==='seated_curl'){
        if(Math.max(...raised)>45)return '上臂贴紧一点点，别让肩膀跟着抬';
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
      if(controlPenalty>25)hint='上臂贴紧一点点，你会更省力';
    }else if(this.type==='front_raise'){
      if(!validWorld)return '暂时无法判断前举方向，请斜侧面拍摄，让头部和双臂清晰可见';
      const mid=(i:number,j:number):Point=>({...a[i],x:mean(a[i].x,a[j].x),y:mean(a[i].y,a[j].y),z:mean(a[i].z,a[j].z)});
      const shoulder=mid(11,12),pelvis=mid(23,24),lateral=norm(vector(a[12],a[11]));let forward=norm(cross(lateral,vector(shoulder,pelvis)));
      const face=dot(vector(a[0],shoulder),forward);
      if(Math.abs(face)<dist(shoulder,pelvis)*.06||dist(a[11],a[12])<.05)return '前举方向不清晰，请调整为斜侧面并让头部入镜';
      if(face<0)forward=forward.map(v=>-v);
      // C-lite framing signal (round 4): how decisively the nose signs the
      // forward axis, as a multiple of the rejection threshold above (which is
      // ratio 1 — the 无法确认 state, surfaced as the string return). A thin
      // margin (< 2) is 不足; anything above only ever reads as 满足.
      framing=Math.abs(face)/(dist(shoulder,pelvis)*.06)>=2?'ok':'weak';
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
      raiseData=[0,1].map(i=>{const v=vector(a[15+i],a[11+i]),n=Math.hypot(...v),f=dot(v,forward),l=Math.abs(dot(v,lateral));return {raised:raised[i],forward:f>n*.6&&f>l,latDom:l>=f,elbow:elbows[i]};}) as [RaiseSide,RaiseSide];
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
      if(this.cycleSide&&knees[support]<135)return '先放回这一侧再换腿——这个不算，也不扣分';
      const hips=angle(a[11+k],a[23+k],a[25+k]);start=Math.min(...knees)>=150;
      peak=knees[k]<=95&&knees[support]>=145&&hips>=150;
      measured=knees[k];amplitude=cap((170-knees[k])/95*100);posture=cap(100-Math.max(0,170-hips)*2);basis='单侧膝屈伸＋大腿保持向下＋另一腿支撑';motion=`${side==='left'?'左':'右'}膝 ${Math.round(knees[k])}°，髋角 ${Math.round(hips)}°；抬大腿不计数`;
      symmetry=cap(100-Math.max(0,165-knees[support])*3-(this.baseline?dist(p[27+support],this.baseline.points[27+support])/torso*120:0));
      if(!start&&hips<150)hint='请让大腿保持向下，脚跟向后抬起，向前抬膝不计入';
    }
    const scorable=confidence>=.7&&[11,12,23,24,...(this.type==='romanian_deadlift'||this.type==='glute_bridge'||this.type==='barbell_deadlift'?[25,26,27,28]:[])].every(i=>(points[i].visibility??0)>=.7);
    return {start,peak,amplitude,angle:measured,confidence,scorable,posture,symmetry,controlPenalty,hint,side,basis,motion,points:p,torso,tilt,elbows:perSide,raiseSides:raiseData,framing};
  }
  /** The peer-peak memory as it stands just before a cycle reset: each side's
   * completed peak record (lastPeak), superseded by fresher peak evidence its
   * still-open cycle holds — a locked peak (peakStart set by a valid closed
   * episode) that never reached completion, or an open peak episode whose
   * deepest sample already clears the same dwell floor a closed episode must
   * clear (PEAK_MIN_DWELL_MS in-zone up to the last measured frame). Spent only
   * through interrupt()'s preservePeerPeak path, so a soft interrupt cannot
   * erase a peak the peer already produced; peerPeakFor still applies its own
   * PEAK_PAIR_WINDOW_MS check when the memory is used, so a snapshot can never
   * pair two peaks that were not actually close in time. Hammer peak units:
   * the depth signal is 80 − elbow, so an open track's peak value is
   * 80 − track.best (a closed episode's interpolated refinement is unknowable
   * for an episode that never closed; the sampled extremum is the honest
   * record, and it is what the track itself would have closed on had the
   * signal left the zone on the next frame). */
  private peerPeakSnapshot():[PeakMark|null,PeakMark|null]{
    const snap:[PeakMark|null,PeakMark|null]=[this.lastPeak[0],this.lastPeak[1]];
    for(const s of [0,1] as const){
      const cyc=this.hammerSides[s];
      let cand:PeakMark|null=null;
      if(cyc.peakStart!==null)cand={at:(cyc.peakStart+cyc.peakEnd)/2,value:cyc.peakElbow};
      else if(cyc.track.open&&cyc.track.best>-Infinity&&(this.last??cyc.track.bestAt)-cyc.track.start>=PEAK_MIN_DWELL_MS)cand={at:cyc.track.bestAt,value:80-cyc.track.best};
      if(cand&&(!snap[s]||cand.at>=snap[s].at))snap[s]=cand;
    }
    return snap;
  }
  /** The other side's confirmed peak for peak-to-peak symmetry (round 3): its last
   * completion's peak if that peaked within PEAK_PAIR_WINDOW_MS of this rep's
   * peak, else its still-open cycle's confirmed peak under the same window. */
  private peerPeakFor(single:SideCompletion,cycles:[SideCycle,SideCycle]):{at:number;value:number}|undefined{
    const mid=(single.peakStart+single.peakEnd)/2,other=1-single.side;
    const stashed=this.lastPeak[other];
    if(stashed&&Math.abs(stashed.at-mid)<=PEAK_PAIR_WINDOW_MS)return stashed;
    const live=cycles[other];
    if(live.peakStart!==null){const at=(live.peakStart+live.peakEnd)/2;if(Math.abs(at-mid)<=PEAK_PAIR_WINDOW_MS)return {at,value:live.peakElbow};}
    return undefined;
  }
  private emitHammerRep(parts:SideCompletion[],f:Measurement,peer?:{at:number;value:number}):boolean{
    if(this.metrics.reps>=this.metrics.targetReps)return false;
    const pair=parts.length===2;
    const depth=pair?Math.min(parts[0].peakAmp,parts[1].peakAmp):parts[0].peakAmp;
    const posture=pair?Math.min(parts[0].peakPosture,parts[1].peakPosture):parts[0].peakPosture;
    const control=Math.max(...parts.map(p=>p.control)),shift=Math.max(...parts.map(p=>p.shift)),speed=Math.max(...parts.map(p=>p.speed)),duration=Math.max(...parts.map(p=>p.duration));
    // A single whose other side peaked within PEAK_PAIR_WINDOW_MS is a bilateral
    // effort whose peaks merely missed the 150 ms merge overlap — score it
    // peak-to-peak like a pair. The instantaneous peakOther formula reads the
    // other elbow mid-flight on loose bilateral synchrony (at a 2 s pace, a
    // 350 ms offset leaves it near 100° → symmetry ≈ 50 for visually symmetric
    // curls) and stays reserved for true single-arm / alternating reps.
    const symmetry=pair?cap(100-Math.abs(parts[0].peakElbow-parts[1].peakElbow)*1.5):peer?cap(100-Math.abs(parts[0].peakElbow-peer.value)*1.5):cap(100-Math.max(0,140-parts[0].peakOther)*1.2);
    const breakdown={depth,stability:cap(100-Math.max(0,speed-260)*.08-Math.max(0,.6-duration)*70-control),trunk:cap(posture-shift*1.5),symmetry};
    const score=Math.round(breakdown.depth*.35+breakdown.stability*.25+breakdown.trunk*.2+breakdown.symmetry*.2),scored=parts.every(p=>p.scoring)&&f.scorable,issues:PoseIssue[]=[];
    if(breakdown.depth<70)issues.push('insufficient_range');if(breakdown.stability<70)issues.push('unstable_movement');if(breakdown.trunk<70)issues.push('body_alignment');if(breakdown.symmetry<70)issues.push('poor_coordination');
    const acc={...this.metrics.scoreAccumulator},counts={...this.metrics.correctionCounts};
    // Hammer curls record each scored rep's symmetry value: the set-level axis
    // aggregates them by median (see updateAverage). This is the only emit path
    // that records values, which is what scopes the median to hammer curls.
    if(scored){acc.count++;acc.total+=score;axes.forEach(k=>acc[k]+=breakdown[k]);acc.symmetryValues=[...(acc.symmetryValues??[]),breakdown.symmetry];issues.forEach(k=>counts[k]++);}
    this.metrics={...this.metrics,reps:this.metrics.reps+1,lastRepScore:scored?score:null,scoreAccumulator:acc,perfectReps:this.metrics.perfectReps+(scored&&score>=90?1:0),formScore:acc.count?Math.round(acc.total/acc.count):0,correctionCounts:counts,lastRepIssues:scored?issues:[],feedback:scored?`好，第 ${this.metrics.reps+1} 次记下啦 · 本次 ${score} 分`:`好，第 ${this.metrics.reps+1} 次记下啦 · 这次没看清，不评分`};
    this.updateAverage();
    return true;
  }
  /** Hammer curls count per side: an alternating curl scores one rep per arm, while two sides whose peaks overlap merge into a single synchronized rep. */
  private updateHammerCurl(f:Measurement,now:number):ExerciseMetrics{
    const elbows=f.elbows!;
    let completed=false;
    if(this.hammerPending&&now-this.hammerPending.at>600){const pending=this.hammerPending;this.hammerPending=null;if(this.emitHammerRep([pending],f,this.peerPeakFor(pending,this.hammerSides)))completed=true;}
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
          const done:SideCompletion={side:s,at:now,peakStart:cyc.peakStart,peakEnd:cyc.peakEnd,peakAmp:cyc.peakAmp,peakPosture:cyc.peakPosture,peakOther:cyc.peakOther,peakElbow:cyc.peakElbow,duration:(now-(cyc.movingAt??now))/1000,scoring:cyc.scoring,control:sustainedPeak(controlSpans(cyc.controlSamples,now),cyc.controlMax),shift:cyc.shiftMax,speed:sustainedPeak(cyc.speedSpans,cyc.speedMax)};
          this.lastPeak[s]={at:(done.peakStart+done.peakEnd)/2,value:done.peakElbow};
          this.hammerSides[s]=freshSideCycle();replaced=true;
          if(this.hammerPending){
            const pending=this.hammerPending;
            const overlap=done.peakStart<=pending.peakEnd+150&&pending.peakStart<=done.peakEnd+150;
            if(pending.side!==s&&overlap){this.hammerPending=null;if(this.emitHammerRep([pending,done],f))completed=true;}
            else{this.hammerPending=null;if(this.emitHammerRep([pending],f,this.peerPeakFor(pending,this.hammerSides)))completed=true;this.hammerPending=done;}
          }else this.hammerPending=done;
        }
      }
      if(!replaced){
        if(e>=145){if(cyc.peakStart===null&&cyc.movingAt!==null){this.hammerSides[s]=freshSideCycle();replaced=true;}}
        else{
          if(cyc.movingAt===null)cyc.movingAt=now;
          cyc.scoring=cyc.scoring&&f.scorable;
          cyc.controlMax=Math.max(cyc.controlMax,f.controlPenalty);
          cyc.controlSamples.push({t:now,v:f.controlPenalty});
          cyc.shiftMax=Math.max(cyc.shiftMax,Math.abs(f.tilt-this.baseline!.tilt));
          if(cyc.sampleAt===null){cyc.sampleAt=now;cyc.sampleAngle=e;}
          else if(now-cyc.sampleAt>=100){const v=Math.abs(e-cyc.sampleAngle)*1000/(now-cyc.sampleAt);cyc.speedMax=Math.max(cyc.speedMax,v);cyc.speedSpans.push({start:cyc.sampleAt,end:now,v});cyc.sampleAt=now;cyc.sampleAngle=e;}
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
    const message=stage==='complete'?'目标完成啦，漂亮':completed?this.metrics.feedback:nearPeak?'接近啦，再往上带一点点，到肩膀高再放回':(hint||copy[stage==='ready'?0:stage==='moving'?1:stage==='peak'?2:3]+(stage==='moving'?' · 继续，保持住':''));
    const issue:PoseIssue|null=f.controlPenalty>30?'unstable_movement':f.posture<70?'body_alignment':null;
    this.diagnostics={...this.diagnostics,stage};
    this.metrics={...this.metrics,phase:f.start?'standing':anyPeak?'ascending':'descending',feedback:completed?this.metrics.feedback:message,poseFeedback:{status:!f.scorable?'uncertain':issue?'adjust':'stable',confidence:f.confidence,issues:issue?[issue]:[],primaryIssue:issue,affectedJoints:issue?poseIssueCopy(issue,this.type).joints:[],calibrated:true,message:hint||(issue?poseIssueCopy(issue,this.type).action:message)}};
    return this.metrics;
  }
  private emitFrontRaiseRep(parts:SideCompletion[],f:Measurement,peer?:{at:number;value:number}):boolean{
    if(this.metrics.reps>=this.metrics.targetReps)return false;
    const pair=parts.length===2;
    const depth=pair?Math.min(parts[0].peakAmp,parts[1].peakAmp):parts[0].peakAmp;
    const posture=pair?Math.min(parts[0].peakPosture,parts[1].peakPosture):parts[0].peakPosture;
    const control=Math.max(...parts.map(p=>p.control)),shift=Math.max(...parts.map(p=>p.shift)),speed=Math.max(...parts.map(p=>p.speed)),duration=Math.max(...parts.map(p=>p.duration));
    // For front raise, peakElbow stores the side's raised angle at its best amplitude
    // and peakOther the other side's raised angle at that moment: a pair is symmetric
    // when both sides peaked at the same height, a single when the other arm stayed down.
    // Round 3: a single whose other side peaked within PEAK_PAIR_WINDOW_MS scores
    // peak-to-peak like a pair (see emitHammerRep); peakOther remains for true singles.
    const symmetry=pair?cap(100-Math.abs(parts[0].peakElbow-parts[1].peakElbow)*1.5):peer?cap(100-Math.abs(parts[0].peakElbow-peer.value)*1.5):cap(100-Math.max(0,parts[0].peakOther-25)*1.2);
    const breakdown={depth,stability:cap(100-Math.max(0,speed-260)*.08-Math.max(0,.6-duration)*70-control),trunk:cap(posture-shift*1.5),symmetry};
    const score=Math.round(breakdown.depth*.35+breakdown.stability*.25+breakdown.trunk*.2+breakdown.symmetry*.2),scored=parts.every(p=>p.scoring)&&f.scorable,issues:PoseIssue[]=[];
    if(breakdown.depth<70)issues.push('insufficient_range');if(breakdown.stability<70)issues.push('unstable_movement');if(breakdown.trunk<70)issues.push('body_alignment');if(breakdown.symmetry<70)issues.push('poor_coordination');
    const acc={...this.metrics.scoreAccumulator},counts={...this.metrics.correctionCounts};
    if(scored){acc.count++;acc.total+=score;axes.forEach(k=>acc[k]+=breakdown[k]);issues.forEach(k=>counts[k]++);}
    this.metrics={...this.metrics,reps:this.metrics.reps+1,lastRepScore:scored?score:null,scoreAccumulator:acc,perfectReps:this.metrics.perfectReps+(scored&&score>=90?1:0),formScore:acc.count?Math.round(acc.total/acc.count):0,correctionCounts:counts,lastRepIssues:scored?issues:[],feedback:scored?`好，第 ${this.metrics.reps+1} 次记下啦 · 本次 ${score} 分`:`好，第 ${this.metrics.reps+1} 次记下啦 · 这次没看清，不评分`};
    this.updateAverage();
    return true;
  }
  /** Front raises count per side, mirroring hammer curls: each arm independently runs
   * start (raised ≤25°) → peak (raised 65–115°, elbow ≥140°, that arm forward-dominant)
   * → return to start. Overlapping peaks merge into one synchronized rep; non-overlapping
   * count one per arm, so single-arm and alternating raises count — while a single-arm
   * LATERAL raise never satisfies the forward-dominance test and stays rejected.
   * Round 4: the peak's form conditions are judged by the peak-bound evidence
   * segment (evaluatePeakEvidence), an overshoot segment revokes an earned
   * latch, and short soft-interrupt holes preserve the open cycle. */
  private updateFrontRaise(f:Measurement,now:number):ExerciseMetrics{
    const sides=f.raiseSides!;
    let completed=false;
    if(this.raisePending&&now-this.raisePending.at>600){const pending=this.raisePending;this.raisePending=null;if(this.emitFrontRaiseRep([pending],f,this.peerPeakFor(pending,this.raiseSides)))completed=true;}
    for(const s of [0,1] as const){
      const cyc=this.raiseSides[s],side=sides[s],other=sides[1-s],v=side.raised;
      // Round 4 evidence sampling: while the arm is engaged, record the form
      // channels the peak-evidence rule judges. The buffer is short and pruned
      // by age — evaluation only reads the peak neighbourhood, and any live
      // episode's argmax sample is far younger than the prune horizon.
      if(v>25||cyc.track.open||cyc.peakStart!==null){
        cyc.samples.push({t:now,raised:v,elbow:side.elbow,fwd:side.forward,lat:side.latDom});
        while(cyc.samples.length&&cyc.samples[0].t<now-4000)cyc.samples.shift();
      }
      // Direction latch (round 4): per-raise direction HISTORY from sustained
      // evidence only — a forward run (≥2 samples spanning ≥ EVIDENCE_MIN_SPAN_MS,
      // gaps ≤ PEAK_GAP_MS) latches the direction; a sustained lateral run
      // clears it and marks the raise mixed, after which it cannot re-latch
      // this raise. The latch feeds hints only; peak qualification always
      // re-judges the peak moment itself (evaluatePeakEvidence).
      if(v>25){
        const chained=cyc.prevAt!==null&&now-cyc.prevAt<=PEAK_GAP_MS;
        if(side.forward){
          cyc.latRun=null;
          cyc.fwdRun=chained&&cyc.fwdRun?{start:cyc.fwdRun.start,last:now,n:cyc.fwdRun.n+1}:{start:now,last:now,n:1};
          if(!cyc.dirMixed&&cyc.fwdRun.n>=2&&cyc.fwdRun.last-cyc.fwdRun.start>=EVIDENCE_MIN_SPAN_MS)cyc.dirLatched=true;
        }else if(side.latDom){
          cyc.fwdRun=null;
          cyc.latRun=chained&&cyc.latRun?{start:cyc.latRun.start,last:now,n:cyc.latRun.n+1}:{start:now,last:now,n:1};
          if(cyc.latRun.n>=2&&cyc.latRun.last-cyc.latRun.start>=EVIDENCE_MIN_SPAN_MS){if(cyc.dirLatched)cyc.dirTurned=true;cyc.dirLatched=false;cyc.dirMixed=true;}
        }else{cyc.fwdRun=null;cyc.latRun=null;}
      }
      // Crossing confirmation like hammer curl's (depth ≥ 0 ⇔ raised ≥65°): the
      // episode's extremum and dwell come from the crossing interpolation; its
      // form conditions (elbow ≥140°, forward-dominant) are judged by the
      // peak-evidence rule at close, and the 115° band cap by the overshoot
      // review below.
      const ev=feedPeakTrack(cyc.track,now,v-65);
      if(ev.best){cyc.peakPosture=f.posture;cyc.peakOther=other.raised;}
      if(ev.closed?.valid){
        const ext=65+ev.closed.depth;
        // Overshoot review (round 4): a reliable segment whose extremum left
        // the band voids the whole raise — including a latch an earlier
        // segment of the same raise already earned (previously a saved
        // peakStart was never revoked by a later failing segment). The 115°
        // rule itself is unchanged.
        if(ext>115){cyc.overshoot=true;cyc.peakStart=null;}
        else if(!cyc.overshoot&&evaluatePeakEvidence(cyc.samples,cyc.track.bestAt,65+cyc.track.best)==='qualified'){cyc.peakStart=ev.closed.start;cyc.peakEnd=ev.closed.end;cyc.peakElbow=ext;cyc.peakAmp=cap(ext/90*100);}
      }
      // Return confirmation accumulates the interpolated in-zone dwell (raised ≤25°)
      // inside a 500 ms window, like hammer curl's (see zonePortion).
      const portion=cyc.prevAt===null?{start:now,ms:0}:zonePortion(cyc.prevAngle,v,25,false,cyc.prevAt,now);
      let replaced=false;
      if(cyc.peakStart!==null&&portion.ms>0){
        if(cyc.returnSince===null||portion.start-cyc.returnSince>RETURN_WINDOW_MS){cyc.returnSince=portion.start;cyc.returnAccum=0;}
        cyc.returnAccum+=Math.min(RETURN_FRAME_CAP_MS,portion.ms);
        if(cyc.returnAccum>=RETURN_HOLD_MS){
          const done:SideCompletion={side:s,at:now,peakStart:cyc.peakStart,peakEnd:cyc.peakEnd,peakAmp:cyc.peakAmp,peakPosture:cyc.peakPosture,peakOther:cyc.peakOther,peakElbow:cyc.peakElbow,duration:(now-(cyc.movingAt??now))/1000,scoring:cyc.scoring,control:sustainedPeak(controlSpans(cyc.controlSamples,now),cyc.controlMax),shift:cyc.shiftMax,speed:sustainedPeak(cyc.speedSpans,cyc.speedMax)};
          this.lastPeak[s]={at:(done.peakStart+done.peakEnd)/2,value:done.peakElbow};
          this.raiseSides[s]=freshSideCycle();replaced=true;
          if(this.raisePending){
            const pending=this.raisePending;
            const overlap=done.peakStart<=pending.peakEnd+150&&pending.peakStart<=done.peakEnd+150;
            if(pending.side!==s&&overlap){this.raisePending=null;if(this.emitFrontRaiseRep([pending,done],f))completed=true;}
            else{this.raisePending=null;if(this.emitFrontRaiseRep([pending],f,this.peerPeakFor(pending,this.raiseSides)))completed=true;this.raisePending=done;}
          }else this.raisePending=done;
        }
      }
      if(!replaced){
        if(v<=25){if(cyc.peakStart===null&&cyc.movingAt!==null){this.raiseSides[s]=freshSideCycle();replaced=true;}}
        else{
          if(cyc.movingAt===null)cyc.movingAt=now;
          cyc.scoring=cyc.scoring&&f.scorable;
          const control=Math.max(0,170-side.elbow)*1.5;
          cyc.controlMax=Math.max(cyc.controlMax,control);
          cyc.controlSamples.push({t:now,v:control});
          cyc.shiftMax=Math.max(cyc.shiftMax,Math.abs(f.tilt-this.baseline!.tilt));
          if(cyc.sampleAt===null){cyc.sampleAt=now;cyc.sampleAngle=v;}
          else if(now-cyc.sampleAt>=100){const w=Math.abs(v-cyc.sampleAngle)*1000/(now-cyc.sampleAt);cyc.speedMax=Math.max(cyc.speedMax,w);cyc.speedSpans.push({start:cyc.sampleAt,end:now,v:w});cyc.sampleAt=now;cyc.sampleAngle=v;}
        }
      }
      const cur=this.raiseSides[s];
      cur.prevAt=now;cur.prevAngle=v;
      if(replaced){cur.track.prevAt=now;cur.track.prevDepth=v-65;}
      if(v<=25){cur.fwdRun=null;cur.latRun=null;}
    }
    const anyPeak=this.raiseSides.some(c=>c.peakStart!==null||c.track.open)||this.raisePending!==null;
    const stage=this.metrics.reps>=this.metrics.targetReps?'complete':anyPeak?(f.start?'returning':'peak'):f.start?'ready':'moving';
    const copy=definitions[this.type].stages;
    const nearPeak=stage==='moving'&&sides.every(s=>s.raised<65)&&sides.some(s=>s.raised>=45);
    const blocker=this.frontRaiseBlocker(sides);
    const message=stage==='complete'?'目标完成啦，漂亮':completed?this.metrics.feedback:blocker||(nearPeak?'接近啦，再往上带一点点，到肩膀高再放回':copy[stage==='ready'?0:stage==='moving'?1:stage==='peak'?2:3]+(stage==='moving'?' · 继续，保持住':''));
    const issue:PoseIssue|null=f.posture<70?'body_alignment':null;
    this.diagnostics={...this.diagnostics,stage};
    this.metrics={...this.metrics,phase:f.start?'standing':anyPeak?'ascending':'descending',feedback:completed?this.metrics.feedback:message,poseFeedback:{status:!f.scorable?'uncertain':issue?'adjust':'stable',confidence:f.confidence,issues:issue?[issue]:[],primaryIssue:issue,affectedJoints:issue?poseIssueCopy(issue,this.type).joints:[],calibrated:true,message:blocker||(issue?poseIssueCopy(issue,this.type).action:message)}};
    return this.metrics;
  }
  /** The gate actually blocking the front-raise rep right now, named in the
   * live hint (round 4). Judges the more-raised arm that has not yet latched a
   * peak; returns undefined when nothing is blocking, letting the near-peak
   * encouragement or the stage copy speak. Replaces the measure() aggregate
   * hint in this updater: that hint required BOTH arms forward, so it fired
   * throughout correct single-arm raises and said nothing about which gate —
   * overshoot, a turn to the side, a bent elbow, or direction — was binding. */
  private frontRaiseBlocker(sides:[RaiseSide,RaiseSide]):string|undefined{
    let active=-1,top=-Infinity;
    for(const s of [0,1] as const)if(this.raiseSides[s].peakStart===null&&sides[s].raised>25&&sides[s].raised>top){top=sides[s].raised;active=s;}
    if(active<0)return undefined;
    const side=sides[active],cyc=this.raiseSides[active];
    if(side.raised>115||cyc.overshoot)return COPY_RAISE_OVERSHOOT;
    if(cyc.dirTurned)return COPY_RAISE_TURNED;
    if(side.forward&&side.raised>=45&&side.elbow<EVIDENCE_CLEAR_BENT_DEG)return COPY_RAISE_ELBOW;
    if(!side.forward&&!cyc.dirLatched){
      if(side.raised>DIRECTION_DEAD_ZONE_DEG)return COPY_RAISE_DIRECTION;
      return COPY_RAISE_DEAD_ZONE;
    }
    return undefined;
  }
  update(raw:Point[]|null,now:number,aspect=1,world:Point[]|null=null):ExerciseMetrics{
    if(!raw||raw.length!==33||!Number.isFinite(now)||!Number.isFinite(aspect)||aspect<=0||raw.some(p=>!p||![p.x,p.y,p.visibility??0].every(Number.isFinite)))return this.softInterrupt('未检测到完整人体关键点',now,notSeenCopyFor(this.type));
    if(this.last!==null&&now<=this.last)return this.metrics;
    if(this.last!==null&&now-this.last>750){if(this.freezeBridged)this.freezeBridged=false;else this.softInterrupt('画面中断',now,COPY_HALF_REP);}
    const required=this.needed(raw);
    if(required.some(i=>(raw[i].visibility??0)<.25||raw[i].x<0||raw[i].x>1||raw[i].y<0||raw[i].y>1))return this.softInterrupt('必要关节离开画面或被遮挡',now,COPY_OUT_OF_FRAME);
    this.frames=[...this.frames,raw].slice(-(this.prefiltered?1:5));const smooth=medianLandmarks(this.frames)!;
    // Front raise reads every angle from world landmarks (validity gated separately in
    // measure), while kneeling systematically tanks image-space hip visibility — so for
    // front raise the hips leave the smoothed-visibility reset set. The raw gate above
    // still catches a total loss, and the nose stays gated: it signs the forward axis.
    const smoothGate=this.type==='front_raise'?required.filter(i=>i!==23&&i!==24):required;
    if(smoothGate.some(i=>(smooth[i].visibility??0)<.55))return this.softInterrupt('必要关节持续不清晰',now,'我有点看不清——换个角度，让我看清你');
    this.worlds=world?.length===33&&world.every(p=>p&&[p.x,p.y,p.z].every(Number.isFinite))?[...this.worlds,world].slice(-(this.prefiltered?1:5)):[];
    const f=this.measure(smooth,aspect,this.worlds.length?medianLandmarks(this.worlds):null,required);
    if(typeof f==='string')return this.formInterrupt(f,now);
    this.last=now;this.cycleHoleStart=null;this.times=[...this.times,now].filter(t=>now-t<=2000);
    this.diagnostics={...this.diagnostics,fps:this.times.length>1?Math.round((this.times.length-1)*1000/(now-this.times[0])):0,confidence:f.confidence,side:f.side||null,angle:f.angle,basis:f.basis,motion:f.motion};
    if(!this.ready){
      // Latched calibration: a non-start frame PAUSES the 2 s hold and banks the time
      // already held instead of zeroing it (the 2026-11-07 front-raise retest showed
      // progress falling 42%→26%→13% as the user raised their arms to test). Round 3:
      // gate interrupts inside update() preserve the bank too (see softInterrupt) —
      // the only expiry left is staleness, checked here and there: no start-pose
      // frame for over CALIBRATION_STALE_MS while calibrating clears the bank.
      if(!f.start&&this.lastStartAt!==null&&now-this.lastStartAt>CALIBRATION_STALE_MS){this.calibrationBank=0;this.calibration=null;}
      if(f.start)this.lastStartAt=now;
      if(!f.start){if(this.calibration!==null){this.calibrationBank+=now-this.calibration;this.calibration=null;}this.baseline=null;}else{if(this.calibration===null)this.calibration=now;this.baseline=f;if(this.armOnStart||this.calibrationBank+(now-this.calibration)>=2000)this.ready=true;}
      const progress=this.ready?1:Math.min(1,(this.calibrationBank+(this.calibration===null?0:now-this.calibration))/2000);this.diagnostics={...this.diagnostics,stage:this.ready?'ready':'calibrating',calibrationProgress:progress};
      // Front raise must not surface its direction hint before calibration completes:
      // at rest the direction test is always false, so the hint kept ordering the user
      // to raise an arm — and raising it zeroed the calibration they were holding.
      // Round 4 (C-lite): what calibration CAN honestly surface is the framing
      // signal — a weak face margin on a non-start pose earns the 不足 copy
      // (COPY_FRAMING_WEAK); the start-pose progress copy remains the 满足
      // surface and the direction measure() strings the 无法确认 one. Pass
      // conditions are untouched.
      const calibHint=this.type==='front_raise'?(!f.start&&f.framing==='weak'?COPY_FRAMING_WEAK:undefined):f.hint;
      const message=this.ready?COPY_CALIBRATED:f.start?`就快好啦，保持起始姿势（${Math.round(progress*100)}%）`:calibHint||(this.armOnStart?'先回到起始姿势，陪我停两秒':'回到起始姿势，陪我停两秒');
      this.metrics={...this.metrics,feedback:message,poseFeedback:{...this.metrics.poseFeedback,status:'uncertain',calibrated:this.ready,confidence:f.confidence,message}};return this.metrics;
    }
    if(this.type==='hammer_curl')return this.updateHammerCurl(f,now);
    if(this.type==='front_raise')return this.updateFrontRaise(f,now);
    if(!f.start){
      if(this.movingAt===null){this.movingAt=now;if(this.type==='standing_leg_curl')this.cycleSide=f.side||null;}
      this.scoring=this.scoring&&f.scorable;this.shift=Math.max(this.shift,Math.abs(f.tilt-this.baseline!.tilt));
      this.controlPenalty=Math.max(this.controlPenalty,f.controlPenalty);
      this.controlSamples.push({t:now,v:f.controlPenalty});
      if(this.controlAt===null){this.controlAt=now;this.controlAngle=f.angle;}else if(now-this.controlAt>=100){const v=Math.abs(f.angle-this.controlAngle)*1000/(now-this.controlAt);this.speed=Math.max(this.speed,v);this.speedSpans.push({start:this.controlAt,end:now,v});this.controlAt=now;this.controlAngle=f.angle;}
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
          const breakdown={depth:this.peak.amplitude,stability:cap(100-Math.max(0,sustainedPeak(this.speedSpans,this.speed)-260)*.08-Math.max(0,.6-duration)*70-sustainedPeak(controlSpans(this.controlSamples,now),this.controlPenalty)),trunk:cap(this.peak.posture-(this.type==='romanian_deadlift'||this.type==='glute_bridge'||this.type==='barbell_deadlift'?0:this.shift*1.5)),symmetry:this.peak.symmetry};
          const score=Math.round(breakdown.depth*.35+breakdown.stability*.25+breakdown.trunk*.2+breakdown.symmetry*.2),scored=this.scoring&&f.scorable,issues:PoseIssue[]=[];
          if(breakdown.depth<70)issues.push('insufficient_range');if(breakdown.stability<70)issues.push('unstable_movement');if(breakdown.trunk<70)issues.push('body_alignment');if(breakdown.symmetry<70)issues.push('poor_coordination');
          const counts={...this.metrics.correctionCounts};if(scored){acc.count++;acc.total+=score;axes.forEach(k=>acc[k]+=breakdown[k]);issues.forEach(k=>counts[k]++);}
          this.metrics={...this.metrics,reps:this.metrics.reps+1,lastRepScore:scored?score:null,scoreAccumulator:acc,perfectReps:this.metrics.perfectReps+(scored&&score>=90?1:0),formScore:acc.count?Math.round(acc.total/acc.count):0,correctionCounts:counts,lastRepIssues:scored?issues:[],feedback:scored?`好，第 ${this.metrics.reps+1} 次记下啦 · 本次 ${score} 分`:`好，第 ${this.metrics.reps+1} 次记下啦 · 这次没看清，不评分`};this.updateAverage();completed=true;
        }this.resetCycle();
      }
    }else{this.returnAt=null;if(this.peak)this.retPrevAt=now;}
    const stage=this.metrics.reps>=this.metrics.targetReps?'complete':this.peak?(f.start?'returning':'peak'):f.start?'ready':'moving';
    const copy=definitions[this.type].stages,message=stage==='complete'?'目标完成啦，漂亮':f.hint||copy[stage==='ready'?0:stage==='moving'?1:stage==='peak'?2:3]+(stage==='moving'?' · 继续，保持住':'');
    const issue:PoseIssue|null=f.controlPenalty>30?'unstable_movement':f.posture<70?'body_alignment':f.symmetry<70?'poor_coordination':null;
    this.diagnostics={...this.diagnostics,stage};this.metrics={...this.metrics,phase:f.start?'standing':this.peak?'ascending':'descending',feedback:completed?this.metrics.feedback:message,poseFeedback:{status:!f.scorable?'uncertain':issue?'adjust':'stable',confidence:f.confidence,issues:issue?[issue]:[],primaryIssue:issue,affectedJoints:issue?poseIssueCopy(issue,this.type).joints:[],calibrated:true,message:f.hint|| (issue?poseIssueCopy(issue,this.type).action:message)}};this.previous=f;return this.metrics;
  }
}
