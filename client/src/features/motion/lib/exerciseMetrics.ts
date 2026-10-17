import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { FormBreakdown, PoseFeedback, PoseIssue, ScoreAccumulator, WorkoutMetrics, WorkoutPhase } from '../types'
import { exerciseInfo, type CameraExerciseType } from './exercises'
import { analyzeSquatFrame } from './squatMetrics'
import { detectPoseIssues, medianLandmarks, POSE_ISSUE_COPY } from './poseFeedback'
import { emptyCorrectionCounts, emptyFormBreakdown } from './sessionMigration'

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
type Frame = { start: boolean; peak: boolean; side?: TrackingSide; trackingSide?: TrackingSide; angle?: number; angleSource?:'world'|'image'; squatMotion?:SquatMotion; jack?:{spread:number;raised:boolean;lowered:boolean}; confidence: number; scores: FormBreakdown; score: number; issues: PoseIssue[] }
export interface RecognitionDiagnostics {
  fps: number
  confidence: number
  side: TrackingSide | null
  angle: number | null
  stage: 'calibrating' | 'ready' | 'moving' | 'peak' | 'returning' | 'tracking_lost' | 'complete'
  calibrationProgress: number
  pairedSides: TrackingSide[]
  lastResetReason: string | null
  basis?: string
  motion?: string
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
  if(edge !== undefined) return `${jointNames[edge]}靠近或超出画面边缘，请调整距离`
  const hidden = required.find(i => (points[i].visibility ?? 0) < .55)
  if(hidden !== undefined) return `${jointNames[hidden]}不够清晰，请调整光线或拍摄角度`
  return '请从侧面拍摄伸臂支撑，让肩到脚踝的身体连线清晰可见'
}
const clamp = (n: number) => Math.min(100, Math.max(0, n))
const mean = (a: number, b: number) => (a + b) / 2
const angle = (a: NormalizedLandmark, b: NormalizedLandmark, c: NormalizedLandmark) => {
  let n = Math.abs((Math.atan2(a.y-b.y,a.x-b.x)-Math.atan2(c.y-b.y,c.x-b.x))*180/Math.PI)
  if (n > 180) n = 360-n
  return n
}
const distance = (a: NormalizedLandmark, b: NormalizedLandmark) => Math.hypot(a.x-b.x,a.y-b.y)
const weights = (s: FormBreakdown) => Math.round(s.depth*.35+s.stability*.25+s.trunk*.2+s.symmetry*.2)
const axes = ['depth','stability','trunk','symmetry'] as const
const visible = (points: NormalizedLandmark[], indices: number[]) => indices.every(i => {
  const p=points[i]; return p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 0) >= .55 && p.x >= .035 && p.x <= .965 && p.y >= .025 && p.y <= .985
})

/** Thresholds are local heuristics, independently tunable after real-camera calibration. */
export function analyzeExerciseFrame(type: CameraExerciseType, raw: NormalizedLandmark[], aspect = 1, trackingSide?: TrackingSide, world?:NormalizedLandmark[]|null): Frame | null {
  if (raw.length < 29 || !Number.isFinite(aspect) || aspect <= 0) return null
  const required = requiredJoints(type,raw,trackingSide)
  if(!visible(raw,required))return null
  if (type === 'squat') {
    const s=analyzeSquatFrame(raw,aspect,world); if(!s)return null
    const p=raw.map(v=>({...v,x:v.x*aspect})),footY=mean(p[27].y,p[28].y)
    const motion={hipHeight:footY-mean(p[23].y,p[24].y),shoulderHeight:footY-mean(p[11].y,p[12].y),legLength:mean(distance(p[23],p[25])+distance(p[25],p[27]),distance(p[24],p[26])+distance(p[26],p[28])),torso:distance({...p[11],x:mean(p[11].x,p[12].x),y:mean(p[11].y,p[12].y)},{...p[23],x:mean(p[23].x,p[24].x),y:mean(p[23].y,p[24].y)}),footX:mean(p[27].x,p[28].x),footY}
    const phase: WorkoutPhase = s.kneeAngle<=125?'bottom':s.kneeAngle>=150?'standing':'descending'
    return { start:s.kneeAngle>=150,peak:s.kneeAngle<=125,angle:s.kneeAngle,angleSource:s.angleSource,squatMotion:motion,confidence:s.confidence,
      scores:{depth:s.depthScore,stability:s.stabilityScore,trunk:s.trunkScore,symmetry:s.symmetryScore},score:s.formScore,issues:detectPoseIssues(s,phase,true).issues }
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
  private pair=new Map<string,Frame>()
  private issues=new Set<PoseIssue>()
  private consecutive:Partial<Record<PoseIssue,number>>={}
  private trackingSide: TrackingSide | undefined
  private lastFrameAt: number | null = null
  private frameTimes: number[] = []
  private worldFrames:NormalizedLandmark[][]=[]
  private squatBaseline:SquatMotion|null=null
  private jackBaseline:number|null=null
  private armsAt:number|null=null
  private legsAt:number|null=null
  private motionAt:number|null=null
  constructor(readonly type:CameraExerciseType, targetReps=20, restored:Partial<ExerciseMetrics>={}) {
    const reps=Math.max(0,restored.reps||0),breakdown={...emptyFormBreakdown(),...restored.formBreakdown}
    const acc=restored.scoreAccumulator || {count:reps,total:(restored.formScore||0)*reps,...Object.fromEntries(axes.map(k=>[k,breakdown[k]*reps]))} as ScoreAccumulator
    this.metrics={...restored,reps,targetReps,formScore:acc.count?Math.round(acc.total/acc.count):0,perfectReps:restored.perfectReps||0,feedback:exerciseInfo(type).placement,phase:'standing',scoreAccumulator:{...acc},formBreakdown:breakdown,correctionCounts:{...emptyCorrectionCounts(),...restored.correctionCounts},lastRepIssues:[],repeatedIssue:null,poseFeedback:this.feedback(null,false)}
  }
  private feedback(frame:Frame|null, calibrated:boolean):PoseFeedback {
    const issues=frame?.issues||['out_of_frame'],primaryIssue=issues[0]||null
    return {status:!frame||!calibrated?'uncertain':primaryIssue?'adjust':'stable',confidence:frame?.confidence||0,issues,primaryIssue,affectedJoints:primaryIssue?POSE_ISSUE_COPY[primaryIssue].joints:[],calibrated,message:!frame?exerciseInfo(this.type).placement:!calibrated?(this.type==='push_up'?'保持伸臂支撑，正在校准':'保持自然站姿，正在校准'):primaryIssue?POSE_ISSUE_COPY[primaryIssue].action:'姿势稳定，保持这个节奏'}
  }
  interrupt(reason = '训练暂停或已停止，继续后重新校准') {
    this.frames=[];this.calibrationAt=null;this.calibrated=false;this.armed=false;this.peakAt=null;this.peak=null;this.returnAt=null;this.pair.clear();this.issues.clear();this.consecutive={}
    this.trackingSide=undefined;this.lastFrameAt=null;this.frameTimes=[]
    this.worldFrames=[];this.squatBaseline=null;this.jackBaseline=null;this.armsAt=null;this.legsAt=null;this.motionAt=null
    this.diagnostics={...this.diagnostics,fps:0,confidence:0,side:null,angle:null,stage:'tracking_lost',calibrationProgress:0,pairedSides:[],lastResetReason:reason}
    this.metrics={...this.metrics,phase:'standing',poseFeedback:{...this.feedback(null,false),message:reason},feedback:reason}
    return this.metrics
  }
  update(raw:NormalizedLandmark[]|null,now:number,aspect=1,world:NormalizedLandmark[]|null=null):ExerciseMetrics {
    if(!raw)return this.interrupt('未检测到人体，请确认所需关节都在画面内')
    if(raw.length<29 || raw.some(p=>!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || (p.visibility!==undefined&&!Number.isFinite(p.visibility))) || !Number.isFinite(aspect) || aspect<=0 || !Number.isFinite(now))return this.interrupt('关键点数据不完整，正在等待有效画面')
    if(this.lastFrameAt!==null && now<=this.lastFrameAt)return this.metrics
    if(this.lastFrameAt!==null && now-this.lastFrameAt>750)this.interrupt('画面更新中断，已丢弃半程动作，请重新校准')
    this.lastFrameAt=now
    this.frameTimes=[...this.frameTimes,now].filter(time=>now-time<=2000).slice(-120)
    const elapsed=now-this.frameTimes[0]
    this.diagnostics={...this.diagnostics,fps:elapsed>0?Math.round((this.frameTimes.length-1)*1000/elapsed):0}
    // Severe loss must never be concealed by old, smoothed poses. Marginal noise
    // (.25–.55) is filtered first; sustained uncertainty still fails the median.
    const required=requiredJoints(this.type,raw,this.trackingSide)
    if(required.some(i=>(raw[i].visibility??0)<.25 || raw[i].x<0 || raw[i].x>1 || raw[i].y<0 || raw[i].y>1))return this.interrupt(rejectedFrameReason(this.type,raw,this.trackingSide))
    this.frames=[...this.frames,raw].slice(-5)
    this.worldFrames=world&&world.length>=29&&world.every(p=>p&&[p.x,p.y,p.z].every(Number.isFinite))?[...this.worldFrames,world].slice(-5):[]
    const smoothedWorld=this.worldFrames.length?medianLandmarks(this.worldFrames):null
    const points=medianLandmarks(this.frames),frame=points?analyzeExerciseFrame(this.type,points,aspect,this.trackingSide,smoothedWorld):null
    if(!frame)return this.interrupt(points?rejectedFrameReason(this.type,points,this.trackingSide):'正在等待完整人体关键点')
    if(this.type==='push_up' && !this.trackingSide && frame.start)this.trackingSide=frame.trackingSide
    this.diagnostics={...this.diagnostics,confidence:frame.confidence,side:this.trackingSide||frame.trackingSide||null,angle:frame.angle??null}
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
      else if(this.calibrationAt===null)this.calibrationAt=now
      else if(now-this.calibrationAt>=2000){this.calibrated=true;this.armed=true}
      const feedback=this.feedback(frame,this.calibrated)
      const progress=this.calibrationAt===null?0:Math.min(1,(now-this.calibrationAt)/2000)
      this.diagnostics={...this.diagnostics,stage:this.calibrated?'ready':'calibrating',calibrationProgress:progress}
      const message=this.calibrated?'校准完成，可以开始完整动作':frame.start?`${feedback.message}（${Math.round(progress*100)}%）`:this.type==='push_up'?'先保持伸臂支撑，再开始动作':'先回到自然站姿，再开始动作'
      this.metrics={...this.metrics,poseFeedback:feedback,feedback:message};return this.metrics
    }
    const feedback=this.feedback(frame,true)
    let phase:WorkoutPhase=frame.start?'standing':this.peak?'ascending':'descending'
    if(this.armed && frame.peak) {
      phase='bottom'
      if(this.peakAt===null)this.peakAt=now
      if(now-this.peakAt>=(this.type==='jumping_jack'?60:150) && (!this.peak || frame.score>=this.peak.score))this.peak=frame
    } else this.peakAt=null
    if(this.armed && !frame.start)frame.issues.forEach(i=>this.issues.add(i))
    let completedRep=false
    if(this.peak && frame.start) {
      if(this.returnAt===null)this.returnAt=now
      if(now-this.returnAt>=(this.type==='jumping_jack'?60:150)) {
        let completed:Frame|null=this.peak
        if(this.type==='high_knees') {
          this.pair.set(this.peak.side!,this.peak)
          if(this.pair.size===2) {
            const [l,r]=[this.pair.get('left')!,this.pair.get('right')!]
            const scores={...l.scores};axes.forEach(k=>scores[k]=mean(l.scores[k],r.scores[k]));scores.symmetry=clamp(scores.symmetry-Math.abs(l.scores.depth-r.scores.depth)*.5)
            completed={...l,scores,score:weights(scores)};this.pair.clear()
          } else completed=null
        }
        if(completed && this.metrics.reps<this.metrics.targetReps) {
          const acc={...this.metrics.scoreAccumulator,count:this.metrics.scoreAccumulator.count+1,total:this.metrics.scoreAccumulator.total+completed.score}
          axes.forEach(k=>acc[k]+=completed.scores[k])
          const breakdown={...emptyFormBreakdown()};axes.forEach(k=>breakdown[k]=Math.round(acc[k]/acc.count))
          const repIssues=[...new Set([...this.issues,...completed.issues])],counts={...this.metrics.correctionCounts}
          let repeated:PoseIssue|null=null
          for(const i of Object.keys(counts) as PoseIssue[]){if(repIssues.includes(i))counts[i]++;this.consecutive[i]=repIssues.includes(i)?(this.consecutive[i]||0)+1:0;if((this.consecutive[i]||0)>=2)repeated=i}
          this.metrics={...this.metrics,reps:this.metrics.reps+1,formScore:Math.round(acc.total/acc.count),perfectReps:this.metrics.perfectReps+(completed.score>=90?1:0),scoreAccumulator:acc,formBreakdown:breakdown,correctionCounts:counts,lastRepIssues:repIssues,repeatedIssue:repeated}
          completedRep=true
          this.issues.clear()
        }
        this.peak=null;this.peakAt=null;this.returnAt=null
        this.trackingSide=undefined
        this.armsAt=null;this.legsAt=null;this.motionAt=null
      }
    } else this.returnAt=null
    const stage=this.metrics.reps>=this.metrics.targetReps?'complete':this.peak?(frame.start?'returning':'peak'):frame.peak?'peak':frame.start?'ready':'moving'
    this.diagnostics={...this.diagnostics,stage,pairedSides:[...this.pair.keys()] as TrackingSide[],calibrationProgress:1}
    const instructions = {
      squat: {ready:'站姿就绪，开始下蹲',moving:'继续下蹲，尚未达到计数深度',peak:'已到下蹲位置，请回到站立',returning:'保持站立，正在确认本次动作'},
      jumping_jack: {ready:'手脚合拢就绪，可以开始',moving:'手脚一起展开，双手抬过肩部',peak:'已完成展开，请让手脚一起合拢',returning:'保持合拢，正在确认本次动作'},
      high_knees: {ready:'双脚落下就绪，交替抬腿',moving:'继续抬腿，尚未达到计数高度',peak:'已抬腿，请落下后换另一侧',returning:'保持落下，正在确认这一侧'},
      push_up: {ready:'伸臂支撑就绪，可以开始下降',moving:'继续屈肘，尚未达到计数幅度',peak:'已完成下降，请推起回到伸臂支撑',returning:'保持伸臂，正在确认本次动作'},
    }[this.type]
    const pairMessage=this.type==='high_knees'&&frame.start&&this.pair.size===1?`已完成${this.pair.has('left')?'左':'右'}侧，请完成${this.pair.has('left')?'右':'左'}侧后计一组`:null
    const message=stage==='complete'?'已完成目标次数':completedRep?`已记录第 ${this.metrics.reps} ${exerciseInfo(this.type).unit}`:frame.peak&&!this.peak?(this.type==='jumping_jack'?'正在识别完整开合，保持自然节奏':'幅度已达到，正在确认动作，请保持平稳'):pairMessage||instructions[stage as keyof typeof instructions]
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
