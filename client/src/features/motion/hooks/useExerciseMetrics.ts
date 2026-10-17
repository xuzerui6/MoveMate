import { useEffect, useRef, useState } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { demonstrationPose, ExerciseTracker, type ExerciseMetrics } from '../lib/exerciseMetrics'
import type { CameraExerciseType } from '../lib/exercises'

export function useExerciseMetrics(type:CameraExerciseType, landmarks:NormalizedLandmark[]|null, simulated:boolean, active:boolean, paused:boolean, aspect:number, restored:Partial<ExerciseMetrics>={}, targetReps=20, resetKey='standalone') {
  const tracker=useRef<ExerciseTracker>()
  const key=type+':'+resetKey+':'+targetReps,trackerKey=useRef('')
  if(!tracker.current||trackerKey.current!==key){tracker.current=new ExerciseTracker(type,targetReps,restored);trackerKey.current=key}
  const [snapshot,setSnapshot]=useState(()=>({key,metrics:tracker.current!.metrics,diagnostics:tracker.current!.diagnostics}))
  const setMetrics=(metrics:ExerciseMetrics)=>setSnapshot({key,metrics,diagnostics:tracker.current!.diagnostics})
  const metrics=snapshot.key===key?snapshot.metrics:tracker.current.metrics
  const diagnostics=snapshot.key===key?snapshot.diagnostics:tracker.current.diagnostics
  const [demoLandmarks,setDemoLandmarks]=useState<NormalizedLandmark[]|null>(null)
  useEffect(()=>{if(!active||paused)setMetrics({...tracker.current!.interrupt()})},[active,paused,key])
  useEffect(()=>{
    if(!active||paused||simulated)return
    setMetrics({...tracker.current!.update(landmarks,performance.now(),aspect)})
  },[active,paused,simulated,landmarks,aspect,key])
  useEffect(()=>{
    if(!active||paused||!simulated)return
    const start=performance.now()
    const tick=()=>{
      const now=performance.now(),elapsed=now-start
      const stages: Array<'neutral'|'peak'|'left'|'right'>=type==='high_knees'?['left','neutral','right','neutral']:['peak','neutral']
      const stage=elapsed<2600?'neutral':stages[Math.floor((elapsed-2600)/1000)%stages.length]
      const frame=demonstrationPose(type,stage);setDemoLandmarks(frame);setMetrics({...tracker.current!.update(frame,now,1)})
    }
    tick();const interval=window.setInterval(tick,100);return()=>window.clearInterval(interval)
  },[active,paused,simulated,type,key])
  return {metrics,diagnostics,demoLandmarks}
}
