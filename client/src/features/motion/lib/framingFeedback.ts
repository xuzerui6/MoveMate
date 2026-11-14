import type {NormalizedLandmark as Point} from '@mediapipe/tasks-vision';
const names:Record<number,string>={0:'头部',11:'左肩',12:'右肩',13:'左肘',14:'右肘',15:'左手腕',16:'右手腕',23:'左髋',24:'右髋',25:'左膝',26:'右膝',27:'左脚踝',28:'右脚踝',29:'左脚跟',30:'右脚跟',31:'左前脚掌',32:'右前脚掌'};
/**
 * Upper-body movements: the hips (23/24) leave the FRAMING GATE only — in a
 * dorm the phone sits close, the extrapolated hips land below the frame's
 * bottom edge, and gating framing on them hard-rejected every frame so
 * calibration could never latch (2026-11-14 diagnosis, Trace 3). needed()
 * itself is untouched: hips still drive scorable/tilt/world-basis and every
 * visibility gate exactly as before; only the in-frame coordinate test —
 * here in the adaptive wrapper and, for wrapper-fed (prefiltered) trackers,
 * in the extended tracker's own coordinate gate — runs over this subset.
 */
export const UPPER_BODY_FRAMING_TYPES=new Set(['hammer_curl','biceps_curl','barbell_curl','reverse_barbell_curl','seated_curl','shoulder_press','dumbbell_standing_press','barbell_military_press','neutral_seated_press','bent_over_row','barbell_row','one_arm_row','bench_press','incline_bench_press','seated_triceps_extension','lying_triceps_extension','triceps_kickback','reverse_fly','seated_lateral_raise','upright_row','bench_dip']);
/** The indices the in-frame (framing) test runs over for this movement:
 * `needed` minus the hips for upper-body movements, `needed` unchanged otherwise. */
export function framingGateIndices(type:string,needed:number[]):number[]{
 return UPPER_BODY_FRAMING_TYPES.has(type)?needed.filter(i=>i!==23&&i!==24):needed;
}
/** Report only joints actually required by this action. Never clamp or accept out-of-frame samples. */
export function framingFeedback(points:Point[],required:number[]){
 const affected=required.filter(i=>points[i].x<0||points[i].x>1||points[i].y<0||points[i].y>1);
 if(!affected.length)return null;
 const parts=affected.map(i=>names[i]||`关节${i}`).slice(0,3).join('、')+(affected.length>3?'等':'');
 const bottom=affected.some(i=>points[i].y>1),top=affected.some(i=>points[i].y<0);
 const edge=bottom&&top?'上下边缘':bottom?'下沿':top?'上沿':'侧边';
 // The bottom-edge wording names what actually left: feet only when a
 // lower-body point (膝/踝/脚跟/脚掌, 25–32) is among the affected joints;
 // an arm-only exit gets arm wording instead of the generic feet copy.
 const lowerBody=affected.some(i=>i>=25&&i<=32);
 const action=bottom&&!top?(lowerBody?'请后退一点，或把镜头稍向下调整，让脚部完整入镜':'请后退一点，或把镜头稍向下调整，让手臂完整入镜'):top&&!bottom?'请后退一点，或把镜头稍向上调整':'请后退一点，并把身体移到画面中央';
 return {affected,message:`${parts}出画（画面${edge}）。${action}，入镜后继续做完整动作`};
}
