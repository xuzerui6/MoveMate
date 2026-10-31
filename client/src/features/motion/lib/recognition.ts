import type {NormalizedLandmark} from '@mediapipe/tasks-vision';
import {ExerciseTracker,demonstrationPose,type ExerciseMetrics} from './exerciseMetrics';
import {ExtendedExerciseTracker} from './extendedRecognition';
import {PlanExerciseTracker,isNewPlanProfile,type NewPlanProfile} from '../../gym/planRecognition';
import {isCameraExercise,type CameraExerciseType,type BaseCameraExerciseType} from './exercises';
import {isNewExercise,type NewExerciseType} from './newExercises';
import {isLibraryRecognition,type LibraryRecognitionType} from '../../gym/libraryRecognition';
export type RecognitionType=CameraExerciseType|NewPlanProfile|LibraryRecognitionType;
export const isRecognitionType=(type:string):type is RecognitionType=>isCameraExercise(type)||isNewPlanProfile(type)||isLibraryRecognition(type);
export function createRecognitionTracker(type:string,target=20,restored:Partial<ExerciseMetrics>={}){
  if(isLibraryRecognition(type)){
    if(type==='goblet_squat'||type==='barbell_back_squat'||type==='barbell_front_squat')return new ExerciseTracker('squat',target,restored);
    if(type==='barbell_curl')return new PlanExerciseTracker('biceps_curl',target,restored);
    if(type==='barbell_row')return new PlanExerciseTracker('bent_over_row',target,restored);
    return new ExtendedExerciseTracker(type,target,restored);
  }
  if(isNewExercise(type))return new ExtendedExerciseTracker(type,target,restored);
  if(isNewPlanProfile(type))return new PlanExerciseTracker(type,target,restored);
  if(isCameraExercise(type))return new ExerciseTracker(type as BaseCameraExerciseType,target,restored);
  throw new Error('当前客户端不支持此动作，请刷新页面或切换手动记录');
}
/** Explicit synthetic sequences for demo and labelled replay, never real-camera evidence. */
export function newDemonstrationPose(type:NewExerciseType,stage:'neutral'|'peak'|'left'|'right'='neutral'){
  const p:NormalizedLandmark[]=Array.from({length:33},()=>({x:.5,y:.2,z:0,visibility:1}));
  const put=(i:number,x:number,y:number)=>{p[i]={x,y,z:0,visibility:1};};
  put(0,.5,.14);
  for(const o of [0,1]){const x=.43+o*.14;put(11+o,x,.28);put(13+o,x,.42);put(15+o,x,.56);put(23+o,.45+o*.1,.53);put(25+o,.45+o*.1,.72);put(27+o,.45+o*.1,.90);put(29+o,.44+o*.1,.92);put(31+o,.48+o*.1,.94);}
  const moving=stage!=='neutral';let world:NormalizedLandmark[]|null=null;
  if(type==='hammer_curl'&&moving)for(const o of [0,1])put(15+o,.45+o*.1,.31);
  if(type==='front_raise'){
    world=p.map(v=>({...v}));const w=(i:number,x:number,y:number,z:number)=>{world![i]={x,y,z,visibility:1};};w(0,0,-.15,-.1);
    for(const o of [0,1]){const x=o?.2:-.2;w(11+o,x,0,0);w(23+o,x,.4,0);w(13+o,x,moving?0:.2,moving?-.2:0);w(15+o,x,moving?0:.4,moving?-.4:0);if(moving){put(13+o,.58+o*.06,.28);put(15+o,.73+o*.06,.28);}}
  }
  if(type==='triceps_kickback')for(const o of [0,1]){const dx=o*.06,dy=o*.02;put(11+o,.65+dx,.30+dy);put(23+o,.40+dx,.53+dy);put(13+o,.50+dx,.40+dy);put(15+o,(moving?.35:.55)+dx,(moving?.50:.52)+dy);}
  if(type==='romanian_deadlift')for(const o of [0,1]){const d=o*.06;put(11+o,(moving?.74:.50)+d,moving?.46:.27);put(23+o,(moving?.43:.50)+d,moving?.55:.53);put(25+o,.5+d,.72);put(27+o,.5+d,.90);put(13+o,(moving?.74:.5)+d,moving?.60:.41);put(15+o,(moving?.74:.5)+d,moving?.75:.55);}
  if(type==='glute_bridge')for(const o of [0,1]){const d=o*.025;put(11+o,.25,.72+d);put(23+o,moving?.475:.53,(moving?.64:.76)+d);put(25+o,.70,.57+d);put(27+o,.80,.78+d);put(13+o,.30,.78+d);put(15+o,.4,.79+d);}
  if(type==='standing_leg_curl'&&moving){const o=stage==='right'?1:0;put(27+o,.27+o*.1,.68);put(29+o,.25+o*.1,.69);put(31+o,.28+o*.1,.66);}
  return {landmarks:p,worldLandmarks:world};
}
export function recognitionDemonstration(type:CameraExerciseType,stage:'neutral'|'peak'|'left'|'right'){
  return isNewExercise(type)?newDemonstrationPose(type,stage):{landmarks:demonstrationPose(type,stage),worldLandmarks:null};
}
