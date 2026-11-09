import type {NormalizedLandmark as Point} from '@mediapipe/tasks-vision';
import type {ExerciseMetrics,RecognitionDiagnostics} from './exerciseMetrics';
import {medianLandmarks,poseIssueCopy} from './poseFeedback';
import { COPY_CALIBRATED, COPY_HALF_REP, COPY_OUT_OF_FRAME, cannotAssessCopyFor, notSeenCopyFor } from './companionCopy';
import { allNumericAssessments, frontRaiseBandFor, syncCategoryForOffset, totalWithheld, type AxisAssessments, type DepthBandCounts } from './axisAssessment';
import {emptyCorrectionCounts,emptyFormBreakdown,medianOf} from './sessionMigration';
import {NEW_EXERCISES,type NewExerciseType} from './newExercises';
import {LIBRARY_RECOGNITION} from '../../gym/libraryRecognition';
import type {PoseIssue, ScoreAccumulator} from '../types';

const cap=(n:number)=>Math.max(0,Math.min(100,n));
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));
const vector=(a:Point,b:Point)=>[a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0)];
const dot=(a:number[],b:number[])=>a.reduce((n,x,i)=>n+x*b[i],0);
const norm=(v:number[])=>v.map(x=>x/(Math.hypot(...v)||1));
const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const angle=(a:Point,b:Point,c:Point)=>Math.acos(Math.max(-1,Math.min(1,dot(norm(vector(a,b)),norm(vector(c,b))))))*180/Math.PI;
const mean=(a:number,b:number)=>(a+b)/2;
type Side='left'|'right';
type Measurement={start:boolean;peak:boolean;amplitude:number;angle:number;confidence:number;scorable:boolean;posture:number;symmetry:number;controlPenalty:number;hint?:string;side?:Side;basis:string;motion:string;points:Point[];torso:number;tilt:number;elbows?:[number,number];raiseSides?:[RaiseSide,RaiseSide];legSides?:[LegSide,LegSide];framing?:'ok'|'weak'};
/** Per-leg channels for the tier-2 leg movements: hip and knee angles plus,
 * for the split squat, the ankle's forward projection relative to its hip
 * along the feet's facing direction (leg-length units) — the front leg is
 * the one whose ankle sits forward, the rear foot rests back (and elevated
 * on a bench), so stance geometry rather than motion picks the front side. */
type LegSide={hip:number;knee:number;proj:number};
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
type SideCycle={movingAt:number|null;peakStart:number|null;peakEnd:number;peakElbow:number;peakAmp:number;peakPosture:number;peakOther:number;otherBase:number;track:PeakTrack;prevAt:number|null;prevAngle:number;returnSince:number|null;returnAccum:number;scoring:boolean;controlMax:number;shiftMax:number;speedMax:number;sampleAt:number|null;sampleAngle:number;controlSamples:TimedValue[];speedSpans:TimedSpan[];samples:RaiseSample[];overshoot:boolean;dirLatched:boolean;dirMixed:boolean;dirTurned:boolean;fwdRun:SustainRun;latRun:SustainRun;supportBase:Point|null;supportPeak:Point|null;peakWindows:{start:number;end:number}[];returnTouched:boolean;returnTouchAt:number|null;evidence:PeakEvidenceVerdict|null};
type SideCompletion={side:number;at:number;peakStart:number;peakEnd:number;peakAmp:number;peakPosture:number;peakOther:number;peakElbow:number;duration:number;scoring:boolean;control:number;shift:number;speed:number;peakWindows:{start:number;end:number}[];cycleStart:number;returnedAt:number};
/** One side's confirmed peak: midpoint time + peak value in the movement's peak units (see lastPeak). */
type PeakMark={at:number;value:number};
const freshSideCycle=():SideCycle=>({movingAt:null,peakStart:null,peakEnd:0,peakElbow:180,peakAmp:0,peakPosture:100,peakOther:180,otherBase:180,track:freshPeakTrack(),prevAt:null,prevAngle:180,returnSince:null,returnAccum:0,scoring:true,controlMax:0,shiftMax:0,speedMax:0,sampleAt:null,sampleAngle:180,controlSamples:[],speedSpans:[],samples:[],overshoot:false,dirLatched:false,dirMixed:false,dirTurned:false,fwdRun:null,latRun:null,supportBase:null,supportPeak:null,peakWindows:[],returnTouched:false,returnTouchAt:null,evidence:null});
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
/** After a TRACKING-LOSS interrupt (the wrapper's rejects, a pause, a
 * restored session — anywhere the subject was actually lost), RE-ARMING
 * requires one continuously-measured start-pose hold of this length;
 * banked fragments may still supply the rest of the 2 s total. Re-arms
 * after a FORM rejection are exempt: the tracker measured the user on the
 * rejecting frame, the set context is intact, and mid-set re-latching is
 * load-bearing (the 2026-11-09 counting repairs rely on it). The
 * 2026-11-09 walking recording showed the hole this closes: the session
 * lost tracking every few seconds and each phantom rep completed inside a
 * stretch re-armed instantly from an arm-swing fragment, while walking
 * never produces a 1.5 s unbroken start hold (longest gap-aware run on
 * the extracted stream ≈1.1 s). First calibration is untouched — the
 * guided user stands in front of the camera and the 2026-11-07 banking
 * story governs it. */
const REARM_MIN_SEGMENT_MS=1500;
/** A calibration segment is "continuous" only while measured frames keep
 * arriving: a gap longer than this banks the open segment and restarts
 * it, so a freeze span or skipped frames cannot inflate a hold out of a
 * few start frames at either end. */
const SEGMENT_GAP_MS=500;
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
 * sub-frame interpolated zone crossing: entry/exit times come from
 * linear crossing interpolation, and the extremum was originally refined by a parabola
 * through the samples bracketing it — the judged value is now the sampled extremum
 * (2026-11-09 counting-mechanism repair; see feedPeakTrack's close site). Angle
 * thresholds are unchanged; only the time/sampling layer moved.
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
/** Step-3 scoring contract (2026-11-08): movements measured on ONE side by
 * design — needed() locks a single tracking side and calibration judges that
 * side alone. Their measure() "symmetry" channel is a both-knees difference
 * or a support-point drift, not a bilateral-symmetry judgment, and the
 * Phase-0 labels mark frontal bilateral symmetry unobservable from the
 * side views these movements prescribe. The axis is declared unassessable
 * for them and leaves the total (which renormalizes over the other three).
 * Support-discipline fourth axes whose DEFINITION is single-side stillness
 * (one-arm row's support elbow, split squat's rear foot, standing leg
 * curl's support leg, mountain climber's extended partner) are not symmetry
 * judgments at all and keep their numbers — see the step-3 doc. */
const SINGLE_SIDE_TYPES:ReadonlySet<string>=new Set(['romanian_deadlift','glute_bridge','barbell_deadlift','lying_leg_raise']);
/** Axis-validity suspension scope (2026-11-09, Codex rounds 3–4;
 * docs/minimum-axis-contract-2026-11-09.md carries the full per-profile
 * mechanism review). These types' stability axis is dominated by the
 * SAME unresolved construct the hammer evidence indicted: a control
 * term grading the upper arm's excursion from the torso line —
 * max(0, max(angle(elbow, shoulder, hip)) − 15°) × 1.5 — read off the
 * elbow-dependent world channel (aspect-corrected 2D only when world
 * landmarks are invalid), with no profile-specific validation. For
 * these types the whole stability axis is unassessable ('control'),
 * and the term stops generating corrective output (see the emit and
 * live-issue sites). Profiles whose control-type term is a different
 * construct — elbow-extension shortfall (front_raise,
 * seated_lateral_raise, reverse_fly), a deviation from a defined hold
 * position inside a rejection-gated band (lying_triceps_extension,
 * seated_triceps_extension), or absent entirely — were reviewed and
 * are NOT in this set; the doc's table states the deciding fact per
 * profile. */
const CONTROL_SUSPENDED_TYPES:ReadonlySet<string>=new Set(['hammer_curl','seated_curl','triceps_kickback']);
/** Channel suspensions (2026-11-09, Codex round-7 concurrence;
 * docs/channel-suspensions-2026-11-09.md; evidence:
 * accuracy-phase0/spillover-audit-report.md). The spillover audit
 * recomputed depth and trunk through the production path against
 * Heavy substitution and independent marks and convicted the
 * measurement CHANNELS behind these axes. The distinction Codex
 * required be recorded: hammer/front-raise TRUNK and front-raise
 * DEPTH carry DEMONSTRATED contamination — trunk's image shoulder/hip
 * tilt wanders ±8° with 30–53° spikes on marks-upright reps (Heavy
 * stays within 3.3° on identical footage) through a max-statistic no
 * production gate tests, and front-raise band assignment flips on
 * both valid in-band efforts, convicted in opposite directions by
 * independent anchors. Front-raise STABILITY is suspended
 * PROVISIONALLY: unresolved validity under demonstrated channel risk
 * — it consumes the same implicated world elbow channel and
 * substitution moves its output substantially (FR-C 48 vs 62), but no
 * marks-grade evidence convicts or clears the axis itself; this is
 * NOT a contamination verdict. All three axes are unassessable
 * ('channel'), a validity reason, so totals withhold and the axes
 * stop generating corrective output (see the emit and live-issue
 * sites). Scope: the suspensions apply to these movements'
 * assessments regardless of ladder rung — no shipped rung is
 * validated for these axes (the audit convicted the shipping Full
 * channel; Heavy is not shipped and is itself unvalidated for them).
 * Internal computation is unchanged throughout (band tallies keep
 * accumulating as diagnostics; XP is rep-derived; counting gates are
 * a separate, already-audited path the audit found no basis to
 * suspend). Restoration criteria are defined in the round doc,
 * before any repair results exist. */
const CHANNEL_SUSPENDED_AXES:ReadonlyMap<string,ReadonlySet<string>>=new Map([
  ['hammer_curl',new Set(['trunk'])],
  ['front_raise',new Set(['depth','stability','trunk'])],
]);
/** The stability value the speed/duration evidence alone supports —
 * the counterfactual the suspended types' issue derivation consults:
 * an unstable_movement correction is suppressed only when the suspended
 * control term is what pushed stability below the issue line (this
 * counterfactual at ≥70 while the printed breakdown is below it); a
 * shortfall the speed/duration terms produce on their own still
 * corrects, because that evidence was never suspended. */
const stabilityWithoutControl=(speed:number,duration:number):number=>cap(100-Math.max(0,speed-260)*.08-Math.max(0,.6-duration)*70);
/** Degraded framing (step 3, matrix cell 4): how long the required joints
 * may stay unevidenced — no successful measure() — before the session
 * enters the cannot-assess state: counting is already paused by the gate
 * interrupts themselves; the state makes that pause a named, visible
 * condition with reframe guidance instead of an endless tracking_lost.
 * 3000 ms sits above every transient the suite shows (freeze grace 2000 ms,
 * gate bursts ≈800 ms) and far below the suite's degraded clips, which
 * never measure at all. */
const CANNOT_ASSESS_AFTER_MS=3000;
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
 * `closed` reports the episode's interpolated entry/exit times and its sampled
 * extremum when the signal leaves the zone. */
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
    // The judged extremum is the SAMPLED extremum (counting-mechanism repair,
    // 2026-11-09; investigation Lead 2, implication 1). The parabola refinement
    // that used to raise this value above the deepest sample is unbounded:
    // near-collinear bracket samples make its vertex diverge, so gates judged
    // values no sample ever reached — refined raised extrema of 202° and, on
    // one garbage segment, 681°, against sampled maxima ≤180° — amplifying
    // channel noise exactly where the front-raise revocation line sits. A
    // revocation gate must judge a statistic that cannot exceed the sampled
    // evidence. Episode TIMING still refines sub-frame (the crossing-
    // interpolated start/end above, and with it the dwell validity); only the
    // judged value is bounded to the sampled range.
    const depthEst=tr.best;
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
type ExtendedType=NewExerciseType|'bench_press'|'reverse_fly'|'seated_triceps_extension'|'barbell_deadlift'|'incline_bench_press'|'seated_curl'|'seated_lateral_raise'|'lying_triceps_extension'|'one_arm_row'|'lying_leg_raise'|'upright_row'|'mountain_climber'|'split_squat'|'bench_dip';
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
  /** Set when a latched ready is lost to a tracking-loss interrupt (and
   * for trackers restored from a latched session): re-arming then
   * requires the REARM_MIN_SEGMENT_MS continuous hold. Form-rejection
   * re-arms never set it. */
  private strictRearm=false;
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
  private rowSides:[SideCycle,SideCycle]=[freshSideCycle(),freshSideCycle()];
  private raiseSides:[SideCycle,SideCycle]=[freshSideCycle(),freshSideCycle()];
  private raisePending:SideCompletion|null=null;
  private climberSides:[SideCycle,SideCycle]=[freshSideCycle(),freshSideCycle()];
  private squatSides:[SideCycle,SideCycle]=[freshSideCycle(),freshSideCycle()];
  /** Which side's split-squat cycle is currently being fed: the front side,
   * re-derived from stance geometry every frame; a mid-cycle flip voids the
   * abandoned side's half cycle rather than letting it complete as the other
   * leg's rep. */
  private squatFront:number|null=null;
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
  /** Step 3 (cell 4): when the current unmeasurable stretch began (the last
   * successfully measured frame's time, or the first failed frame's), and
   * whether it has lasted long enough to name the cannot-assess state. */
  private unmeasurableSince:number|null=null;
  private cannotAssess=false;
  /** Generic-path stability evidence, aggregated by sustainedPeak at completion. */
  private controlSamples:TimedValue[]=[];
  private speedSpans:TimedSpan[]=[];
  private upperArmDevAt:number|null=null;
  private upperArmClearAt:number|null=null;
  private freezeBridged=false;
  requiredIndices(raw:Point[]){return this.needed(raw)}
  constructor(readonly type:ExtendedType,targetReps=20,restored:Partial<ExerciseMetrics>={},readonly prefiltered=false,readonly armOnStart=false){
    const acc={...emptyFormBreakdown(),count:0,total:0,...restored.scoreAccumulator};
    // A tracker restored from a session that had already latched (or counted)
    // is in a re-arm context from birth: its next latch is a RE-arm.
    this.strictRearm=!!restored.poseFeedback?.calibrated||(restored.reps||0)>0;
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
    this.metrics.formBreakdown=b;this.metrics.axisAssessment=this.assessments();}
  /** The step-3 assessability map for the set as it stands (see
   * axisAssessment.ts for the contract). Static per movement, except the
   * hammer category (derived from the recorded peak-timing offsets) and
   * the cannot-assess override: a session that ends inside the degraded-framing
   * state without one scored rep presents every axis as unassessable —
   * scored reps keep the axes they honestly earned before the degradation.
   * Front-raise band tallies are still recorded per rep but, since the
   * channel suspensions, no longer derive a presented axis state. */
  private assessments():AxisAssessments{return this.assessmentsFor(this.metrics.scoreAccumulator);}
  /** The assessability map for a given accumulator (the emit sites consult
   * the post-increment accumulator to decide whether the rep's aggregate
   * may be presented — see totalWithheld). */
  private assessmentsFor(a:ScoreAccumulator):AxisAssessments{
    const out=allNumericAssessments();
    if(this.cannotAssess&&a.count===0){for(const k of axes)out[k]={kind:'unassessable',reason:'framing'};return out;}
    if(a.count===0)return out;
    if(CONTROL_SUSPENDED_TYPES.has(this.type)){
      // Axis-validity suspension (2026-11-09, Codex rounds 3–4): the
      // control term of these profiles' stability is read off the
      // elbow-dependent upper-arm angle — the world channel whose per-rep
      // noise the Phase-0 labels could not clear (HC-A stability read 15
      // against an 'adequate' label, and step 3's renormalization raised
      // its weight in the total). The whole stability axis is
      // unassessable here: the speed/duration remainder is not presented
      // as "stability" either. The internal breakdown keeps computing
      // exactly as before (XP is rep-derived and the internal formScore
      // is not a presentation); only the axis state — and through the
      // minimum-axis contract, the total — is withheld. A restored
      // pre-contract hammer set (it recorded symmetry values and no
      // offsets) keeps its historical numbers, as with symmetry below;
      // the other suspended types have no pre-contract marker and their
      // stored maps still win on the restore path, so this derivation
      // governs live and resumed sets.
      const preContract=this.type==='hammer_curl'&&!!(a.symmetryValues&&a.symmetryValues.length)&&!(a.symmetryOffsetsMs&&a.symmetryOffsetsMs.length);
      if(!preContract)out.stability={kind:'unassessable',reason:'control'};
    }
    // Channel suspensions (2026-11-09, Codex round-7; see
    // CHANNEL_SUSPENDED_AXES for the evidence and the recorded
    // distinction — trunk/depth: demonstrated contamination;
    // front-raise stability: provisional, unresolved validity under
    // demonstrated channel risk). Hammer's trunk follows the same
    // pre-contract carve-out as its stability: a restored pre-contract
    // set keeps its historical numbers as a set.
    const channelAxes=CHANNEL_SUSPENDED_AXES.get(this.type);
    if(channelAxes){
      const preContractHammer=this.type==='hammer_curl'&&!!(a.symmetryValues&&a.symmetryValues.length)&&!(a.symmetryOffsetsMs&&a.symmetryOffsetsMs.length);
      if(!preContractHammer)for(const k of axes)if(channelAxes.has(k))out[k]={kind:'unassessable',reason:'channel'};
    }
    if(this.type==='hammer_curl'){
      if(a.symmetryOffsetsMs&&a.symmetryOffsetsMs.length)out.symmetry={kind:'category',category:syncCategoryForOffset(medianOf(a.symmetryOffsetsMs))};
      else if(!(a.symmetryValues&&a.symmetryValues.length))out.symmetry={kind:'unassessable',reason:'no-bilateral-evidence'};
      // else: a restored pre-contract set — its median number stands.
    }else if(this.type==='front_raise'){
      out.symmetry={kind:'unassessable',reason:'view'};
      // Depth is channel-suspended above: the per-side band tallies
      // keep accumulating in emitFrontRaiseRep as diagnostics, but no
      // presented band is derived from them anymore.
    }else if(SINGLE_SIDE_TYPES.has(this.type)){
      out.symmetry={kind:'unassessable',reason:'single-side'};
    }
    return out;
  }
  /** Step 3 (cell 4): a frame that could not be measured extends the
   * current unmeasurable stretch; once it outlasts CANNOT_ASSESS_AFTER_MS
   * the session is in the cannot-assess state until a frame measures again.
   * Called by softInterrupt (every gate loss) and by formInterrupt only for
   * its cannot-confirm rejections — see there. */
  private noteUnmeasurable(now:number){
    if(this.unmeasurableSince===null)this.unmeasurableSince=this.last??now;
    if(now-this.unmeasurableSince>=CANNOT_ASSESS_AFTER_MS)this.cannotAssess=true;
  }
  private resetCycle(){this.peak=null;this.peakAt=null;this.returnAt=null;this.retSince=null;this.retAccum=0;this.retPrevAt=null;this.movingAt=null;this.cycleSide=null;this.scoring=true;this.speed=0;this.shift=0;this.controlPenalty=0;this.controlAt=null;this.hammerSides=[freshSideCycle(),freshSideCycle()];this.hammerPending=null;this.rowSides=[freshSideCycle(),freshSideCycle()];this.raiseSides=[freshSideCycle(),freshSideCycle()];this.raisePending=null;this.climberSides=[freshSideCycle(),freshSideCycle()];this.squatSides=[freshSideCycle(),freshSideCycle()];this.squatFront=null;this.lastPeak=[null,null];this.controlSamples=[];this.speedSpans=[];this.upperArmDevAt=null;this.upperArmClearAt=null;this.freezeBridged=false;}
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
  interrupt(reason='先停一下，继续时重新校准',feedback=reason,opts?:{preserveCalibration?:boolean;preserveReady?:boolean;preserveCycle?:boolean;preservePeerPeak?:boolean;preserveHammerCycle?:boolean}){
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
    // preserveHammerCycle (counting-mechanism repair, 2026-11-09; Lead 1,
    // implication 4): the hammer-curl side cycles, a pending completion and
    // the last-peak record survive a FORM rejection inside the same
    // CYCLE_PRESERVE_MS bound, so a frame judged invalid no longer voids a
    // nearly-complete cycle (see formInterrupt). Calibration and ready
    // semantics are untouched — recalibration is still required.
    // The cycles and any pending completion still reset exactly as before.
    const preserve=!!opts?.preserveCalibration;
    const bank=preserve?this.calibrationBank:0,segment=preserve?this.calibration:null,ready=preserve&&opts?.preserveReady?this.ready:false,baseline=preserve?this.baseline:null,progress=preserve?this.diagnostics.calibrationProgress:0;
    const keepCycle=!!opts?.preserveCycle;
    const raiseSides=keepCycle?this.raiseSides:null,raisePending=keepCycle?this.raisePending:null,lastPeak=keepCycle?this.lastPeak:null;
    const peerPeaks=opts?.preservePeerPeak?this.peerPeakSnapshot():null;
    const keepHammer=!!opts?.preserveHammerCycle;
    const hammerSides=keepHammer?this.hammerSides:null,hammerPending=keepHammer?this.hammerPending:null,hammerPeak=keepHammer?this.lastPeak:null;
    const wasReady=this.ready;
    this.frames=[];this.worlds=[];this.last=null;this.calibration=segment;this.calibrationBank=bank;this.baseline=baseline;this.ready=ready;this.side=null;this.times=[];this.previous=null;this.resetCycle();
    if(wasReady&&!ready&&!preserve)this.strictRearm=true;
    if(keepCycle&&raiseSides&&lastPeak){this.raiseSides=raiseSides;this.raisePending=raisePending;this.lastPeak=lastPeak;}
    if(keepHammer&&hammerSides&&hammerPeak){this.hammerSides=hammerSides;this.hammerPending=hammerPending;this.lastPeak=hammerPeak;}
    if(peerPeaks)this.lastPeak=peerPeaks;
    if(!keepCycle&&!peerPeaks&&!keepHammer)this.cycleHoleStart=null;
    this.diagnostics={...this.diagnostics,stage:'tracking_lost',fps:0,calibrationProgress:progress,lastResetReason:reason};
    this.metrics={...this.metrics,phase:'standing',feedback,poseFeedback:{...this.metrics.poseFeedback,status:'uncertain',calibrated:ready,message:feedback}};
    // Step 3: every metrics surface carries the current assessability map;
    // inside the cannot-assess state the interrupt's own message yields to
    // the state copy (one reframe cue, companion tone) and the diagnostics
    // stage names the state, so the pause is visible instead of silent.
    this.metrics.axisAssessment=this.assessments();
    if(this.cannotAssess){
      const copy=cannotAssessCopyFor(this.type);
      this.diagnostics={...this.diagnostics,stage:'cannot_assess'};
      this.metrics={...this.metrics,feedback:copy,poseFeedback:{...this.metrics.poseFeedback,message:copy}};
    }
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
    this.noteUnmeasurable(now);
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
    // Only cannot-confirm rejections （暂时无法…) are evidence loss: the
    // pose was seen and found unjudgeable. A rejection that names a visible
    // wrong posture （俯身/站姿不计入…) is the system seeing the user clearly
    // — it keeps its own specific copy forever and never trips the state.
    if(reason.startsWith('暂时无法'))this.noteUnmeasurable(now);
    if(!this.ready&&this.lastStartAt!==null&&now-this.lastStartAt>CALIBRATION_STALE_MS){this.calibrationBank=0;this.calibration=null;}
    // Hammer curls (counting-mechanism repair, 2026-11-09; Lead 1,
    // implication 4): a form rejection judges the current frame's posture,
    // and wiping the in-flight cycles on it was the shipped path's largest
    // single counting loss on HC-A (4 of 7 missed episodes died inside a
    // tilt-gate rejection). Inside the shared preservation bound — measured
    // from the last successfully measured frame on the same hole clock
    // softInterrupt uses — the side cycles, any pending completion and the
    // peak record survive; past the bound the rejection voids the cycles
    // exactly as before. Ready still drops: recalibration re-earns the
    // start hold before the preserved cycles can progress, and a preserved
    // cycle still needs valid measured frames to complete — preservation
    // fabricates nothing. Other movements keep the wipe: their form
    // rejections judge the pose family itself, and no traced loss indicts
    // them.
    let preserveHammerCycle=false;
    if(this.type==='hammer_curl'){
      if(this.cycleHoleStart===null)this.cycleHoleStart=this.last??now;
      preserveHammerCycle=now-this.cycleHoleStart<=CYCLE_PRESERVE_MS;
      if(!preserveHammerCycle)this.cycleHoleStart=null;
    }
    return this.interrupt(reason,reason,{preserveCalibration:true,preserveHammerCycle});
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
    if(this.type==='romanian_deadlift'||this.type==='glute_bridge'||this.type==='lying_leg_raise'){
      if(!this.side){const confidence=(s:Side)=>Math.min(...sideJoints(s).map(i=>raw[i]?.visibility||0));this.side=confidence('left')>=confidence('right')?'left':'right';}
      return sideJoints(this.side);
    }
    if(this.type==='standing_leg_curl')return [11,12,23,24,25,26,27,28];
    if(this.type==='one_arm_row')return [11,12,13,14,15,16,23,24,25,26];
    if(this.type==='mountain_climber')return [11,12,13,14,15,16,23,24,25,26,27,28];
    if(this.type==='split_squat')return [11,12,23,24,25,26,27,28,29,30,31,32];
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
    let legData:[LegSide,LegSide]|undefined;
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
    }else if(this.type==='one_arm_row'){
      // One-arm bent-over row (tier-1 expansion, 2026-11-08): the bent_over_row
      // pattern's gates applied to a single working arm — torso tilt 25–85°,
      // elbow start ≥145°, peak ≤100°, the same amplitude formula
      // ((160 − elbow)/90) and baseline-relative posture. Counting runs per
      // side in updateOneArmRow (the hammer-curl cycle machinery), so this
      // aggregate only serves calibration and diagnostics: start is the
      // working arm hanging free — the support arm rests on a bench or the
      // knee and is never required to extend — and peak marks the extended
      // side having pulled. No gate value is new; the per-side split is.
      if(tilt<25||tilt>85)return '请屈髋俯身并保持稳定，从斜侧面朝向工作侧拍摄；直立不计入';
      start=Math.max(...elbows)>=145;peak=Math.max(...elbows)<=100;measured=mean(elbows[0],elbows[1]);amplitude=cap((160-Math.max(...elbows))/90*100);symmetry=cap(100-Math.abs(elbows[0]-elbows[1])*1.5);posture=this.baseline?cap(100-Math.abs(tilt-this.baseline.tilt)*3):100;perSide=[elbows[0],elbows[1]];
      basis='俯身姿势＋单侧肘屈伸，逐侧计数';motion=`双肘 ${Math.round(elbows[0])}° / ${Math.round(elbows[1])}°；拉起 ≤100°，放回 ≥145°`;
    }else if(this.type==='lying_leg_raise'){
      // Lying leg raise (tier-2 expansion, exdb:0620): the glute-bridge
      // pattern (G) re-aimed at hip flexion — supine support points pinned
      // while the hip angle (shoulder–hip–knee) travels the cycle. Survey
      // draft thresholds: start hip ≥160° (legs flat), peak ≤100°. A sit-up
      // moves the shoulder support, so shoulder/hip drift against the
      // calibration baseline rejects it (the bridge's support-stability
      // check); bent vs straight knees share the same hip trace and are
      // deliberately not distinguished (the survey's non-exclusion note).
      const hips=[angle(a[11],a[23],a[25]),angle(a[12],a[24],a[26])],hinge=hips[o];
      if(tilt<45)return '请仰卧在凳面或地面、双腿伸直，摄像头降低并侧面拍摄；坐起或站立不计入';
      if(this.baseline&&[11+o,23+o].some(i=>dist(p[i],this.baseline!.points[i])>this.baseline!.torso*.14))return '肩部、髋部或画面移动，请恢复支撑后重新校准';
      start=hinge>=160;peak=hinge<=100;measured=hinge;amplitude=cap((170-hinge)/85*100);posture=this.baseline?cap(100-Math.abs(tilt-this.baseline.tilt)*3):100;symmetry=cap(100-Math.abs(hips[0]-hips[1])*1.5);
      basis='仰卧支撑稳定＋髋屈伸（肩–髋–膝）';motion=`髋角 ${Math.round(hinge)}°；放平 ≥160°，举至 ≤100°`;
    }else if(this.type==='upright_row'){
      // Upright row (tier-2 expansion, exdb:0437): two existing channels
      // combined — the curl family's bilateral elbow angle plus the press
      // family's hand-height channel ((shoulder − wrist) / torso). The pair
      // is what separates a row from a shrug, which moves neither channel.
      // Survey draft: start elbows ≥160° with the hands at/below the hip
      // line; peak elbows ≤80° AND both hands at/above the shoulder line.
      if(tilt>35)return '请直立站稳、双臂自然垂下；俯身或侧倾提拉不计入';
      const rise=[(p[11].y-p[15].y)/torso,(p[12].y-p[16].y)/torso];
      start=Math.min(...elbows)>=160&&[0,1].every(i=>p[15+i].y>=p[23+i].y-torso*.1);
      peak=Math.max(...elbows)<=80&&Math.min(...rise)>=0;
      measured=mean(elbows[0],elbows[1]);amplitude=cap((170-Math.max(...elbows))/90*100);symmetry=cap(100-Math.abs(elbows[0]-elbows[1])*1.5);
      basis='双肘屈伸＋双手相对肩高（双通道互证）';motion=`双肘 ${Math.round(elbows[0])}° / ${Math.round(elbows[1])}°，手高 ${Math.round(Math.min(...rise)*100)}% 躯干长；垂臂 ≥160°，提至肘 ≤80° 且手过肩线`;
      if(!start&&Math.max(...elbows)>140&&Math.min(...rise)>=-.9)hint='手再提起来一点，肘屈起来向外打开——只耸肩不算哦';
    }else if(this.type==='bench_dip'){
      // Bench dip (tier-2 expansion, exdb:0129): elbow angle plus shoulder
      // descent against the calibrated support pose. The two channels
      // cross-check: sitting down without bending the elbows earns no
      // flexion, and bending the elbows while propped up earns no descent.
      // Survey draft: start elbows ≥155° at support height; peak elbows
      // ≤105° with the shoulder midpoint dropped ≥ 0.12 torso lengths.
      const drop=this.baseline?(mean(p[11].y,p[12].y)-mean(this.baseline.points[11].y,this.baseline.points[12].y))/torso:0;
      start=Math.min(...elbows)>=155&&drop<=.04;
      peak=Math.max(...elbows)<=105&&!!this.baseline&&drop>=.12;
      measured=mean(elbows[0],elbows[1]);amplitude=cap((170-Math.max(...elbows))/80*100);symmetry=cap(100-Math.abs(elbows[0]-elbows[1])*1.5);posture=this.baseline?cap(100-Math.abs(tilt-this.baseline.tilt)*3):100;
      basis='双肘屈伸＋肩部下降位移（双通道互证）';motion=`双肘 ${Math.round(elbows[0])}° / ${Math.round(elbows[1])}°，肩降 ${Math.round(drop*100)}% 躯干长；伸臂 ≥155°，下沉肘 ≤105° 且肩降 ≥12%`;
    }else if(this.type==='mountain_climber'){
      // Mountain climber (tier-2 expansion, exdb:0630): the high-knees
      // alternation transplanted into a plank — the posture gate comes
      // first (torso near-horizontal, hands supporting), then per-side
      // hip+knee cycles run in updateMountainClimber. Survey draft:
      // extended side hip ≥150° and knee ≥150°; tucked side hip ≤100°
      // and knee ≤110°.
      if(tilt<55)return '请保持俯撑：双手撑地、身体成一条直线，斜侧面拍摄；站立抬腿不计入';
      const hips=[angle(a[11],a[23],a[25]),angle(a[12],a[24],a[26])];
      legData=[{hip:hips[0],knee:knees[0],proj:0},{hip:hips[1],knee:knees[1],proj:0}];
      start=legData.every(l=>l.hip>=150&&l.knee>=150);peak=legData.some(l=>l.hip<=100&&l.knee<=110);
      measured=mean(hips[0],hips[1]);amplitude=cap((170-Math.min(...hips))/85*100);posture=this.baseline?cap(100-Math.abs(tilt-this.baseline.tilt)*3):100;symmetry=cap(100-Math.abs(hips[0]-hips[1])*1.5);
      basis='俯撑姿态＋双腿交替髋膝回收';motion=`髋 ${Math.round(hips[0])}° / ${Math.round(hips[1])}°，膝 ${Math.round(knees[0])}° / ${Math.round(knees[1])}°；回收 髋 ≤100° 且膝 ≤110°，蹬回 ≥150°`;
    }else if(this.type==='split_squat'){
      // Split squat (tier-2 expansion, exdb:0410): the squat family's knee
      // cycle measured on the FRONT leg only (updateSplitSquat). Front and
      // rear come from stance geometry, not from motion: facing is the
      // feet's own heel→toe direction, the front ankle projects forward of
      // its hip along it, and the rear ankle projects backward (its foot
      // rests elevated behind). Thresholds are the squat family's own:
      // start knee ≥150°, peak ≤125°.
      const fx=mean(p[31].x-p[29].x,p[32].x-p[30].x),fy=mean(p[31].y-p[29].y,p[32].y-p[30].y),flen=Math.hypot(fx,fy)||1;
      legData=[0,1].map(i=>{const leg=Math.max(.05,dist(p[23+i],p[25+i])+dist(p[25+i],p[27+i]));return {hip:180,knee:knees[i],proj:((p[27+i].x-p[23+i].x)*fx+(p[27+i].y-p[23+i].y)*fy)/flen/leg};}) as [LegSide,LegSide];
      // Start and peak judge the FRONT knee only: the rear knee is
      // structurally bent in an elevated split stance (its shin rests back
      // on the bench), so requiring both knees straight would make the
      // start pose unreachable and calibration impossible.
      const frontKnee=knees[legData[0].proj>=legData[1].proj?0:1];
      start=frontKnee>=150;peak=frontKnee<=125;
      measured=frontKnee;amplitude=cap((170-measured)/80*100);symmetry=cap(100-Math.abs(knees[0]-knees[1])*1.5);
      basis='分腿站姿＋前腿膝屈伸（前/后由站姿几何判定）';motion=`双膝 ${Math.round(knees[0])}° / ${Math.round(knees[1])}°；站立 ≥150°，前腿下沉 ≤125°`;
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
    const scorable=confidence>=.7&&[11,12,23,24,...(this.type==='romanian_deadlift'||this.type==='glute_bridge'||this.type==='barbell_deadlift'||this.type==='lying_leg_raise'?[25,26,27,28]:[])].every(i=>(points[i].visibility??0)>=.7);
    return {start,peak,amplitude,angle:measured,confidence,scorable,posture,symmetry,controlPenalty,hint,side,basis,motion,points:p,torso,tilt,elbows:perSide,raiseSides:raiseData,legSides:legData,framing};
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
    // Step 3 (matrix cell 1): symmetry no longer takes a number. The Phase-0
    // replay showed the two elbow channels disagreeing by 15–35° on visibly
    // symmetric arms, so any peak-HEIGHT comparison (paired, peak-to-peak or
    // the instantaneous peakOther read) grades channel noise, not the user.
    // What the frontal view does evidence honestly is peak TIMING: this rep
    // records the offset between the two sides' confirmed peak midpoints —
    // from the pair itself, from the peer peak the round-3 machinery found,
    // or, for a single with neither, from the other side's most recent
    // confirmed peak wherever it sits (an alternating rep's honest record).
    // A rep whose other side has never peaked records nothing: no bilateral
    // evidence exists for it. The set presentation is the category of the
    // median offset (see assessments()); the offsets join the accumulator
    // exactly where symmetryValues used to, and symmetry leaves the total,
    // which renormalizes over depth/stability/trunk.
    const mid=(p:SideCompletion)=>(p.peakStart+p.peakEnd)/2;
    let offsetMs:number|null=null;
    if(pair)offsetMs=Math.abs(mid(parts[0])-mid(parts[1]));
    else if(peer)offsetMs=Math.abs(mid(parts[0])-peer.at);
    else{const lastOther=this.lastPeak[1-parts[0].side];if(lastOther)offsetMs=Math.abs(mid(parts[0])-lastOther.at);}
    const breakdown={depth,stability:cap(100-Math.max(0,speed-260)*.08-Math.max(0,.6-duration)*70-control),trunk:cap(posture-shift*1.5)};
    const score=Math.round((breakdown.depth*.35+breakdown.stability*.25+breakdown.trunk*.2)/.8),scored=parts.every(p=>p.scoring)&&f.scorable,issues:PoseIssue[]=[];
    // Suspended constructs stop correcting (2026-11-09, Codex round-4):
    // hammer's stability axis is suspended ('control'), so an
    // unstable_movement correction stands only when the speed/duration
    // evidence produces the shortfall without the control term — a
    // shortfall the suspended term manufactured is not corrected.
    // Channel suspension (Codex round-7): hammer's trunk axis is
    // suspended on demonstrated contamination, and posture − shift IS
    // the convicted read — there is no unsuspended remainder to run a
    // counterfactual over, so no body_alignment correction is derived
    // from it at all. The internal trunk value still computes (it
    // feeds the unprinted breakdown exactly as before).
    if(breakdown.depth<70)issues.push('insufficient_range');if(breakdown.stability<70&&stabilityWithoutControl(speed,duration)<70)issues.push('unstable_movement');
    const acc={...this.metrics.scoreAccumulator},counts={...this.metrics.correctionCounts};
    // Hammer curls record each scored rep's peak-timing offset: the set-level
    // symmetry presentation derives from their median (see assessments()).
    // This is the only emit path that records offsets, which is what scopes
    // the category to hammer curls. The numeric symmetry sum is no longer
    // maintained for new sets; restored pre-contract sets keep theirs.
    if(scored){acc.count++;acc.total+=score;acc.depth+=breakdown.depth;acc.stability+=breakdown.stability;acc.trunk+=breakdown.trunk;if(offsetMs!==null)acc.symmetryOffsetsMs=[...(acc.symmetryOffsetsMs??[]),Math.round(offsetMs)];issues.forEach(k=>counts[k]++);}
    // Minimum-axis contract (2026-11-09): the per-rep aggregate is a
    // total too — while the set's total is withheld it is computed
    // internally (formScore, perfectReps) but not printed, here or in
    // the set summary. Hammer's suspended stability axis withholds it.
    const withheld=scored&&totalWithheld(this.assessmentsFor(acc));
    this.metrics={...this.metrics,reps:this.metrics.reps+1,lastRepScore:scored?score:null,scoreAccumulator:acc,perfectReps:this.metrics.perfectReps+(scored&&score>=90?1:0),formScore:acc.count?Math.round(acc.total/acc.count):0,correctionCounts:counts,lastRepIssues:scored?issues:[],feedback:scored?(withheld?`好，第 ${this.metrics.reps+1} 次记下啦`:`好，第 ${this.metrics.reps+1} 次记下啦 · 本次 ${score} 分`):`好，第 ${this.metrics.reps+1} 次记下啦 · 这次没看清，不评分`};
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
      if(ev.closed?.valid){cyc.peakStart=ev.closed.start;cyc.peakEnd=ev.closed.end;cyc.peakElbow=80-ev.closed.depth;cyc.peakAmp=cap((160-cyc.peakElbow)/95*100);cyc.peakWindows.push({start:ev.closed.start,end:ev.closed.end});}
      // Return confirmation: accumulate the interpolated in-zone dwell (≥145°) inside
      // a 500 ms window, so elbow jitter cannot stall the rep and coarse sampling
      // cannot shrink a genuine dwell below the hold (see zonePortion).
      const portion=cyc.prevAt===null?{start:now,ms:0}:zonePortion(cyc.prevAngle,e,145,true,cyc.prevAt,now);
      let replaced=false;
      if(cyc.peakStart!==null&&portion.ms>0){
        if(cyc.returnSince===null||portion.start-cyc.returnSince>RETURN_WINDOW_MS){cyc.returnSince=portion.start;cyc.returnAccum=0;}
        cyc.returnAccum+=Math.min(RETURN_FRAME_CAP_MS,portion.ms);
        if(cyc.returnAccum>=RETURN_HOLD_MS){
          const done:SideCompletion={side:s,at:now,peakStart:cyc.peakStart,peakEnd:cyc.peakEnd,peakAmp:cyc.peakAmp,peakPosture:cyc.peakPosture,peakOther:cyc.peakOther,peakElbow:cyc.peakElbow,duration:(now-(cyc.movingAt??now))/1000,scoring:cyc.scoring,control:sustainedPeak(controlSpans(cyc.controlSamples,now),cyc.controlMax),shift:cyc.shiftMax,speed:sustainedPeak(cyc.speedSpans,cyc.speedMax),peakWindows:cyc.peakWindows,cycleStart:cyc.movingAt??cyc.peakStart,returnedAt:cyc.returnSince??now};
          this.lastPeak[s]={at:(done.peakStart+done.peakEnd)/2,value:done.peakElbow};
          this.hammerSides[s]=freshSideCycle();replaced=true;
          if(this.hammerPending){
            const pending=this.hammerPending;
            // Pair identity (counting-mechanism repair, 2026-11-09; Lead 1):
            // the test consults EVERY peak episode each cycle latched, not
            // only the window each cycle finally kept. On a fragmented
            // channel one side's plateau closes as several episodes and the
            // cycle keeps the last, so the two kept windows can sit ~330 ms
            // apart on one synchronous effort — the shipped split — while a
            // discarded fragment of the same plateau overlapped the
            // partner's window all along. The ±150 ms tolerance itself is
            // unchanged; what changed is which windows it compares.
            // A genuinely staggered effort — each side exactly one episode,
            // windows apart (the step-3 loose-sync and alternating
            // fixtures) — still fails every pairing and emits as singles.
            const overlap=done.peakWindows.some(w=>pending.peakWindows.some(p=>w.start<=p.end+150&&p.start<=w.end+150));
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
    // Suspended constructs stop correcting (2026-11-09, Codex round-4):
    // the live upper-arm hint and the control-derived live issue both
    // read the suspended control term, so neither surfaces for hammer
    // curls anymore. The hint machinery (upperArmHintVisible) stays for
    // the record; the internal penalty still feeds the (unprinted)
    // breakdown exactly as before. Channel suspension (Codex round-7):
    // the live posture issue read the same image tilt channel the
    // spillover audit convicted for the trunk axis — it no longer
    // surfaces either, so hammer curls currently raise no live
    // corrective issue; stage copy carries the surface.
    const message=stage==='complete'?'目标完成啦，漂亮':completed?this.metrics.feedback:nearPeak?'接近啦，再往上带一点点，到肩膀高再放回':copy[stage==='ready'?0:stage==='moving'?1:stage==='peak'?2:3]+(stage==='moving'?' · 继续，保持住':'');
    const issue:PoseIssue|null=null;
    this.diagnostics={...this.diagnostics,stage};
    this.metrics={...this.metrics,phase:f.start?'standing':anyPeak?'ascending':'descending',feedback:completed?this.metrics.feedback:message,poseFeedback:{status:!f.scorable?'uncertain':issue?'adjust':'stable',confidence:f.confidence,issues:issue?[issue]:[],primaryIssue:issue,affectedJoints:issue?poseIssueCopy(issue,this.type).joints:[],calibrated:true,message:issue?poseIssueCopy(issue,this.type).action:message}};
    return this.metrics;
  }
  private emitOneArmRowRep(done:SideCompletion,otherBase:number,f:Measurement):boolean{
    if(this.metrics.reps>=this.metrics.targetReps)return false;
    // The fourth axis of a unilateral row is support-side discipline (the
    // standing-leg-curl precedent: for a one-sided movement the non-working
    // side is what gets judged): how far the support elbow drifted from where
    // it rested when this rep left the start pose, at the symmetry slope used
    // throughout this file (1.5 points per degree). The support arm has no
    // absolute angle standard — bench support rests near 90°, knee support
    // higher, a straight support arm near 160° — so only its stillness is
    // scored, never its position.
    const symmetry=cap(100-Math.abs(done.peakOther-otherBase)*1.5);
    const breakdown={depth:done.peakAmp,stability:cap(100-Math.max(0,done.speed-260)*.08-Math.max(0,.6-done.duration)*70-done.control),trunk:cap(done.peakPosture-done.shift*1.5),symmetry};
    const score=Math.round(breakdown.depth*.35+breakdown.stability*.25+breakdown.trunk*.2+breakdown.symmetry*.2),scored=done.scoring&&f.scorable,issues:PoseIssue[]=[];
    if(breakdown.depth<70)issues.push('insufficient_range');if(breakdown.stability<70)issues.push('unstable_movement');if(breakdown.trunk<70)issues.push('body_alignment');if(breakdown.symmetry<70)issues.push('poor_coordination');
    const acc={...this.metrics.scoreAccumulator},counts={...this.metrics.correctionCounts};
    const key=done.side===0?'leftReps':'rightReps';acc[key]=(acc[key]||0)+1;
    if(scored){acc.count++;acc.total+=score;axes.forEach(k=>acc[k]+=breakdown[k]);issues.forEach(k=>counts[k]++);}
    this.metrics={...this.metrics,reps:this.metrics.reps+1,lastRepScore:scored?score:null,scoreAccumulator:acc,perfectReps:this.metrics.perfectReps+(scored&&score>=90?1:0),formScore:acc.count?Math.round(acc.total/acc.count):0,correctionCounts:counts,lastRepIssues:scored?issues:[],feedback:scored?`好，第 ${this.metrics.reps+1} 次记下啦 · 本次 ${score} 分`:`好，第 ${this.metrics.reps+1} 次记下啦 · 这次没看清，不评分`};
    this.updateAverage();
    return true;
  }
  /** One-arm rows count per side like hammer curls, minus the pairing: the two
   * sides are independent efforts (one works, one supports), so a completion
   * emits immediately — nothing ever merges, and a side that never leaves the
   * start pose (the support) can never produce a rep, while switching the
   * working side between reps needs no re-locking. The peak zone is the
   * bent_over_row peak (elbow ≤100°) carried on the depth signal 100 − elbow;
   * peak amplitude reuses that pattern's formula; the return gate is the
   * shared ≥145° accumulation. */
  private updateOneArmRow(f:Measurement,now:number):ExerciseMetrics{
    const elbows=f.elbows!;
    let completed=false;
    for(const s of [0,1] as const){
      const cyc=this.rowSides[s],e=elbows[s],other=elbows[1-s];
      const ev=feedPeakTrack(cyc.track,now,100-e);
      if(ev.best){cyc.peakPosture=f.posture;cyc.peakOther=other;}
      if(ev.closed?.valid){cyc.peakStart=ev.closed.start;cyc.peakEnd=ev.closed.end;cyc.peakElbow=100-ev.closed.depth;cyc.peakAmp=cap((160-cyc.peakElbow)/90*100);cyc.peakWindows.push({start:ev.closed.start,end:ev.closed.end});}
      const portion=cyc.prevAt===null?{start:now,ms:0}:zonePortion(cyc.prevAngle,e,145,true,cyc.prevAt,now);
      let replaced=false;
      if(cyc.peakStart!==null&&portion.ms>0){
        if(cyc.returnSince===null||portion.start-cyc.returnSince>RETURN_WINDOW_MS){cyc.returnSince=portion.start;cyc.returnAccum=0;}
        cyc.returnAccum+=Math.min(RETURN_FRAME_CAP_MS,portion.ms);
        if(cyc.returnAccum>=RETURN_HOLD_MS){
          const done:SideCompletion={side:s,at:now,peakStart:cyc.peakStart,peakEnd:cyc.peakEnd,peakAmp:cyc.peakAmp,peakPosture:cyc.peakPosture,peakOther:cyc.peakOther,peakElbow:cyc.peakElbow,duration:(now-(cyc.movingAt??now))/1000,scoring:cyc.scoring,control:sustainedPeak(controlSpans(cyc.controlSamples,now),cyc.controlMax),shift:cyc.shiftMax,speed:sustainedPeak(cyc.speedSpans,cyc.speedMax),peakWindows:cyc.peakWindows,cycleStart:cyc.movingAt??cyc.peakStart,returnedAt:cyc.returnSince??now};
          const otherBase=cyc.otherBase;
          this.rowSides[s]=freshSideCycle();replaced=true;
          if(this.emitOneArmRowRep(done,otherBase,f))completed=true;
        }
      }
      if(!replaced){
        if(e>=145){
          if(cyc.peakStart===null&&cyc.movingAt!==null){this.rowSides[s]=freshSideCycle();this.rowSides[s].otherBase=other;replaced=true;}
          // Idle at the start pose: keep refreshing the support arm's resting
          // angle, so otherBase names where the support rested just before the
          // rep departed — a support that starts drifting in the same smoothed
          // frames as the pull itself must not move its own reference.
          else if(cyc.peakStart===null&&cyc.movingAt===null)cyc.otherBase=other;
        }
        else{
          if(cyc.movingAt===null){cyc.movingAt=now;
            // No idle frame refreshed this cycle (a pull on the first frame
            // after calibration): fall back to the calibrated rest pose.
            if(cyc.otherBase===180&&this.baseline?.elbows)cyc.otherBase=this.baseline.elbows[1-s];}
          cyc.scoring=cyc.scoring&&f.scorable;
          cyc.controlMax=Math.max(cyc.controlMax,f.controlPenalty);
          cyc.controlSamples.push({t:now,v:f.controlPenalty});
          cyc.shiftMax=Math.max(cyc.shiftMax,Math.abs(f.tilt-this.baseline!.tilt));
          if(cyc.sampleAt===null){cyc.sampleAt=now;cyc.sampleAngle=e;}
          else if(now-cyc.sampleAt>=100){const v=Math.abs(e-cyc.sampleAngle)*1000/(now-cyc.sampleAt);cyc.speedMax=Math.max(cyc.speedMax,v);cyc.speedSpans.push({start:cyc.sampleAt,end:now,v});cyc.sampleAt=now;cyc.sampleAngle=e;}
        }
      }
      const cur=this.rowSides[s];
      cur.prevAt=now;cur.prevAngle=e;
      if(replaced){cur.track.prevAt=now;cur.track.prevDepth=100-e;}
    }
    const anyPeak=this.rowSides.some(c=>c.peakStart!==null||c.track.open);
    const stage=this.metrics.reps>=this.metrics.targetReps?'complete':anyPeak?(f.start?'returning':'peak'):f.start?'ready':'moving';
    const copy=definitions[this.type].stages;
    const nearPeak=stage==='moving'&&elbows.some(e=>e>100&&e<=125);
    const message=stage==='complete'?'目标完成啦，漂亮':completed?this.metrics.feedback:nearPeak?'接近啦，再往后拉一点点，肘贴近躯干再放回':copy[stage==='ready'?0:stage==='moving'?1:stage==='peak'?2:3]+(stage==='moving'?' · 继续，保持住':'');
    const issue:PoseIssue|null=f.posture<70?'body_alignment':null;
    this.diagnostics={...this.diagnostics,stage};
    this.metrics={...this.metrics,phase:f.start?'standing':anyPeak?'ascending':'descending',feedback:completed?this.metrics.feedback:message,poseFeedback:{status:!f.scorable?'uncertain':issue?'adjust':'stable',confidence:f.confidence,issues:issue?[issue]:[],primaryIssue:issue,affectedJoints:issue?poseIssueCopy(issue,this.type).joints:[],calibrated:true,message:issue?poseIssueCopy(issue,this.type).action:message}};
    return this.metrics;
  }
  private emitClimberRep(done:SideCompletion,f:Measurement):boolean{
    if(this.metrics.reps>=this.metrics.targetReps)return false;
    // Fourth axis （左右协调）: the other leg's discipline at this rep's peak —
    // it should be back at extension while this side drives (the one-arm-row
    // support-axis logic at this file's symmetry slope of 1.5 points/degree).
    const symmetry=cap(100-Math.max(0,150-done.peakOther)*1.5);
    // Stability deliberately drops the shared formula's duration term and
    // raises its speed threshold: this is a rhythm movement, so cadence is
    // the point rather than a fault. A drive sweeps the hip ≈70°; even at
    // two drives per second that averages ≈300°/s, so the elbow-scale
    // 260°/s threshold would tax every honest rep — 420°/s only taxes
    // flailing. (New-movement scoring definition, per the tier-2 survey:
    // slow countable reps are the acceptance line.)
    const breakdown={depth:done.peakAmp,stability:cap(100-Math.max(0,done.speed-420)*.08-done.control),trunk:cap(done.peakPosture-done.shift*1.5),symmetry};
    const score=Math.round(breakdown.depth*.35+breakdown.stability*.25+breakdown.trunk*.2+breakdown.symmetry*.2),scored=done.scoring&&f.scorable,issues:PoseIssue[]=[];
    if(breakdown.depth<70)issues.push('insufficient_range');if(breakdown.stability<70)issues.push('unstable_movement');if(breakdown.trunk<70)issues.push('body_alignment');if(breakdown.symmetry<70)issues.push('poor_coordination');
    const acc={...this.metrics.scoreAccumulator},counts={...this.metrics.correctionCounts};
    const key=done.side===0?'leftReps':'rightReps';acc[key]=(acc[key]||0)+1;
    if(scored){acc.count++;acc.total+=score;axes.forEach(k=>acc[k]+=breakdown[k]);issues.forEach(k=>counts[k]++);}
    this.metrics={...this.metrics,reps:this.metrics.reps+1,lastRepScore:scored?score:null,scoreAccumulator:acc,perfectReps:this.metrics.perfectReps+(scored&&score>=90?1:0),formScore:acc.count?Math.round(acc.total/acc.count):0,correctionCounts:counts,lastRepIssues:scored?issues:[],feedback:scored?`好，第 ${this.metrics.reps+1} 次记下啦 · 本次 ${score} 分`:`好，第 ${this.metrics.reps+1} 次记下啦 · 这次没看清，不评分`};
    this.updateAverage();
    return true;
  }
  /** Mountain climbers count per side like one-arm rows: each leg runs its own
   * extended (hip ≥150° and knee ≥150°) → tucked (hip ≤100° and knee ≤110°) →
   * extended cycle on the depth signal min(100 − hip, 110 − knee), and a
   * completion emits immediately for that side. One alternation rule from the
   * survey draft （左右交替）: a completion only counts when the OTHER side was
   * back at extension (hip ≥135°) at this side's peak — both legs tucked
   * together is a frog tuck, not a climber drive, and is discarded for both
   * sides alike. There is no pairing and no pending window. */
  private updateMountainClimber(f:Measurement,now:number):ExerciseMetrics{
    const legs=f.legSides!;
    let completed=false;
    for(const s of [0,1] as const){
      const cyc=this.climberSides[s],leg=legs[s],other=legs[1-s];
      const depth=Math.min(100-leg.hip,110-leg.knee);
      const ev=feedPeakTrack(cyc.track,now,depth);
      if(ev.best){cyc.peakPosture=f.posture;cyc.peakOther=other.hip;cyc.peakElbow=leg.hip;cyc.peakAmp=cap((170-leg.hip)/85*100);}
      if(ev.closed?.valid){cyc.peakStart=ev.closed.start;cyc.peakEnd=ev.closed.end;cyc.peakWindows.push({start:ev.closed.start,end:ev.closed.end});}
      const ext=Math.min(leg.hip-150,leg.knee-150);
      const portion=cyc.prevAt===null?{start:now,ms:0}:zonePortion(cyc.prevAngle,ext,0,true,cyc.prevAt,now);
      let replaced=false;
      if(cyc.peakStart!==null&&portion.ms>0){
        if(cyc.returnSince===null||portion.start-cyc.returnSince>RETURN_WINDOW_MS){cyc.returnSince=portion.start;cyc.returnAccum=0;}
        cyc.returnAccum+=Math.min(RETURN_FRAME_CAP_MS,portion.ms);
        if(cyc.returnAccum>=RETURN_HOLD_MS){
          const done:SideCompletion={side:s,at:now,peakStart:cyc.peakStart,peakEnd:cyc.peakEnd,peakAmp:cyc.peakAmp,peakPosture:cyc.peakPosture,peakOther:cyc.peakOther,peakElbow:cyc.peakElbow,duration:(now-(cyc.movingAt??now))/1000,scoring:cyc.scoring,control:sustainedPeak(controlSpans(cyc.controlSamples,now),cyc.controlMax),shift:cyc.shiftMax,speed:sustainedPeak(cyc.speedSpans,cyc.speedMax),peakWindows:cyc.peakWindows,cycleStart:cyc.movingAt??cyc.peakStart,returnedAt:cyc.returnSince??now};
          const alternated=done.peakOther>=135;
          this.climberSides[s]=freshSideCycle();replaced=true;
          if(alternated&&this.emitClimberRep(done,f))completed=true;
        }
      }
      if(!replaced){
        if(ext>=0){if(cyc.peakStart===null&&cyc.movingAt!==null){this.climberSides[s]=freshSideCycle();replaced=true;}}
        else{
          if(cyc.movingAt===null)cyc.movingAt=now;
          cyc.scoring=cyc.scoring&&f.scorable;
          cyc.controlMax=Math.max(cyc.controlMax,f.controlPenalty);
          cyc.controlSamples.push({t:now,v:f.controlPenalty});
          cyc.shiftMax=Math.max(cyc.shiftMax,Math.abs(f.tilt-this.baseline!.tilt));
          if(cyc.sampleAt===null){cyc.sampleAt=now;cyc.sampleAngle=leg.hip;}
          else if(now-cyc.sampleAt>=100){const v=Math.abs(leg.hip-cyc.sampleAngle)*1000/(now-cyc.sampleAt);cyc.speedMax=Math.max(cyc.speedMax,v);cyc.speedSpans.push({start:cyc.sampleAt,end:now,v});cyc.sampleAt=now;cyc.sampleAngle=leg.hip;}
        }
      }
      const cur=this.climberSides[s];
      cur.prevAt=now;cur.prevAngle=ext;
      if(replaced){cur.track.prevAt=now;cur.track.prevDepth=depth;}
    }
    const anyPeak=this.climberSides.some(c=>c.peakStart!==null||c.track.open);
    const stage=this.metrics.reps>=this.metrics.targetReps?'complete':anyPeak?(f.start?'returning':'peak'):f.start?'ready':'moving';
    const copy=definitions[this.type].stages;
    const nearTuck=stage==='moving'&&legs.some(l=>l.hip<=130&&l.knee<=135);
    const message=stage==='complete'?'目标完成啦，漂亮':completed?this.metrics.feedback:nearTuck?'接近啦，再往胸口收一点点':copy[stage==='ready'?0:stage==='moving'?1:stage==='peak'?2:3]+(stage==='moving'?' · 继续，保持住':'');
    const issue:PoseIssue|null=f.posture<70?'body_alignment':null;
    this.diagnostics={...this.diagnostics,stage};
    this.metrics={...this.metrics,phase:f.start?'standing':anyPeak?'ascending':'descending',feedback:completed?this.metrics.feedback:message,poseFeedback:{status:!f.scorable?'uncertain':issue?'adjust':'stable',confidence:f.confidence,issues:issue?[issue]:[],primaryIssue:issue,affectedJoints:issue?poseIssueCopy(issue,this.type).joints:[],calibrated:true,message:issue?poseIssueCopy(issue,this.type).action:message}};
    return this.metrics;
  }
  private emitSplitSquatRep(done:SideCompletion,rearDrift:number,f:Measurement):boolean{
    if(this.metrics.reps>=this.metrics.targetReps)return false;
    // Fourth axis （后脚稳定）: the rear foot rests planted on its bench for
    // the whole rep; how far its ankle wandered between this rep's departure
    // and its peak is the discipline being scored — the glute bridge's
    // support-drift definition (drift / torso × 200), applied to the rear
    // ankle instead of the support shoulder/ankle pair.
    const symmetry=cap(100-rearDrift/f.torso*200);
    const breakdown={depth:done.peakAmp,stability:cap(100-Math.max(0,done.speed-260)*.08-Math.max(0,.6-done.duration)*70-done.control),trunk:cap(done.peakPosture-done.shift*1.5),symmetry};
    const score=Math.round(breakdown.depth*.35+breakdown.stability*.25+breakdown.trunk*.2+breakdown.symmetry*.2),scored=done.scoring&&f.scorable,issues:PoseIssue[]=[];
    if(breakdown.depth<70)issues.push('insufficient_range');if(breakdown.stability<70)issues.push('unstable_movement');if(breakdown.trunk<70)issues.push('body_alignment');if(breakdown.symmetry<70)issues.push('poor_coordination');
    const acc={...this.metrics.scoreAccumulator},counts={...this.metrics.correctionCounts};
    const key=done.side===0?'leftReps':'rightReps';acc[key]=(acc[key]||0)+1;
    if(scored){acc.count++;acc.total+=score;axes.forEach(k=>acc[k]+=breakdown[k]);issues.forEach(k=>counts[k]++);}
    this.metrics={...this.metrics,reps:this.metrics.reps+1,lastRepScore:scored?score:null,scoreAccumulator:acc,perfectReps:this.metrics.perfectReps+(scored&&score>=90?1:0),formScore:acc.count?Math.round(acc.total/acc.count):0,correctionCounts:counts,lastRepIssues:scored?issues:[],feedback:scored?`好，第 ${this.metrics.reps+1} 次记下啦 · 本次 ${score} 分`:`好，第 ${this.metrics.reps+1} 次记下啦 · 这次没看清，不评分`};
    this.updateAverage();
    return true;
  }
  /** Split squats run the squat family's knee cycle on the front leg only.
   * Only the front side's cycle is fed; the rear side never accumulates a
   * cycle, so its (also flexing) knee can never produce a rep. The front
   * side is re-derived from stance geometry every frame (see measure), the
   * feet stay planted throughout a rep so the derivation is stable, and
   * swapping stance between reps simply feeds the other side's fresh cycle —
   * a mid-cycle flip voids the abandoned half cycle instead of completing
   * it as the wrong leg. */
  private updateSplitSquat(f:Measurement,now:number):ExerciseMetrics{
    const legs=f.legSides!;
    const front=(legs[0].proj>=legs[1].proj?0:1) as 0|1,rear=(1-front) as 0|1;
    if(this.squatFront!==null&&this.squatFront!==front)this.squatSides[this.squatFront]=freshSideCycle();
    this.squatFront=front;
    const cyc=this.squatSides[front],knee=legs[front].knee;
    let completed=false;
    const ev=feedPeakTrack(cyc.track,now,125-knee);
    if(ev.best){cyc.peakPosture=f.posture;cyc.supportPeak={...f.points[27+rear]};}
    if(ev.closed?.valid){cyc.peakStart=ev.closed.start;cyc.peakEnd=ev.closed.end;cyc.peakElbow=125-ev.closed.depth;cyc.peakAmp=cap((170-cyc.peakElbow)/80*100);cyc.peakWindows.push({start:ev.closed.start,end:ev.closed.end});}
    const portion=cyc.prevAt===null?{start:now,ms:0}:zonePortion(cyc.prevAngle,knee,150,true,cyc.prevAt,now);
    let replaced=false;
    if(cyc.peakStart!==null&&portion.ms>0){
      if(cyc.returnSince===null||portion.start-cyc.returnSince>RETURN_WINDOW_MS){cyc.returnSince=portion.start;cyc.returnAccum=0;}
      cyc.returnAccum+=Math.min(RETURN_FRAME_CAP_MS,portion.ms);
      if(cyc.returnAccum>=RETURN_HOLD_MS){
        const done:SideCompletion={side:front,at:now,peakStart:cyc.peakStart,peakEnd:cyc.peakEnd,peakAmp:cyc.peakAmp,peakPosture:cyc.peakPosture,peakOther:legs[rear].knee,peakElbow:cyc.peakElbow,duration:(now-(cyc.movingAt??now))/1000,scoring:cyc.scoring,control:sustainedPeak(controlSpans(cyc.controlSamples,now),cyc.controlMax),shift:cyc.shiftMax,speed:sustainedPeak(cyc.speedSpans,cyc.speedMax),peakWindows:cyc.peakWindows,cycleStart:cyc.movingAt??cyc.peakStart,returnedAt:cyc.returnSince??now};
        const drift=cyc.supportBase&&cyc.supportPeak?dist(cyc.supportPeak,cyc.supportBase):0;
        this.squatSides[front]=freshSideCycle();replaced=true;
        if(this.emitSplitSquatRep(done,drift,f))completed=true;
      }
    }
    if(!replaced){
      if(knee>=150){if(cyc.peakStart===null&&cyc.movingAt!==null){this.squatSides[front]=freshSideCycle();replaced=true;}}
      else{
        if(cyc.movingAt===null){cyc.movingAt=now;cyc.supportBase={...f.points[27+rear]};}
        cyc.scoring=cyc.scoring&&f.scorable;
        cyc.controlMax=Math.max(cyc.controlMax,f.controlPenalty);
        cyc.controlSamples.push({t:now,v:f.controlPenalty});
        cyc.shiftMax=Math.max(cyc.shiftMax,Math.abs(f.tilt-this.baseline!.tilt));
        if(cyc.sampleAt===null){cyc.sampleAt=now;cyc.sampleAngle=knee;}
        else if(now-cyc.sampleAt>=100){const v=Math.abs(knee-cyc.sampleAngle)*1000/(now-cyc.sampleAt);cyc.speedMax=Math.max(cyc.speedMax,v);cyc.speedSpans.push({start:cyc.sampleAt,end:now,v});cyc.sampleAt=now;cyc.sampleAngle=knee;}
      }
    }
    const cur=this.squatSides[front];
    cur.prevAt=now;cur.prevAngle=knee;
    if(replaced){cur.track.prevAt=now;cur.track.prevDepth=125-knee;}
    const anyPeak=cur.peakStart!==null||cur.track.open;
    const stage=this.metrics.reps>=this.metrics.targetReps?'complete':anyPeak?(f.start?'returning':'peak'):f.start?'ready':'moving';
    const copy=definitions[this.type].stages;
    const nearPeak=stage==='moving'&&knee<=145&&knee>125;
    const message=stage==='complete'?'目标完成啦，漂亮':completed?this.metrics.feedback:nearPeak?'接近啦，再往下沉一点点':copy[stage==='ready'?0:stage==='moving'?1:stage==='peak'?2:3]+(stage==='moving'?' · 继续，保持住':'');
    const issue:PoseIssue|null=f.posture<70?'body_alignment':null;
    this.diagnostics={...this.diagnostics,stage};
    this.metrics={...this.metrics,phase:f.start?'standing':anyPeak?'ascending':'descending',feedback:completed?this.metrics.feedback:message,poseFeedback:{status:!f.scorable?'uncertain':issue?'adjust':'stable',confidence:f.confidence,issues:issue?[issue]:[],primaryIssue:issue,affectedJoints:issue?poseIssueCopy(issue,this.type).joints:[],calibrated:true,message:issue?poseIssueCopy(issue,this.type).action:message}};
    return this.metrics;
  }
  private emitFrontRaiseRep(parts:SideCompletion[],f:Measurement,peer?:{at:number;value:number}):boolean{
    if(this.metrics.reps>=this.metrics.targetReps)return false;
    const pair=parts.length===2;
    const posture=pair?Math.min(parts[0].peakPosture,parts[1].peakPosture):parts[0].peakPosture;
    const control=Math.max(...parts.map(p=>p.control)),shift=Math.max(...parts.map(p=>p.shift)),speed=Math.max(...parts.map(p=>p.speed)),duration=Math.max(...parts.map(p=>p.duration));
    // Step 3 (matrix cell 2): front-raise depth and symmetry both leave the
    // numeric contract. Depth becomes a per-side band (未到肩高 / 到达肩高 /
    // 过顶） read off each side's confirmed peak raised angle — for front
    // raise peakElbow stores exactly that — because the degree channel
    // carries a systematic low bias (≈ −20° under a loose sleeve) that made
    // the /90 number grade the channel, not the raise. Symmetry is
    // unassessable frontally: the labels file marks only timing and
    // projected height observable, and the right channel's episodic
    // +15–50° over-read is a channel diagnostic, not a performance fact.
    // The total renormalizes over stability and trunk; per scored rep each
    // participating side's band joins the accumulator tallies.
    // Channel suspensions (2026-11-09, Codex round-7): the tallies are
    // now DIAGNOSTICS ONLY — the spillover audit convicted the band
    // assignment itself (both valid in-band efforts flip under
    // substitution, in opposite directions), so no band is presented
    // (see assessmentsFor). Trunk is suspended on demonstrated
    // contamination and stability provisionally, so neither derives a
    // correction here: trunk has no unsuspended remainder (posture −
    // shift IS the convicted read), and an unstable_movement
    // correction stands only when the speed/duration evidence produces
    // the shortfall without the elbow-channel control term — the same
    // counterfactual the hammer suspension applies.
    const breakdown={stability:cap(100-Math.max(0,speed-260)*.08-Math.max(0,.6-duration)*70-control),trunk:cap(posture-shift*1.5)};
    const score=Math.round((breakdown.stability*.25+breakdown.trunk*.2)/.45),scored=parts.every(p=>p.scoring)&&f.scorable,issues:PoseIssue[]=[];
    if(breakdown.stability<70&&stabilityWithoutControl(speed,duration)<70)issues.push('unstable_movement');
    const acc={...this.metrics.scoreAccumulator},counts={...this.metrics.correctionCounts};
    if(scored){acc.count++;acc.total+=score;acc.stability+=breakdown.stability;acc.trunk+=breakdown.trunk;
      const bands:DepthBandCounts={left:{...(acc.depthBandCounts?.left??{})},right:{...(acc.depthBandCounts?.right??{})}};
      for(const part of parts){const sideKey=part.side===0?'left':'right';const tally={...(bands[sideKey]??{})};const band=frontRaiseBandFor(part.peakElbow);tally[band]=(tally[band]||0)+1;bands[sideKey]=tally;}
      acc.depthBandCounts=bands;issues.forEach(k=>counts[k]++);}
    // Minimum-axis contract (2026-11-09, Codex round-4): in the round-5
    // window front raise's total was presented again (stability +
    // trunk numeric, depth as bands, symmetry by design). The channel
    // suspensions (Codex round-7) withhold it once more — depth,
    // stability and trunk are validity-suspended ('channel') — so the
    // per-rep aggregate follows the set total and does not print (see
    // emitHammerRep's note for the withheld case).
    const withheld=scored&&totalWithheld(this.assessmentsFor(acc));
    this.metrics={...this.metrics,reps:this.metrics.reps+1,lastRepScore:scored?score:null,scoreAccumulator:acc,perfectReps:this.metrics.perfectReps+(scored&&score>=90?1:0),formScore:acc.count?Math.round(acc.total/acc.count):0,correctionCounts:counts,lastRepIssues:scored?issues:[],feedback:scored?(withheld?`好，第 ${this.metrics.reps+1} 次记下啦`:`好，第 ${this.metrics.reps+1} 次记下啦 · 本次 ${score} 分`):`好，第 ${this.metrics.reps+1} 次记下啦 · 这次没看清，不评分`};
    this.updateAverage();
    return true;
  }
  /** A front-raise completion's arrival at the pending/merge machinery: it
   * pairs with a waiting opposite-side completion whose kept peak windows
   * overlap, otherwise it flushes the waiting one as a single and takes its
   * place. Shared by the return-confirmed path and the latch payout below,
   * so a paid-out latch is indistinguishable from a returned one downstream. */
  private arriveRaiseCompletion(done:SideCompletion,f:Measurement):boolean{
    let completed=false;
    if(this.raisePending){
      const pending=this.raisePending;
      const overlap=done.peakStart<=pending.peakEnd+150&&pending.peakStart<=done.peakEnd+150;
      if(pending.side!==done.side&&overlap){this.raisePending=null;if(this.emitFrontRaiseRep([pending,done],f))completed=true;}
      else{this.raisePending=null;if(this.emitFrontRaiseRep([pending],f,this.peerPeakFor(pending,this.raiseSides)))completed=true;this.raisePending=done;}
    }else this.raisePending=done;
    return completed;
  }
  /** Closes out a latched front-raise effort whose return never confirmed
   * because the NEXT effort's qualified peak superseded it (counting-
   * mechanism repair, 2026-11-09; investigation Lead 3b). The completion is
   * built from the latch and the stability evidence gathered up to the
   * descent's return-zone touch — the effort's own end — and arrives through
   * the same pending machinery as a return-confirmed completion, in order.
   * The cycle stays open for the superseding effort: its per-effort
   * stability evidence restarts here, so the superseded effort's peak and
   * descent samples cannot leak into the next rep's charge, while the
   * conservative whole-cycle flags (scoring, shift) keep accumulating and
   * the new effort's duration runs from the touch. */
  private payOutRaiseLatch(s:0|1,now:number,f:Measurement):boolean{
    const cyc=this.raiseSides[s];
    if(cyc.peakStart===null||cyc.returnTouchAt===null)return false;
    const touchAt=cyc.returnTouchAt;
    const controlSamples=cyc.controlSamples.filter(v=>v.t<=touchAt),speedSpans=cyc.speedSpans.filter(sp=>sp.start<=touchAt);
    const done:SideCompletion={side:s,at:now,peakStart:cyc.peakStart,peakEnd:cyc.peakEnd,peakAmp:cyc.peakAmp,peakPosture:cyc.peakPosture,peakOther:cyc.peakOther,peakElbow:cyc.peakElbow,duration:(touchAt-(cyc.movingAt??cyc.peakStart))/1000,scoring:cyc.scoring,control:sustainedPeak(controlSpans(controlSamples,touchAt),controlSamples.length?Math.max(...controlSamples.map(v=>v.v)):0),shift:cyc.shiftMax,speed:sustainedPeak(speedSpans,speedSpans.length?Math.max(...speedSpans.map(sp=>sp.v)):0),peakWindows:[{start:cyc.peakStart,end:cyc.peakEnd}],cycleStart:cyc.movingAt??cyc.peakStart,returnedAt:touchAt};
    this.lastPeak[s]={at:(done.peakStart+done.peakEnd)/2,value:done.peakElbow};
    cyc.controlSamples=[];cyc.speedSpans=[];cyc.controlMax=0;cyc.speedMax=0;cyc.sampleAt=null;
    cyc.movingAt=touchAt;
    return this.arriveRaiseCompletion(done,f);
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
        cyc.peakWindows.push({start:ev.closed.start,end:ev.closed.end});
        // Peak evidence is evaluated for EVERY closed episode and the verdict
        // recorded (counting-mechanism repair, 2026-11-09; investigation
        // Lead 3a): the overshoot branch used to run first and pre-empt
        // evaluation entirely, so an effort that tripped the band cap — the
        // bent 145° effort of the FR-C audit — left no evidence verdict at
        // all, its elbow axis unknowable by construction. Evaluation now
        // always runs and the verdict is carried on the cycle and mirrored
        // to diagnostics; the overshoot review below still decides the
        // effort's fate exactly as round 4 specified.
        const verdict=evaluatePeakEvidence(cyc.samples,cyc.track.bestAt,65+cyc.track.best);
        cyc.evidence=verdict;this.diagnostics={...this.diagnostics,lastPeakEvidence:verdict};
        // Overshoot review (round 4): a reliable segment whose extremum left
        // the band voids the whole raise — including a latch an earlier
        // segment of the same raise already earned (previously a saved
        // peakStart was never revoked by a later failing segment). The 115°
        // rule itself is unchanged.
        if(ext>115){cyc.overshoot=true;cyc.peakStart=null;}
        else if(!cyc.overshoot&&verdict==='qualified'){
          // A superseded latch is never silently overwritten (Lead 3b): when
          // the descent after the earlier latch reached the return zone, that
          // effort was a separate effort — it is closed out and paid in
          // order before the new latch takes the slot. Without the touch the
          // new peak is a continuation of the same effort and replaces its
          // latch, exactly as before.
          if(cyc.peakStart!==null&&cyc.returnTouched&&this.payOutRaiseLatch(s,now,f))completed=true;
          cyc.peakStart=ev.closed.start;cyc.peakEnd=ev.closed.end;cyc.peakElbow=ext;cyc.peakAmp=cap(ext/90*100);cyc.returnTouched=false;cyc.returnTouchAt=null;
        }
      }
      // Return confirmation accumulates the interpolated in-zone dwell (raised ≤25°)
      // inside a 500 ms window, like hammer curl's (see zonePortion).
      const portion=cyc.prevAt===null?{start:now,ms:0}:zonePortion(cyc.prevAngle,v,25,false,cyc.prevAt,now);
      let replaced=false;
      if(cyc.peakStart!==null&&portion.ms>0){
        // The descent entered the return zone after this latch (Lead 3b's
        // effort-separation fact): recorded even when the dwell falls short
        // of confirming the return, because a new qualified peak uses it to
        // decide whether the latch it supersedes was a separate effort.
        if(!cyc.returnTouched){cyc.returnTouched=true;cyc.returnTouchAt=portion.start;}
        if(cyc.returnSince===null||portion.start-cyc.returnSince>RETURN_WINDOW_MS){cyc.returnSince=portion.start;cyc.returnAccum=0;}
        cyc.returnAccum+=Math.min(RETURN_FRAME_CAP_MS,portion.ms);
        if(cyc.returnAccum>=RETURN_HOLD_MS){
          const done:SideCompletion={side:s,at:now,peakStart:cyc.peakStart,peakEnd:cyc.peakEnd,peakAmp:cyc.peakAmp,peakPosture:cyc.peakPosture,peakOther:cyc.peakOther,peakElbow:cyc.peakElbow,duration:(now-(cyc.movingAt??now))/1000,scoring:cyc.scoring,control:sustainedPeak(controlSpans(cyc.controlSamples,now),cyc.controlMax),shift:cyc.shiftMax,speed:sustainedPeak(cyc.speedSpans,cyc.speedMax),peakWindows:cyc.peakWindows,cycleStart:cyc.movingAt??cyc.peakStart,returnedAt:cyc.returnSince??now};
          this.lastPeak[s]={at:(done.peakStart+done.peakEnd)/2,value:done.peakElbow};
          this.raiseSides[s]=freshSideCycle();replaced=true;
          if(this.arriveRaiseCompletion(done,f))completed=true;
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
    // Channel suspension (2026-11-09, Codex round-7): the live posture
    // issue read the image tilt channel convicted for the trunk axis,
    // so front raise raises no live corrective issue either. The
    // blocker hints above are counting-gate guidance (direction /
    // peak-evidence state), a separate audited path — they stand.
    const issue:PoseIssue|null=null;
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
    // A measured frame ends any unmeasurable stretch and exits the
    // cannot-assess state; the assessability map refreshes with it.
    this.unmeasurableSince=null;
    if(this.cannotAssess){this.cannotAssess=false;this.metrics.axisAssessment=this.assessments();}
    const prevMeasuredAt=this.last;
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
      if(!f.start){if(this.calibration!==null){this.calibrationBank+=now-this.calibration;this.calibration=null;}this.baseline=null;}else{
        // Continuity is measured, not wall-clock: a measurement gap banks
        // the open segment and restarts it (see SEGMENT_GAP_MS).
        if(this.calibration!==null&&prevMeasuredAt!==null&&now-prevMeasuredAt>SEGMENT_GAP_MS){this.calibrationBank+=prevMeasuredAt-this.calibration;this.calibration=now;}
        if(this.calibration===null)this.calibration=now;this.baseline=f;const segment=now-this.calibration;if((!this.strictRearm||segment>=REARM_MIN_SEGMENT_MS)&&(this.armOnStart||this.calibrationBank+segment>=2000))this.ready=true;}
      // Progress reports distance to the latch: on a strict re-arm the
      // continuous hold is usually the binding requirement, so banked
      // fragments alone must not fill the ring (they cap at the current
      // segment's share of the hold).
      const segmentNow=this.calibration===null?0:now-this.calibration;
      let progress=this.ready?1:Math.min(1,(this.calibrationBank+segmentNow)/2000);
      if(this.strictRearm&&!this.ready)progress=this.armOnStart?Math.min(1,segmentNow/REARM_MIN_SEGMENT_MS):Math.min(progress,segmentNow/REARM_MIN_SEGMENT_MS);
      this.diagnostics={...this.diagnostics,stage:this.ready?'ready':'calibrating',calibrationProgress:progress};
      // Front raise must not surface its direction hint before calibration completes:
      // at rest the direction test is always false, so the hint kept ordering the user
      // to raise an arm — and raising it zeroed the calibration they were holding.
      // Round 4 (C-lite): what calibration CAN honestly surface is the framing
      // signal — a weak face margin on a non-start pose earns the 不足 copy
      // (COPY_FRAMING_WEAK); the start-pose progress copy remains the 满足
      // surface and the direction measure() strings the 无法确认 one. Pass
      // conditions are untouched.
      // No form cue before the set has latched — for ANY type, not just front
      // raise. measure()'s hint is a form judgment computed from an
      // uncalibrated pose (the 2026-11-09 walking recording showed hammer's
      // upper-arm hint, removed from the live path in round 5, still reaching
      // the screen through this branch during the FIND phase). The only
      // pre-latch exception stays front raise's framing-weak signal, which is
      // a framing fact, not a form judgment. Post-latch surfaces are untouched.
      const calibHint=this.type==='front_raise'&&!f.start&&f.framing==='weak'?COPY_FRAMING_WEAK:undefined;
      const message=this.ready?COPY_CALIBRATED:f.start?`就快好啦，保持起始姿势（${Math.round(progress*100)}%）`:calibHint||(this.armOnStart?'先回到起始姿势，陪我停两秒':'回到起始姿势，陪我停两秒');
      this.metrics={...this.metrics,feedback:message,poseFeedback:{...this.metrics.poseFeedback,status:'uncertain',calibrated:this.ready,confidence:f.confidence,message}};return this.metrics;
    }
    if(this.type==='hammer_curl')return this.updateHammerCurl(f,now);
    if(this.type==='front_raise')return this.updateFrontRaise(f,now);
    if(this.type==='one_arm_row')return this.updateOneArmRow(f,now);
    if(this.type==='mountain_climber')return this.updateMountainClimber(f,now);
    if(this.type==='split_squat')return this.updateSplitSquat(f,now);
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
          const sustainedSpeed=sustainedPeak(this.speedSpans,this.speed),sustainedControl=sustainedPeak(controlSpans(this.controlSamples,now),this.controlPenalty);
          const breakdown={depth:this.peak.amplitude,stability:cap(100-Math.max(0,sustainedSpeed-260)*.08-Math.max(0,.6-duration)*70-sustainedControl),trunk:cap(this.peak.posture-(this.type==='romanian_deadlift'||this.type==='glute_bridge'||this.type==='barbell_deadlift'?0:this.shift*1.5)),symmetry:this.peak.symmetry};
          // Step 3 (matrix cell 3): single-side movements emit no symmetry
          // number — the channel is not a bilateral judgment and the view
          // cannot evidence one — so the axis leaves the total, which
          // renormalizes over depth/stability/trunk, and no poor_coordination
          // correction is derived from it. Every other generic-path movement
          // keeps the four-axis total exactly as before.
          const singleSide=SINGLE_SIDE_TYPES.has(this.type);
          const score=singleSide?Math.round((breakdown.depth*.35+breakdown.stability*.25+breakdown.trunk*.2)/.8):Math.round(breakdown.depth*.35+breakdown.stability*.25+breakdown.trunk*.2+breakdown.symmetry*.2),scored=this.scoring&&f.scorable,issues:PoseIssue[]=[];
          // Suspended constructs stop correcting (2026-11-09, Codex
          // round-4): for the suspended types an unstable_movement
          // correction stands only when the speed/duration evidence
          // produces the shortfall without the control term.
          const stabilityIssue=breakdown.stability<70&&(!CONTROL_SUSPENDED_TYPES.has(this.type)||stabilityWithoutControl(sustainedSpeed,duration)<70);
          if(breakdown.depth<70)issues.push('insufficient_range');if(stabilityIssue)issues.push('unstable_movement');if(breakdown.trunk<70)issues.push('body_alignment');if(!singleSide&&breakdown.symmetry<70)issues.push('poor_coordination');
          const counts={...this.metrics.correctionCounts};if(scored){acc.count++;acc.total+=score;axes.forEach(k=>{if(singleSide&&k==='symmetry')return;acc[k]+=breakdown[k];});issues.forEach(k=>counts[k]++);}
          // Minimum-axis contract: the per-rep aggregate print follows
          // the set total — withheld while the set's total is withheld
          // (the suspended types), computed internally either way.
          const withheld=scored&&totalWithheld(this.assessmentsFor(acc));
          this.metrics={...this.metrics,reps:this.metrics.reps+1,lastRepScore:scored?score:null,scoreAccumulator:acc,perfectReps:this.metrics.perfectReps+(scored&&score>=90?1:0),formScore:acc.count?Math.round(acc.total/acc.count):0,correctionCounts:counts,lastRepIssues:scored?issues:[],feedback:scored?(withheld?`好，第 ${this.metrics.reps+1} 次记下啦`:`好，第 ${this.metrics.reps+1} 次记下啦 · 本次 ${score} 分`):`好，第 ${this.metrics.reps+1} 次记下啦 · 这次没看清，不评分`};this.updateAverage();completed=true;
        }this.resetCycle();
      }
    }else{this.returnAt=null;if(this.peak)this.retPrevAt=now;}
    const stage=this.metrics.reps>=this.metrics.targetReps?'complete':this.peak?(f.start?'returning':'peak'):f.start?'ready':'moving';
    const copy=definitions[this.type].stages,message=stage==='complete'?'目标完成啦，漂亮':f.hint||copy[stage==='ready'?0:stage==='moving'?1:stage==='peak'?2:3]+(stage==='moving'?' · 继续，保持住':'');
    // Suspended constructs stop correcting (2026-11-09, Codex round-4):
    // for the suspended types the live control-penalty branch no longer
    // raises unstable_movement; posture/symmetry derivations stand, and
    // non-suspended types keep the control branch exactly as before.
    const issue:PoseIssue|null=f.controlPenalty>30&&!CONTROL_SUSPENDED_TYPES.has(this.type)?'unstable_movement':f.posture<70?'body_alignment':!SINGLE_SIDE_TYPES.has(this.type)&&f.symmetry<70?'poor_coordination':null;
    this.diagnostics={...this.diagnostics,stage};this.metrics={...this.metrics,phase:f.start?'standing':this.peak?'ascending':'descending',feedback:completed?this.metrics.feedback:message,poseFeedback:{status:!f.scorable?'uncertain':issue?'adjust':'stable',confidence:f.confidence,issues:issue?[issue]:[],primaryIssue:issue,affectedJoints:issue?poseIssueCopy(issue,this.type).joints:[],calibrated:true,message:f.hint|| (issue?poseIssueCopy(issue,this.type).action:message)}};this.previous=f;return this.metrics;
  }
}
