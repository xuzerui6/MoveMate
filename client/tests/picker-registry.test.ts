import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CAMERA_EXERCISES,BASE_CAMERA_EXERCISES,exerciseInfo,isCameraExercise} from '../src/features/motion/lib/exercises';
import {NEW_EXERCISES,isNewExercise,type NewExerciseType} from '../src/features/motion/lib/newExercises';
import {createRecognitionTracker,newDemonstrationPose} from '../src/features/motion/lib/recognition';
import {ExtendedExerciseTracker} from '../src/features/motion/lib/extendedRecognition';
import {PlanExerciseTracker} from '../src/features/gym/planRecognition';
import standaloneDefinitions from '../../server/src/gym/new-recognition.json';
import libraryDefinitions from '../../server/src/gym/library-recognition.json';

// The tier 1-2 recognition-expansion profiles. Since the picker fix they are
// registered in the standalone registry (server/src/gym/new-recognition.json)
// in addition to the library registry, so the standalone AI 动作训练 picker
// lists them as 试用 entries next to the original six.
const TIER_PROFILES=['dumbbell_standing_press','barbell_military_press','dumbbell_reverse_lunge','dumbbell_deadlift','one_arm_row','lying_leg_raise','upright_row','mountain_climber','split_squat','seated_calf_raise','barbell_good_morning','bench_dip'] as const;

// Camera-linked profiles that intentionally remain plan-path only: the six
// original plan profiles and the sixteen pre-expansion library profiles.
// Tiers 1-2 were the scope of the picker fix; any future profile must either
// join the picker registry or be accounted for here explicitly.
const PLAN_ONLY_PROFILES=['biceps_curl','lateral_raise','shoulder_press','bent_over_row','reverse_lunge','calf_raise','goblet_squat','barbell_back_squat','barbell_curl','bench_press','reverse_fly','seated_triceps_extension','barbell_deadlift','barbell_row','barbell_front_squat','incline_bench_press','seated_curl','seated_lateral_raise','lying_triceps_extension','reverse_barbell_curl','neutral_seated_press','dumbbell_calf_raise'];

test('picker registry: 4 base + 18 trial entries, trial count derived from the registry',()=>{
  assert.equal(Object.keys(BASE_CAMERA_EXERCISES).length,4);
  assert.equal(Object.keys(NEW_EXERCISES).length,18);
  assert.equal(Object.keys(CAMERA_EXERCISES).length,22);
  // Trial membership is derived from the registry (pickerExercises reads the
  // same isNewExercise split for the 试用 pill).
  assert.equal(Object.keys(CAMERA_EXERCISES).filter(id=>isNewExercise(id)).length,18);
  for(const type of TIER_PROFILES)assert.ok(isNewExercise(type),`${type} missing from the standalone registry`);
});

test('every trial entry carries complete picker copy (name, unit, placement, instruction, breathing, axes, stages)',()=>{
  for(const [type,entry] of Object.entries(NEW_EXERCISES)){
    const info=exerciseInfo(type);
    assert.ok(info.name&&info.unit&&info.placement&&info.instruction&&info.breathing,type);
    assert.equal(info.axes.length,4,type);
    assert.equal((entry as any).stages.length,4,type);
    assert.ok((entry as any).exerciseIds.length>0,type);
    assert.ok(isCameraExercise(type),type);
  }
});

test('tier entries are verbatim copies of their library profiles (single source of truth, no drift)',()=>{
  const shared=['name','english','unit','placement','instruction','joints','axes','stages','exerciseIds','recognitionVersion'] as const;
  for(const type of TIER_PROFILES){
    const standalone=(standaloneDefinitions as any)[type],library=(libraryDefinitions as any)[type];
    assert.ok(standalone&&library,type);
    for(const field of shared)assert.deepEqual(standalone[field],library[field],`${type}.${field}`);
    assert.equal(standalone.recognitionVersion,6,type);
    // The one adapted field: the standalone registry adds a breathing cue
    // (the library profile shape has none; the voice coach reads it here).
    assert.ok(typeof standalone.breathing==='string'&&standalone.breathing.length>0,type);
    assert.ok(!('breathing' in library),type);
  }
});

test('every camera-linked catalog movement (56) is picker-reachable or explicitly plan-only',()=>{
  const bindings=new Map<string,string>();
  const bind=(id:string,profile:string)=>{const prev=bindings.get(id);assert.ok(prev===undefined||prev===profile,`${id} bound to both ${prev} and ${profile}`);bindings.set(id,profile);};
  for(const [profile,definition] of Object.entries(standaloneDefinitions))for(const id of (definition as any).exerciseIds)bind(id,profile);
  for(const [profile,definition] of Object.entries(libraryDefinitions))for(const id of (definition as any).exerciseIds)bind(id,profile);
  // Direct bindings in server/src/gym/camera.ts that live outside the JSON registries.
  bind('exdb:0294','biceps_curl');bind('exdb:0416','biceps_curl');bind('exdb:0334','lateral_raise');
  bind('exdb:0405','shoulder_press');bind('exdb:0293','bent_over_row');bind('exdb:1373','calf_raise');
  bind('movemate:reverse_lunge','reverse_lunge');
  // Core motion types (server planCamera core map) are the picker's base entries.
  bind('motion:squat','squat');bind('motion:jumping_jack','jumping_jack');bind('motion:high_knees','high_knees');bind('motion:push_up','push_up');
  assert.equal(bindings.size,56);
  const unaccounted=new Set<string>();
  for(const [id,profile] of bindings){
    if(isCameraExercise(profile))continue;
    if(PLAN_ONLY_PROFILES.includes(profile))continue;
    unaccounted.add(`${id} -> ${profile}`);
  }
  assert.deepEqual([...unaccounted],[]);
  // The plan-only list must not silently grow stale either: every entry on it
  // is a real bound profile that is not in the picker.
  const boundProfiles=new Set(bindings.values());
  for(const profile of PLAN_ONLY_PROFILES){assert.ok(boundProfiles.has(profile),`${profile} no longer bound`);assert.ok(!isCameraExercise(profile),`${profile} joined the picker — remove it from PLAN_ONLY_PROFILES`);}
  // Reverse consistency: every picker trial entry's catalog ids bind back to it.
  for(const [profile,definition] of Object.entries(standaloneDefinitions))for(const id of (definition as any).exerciseIds)assert.equal(bindings.get(id),profile);
});

test('picker selection constructs the same tracker as the plan path for every tier profile',()=>{
  const routes:Record<string,{kind:'plan'|'extended',type:string}>={
    dumbbell_standing_press:{kind:'plan',type:'shoulder_press'},
    barbell_military_press:{kind:'plan',type:'shoulder_press'},
    dumbbell_reverse_lunge:{kind:'plan',type:'reverse_lunge'},
    seated_calf_raise:{kind:'plan',type:'seated_calf_raise'},
    dumbbell_deadlift:{kind:'extended',type:'barbell_deadlift'},
    barbell_good_morning:{kind:'extended',type:'romanian_deadlift'},
    one_arm_row:{kind:'extended',type:'one_arm_row'},
    lying_leg_raise:{kind:'extended',type:'lying_leg_raise'},
    upright_row:{kind:'extended',type:'upright_row'},
    mountain_climber:{kind:'extended',type:'mountain_climber'},
    split_squat:{kind:'extended',type:'split_squat'},
    bench_dip:{kind:'extended',type:'bench_dip'},
  };
  for(const [profile,route] of Object.entries(routes)){
    const tracker=createRecognitionTracker(profile,20);
    if(route.kind==='plan'){assert.ok(tracker instanceof PlanExerciseTracker,profile);assert.equal((tracker as PlanExerciseTracker).type,route.type,profile);}
    else{assert.ok(tracker instanceof ExtendedExerciseTracker,profile);assert.equal((tracker as ExtendedExerciseTracker).type,route.type,profile);}
  }
});

test('standalone demo loop (useExerciseMetrics timing) counts reps for every tier profile',()=>{
  for(const type of TIER_PROFILES){
    const tracker=createRecognitionTracker(type,20);let now=0;
    const feed=(stage:'neutral'|'peak'|'left'|'right',ms:number)=>{const frame=newDemonstrationPose(type as NewExerciseType,stage);for(let t=0;t<ms;t+=100){now+=100;tracker.update(frame.landmarks,now,1,frame.worldLandmarks);}};
    feed('neutral',2600);
    // Mirrors the demo driver: per-side types alternate left/right stages,
    // all other types alternate peak/neutral, one second per stage.
    const stages:Array<'neutral'|'peak'|'left'|'right'>=(type==='one_arm_row'||type==='mountain_climber')?['left','neutral','right','neutral','left','neutral','right','neutral']:['peak','neutral','peak','neutral'];
    for(const stage of stages)feed(stage,1000);
    assert.ok(tracker.metrics.reps>=2,`${type}: demo reps=${tracker.metrics.reps}`);
    if(type==='one_arm_row'||type==='mountain_climber'){
      assert.ok((tracker.metrics.scoreAccumulator.leftReps||0)>=1,`${type}: left side never counted in demo`);
      assert.ok((tracker.metrics.scoreAccumulator.rightReps||0)>=1,`${type}: right side never counted in demo`);
    }
  }
});
