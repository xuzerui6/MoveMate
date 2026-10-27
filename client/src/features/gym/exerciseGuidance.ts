type GuideExercise={id?:string;reviewStatus?:string;instructions?:unknown};

export function isUnreviewedOfficialExercise(exercise?:GuideExercise|null):boolean{
  return typeof exercise?.id==='string'&&/^(?:exdb|motion|movemate):/.test(exercise.id)&&exercise.reviewStatus!=='checked';
}

// Saved workout snapshots are immutable. An old or unresolved official record
// must not turn known-bad source wording into authoritative voice instructions.
export function workoutGuideInstruction(exercise?:GuideExercise|null,recognizerInstruction?:string):string{
  if(recognizerInstruction)return recognizerInstruction;
  if(!exercise)return '';
  if(isUnreviewedOfficialExercise(exercise))return '此动作的来源资料尚未核对。仅提供通用节奏、休息和记录提醒，不根据原始步骤给出具体姿势、负重或医疗建议；请先核对当前动作库。';
  return Array.isArray(exercise.instructions)?exercise.instructions.filter((s):s is string=>typeof s==='string').join(' '):'';
}
