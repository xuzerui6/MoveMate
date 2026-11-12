type GuideExercise={id?:string;reviewStatus?:string;instructions?:unknown};

export function isUnreviewedOfficialExercise(exercise?:GuideExercise|null):boolean{
  return typeof exercise?.id==='string'&&/^(?:exdb|motion|movemate):/.test(exercise.id)&&exercise.reviewStatus!=='checked';
}

// Saved workout snapshots are immutable. An old or unresolved official record
// must not turn known-bad source wording into authoritative voice instructions.
export function workoutGuideInstruction(exercise?:GuideExercise|null,recognizerInstruction?:string):string{
  if(recognizerInstruction)return recognizerInstruction;
  if(!exercise)return '';
  if(isUnreviewedOfficialExercise(exercise))return '这个动作的资料还没核对完，这里只给通用的节奏、休息和记录提醒，不给具体的姿势、负重或健康建议；想看细节，先去动作库里对一下。';
  return Array.isArray(exercise.instructions)?exercise.instructions.filter((s):s is string=>typeof s==='string').join(' '):'';
}
