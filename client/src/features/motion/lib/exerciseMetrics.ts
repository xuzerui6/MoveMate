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
type Frame = { start: boolean; peak: boolean; side?: 'left' | 'right'; confidence: number; scores: FormBreakdown; score: number; issues: PoseIssue[] }
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
export function analyzeExerciseFrame(type: CameraExerciseType, raw: NormalizedLandmark[], aspect = 1): Frame | null {
  if (raw.length < 29 || !Number.isFinite(aspect) || aspect <= 0) return null
  if (type === 'squat') {
    const s=analyzeSquatFrame(raw,aspect); if(!s)return null
    const phase: WorkoutPhase = s.kneeAngle<=102?'bottom':s.kneeAngle>=158?'standing':'descending'
    return { start:s.kneeAngle>=158,peak:s.kneeAngle<=102,confidence:s.confidence,
      scores:{depth:s.depthScore,stability:s.stabilityScore,trunk:s.trunkScore,symmetry:s.symmetryScore},score:s.formScore,issues:detectPoseIssues(s,phase,true).issues }
  }
  let required=[11,12,23,24,25,26,27,28]
  if(type==='jumping_jack')required.push(13,14,15,16)
  if(type==='push_up') {
    const left=[11,13,15,23,27],right=[12,14,16,24,28]
    required=visible(raw,left)&&(!visible(raw,right)||Math.min(...left.map(i=>raw[i].visibility))>=Math.min(...right.map(i=>raw[i].visibility)))?left:right
  }
  if(!visible(raw,required))return null
  const p=raw.map(v=>({...v,x:v.x*aspect}))
  const confidence=Math.min(...required.map(i=>raw[i].visibility))
  const hip={...p[23],x:mean(p[23].x,p[24].x),y:mean(p[23].y,p[24].y)}
  const shoulder={...p[11],x:mean(p[11].x,p[12].x),y:mean(p[11].y,p[12].y)}
  const width=Math.max(.04,distance(p[11],p[12]))
  const torso=Math.max(.05,distance(hip,shoulder))
  const upright=clamp(100-Math.max(0,Math.abs(shoulder.x-hip.x)/torso-.12)*150)
  let start=false,peak=false,side: Frame['side'],scores=emptyFormBreakdown()
  if(type==='jumping_jack') {
    const spread=Math.abs(p[27].x-p[28].x)/width
    const armRise=(shoulder.y-mean(p[15].y,p[16].y))/torso
    start=spread<=1.2 && p[15].y>p[11].y+.08 && p[16].y>p[12].y+.08
    peak=spread>=1.8 && p[15].y<p[11].y-.06 && p[16].y<p[12].y-.06
    scores={depth:clamp(Math.min(spread/2.5,Math.max(0,armRise)/.65)*100),stability:clamp(100-Math.abs(p[27].y-p[28].y)/torso*150),trunk:upright,symmetry:clamp(100-(Math.abs(p[15].y-p[16].y)+Math.abs(Math.abs(p[27].x-hip.x)-Math.abs(p[28].x-hip.x)))/torso*120)}
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
  return {start,peak,side,confidence,scores,score:weights(scores),issues}
}

export class ExerciseTracker {
  metrics: ExerciseMetrics
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
  constructor(readonly type:CameraExerciseType, targetReps=20, restored:Partial<ExerciseMetrics>={}) {
    const reps=Math.max(0,restored.reps||0),breakdown={...emptyFormBreakdown(),...restored.formBreakdown}
    const acc=restored.scoreAccumulator || {count:reps,total:(restored.formScore||0)*reps,...Object.fromEntries(axes.map(k=>[k,breakdown[k]*reps]))} as ScoreAccumulator
    this.metrics={...restored,reps,targetReps,formScore:acc.count?Math.round(acc.total/acc.count):0,perfectReps:restored.perfectReps||0,feedback:exerciseInfo(type).placement,phase:'standing',scoreAccumulator:{...acc},formBreakdown:breakdown,correctionCounts:{...emptyCorrectionCounts(),...restored.correctionCounts},lastRepIssues:[],repeatedIssue:null,poseFeedback:this.feedback(null,false)}
  }
  private feedback(frame:Frame|null, calibrated:boolean):PoseFeedback {
    const issues=frame?.issues||['out_of_frame'],primaryIssue=issues[0]||null
    return {status:!frame||!calibrated?'uncertain':primaryIssue?'adjust':'stable',confidence:frame?.confidence||0,issues,primaryIssue,affectedJoints:primaryIssue?POSE_ISSUE_COPY[primaryIssue].joints:[],calibrated,message:!frame?exerciseInfo(this.type).placement:!calibrated?(this.type==='push_up'?'保持伸臂支撑，正在校准':'保持自然站姿，正在校准'):primaryIssue?POSE_ISSUE_COPY[primaryIssue].action:'姿势稳定，保持这个节奏'}
  }
  interrupt() {
    this.frames=[];this.calibrationAt=null;this.calibrated=false;this.armed=false;this.peakAt=null;this.peak=null;this.returnAt=null;this.pair.clear();this.issues.clear();this.consecutive={}
    this.metrics={...this.metrics,phase:'standing',poseFeedback:this.feedback(null,false),feedback:exerciseInfo(this.type).placement}
    return this.metrics
  }
  update(raw:NormalizedLandmark[]|null,now:number,aspect=1):ExerciseMetrics {
    if(!raw || !analyzeExerciseFrame(this.type,raw,aspect))return this.interrupt()
    this.frames=[...this.frames,raw].slice(-5)
    const points=medianLandmarks(this.frames),frame=points?analyzeExerciseFrame(this.type,points,aspect):null
    if(!frame)return this.interrupt()
    if(!this.calibrated) {
      if(!frame.start)this.calibrationAt=null
      else if(this.calibrationAt===null)this.calibrationAt=now
      else if(now-this.calibrationAt>=2000){this.calibrated=true;this.armed=true}
      const feedback=this.feedback(frame,this.calibrated)
      this.metrics={...this.metrics,poseFeedback:feedback,feedback:feedback.message};return this.metrics
    }
    const feedback=this.feedback(frame,true)
    let phase:WorkoutPhase=frame.start?'standing':this.peak?'ascending':'descending'
    if(this.armed && frame.peak) {
      phase='bottom'
      if(this.peakAt===null)this.peakAt=now
      if(now-this.peakAt>=150 && (!this.peak || frame.score>=this.peak.score))this.peak=frame
    } else this.peakAt=null
    if(this.armed && !frame.start)frame.issues.forEach(i=>this.issues.add(i))
    if(this.peak && frame.start) {
      if(this.returnAt===null)this.returnAt=now
      if(now-this.returnAt>=150) {
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
          this.issues.clear()
        }
        this.peak=null;this.peakAt=null;this.returnAt=null
      }
    } else this.returnAt=null
    this.metrics={...this.metrics,phase,poseFeedback:feedback,feedback:this.metrics.reps>=this.metrics.targetReps?'已完成目标次数':feedback.message}
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
