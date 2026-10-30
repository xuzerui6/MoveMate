import { useEffect, useRef, useState } from 'react';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { type ExerciseMetrics } from '../motion/lib/exerciseMetrics';
import { type CameraExerciseType } from '../motion/lib/exercises';
import { type NewPlanProfile } from './planRecognition';
import {createRecognitionTracker} from '../motion/lib/recognition';
export type PlanRecognitionType = CameraExerciseType | NewPlanProfile;
export function usePlanRecognition(type:PlanRecognitionType,landmarks:NormalizedLandmark[]|null,active:boolean,paused:boolean,aspect:number,restored:Partial<ExerciseMetrics>,target:number,resetKey:string,world:NormalizedLandmark[]|null){
  const holder=useRef<{key:string;tracker:ReturnType<typeof createRecognitionTracker>}>();
  const key=type+':'+resetKey+':'+target;
  if(!holder.current||holder.current.key!==key)holder.current={key,tracker:createRecognitionTracker(type,target,restored)};
  const [snapshot,setSnapshot]=useState(()=>({key,metrics:holder.current!.tracker.metrics,diagnostics:holder.current!.tracker.diagnostics}));
  const publish=()=>setSnapshot({key,metrics:{...holder.current!.tracker.metrics},diagnostics:{...holder.current!.tracker.diagnostics}});
  useEffect(()=>{if(!active||paused){holder.current!.tracker.interrupt();publish();}},[key,active,paused]);
  useEffect(()=>{if(active&&!paused){holder.current!.tracker.update(landmarks,performance.now(),aspect,world);publish();}},[key,active,paused,landmarks,world,aspect]);
  return snapshot.key===key?snapshot:{metrics:holder.current.tracker.metrics,diagnostics:holder.current.tracker.diagnostics};
}
