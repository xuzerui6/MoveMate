import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

export type SquatSide = 'left' | 'right'
export const squatJoints = {left:[11,23,25,27],right:[12,24,26,28]} as const
export function squatSideVisible(points: NormalizedLandmark[], side: SquatSide, confidence=.55) {
  return squatJoints[side].every(i=>{
    const p=points[i]
    return p && (p.visibility??0)>=confidence && p.x>=.035 && p.x<=.965 && p.y>=.025 && p.y<=.985
  })
}

export interface SquatFrameAnalysis {
  kneeAngle: number
  depthScore: number
  stabilityScore: number
  trunkScore: number
  symmetryScore: number
  formScore: number
  confidence: number
  angleSource: 'world' | 'image'
}

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value))
const angle = (a: NormalizedLandmark, b: NormalizedLandmark, c: NormalizedLandmark) => {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x)
  let degrees = Math.abs(radians * 180 / Math.PI)
  if (degrees > 180) degrees = 360 - degrees
  return degrees
}
const distance = (a: NormalizedLandmark, b: NormalizedLandmark) => Math.hypot(a.x - b.x, a.y - b.y)
const midpoint = (a: NormalizedLandmark, b: NormalizedLandmark): NormalizedLandmark => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2, visibility: Math.min(a.visibility || 1, b.visibility || 1) })

export function analyzeSquatFrame(points: NormalizedLandmark[], aspectRatio = 1, world?: NormalizedLandmark[] | null, side?: SquatSide): SquatFrameAnalysis | null {
  if (points.length < 29) return null
  const required = side ? squatJoints[side] : [11, 12, 23, 24, 25, 26, 27, 28]
  const confidence = Math.min(...required.map(index => points[index].visibility ?? 0))
  if (confidence < .55) return null
  if (required.some(index => points[index].x < .035 || points[index].x > .965 || points[index].y < .025 || points[index].y > .985)) return null
  points = points.map(p => ({ ...p, x: p.x * aspectRatio }))
  const worldAngle=(a:NormalizedLandmark,b:NormalizedLandmark,c:NormalizedLandmark)=>{
    const u=[a.x-b.x,a.y-b.y,a.z-b.z],v=[c.x-b.x,c.y-b.y,c.z-b.z]
    const denominator=Math.hypot(...u)*Math.hypot(...v)
    return denominator>1e-6?Math.acos(Math.max(-1,Math.min(1,u.reduce((sum,n,i)=>sum+n*v[i],0)/denominator)))*180/Math.PI:NaN
  }
  const validWorld=!!world&&(side?squatJoints[side].slice(1):[23,24,25,26,27,28]).every(i=>world[i]&&[world[i].x,world[i].y,world[i].z].every(Number.isFinite))
  const leftWorld=validWorld&&side!=='right'?worldAngle(world![23],world![25],world![27]):NaN
  const rightWorld=validWorld&&side!=='left'?worldAngle(world![24],world![26],world![28]):NaN
  const useWorld=(side==='right'||Number.isFinite(leftWorld))&&(side==='left'||Number.isFinite(rightWorld))
  const leftKnee = useWorld?leftWorld:angle(points[23], points[25], points[27])
  const rightKnee = useWorld?rightWorld:angle(points[24], points[26], points[28])
  const kneeAngle = side==='left'?leftKnee:side==='right'?rightKnee:(leftKnee+rightKnee)/2
  if(side){
    // Single-side geometry supports counting. The caller excludes this frame from scoring.
    return {kneeAngle,depthScore:0,stabilityScore:0,trunkScore:0,symmetryScore:0,formScore:0,confidence,angleSource:useWorld?'world':'image'}
  }
  const depthScore = clamp((125 - kneeAngle) / 35 * 100)
  const symmetryScore = clamp(100 - Math.abs(leftKnee - rightKnee) * 2.5)
  const shoulderWidth = Math.max(.05, distance(points[11], points[12]))
  const kneeDrift = (Math.abs(points[25].x - points[27].x) + Math.abs(points[26].x - points[28].x)) / (2 * shoulderWidth)
  const stabilityScore = clamp(100 - Math.max(0, kneeDrift - .3) * 130)
  const shoulderMid = midpoint(points[11], points[12]), hipMid = midpoint(points[23], points[24])
  const trunkTilt = Math.abs(Math.atan2(shoulderMid.x - hipMid.x, hipMid.y - shoulderMid.y) * 180 / Math.PI)
  const trunkScore = clamp(100 - Math.max(0, trunkTilt - 10) * 3.5)
  const formScore = Math.round(depthScore * .35 + stabilityScore * .25 + trunkScore * .20 + symmetryScore * .20)
  return { kneeAngle, depthScore, stabilityScore, trunkScore, symmetryScore, formScore, confidence, angleSource:useWorld?'world':'image' }
}
