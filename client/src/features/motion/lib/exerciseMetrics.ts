import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { FormBreakdown, PoseFeedback, PoseIssue, ScoreAccumulator, WorkoutMetrics, WorkoutPhase } from '../types'
import { exerciseInfo, type BaseCameraExerciseType as CameraExerciseType } from './exercises'
import { analyzeSquatFrame, squatJoints, squatSideVisible } from './squatMetrics'
import { detectPoseIssues, medianLandmarks, poseIssueCopy } from './poseFeedback'
import { emptyCorrectionCounts, emptyFormBreakdown } from './sessionMigration'
import { COPY_CALIBRATED, COPY_HALF_REP, COPY_UNCLEAR, COPY_WAIT_START, COPY_WAIT_START_PLANK, notSeenCopyFor } from './companionCopy'

export interface ExerciseMetrics extends WorkoutMetrics {
  scoreAccumulator: ScoreAccumulator
  poseFeedback: PoseFeedback
  formBreakdown: FormBreakdown
  correctionCounts: Record<PoseIssue, number>
  lastRepIssues: PoseIssue[]
  repeatedIssue: PoseIssue | null
}
type TrackingSide = 'left' | 'right'
type SquatMotion = {hipHeight:number;shoulderHeight:number;legLength:number;torso:number;footX:number;footY:number}
type Frame = { squatScorable?:boolean; start: boolean; peak: boolean; side?: TrackingSide; trackingSide?: TrackingSide; angle?: number; angleSource?:'world'|'image'; squatMotion?:SquatMotion; jack?:{spread:number;raised:boolean;lowered:boolean}; confidence: number; scores: FormBreakdown; score: number; issues: PoseIssue[] }
export interface RecognitionDiagnostics {
  fps: number
  confidence: number
  side: TrackingSide | null
  angle: number | null
  stage: 'calibrating' | 'ready' | 'moving' | 'peak' | 'returning' | 'tracking_lost' | 'cannot_assess' | 'complete'
  calibrationProgress: number
  pairedSides: TrackingSide[]
  lastResetReason: string | null
  basis?: string
  motion?: string
  /** Front raise only (2026-11-09): the most recent peak-evidence verdict,
   * recorded for every closed peak episode — including efforts the overshoot
   * review revokes, which previously left no verdict at all. */
  lastPeakEvidence?: 'qualified' | 'revoked' | 'insufficient'
}
const leftSide = [11,13,15,23,27], rightSide = [12,14,16,24,28]
const jointNames: Record<number,string> = {11:'左肩',12:'右肩',13:'左肘',14:'右肘',15:'左手腕',16:'右手腕',23:'左髋',24:'右髋',25:'左膝',26:'右膝',27:'左脚踝',28:'右脚踝'}
const sideConfidence = (points: NormalizedLandmark[], indices: number[]) => Math.min(...indices.map(i => points[i]?.visibility ?? 0))
function requiredJoints(type: CameraExerciseType, points: NormalizedLandmark[], side?: TrackingSide) {
  if(type === 'push_up') {
    const chosen = side || (visible(points,leftSide) && (!visible(points,rightSide) || sideConfidence(points,leftSide) >= sideConfidence(points,rightSide)) ? 'left' : 'right')
    return chosen === 'left' ? leftSide : rightSide
  }
  // Raised wrists can leave a laptop's frame while the upper arms remain visible.
  // Use a visible elbow only when that side's wrist is unavailable.
  return type === 'jumping_jack' ? [11,12,23,24,27,28,visible(points,[15])?15:visible(points,[13])?13:15,visible(points,[16])?16:visible(points,[14])?14:16] : [11,12,23,24,25,26,27,28]
}
function rejectedFrameReason(type: CameraExerciseType, points: NormalizedLandmark[], side?: TrackingSide) {
  const required = requiredJoints(type,points,side)
  const edge = required.find(i => points[i].x < .035 || points[i].x > .965 || points[i].y < .025 || points[i].y > .985)
  if(edge !== undefined) return `${jointNames[edge]}靠近画面边缘啦，往后退一点点`
  const hidden = required.find(i => (points[i].visibility ?? 0) < .55)
  if(hidden !== undefined) return `${jointNames[hidden]}有点看不清，换个角度或让光线亮一点`
  return '从侧面拍，让我看清你肩到脚踝的连线'
}
const clamp = (n: number) => Math.min(100, Math.max(0, n))
/** Fast-tempo cycle rules (2026-11-07, shared with extendedRecognition/planRecognition):
 * peaks latch on the first in-zone frame instead of dwelling for the hold time
 * (sampled dwell made fast reps uncountable), returns accumulate the hold inside a
 * 500 ms window instead of one unbroken hold, and a latched peak only completes when
 * the excursion lasted at least MIN_EXCURSION_MS so a brief peak blip counts nothing. */
const RETURN_WINDOW_MS=500,RETURN_FRAME_CAP_MS=100,MIN_EXCURSION_MS=250
const mean = (a: number, b: number) => (a + b) / 2
const angle = (a: NormalizedLandmark, b: NormalizedLandmark, c: NormalizedLandmark) => {
  let n = Math.abs((Math.atan2(a.y-b.y,a.x-b.x)-Math.atan2(c.y-b.y,c.x-b.x))*180/Math.PI)
  if (n > 180) n = 360-n
  return n
}
const distance = (a: Pick<NormalizedLandmark,'x'|'y'>, b: Pick<NormalizedLandmark,'x'|'y'>) => Math.hypot(a.x-b.x,a.y-b.y)
const weights = (s: FormBreakdown) => Math.round(s.depth*.35+s.stability*.25+s.trunk*.2+s.symmetry*.2)
const axes = ['depth','stability','trunk','symmetry'] as const
const visible = (points: NormalizedLandmark[], indices: number[]) => indices.every(i => {
  const p=points[i]; return p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 0) >= .55 && p.x >= .035 && p.x <= .965 && p.y >= .025 && p.y <= .985
})

/** Thresholds are local heuristics, independently tunable after real-camera calibration. */
export function analyzeExerciseFrame(type: CameraExerciseType, raw: NormalizedLandmark[], aspect = 1, trackingSide?: TrackingSide, world?:NormalizedLandmark[]|null, squatSide?:TrackingSide): Frame | null {
  if (raw.length < 29 || !Number.isFinite(aspect) || aspect <= 0) return null
  const required = squatSide ? [...squatJoints[squatSide]] : requiredJoints(type,raw,trackingSide)
  if(!visible(raw,required))return null
  if (type === 'squat') {
    const both = !squatSide || (squatSideVisible(raw,'left') && squatSideVisible(raw,'right'))
    const s=analyzeSquatFrame(raw,aspect,world,both?undefined:squatSide)
    if(!s)return null
    const p=raw.map(v=>({...v,x:v.x*aspect}))
    const offset=squatSide==='right'?1:0
    const joint=(i:number)=>squatSide?p[i+offset]:{x:mean(p[i].x,p[i+1].x),y:mean(p[i].y,p[i+1].y)}
    const shoulder=joint(11),hip=joint(23),foot=joint(27)
    const leg=(i:number)=>distance(p[23+i],p[25+i])+distance(p[25+i],p[27+i])
    const motion={hipHeight:foot.y-hip.y,shoulderHeight:foot.y-shoulder.y,legLength:squatSide?leg(offset):mean(leg(0),leg(1)),torso:distance(shoulder,hip),footX:foot.x,footY:foot.y}
    const primary=squatSide?analyzeSquatFrame(raw,aspect,world,squatSide):s
    if(!primary)return null
    const phase: WorkoutPhase = s.kneeAngle<=125?'bottom':s.kneeAngle>=150?'standing':'descending'
    return {start:s.kneeAngle>=150&&primary.kneeAngle>=150,peak:s.kneeAngle<=125&&primary.kneeAngle<=125,angle:s.kneeAngle,angleSource:primary.angleSource,squatMotion:motion,confidence:s.confidence,
      squatScorable:both&&s.confidence>=.7,
      scores:{depth:s.depthScore,stability:s.stabilityScore,trunk:s.trunkScore,symmetry:s.symmetryScore},score:s.formScore,issues:both?detectPoseIssues(s,phase,true).issues:[]}

  }
  const p=raw.map(v=>({...v,x:v.x*aspect}))
  const confidence=Math.min(...required.map(i=>raw[i].visibility))
  const hip={...p[23],x:mean(p[23].x,p[24].x),y:mean(p[23].y,p[24].y)}
  const shoulder={...p[11],x:mean(p[11].x,p[12].x),y:mean(p[11].y,p[12].y)}
  const width=Math.max(.04,distance(p[11],p[12]))
  const torso=Math.max(.05,distance(hip,shoulder))
  const upright=clamp(100-Math.max(0,Math.abs(shoulder.x-hip.x)/torso-.12)*150)
  let start=false,peak=false,side: Frame['side'],measuredAngle:number|undefined,jack:Frame['jack'],scores=emptyFormBreakdown()
  if(type==='jumping_jack') {
    const spread=Math.abs(p[27].x-p[28].x)/width
    const [l,r]=required.slice(-2),armRise=(shoulder.y-mean(p[l].y,p[r].y))/torso
    const raised=p[l].y<p[11].y-torso*.12&&p[r].y<p[12].y-torso*.12
    const lowered=p[l].y>p[11].y+torso*.2&&p[r].y>p[12].y+torso*.2
    jack={spread,raised,lowered}
    start=spread<=1.65&&lowered
    peak=spread>=1.4&&raised
    scores={depth:clamp(Math.min(spread/2.5,Math.max(0,armRise)/.65)*100),stability:clamp(100-Math.abs(p[27].y-p[28].y)/torso*150),trunk:upright,symmetry:clamp(100-(Math.abs(p[l].y-p[r].y)+Math.abs(Math.abs(p[27].x-hip.x)-Math.abs(p[28].x-hip.x)))/torso*120)}
  } else if(type==='high_knees') {
    const leg=Math.max(.08,mean(distance(p[23],p[27]),distance(p[24],p[28])))
    const left=(p[23].y-p[25].y)/leg,right=(p[24].y-p[26].y)/leg
    start=left<-.25 && right<-.25
    peak=Math.max(left,right)>=-.08 && Math.min(left,right)<-.25
    side=left>right?'left':'right'
    const support=side==='left'?28:27,supportHip=side==='left'?24:23
    scores={depth:clamp((Math.max(left,right)+.15)/.3*100),stability:clamp(100-Math.max(0,Math.abs(p[support].x-p[supportHip].x)/torso-.15)*150),trunk:upright,symmetry:clamp(100-Math.abs(p[11].y-p[12].y)/torso*200)}
  } else {
    const [s,e,w,h,a]=required
    const elbow=angle(p[s],p[e],p[w]),line=angle(p[s],p[h],p[a])
    measuredAngle=elbow
    // Reject standing bends: shoulder-to-ankle line must be predominantly horizontal.
    if(Math.abs(p[s].x-p[a].x)<Math.abs(p[s].y-p[a].y)*1.2)return null
    start=elbow>=158;peak=elbow<=102
    scores={depth:clamp((125-elbow)/35*100),stability:clamp(100-Math.max(0,Math.abs(p[s].x-p[w].x)/Math.max(.08,distance(p[s],p[w]))-.35)*100),trunk:clamp(100-Math.max(0,180-line-8)*3),symmetry:clamp(100-Math.max(0,Math.abs(p[e].y-mean(p[s].y,p[w].y))/Math.max(.08,distance(p[s],p[w]))-.3)*100)}
  }
  const issues:PoseIssue[]=[]
  if(peak && scores.depth<72)issues.push('insufficient_range')
  if(scores.stability<72)issues.push('unstable_movement')
  if(scores.trunk<70)issues.push('body_alignment')
  if(scores.symmetry<70)issues.push('poor_coordination')
  return {start,peak,side,jack,angle:measuredAngle,trackingSide:type==='push_up'?(required===leftSide?'left':'right'):undefined,confidence,scores,score:weights(scores),issues}
}

export class ExerciseTracker {
  metrics: ExerciseMetrics
  diagnostics: RecognitionDiagnostics = {fps:0,confidence:0,side:null,angle:null,stage:'calibrating',calibrationProgress:0,pairedSides:[],lastResetReason:null}
  private frames: NormalizedLandmark[][]=[]
  private calibrationAt: number|null=null
  private calibrated=false
  private armed=false
  private peakAt:number|null=null
  private peak:Frame|null=null
  private returnAt:number|null=null
  private movingAt:number|null=null
  private retAnchor:number|null=null
  private retAccum=0
  private retPrevAt:number|null=null
  private pair=new Map<string,Frame>()
  private issues=new Set<PoseIssue>()
  private consecutive:Partial<Record<PoseIssue,number>>={}
  private trackingSide: TrackingSide | undefined
  private lastFrameAt: number | null = null
  private frameTimes: number[] = []
  private freezeBridged=false
  private worldFrames:NormalizedLandmark[][]=[]
  private squatBaseline:SquatMotion|null=null
  private jackBaseline:number|null=null
  private armsAt:number|null=null
  private legsAt:number|null=null
  private motionAt:number|null=null
  private squatSide?:TrackingSide
  private squatCycle:{samples:number;invalid:boolean;totals:FormBreakdown;depth:number}|null=null
  private chooseSquatSide(raw:NormalizedLandmark[]):TrackingSide {
    if(this.squatSide)return this.squatSide
    const left=squatSideVisible(raw,'left'),right=squatSideVisible(raw,'right')
    if(!left&&right)return 'right'
    if(left&&right&&sideConfidence(raw,[...squatJoints.right])>sideConfidence(raw,[...squatJoints.left]))return 'right'
    return 'left'
  }
  requiredIndices(raw:NormalizedLandmark[]){
    return this.adaptiveSquat ? [...squatJoints[this.chooseSquatSide(raw)]] : requiredJoints(this.type,raw,this.trackingSide)
  }
  constructor(readonly type:CameraExerciseType, targetReps=20, restored:Partial<ExerciseMetrics>={},readonly prefiltered=false,readonly armOnStart=false,readonly adaptiveSquat=type==='squat'&&armOnStart) {
    const reps=Math.max(0,restored.reps||0),breakdown={...emptyFormBreakdown(),...restored.formBreakdown}
    const acc=restored.scoreAccumulator || {count:reps,total:(restored.formScore||0)*reps,...Object.fromEntries(axes.map(k=>[k,breakdown[k]*reps]))} as ScoreAccumulator
    this.metrics={...restored,reps,targetReps,formScore:acc.count?Math.round(acc.total/acc.count):0,perfectReps:restored.perfectReps||0,feedback:exerciseInfo(type).placement,phase:'standing',scoreAccumulator:{...acc},formBreakdown:breakdown,correctionCounts:{...emptyCorrectionCounts(),...restored.correctionCounts},lastRepIssues:[],repeatedIssue:null,poseFeedback:this.feedback(null,false)}
  }
  private feedback(frame:Frame|null, calibrated:boolean):PoseFeedback {
    const issues=frame?.issues||['out_of_frame'],primaryIssue=issues[0]||null
    return {status:!frame||!calibrated?'uncertain':primaryIssue?'adjust':'stable',confidence:frame?.confidence||0,issues,primaryIssue,affectedJoints:primaryIssue?poseIssueCopy(primaryIssue,this.type).joints:[],calibrated,message:!frame?exerciseInfo(this.type).placement:!calibrated?(this.type==='push_up'?COPY_WAIT_START_PLANK:COPY_WAIT_START):primaryIssue?poseIssueCopy(primaryIssue,this.type).action:'姿势稳定，保持这个节奏'}
  }
  interrupt(reason = '先停一下，继续时先回到起始姿势', feedback = reason) {
    this.frames=[];this.calibrationAt=null;this.calibrated=false;this.armed=false;this.peakAt=null;this.peak=null;this.returnAt=null;this.movingAt=null;this.retAnchor=null;this.retAccum=0;this.retPrevAt=null;this.pair.clear();this.issues.clear();this.consecutive={}
    this.trackingSide=undefined;this.lastFrameAt=null;this.frameTimes=[];this.freezeBridged=false
    this.worldFrames=[];this.squatSide=undefined;this.squatCycle=null;this.squatBaseline=null;this.jackBaseline=null;this.armsAt=null;this.legsAt=null;this.motionAt=null
    this.diagnostics={...this.diagnostics,fps:0,confidence:0,side:null,angle:null,stage:'tracking_lost',calibrationProgress:0,pairedSides:[],lastResetReason:reason}
    this.metrics={...this.metrics,phase:'standing',poseFeedback:{...this.feedback(null,false),message:feedback},feedback}
    return this.metrics
  }
  /** The adaptive wrapper deliberately held frames back (a ladder step-down
   * swapping the pose model — see AdaptiveRecognition.carryToRun); the next
   * frame gap is therefore known-benign and must not be read as a tracking
   * loss. Only arms when the pending gap actually exceeds the guard. Mirrors
   * ExtendedExerciseTracker.bridgeFreezeGap. */
  bridgeFreezeGap(now:number){if(this.lastFrameAt!==null&&now-this.lastFrameAt>750)this.freezeBridged=true;}
  update(raw:NormalizedLandmark[]|null,now:number,aspect=1,world:NormalizedLandmark[]|null=null):ExerciseMetrics {
    if(!raw)return this.interrupt('未检测到完整人体关键点',notSeenCopyFor(this.type))
    if(raw.length<29 || raw.some(p=>!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || (p.visibility!==undefined&&!Number.isFinite(p.visibility))) || !Number.isFinite(aspect) || aspect<=0 || !Number.isFinite(now))return this.interrupt('关键点数据不完整',COPY_UNCLEAR)
    if(this.lastFrameAt!==null && now<=this.lastFrameAt)return this.metrics
    if(this.lastFrameAt!==null && now-this.lastFrameAt>750){if(this.freezeBridged)this.freezeBridged=false;else this.interrupt('画面更新中断',COPY_HALF_REP);}
    this.lastFrameAt=now
    this.frameTimes=[...this.frameTimes,now].filter(time=>now-time<=2000).slice(-120)
    const elapsed=now-this.frameTimes[0]
    this.diagnostics={...this.diagnostics,fps:elapsed>0?Math.round((this.frameTimes.length-1)*1000/elapsed):0}
    // Severe loss must never be concealed by old, smoothed poses. Marginal noise
    // (.25–.55) is filtered first; sustained uncertainty still fails the median.
    const required=this.requiredIndices(raw)
    if(required.some(i=>(raw[i].visibility??0)<.25 || raw[i].x<0 || raw[i].x>1 || raw[i].y<0 || raw[i].y>1))return this.interrupt(rejectedFrameReason(this.type,raw,this.trackingSide))
    this.frames=[...this.frames,raw].slice(-(this.prefiltered?1:5))
    this.worldFrames=world&&world.length>=29&&world.every(p=>p&&[p.x,p.y,p.z].every(Number.isFinite))?[...this.worldFrames,world].slice(-(this.prefiltered?1:5)):[]
    const smoothedWorld=this.worldFrames.length?medianLandmarks(this.worldFrames):null
    const points=medianLandmarks(this.frames),frame=points?analyzeExerciseFrame(this.type,points,aspect,this.trackingSide,smoothedWorld,this.adaptiveSquat?this.chooseSquatSide(raw):undefined):null
    if(!frame)return this.interrupt(points?rejectedFrameReason(this.type,points,this.trackingSide):'我还在找你，站到画面里来')
    if(this.adaptiveSquat&&!this.squatSide&&frame.start)this.squatSide=this.chooseSquatSide(raw)
    if(this.type==='push_up' && !this.trackingSide && frame.start)this.trackingSide=frame.trackingSide
    this.diagnostics={...this.diagnostics,confidence:frame.confidence,side:this.squatSide||this.trackingSide||frame.trackingSide||null,angle:frame.angle??null}
    if(this.type==='squat'&&frame.squatMotion){
      const m=frame.squatMotion
      if(!this.calibrated&&frame.start){
        this.squatBaseline=this.squatBaseline?Object.fromEntries(Object.keys(m).map(k=>[k,.9*this.squatBaseline![k as keyof SquatMotion]+.1*m[k as keyof SquatMotion]])) as SquatMotion:{...m}
      }
      const b=this.squatBaseline,drop=b?(b.hipHeight-m.hipHeight)/Math.max(.08,b.legLength):0
      this.diagnostics={...this.diagnostics,basis:frame.angleSource==='world'?'三维膝角':'二维膝角＋髋部位移',motion:frame.angleSource==='world'?`膝角 ${Math.round(frame.angle??0)}°，下蹲 ≤125°／站起 ≥150°`:`髋部下降 ${Math.round(drop*100)}% 腿长，正面下降目标 ≥23%`}
      if(this.calibrated&&b){
        const scale=m.torso/Math.max(.04,b.torso),feetStable=Math.abs(m.footY-b.footY)<b.legLength*.15&&Math.abs(m.footX-b.footX)<b.legLength*.2
        if(frame.angleSource!=='world'){
          const shoulderDrop=(b.shoulderHeight-m.shoulderHeight)/Math.max(.08,b.legLength)
          const bodyPeak=drop>=.23&&shoulderDrop>=.12&&scale>=.72&&scale<=1.28&&feetStable
          frame.peak=frame.peak||bodyPeak
          frame.start=frame.start&&drop<=.10
          if(bodyPeak&&(frame.angle??180)>125){frame.scores={...frame.scores,depth:clamp((drop-.12)/.25*100)};frame.score=weights(frame.scores)}
        }else frame.peak=frame.peak&&feetStable
      }
    }
    if(this.type==='jumping_jack'&&frame.jack){
      const j=frame.jack
      if(!this.calibrated&&frame.start)this.jackBaseline=this.jackBaseline===null?j.spread:.9*this.jackBaseline+.1*j.spread
      const closed=this.jackBaseline??1,open=Math.max(1.4,closed+.4)
      this.diagnostics={...this.diagnostics,basis:'手臂抬起＋双脚开合',motion:`脚距 ${j.spread.toFixed(2)} 倍肩宽，展开目标 ${open.toFixed(2)}`}
      if(this.calibrated){
        frame.start=j.lowered&&j.spread<=closed+.2
        if(!frame.start){
          if(this.motionAt===null)this.motionAt=now
          if(j.raised)this.armsAt=now
          if(j.spread>=open)this.legsAt=now
        }
        frame.peak=!frame.start&&this.armsAt!==null&&this.legsAt!==null&&now-this.armsAt<=700&&now-this.legsAt<=700
        if(frame.start&&!this.peak){this.armsAt=null;this.legsAt=null;this.motionAt=null}
        if(frame.start&&this.peak&&this.motionAt!==null&&now-this.motionAt<250){this.peak=null;this.peakAt=null;this.returnAt=null;this.armsAt=null;this.legsAt=null;this.motionAt=null}
      }
    }
    if(!this.calibrated) {
      if(!frame.start)this.calibrationAt=null
      else {
        this.calibrationAt ??= now
        if(this.armOnStart||now-this.calibrationAt>=2000){this.calibrated=true;this.armed=true}
      }
      const feedback=this.feedback(frame,this.calibrated)
      const progress=this.calibrated?1:this.calibrationAt===null?0:Math.min(1,(now-this.calibrationAt)/2000)
      this.diagnostics={...this.diagnostics,stage:this.calibrated?'ready':'calibrating',calibrationProgress:progress}
      const message=this.calibrated?COPY_CALIBRATED:frame.start?`${feedback.message}（${Math.round(progress*100)}%）`:this.type==='push_up'?'先摆好伸臂支撑，我在等你':'先站回自然站姿，陪我停两秒'
      this.metrics={...this.metrics,poseFeedback:feedback,feedback:message};return this.metrics
    }
    const feedback=this.feedback(frame,true)
    let phase:WorkoutPhase=frame.start?'standing':this.peak?'ascending':'descending'
    if(!frame.start){if(this.movingAt===null)this.movingAt=now}
    else if(!this.peak)this.movingAt=null
    if(this.armed && frame.peak) {
      phase='bottom'
      if(this.peakAt===null)this.peakAt=now
      if(!this.peak || frame.score>=this.peak.score)this.peak=frame
    } else this.peakAt=null
    if(this.armed && !frame.start)frame.issues.forEach(i=>this.issues.add(i))
    if(this.adaptiveSquat&&(!frame.start||this.peak)){
      const cycle=this.squatCycle??={samples:0,invalid:false,totals:emptyFormBreakdown(),depth:0}
      if(!frame.squatScorable)cycle.invalid=true
      else{
        cycle.samples++
        for(const key of axes)cycle.totals[key]+=frame.scores[key]
        if(this.peak&&frame.peak)cycle.depth=Math.max(cycle.depth,frame.scores.depth)
      }
    }else if(this.adaptiveSquat)this.squatCycle=null
    let completedRep=false
    let unscored=false
    if(this.peak && frame.start) {
      if(this.returnAt===null)this.returnAt=now
      if(this.retAnchor===null||now-this.retAnchor>RETURN_WINDOW_MS){this.retAnchor=now;this.retAccum=this.retPrevAt!==null?Math.min(RETURN_FRAME_CAP_MS,now-this.retPrevAt)/2:0}
      else if(this.retPrevAt!==null)this.retAccum+=Math.min(RETURN_FRAME_CAP_MS,now-this.retPrevAt)
      this.retPrevAt=now
      if(this.retAccum>=(this.type==='jumping_jack'?60:150)) {
        if(this.returnAt-(this.movingAt??this.returnAt)>=MIN_EXCURSION_MS) {
        let completed:Frame|null=this.peak
        if(this.type==='high_knees') {
          this.pair.set(this.peak.side!,this.peak)
          if(this.pair.size===2) {
            const [l,r]=[this.pair.get('left')!,this.pair.get('right')!]
            const scores={...l.scores};axes.forEach(k=>scores[k]=mean(l.scores[k],r.scores[k]));scores.symmetry=clamp(scores.symmetry-Math.abs(l.scores.depth-r.scores.depth)*.5)
            completed={...l,scores,score:weights(scores)};this.pair.clear()
          } else completed=null
        }
        if(completed&&this.adaptiveSquat&&this.metrics.reps<this.metrics.targetReps){
          const cycle=this.squatCycle
          if(!cycle||cycle.invalid||!cycle.samples){
            this.metrics={...this.metrics,reps:this.metrics.reps+1,lastRepScore:null,lastRepIssues:[],repeatedIssue:null}
            completed=null
            completedRep=true
            unscored=true
            this.issues.clear()
          }else{
            const scores={...cycle.totals}
            for(const key of axes)scores[key]/=cycle.samples
            scores.depth=cycle.depth
            completed={...completed,scores,score:weights(scores)}
          }
          this.squatCycle=null
        }
        if(completed && this.metrics.reps<this.metrics.targetReps) {
          const acc={...this.metrics.scoreAccumulator,count:this.metrics.scoreAccumulator.count+1,total:this.metrics.scoreAccumulator.total+completed.score}
          axes.forEach(k=>acc[k]+=completed.scores[k])
          const breakdown={...emptyFormBreakdown()};axes.forEach(k=>breakdown[k]=Math.round(acc[k]/acc.count))
          const repIssues=[...new Set([...this.issues,...completed.issues])],counts={...this.metrics.correctionCounts}
          let repeated:PoseIssue|null=null
          for(const i of Object.keys(counts) as PoseIssue[]){if(repIssues.includes(i))counts[i]++;this.consecutive[i]=repIssues.includes(i)?(this.consecutive[i]||0)+1:0;if((this.consecutive[i]||0)>=2)repeated=i}
          this.metrics={...this.metrics,reps:this.metrics.reps+1,formScore:Math.round(acc.total/acc.count),perfectReps:this.metrics.perfectReps+(completed.score>=90?1:0),scoreAccumulator:acc,formBreakdown:breakdown,...(this.adaptiveSquat?{lastRepScore:completed.score}:{}),correctionCounts:counts,lastRepIssues:repIssues,repeatedIssue:repeated}
          completedRep=true
          this.issues.clear()
        }
        }
        this.peak=null;this.peakAt=null;this.returnAt=null;this.retAnchor=null;this.retAccum=0;this.retPrevAt=null
        this.trackingSide=undefined
        this.armsAt=null;this.legsAt=null;this.motionAt=null
      }
    } else {this.returnAt=null;if(this.peak)this.retPrevAt=now}
    const stage=this.metrics.reps>=this.metrics.targetReps?'complete':this.peak?(frame.start?'returning':'peak'):frame.peak?'peak':frame.start?'ready':'moving'
    this.diagnostics={...this.diagnostics,stage,pairedSides:[...this.pair.keys()] as TrackingSide[],calibrationProgress:1}
    const instructions = {
      squat: {ready:'站好啦，开始下蹲',moving:'再往下一点点，你可以的',peak:'到位啦——慢慢站起来',returning:'好，站稳，我确认一下'},
      jumping_jack: {ready:'合拢站好，我们开始',moving:'一起展开，双手抬过肩',peak:'展开到位——合拢回来',returning:'好，合拢站稳，我确认一下'},
      high_knees: {ready:'站好啦，交替抬腿',moving:'再抬高一点点，你可以的',peak:'到位——落下，换另一侧',returning:'好，落稳，我确认一下'},
      push_up: {ready:'支撑好啦，开始下降',moving:'再往下一点点，你可以的',peak:'到位啦——推起来，回到支撑',returning:'好，撑稳，我确认一下'},
    }[this.type]
    const pairMessage=this.type==='high_knees'&&frame.start&&this.pair.size===1?`已完成${this.pair.has('left')?'左':'右'}侧，再来${this.pair.has('left')?'右':'左'}侧，凑成一组`:null
    const message=stage==='complete'?'目标完成啦，漂亮':unscored?'记下啦 · 两侧没看全，这次不评分':completedRep?`好，第 ${this.metrics.reps} ${exerciseInfo(this.type).unit}，记下啦`:frame.peak&&!this.peak?(this.type==='jumping_jack'?'节奏就这样，保持住':'到位啦，稳住，我确认一下'):pairMessage||instructions[stage as keyof typeof instructions]
    this.metrics={...this.metrics,phase,poseFeedback:feedback,feedback:message}
    return this.metrics
  }
}

/** Explicit synthetic demonstration; never used as proof of real-camera accuracy. */
export function demonstrationPose(type:CameraExerciseType,stage:'neutral'|'peak'|'left'|'right'):NormalizedLandmark[] {
  const p:NormalizedLandmark[]=Array.from({length:33},()=>({x:.5,y:.2,z:0,visibility:1}))
  const set=(i:number,x:number,y:number)=>{p[i]={x,y,z:0,visibility:1}}
  for(const [i,x,y] of [[11,.4,.3],[12,.6,.3],[13,.38,.45],[14,.62,.45],[15,.38,.65],[16,.62,.65],[23,.43,.55],[24,.57,.55],[25,.43,.72],[26,.57,.72],[27,.43,.9],[28,.57,.9]])set(i,x,y)
  if(stage==='neutral') {
    if(type!=='push_up')return p
  } else if(type==='squat') {
    set(11,.4,.43);set(12,.6,.43);set(23,.43,.7);set(24,.57,.7);set(25,.28,.7);set(26,.72,.7);set(27,.28,.9);set(28,.72,.9)
  } else if(type==='jumping_jack') {
    set(13,.3,.22);set(14,.7,.22);set(15,.22,.1);set(16,.78,.1);set(27,.22,.9);set(28,.78,.9)
  } else if(type==='high_knees') {
    const left=stage!=='right';set(left?25:26,left ? .43 : .57,.45);set(left?27:28,left ? .43 : .57,.6)
  }
  if(type==='push_up') {
    const down=stage!=='neutral'
    for(const o of [0,1]){set(11+o,.25,down ? .45 : .3);set(13+o,down ? .36 : .25,down ? .51 : .45);set(15+o,.25,.6);set(23+o,.55,down ? .47 : .4);set(27+o,.85,down ? .49 : .5)}
  }
  return p
}
