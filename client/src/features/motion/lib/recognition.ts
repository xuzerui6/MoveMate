import type {NormalizedLandmark} from '@mediapipe/tasks-vision';
import {ExerciseTracker,demonstrationPose,type ExerciseMetrics} from './exerciseMetrics';
import {ExtendedExerciseTracker} from './extendedRecognition';
import {PlanExerciseTracker,isNewPlanProfile,type NewPlanProfile} from '../../gym/planRecognition';
import {isCameraExercise,type CameraExerciseType,type BaseCameraExerciseType} from './exercises';
import {isNewExercise,type NewExerciseType} from './newExercises';
import {isLibraryRecognition,type LibraryRecognitionType} from '../../gym/libraryRecognition';
export type RecognitionType=CameraExerciseType|NewPlanProfile|LibraryRecognitionType;
export const isRecognitionType=(type:string):type is RecognitionType=>isCameraExercise(type)||isNewPlanProfile(type)||isLibraryRecognition(type);
export function createRecognitionTracker(type:string,target=20,restored:Partial<ExerciseMetrics>={},prefiltered=false,armOnStart=false){
  if(isLibraryRecognition(type)){
    if(type==='goblet_squat'||type==='barbell_back_squat'||type==='barbell_front_squat')return new ExerciseTracker('squat',target,restored,prefiltered,armOnStart,false);
    if(type==='barbell_curl'||type==='reverse_barbell_curl')return new PlanExerciseTracker('biceps_curl',target,restored,prefiltered,armOnStart);
    if(type==='barbell_row')return new PlanExerciseTracker('bent_over_row',target,restored,prefiltered,armOnStart);
    if(type==='neutral_seated_press')return new PlanExerciseTracker('shoulder_press',target,restored,prefiltered,armOnStart);
    if(type==='dumbbell_standing_press'||type==='barbell_military_press')return new PlanExerciseTracker('shoulder_press',target,restored,prefiltered,armOnStart);
    if(type==='dumbbell_reverse_lunge')return new PlanExerciseTracker('reverse_lunge',target,restored,prefiltered,armOnStart);
    if(type==='dumbbell_deadlift')return new ExtendedExerciseTracker('barbell_deadlift',target,restored,prefiltered,armOnStart);
    if(type==='barbell_good_morning')return new ExtendedExerciseTracker('romanian_deadlift',target,restored,prefiltered,armOnStart);
    if(type==='seated_calf_raise')return new PlanExerciseTracker('seated_calf_raise',target,restored,prefiltered,armOnStart);
    if(type==='dumbbell_calf_raise')return new PlanExerciseTracker('calf_raise',target,restored,prefiltered,armOnStart);
    return new ExtendedExerciseTracker(type,target,restored,prefiltered,armOnStart);
  }
  if(isNewExercise(type))return new ExtendedExerciseTracker(type,target,restored,prefiltered,armOnStart);
  if(isNewPlanProfile(type))return new PlanExerciseTracker(type,target,restored,prefiltered,armOnStart);
  if(isCameraExercise(type))return new ExerciseTracker(type as BaseCameraExerciseType,target,restored,prefiltered,armOnStart);
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
  if(type==='romanian_deadlift'||type==='barbell_good_morning')for(const o of [0,1]){const d=o*.06;put(11+o,(moving?.74:.50)+d,moving?.46:.27);put(23+o,(moving?.43:.50)+d,moving?.55:.53);put(25+o,.5+d,.72);put(27+o,.5+d,.90);put(13+o,(moving?.74:.5)+d,moving?.60:.41);put(15+o,(moving?.74:.5)+d,moving?.75:.55);}
  if(type==='glute_bridge')for(const o of [0,1]){const d=o*.025;put(11+o,.25,.72+d);put(23+o,moving?.475:.53,(moving?.64:.76)+d);put(25+o,.70,.57+d);put(27+o,.80,.78+d);put(13+o,.30,.78+d);put(15+o,.4,.79+d);}
  if(type==='standing_leg_curl'&&moving){const o=stage==='right'?1:0;put(27+o,.27+o*.1,.68);put(29+o,.25+o*.1,.69);put(31+o,.28+o*.1,.66);}
  // Tier 1-2 picker demos: geometry ported from the aspect-verified fixtures
  // (tests/fixtures/plan-camera.ts and library-camera.ts) so the standalone
  // demo loop exercises the same poses the plan path was acceptance-tested with.
  if(type==='dumbbell_standing_press'||type==='barbell_military_press')for(const o of [0,1]){if(moving){put(13+o,o?.57:.43,.14);put(15+o,o?.57:.43,.02);}else{put(13+o,o?.71:.29,.37);put(15+o,o?.71:.29,.19);}}
  if(type==='dumbbell_reverse_lunge'&&moving){const rear=stage==='right'?1:0,front=1-rear;for(const i of [11,12,23,24])p[i].y+=.1;put(25+rear,.32+rear*.1,.76);put(27+rear,.2+rear*.1,.90);put(29+rear,.19+rear*.1,.92);put(31+rear,.23+rear*.1,.94);put(25+front,.55+front*.1,.74);}
  if(type==='seated_calf_raise')for(const o of [0,1]){const x=.62+o*.06;put(11+o,o?.57:.43,.16);put(13+o,o?.55:.41,.30);put(15+o,o?.61:.49,.38);put(23+o,o?.56:.44,.40);put(25+o,x,.42);put(27+o,x,moving?.735:.76);put(29+o,x-.025,moving?.825:.86);put(31+o,x+.065,.86);}
  if(type==='dumbbell_deadlift'){const down=!moving;for(const o of [0,1]){const d=o*.06;put(11+o,(down?.61:.52)+d,down?.40:.25);put(23+o,(down?.42:.52)+d,down?.60:.53);put(25+o,(down?.60:.52)+d,down?.73:.72);put(27+o,.52+d,.90);put(13+o,(down?.60:.52)+d,down?.60:.45);put(15+o,(down?.59:.52)+d,down?.83:.65);}}
  if(type==='one_arm_row'){const pull=stage==='right'?1:0;for(const o of [0,1]){const d=o*.06,sx=.58+d,sy=.38+o*.02;put(11+o,sx,sy);put(23+o,.40+d,.55+o*.02);put(25+o,.40+d,.74+o*.02);put(27+o,.40+d,.90);if(moving&&o===pull){put(13+o,sx-.12,sy-.01);put(15+o,sx-.03,sy+.05);}else{put(13+o,sx,.52+o*.02);put(15+o,sx,.66+o*.02);}}}
  if(type==='lying_leg_raise')for(const o of [0,1]){const d=o*.02;put(11+o,.22+d,.55);put(13+o,.20+d,.68);put(15+o,.30+d,.72);put(23+o,.48+d,.57);if(moving){put(25+o,.50+d,.30);put(27+o,.52+d,.06);put(29+o,.50+d,.06);put(31+o,.55+d,.06);}else{put(25+o,.72+d,.58);put(27+o,.92+d,.58);put(29+o,.90+d,.58);put(31+o,.95+d,.58);}}
  if(type==='upright_row')for(const o of [0,1]){const d=o*.12;put(11+o,.44+d,.30);put(23+o,.45+d,.55);put(25+o,.45+d,.74);put(27+o,.45+d,.90);if(moving){put(13+o,.33+d,.30);put(15+o,.43+d,.26);}else{put(13+o,.435+d,.44);put(15+o,.44+d,.60);}}
  if(type==='mountain_climber'){const tuck=stage==='right'?1:0;for(const o of [0,1]){const d=o*.02;put(11+o,.28+d,.40);put(13+o,.29+d,.58);put(15+o,.30+d,.76);put(23+o,.50+d,.43);if(moving&&o===tuck){put(25+o,.36+d,.58);put(27+o,.48+d,.76);put(29+o,.46+d,.76);put(31+o,.51+d,.76);}else{put(25+o,.70+d,.46);put(27+o,.88+d,.50);put(29+o,.86+d,.50);put(31+o,.91+d,.50);}}}
  if(type==='split_squat'){for(const o of [0,1]){put(11+o,.46+o*.03,moving?.34:.26);put(13+o,.45+o*.03,moving?.50:.42);put(15+o,.45+o*.03,moving?.64:.58);}put(23,.44,moving?.56:.48);put(24,.52,moving?.56:.48);if(moving){put(25,.575,.715);put(27,.50,.90);put(26,.42,.76);put(28,.30,.60);}else{put(25,.47,.68);put(27,.50,.90);put(26,.40,.64);put(28,.24,.62);}put(29,.46,.905);put(31,.55,.905);put(30,.20,.625);put(32,.29,.625);}
  if(type==='bench_dip')for(const o of [0,1]){const d=o*.02;put(11+o,.40+d,moving?.41:.30);put(23+o,.45+d,moving?.60:.53);put(25+o,.63+d,moving?.62:.55);put(27+o,.64+d,.88);put(13+o,(moving?.27:.365)+d,moving?.47:.45);put(15+o,.30+d,.58);}
  return {landmarks:p,worldLandmarks:world};
}
export function recognitionDemonstration(type:CameraExerciseType,stage:'neutral'|'peak'|'left'|'right'){
  return isNewExercise(type)?newDemonstrationPose(type,stage):{landmarks:demonstrationPose(type,stage),worldLandmarks:null};
}
