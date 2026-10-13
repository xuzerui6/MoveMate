import { useEffect, useRef, useState } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { demonstrationPose, ExerciseTracker, type ExerciseMetrics } from '../lib/exerciseMetrics'
import type { CameraExerciseType } from '../lib/exercises'

export function useExerciseMetrics(type:CameraExerciseType, landmarks:NormalizedLandmark[]|null, simulated:boolean, active:boolean, paused:boolean, aspect:number, restored:Partial<ExerciseMetrics>={}) {
  const tracker=useRef<ExerciseTracker>()
  if(!tracker.current)tracker.current=new ExerciseTracker(type,20,restored)
  const [metrics,setMetrics]=useState(()=>tracker.current!.metrics)
  const [demoLandmarks,setDemoLandmarks]=useState<NormalizedLandmark[]|null>(null)
  useEffect(()=>{if(!active||paused)setMetrics({...tracker.current!.interrupt()})},[active,paused])
  useEffect(()=>{
    if(!active||paused||simulated)return
    setMetrics({...tracker.current!.update(landmarks,performance.now(),aspect)})
  },[active,paused,simulated,landmarks,aspect])
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
  },[active,paused,simulated,type])
  return {metrics,demoLandmarks}
}
