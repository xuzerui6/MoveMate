/** Deliberate ID allowlist: names, imported data and custom exercises never grant recognition. */
import extended from './new-recognition.json';
const legacyProfiles = ["biceps_curl", "lateral_raise", "shoulder_press", "bent_over_row", "reverse_lunge", "calf_raise"] as const;
export type NewPlanProfile = typeof legacyProfiles[number] | keyof typeof extended;
export const planProfiles:readonly NewPlanProfile[] = [...legacyProfiles,...Object.keys(extended) as (keyof typeof extended)[]];
const profiles: Record<NewPlanProfile, { name: string; placement: string; instruction: string; joints: string; axes: string[] }> = {
  ...extended,
  biceps_curl: { name: "站姿双臂哑铃弯举", placement: "正面略侧身，肩、肘、手腕和髋完整入镜。", instruction: "双臂垂下站稳两秒；同时弯举，再放回伸臂位置。", joints: "双肩、双肘、双手腕、双髋", axes: ["屈肘幅度", "上臂稳定", "躯干控制", "双臂协调"] },
  lateral_raise: { name: "站姿双臂哑铃侧平举", placement: "正面拍摄，双手侧举后仍需完整入镜。", instruction: "双臂垂下站稳两秒；同时侧举至接近肩高，再放回。", joints: "双肩、双肘、双手腕、双髋", axes: ["抬举幅度", "手臂控制", "躯干控制", "双臂协调"] },
  shoulder_press: { name: "坐姿双臂哑铃肩推", placement: "正面略侧身，肩、肘、手腕和髋入镜，举过头顶的双手不能出画。", instruction: "坐稳，双手在肩部高度保持两秒；同时推起，再放回。", joints: "双肩、双肘、双手腕、双髋", axes: ["推举幅度", "推举控制", "躯干控制", "双臂协调"] },
  bent_over_row: { name: "双臂哑铃俯身划船", placement: "从斜侧面拍摄，双肩、双肘、双手腕、髋和膝清晰可见。", instruction: "保持俯身、双臂垂下两秒；双肘向后拉起，再放回。", joints: "双肩、双肘、双手腕、双髋、双膝", axes: ["划船幅度", "手臂控制", "俯身稳定", "双臂协调"] },
  reverse_lunge: { name: "交替后撤弓步", placement: "斜侧面全身拍摄，双脚后撤仍在画面内，肩、髋、膝和脚踝清晰可见。", instruction: "站稳两秒；一侧向后撤并下沉，再回到并脚站立；每侧完成计一次。", joints: "双肩、双髋、双膝、双脚踝", axes: ["弓步幅度", "支撑控制", "躯干控制", "左右协调"] },
  calf_raise: { name: "平地双脚提踵", placement: "从斜侧面拍摄全身，双脚跟与前脚掌都要清晰可见；不要使用台阶。", instruction: "脚跟落地站稳两秒；双脚同时提踵，再缓慢落回。", joints: "双肩、双髋、双膝、双脚踝、双脚跟、双前脚掌", axes: ["提踵幅度", "落跟控制", "直立稳定", "双脚协调"] },
};
const bindings: Record<string, NewPlanProfile> = {
  ...Object.fromEntries(Object.entries(extended).flatMap(([profile,info])=>info.exerciseIds.map(id=>[id,profile as NewPlanProfile]))),
  "exdb:0294": "biceps_curl", "exdb:0416": "biceps_curl",
  "exdb:0334": "lateral_raise", "exdb:0405": "shoulder_press",
  "exdb:0293": "bent_over_row", "exdb:1373": "calf_raise",
  "movemate:reverse_lunge": "reverse_lunge",
};
export function planCameraFor(id: string) {
  const profile = bindings[id];
  return profile ? { profile, status: "trial" as const, unit: "次", ...profiles[profile], limitations: "仅支持此标准动作；重量由本人填写，不能识别负重。变式、遮挡或拍摄角度不符时请改为手动。" } : undefined;
}
export function snapshotCameraProfile(exercise: any): string | undefined {
  if (exercise.id === "motion:" + exercise.cameraType && ["squat", "jumping_jack", "high_knees", "push_up"].includes(exercise.cameraType)) return exercise.cameraType;
  const allowed = planCameraFor(exercise.id);
  return allowed && exercise.planCamera?.profile === allowed.profile ? allowed.profile : undefined;
}
