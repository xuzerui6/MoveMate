import {NEW_EXERCISES,type NewExerciseType} from './newExercises'
export type BaseCameraExerciseType = 'squat' | 'jumping_jack' | 'high_knees' | 'push_up'
export type CameraExerciseType = BaseCameraExerciseType | NewExerciseType
export const BASE_CAMERA_EXERCISES = {
  squat: { name: '深蹲', english: 'SQUAT', unit: '次', placement: '全身入镜，略侧身；让肩、髋、膝和脚踝都清晰可见。', instruction: '站稳后下蹲，再回到站立，完成一次。', breathing: '下蹲时吸气，起身时呼气，不要憋气。', axes: ['下蹲深度', '膝盖稳定', '躯干控制', '左右对称'] },
  jumping_jack: { name: '开合跳', english: 'JUMPING JACK', unit: '次', placement: '正面对着摄像头，双脚和举过头顶的双手都要入镜。', instruction: '手脚一起展开，再一起回到合拢位置，完成一次。', breathing: '保持自然呼吸，落地轻一些。', axes: ['展开幅度', '落地控制', '躯干姿态', '手脚协调'] },
  high_knees: { name: '高抬腿', english: 'HIGH KNEES', unit: '组', placement: '正面对着摄像头，全身入镜；保持髋、膝和脚踝清晰。', instruction: '左右各抬腿并落下算一组；重复同一侧不会增加组数。', breathing: '随着左右抬腿自然呼吸，身体保持直立。', axes: ['抬腿幅度', '支撑稳定', '躯干姿态', '左右协调'] },
  push_up: { name: '俯卧撑', english: 'PUSH UP', unit: '次', placement: '摄像头从侧面拍摄，肩、肘、手腕、髋和脚踝都要入镜。', instruction: '从伸臂支撑开始，屈肘下降，再推起，完成一次。', breathing: '下降时吸气，推起时呼气，不要憋气。', axes: ['屈伸幅度', '支撑控制', '身体连线', '屈伸协调'] },
} as const
export const CAMERA_EXERCISES = {...BASE_CAMERA_EXERCISES,...NEW_EXERCISES}
export const isCameraExercise = (value: string): value is CameraExerciseType => Object.prototype.hasOwnProperty.call(CAMERA_EXERCISES, value)
const unknownExercise={name:'未知动作，请刷新页面',english:'UNSUPPORTED',unit:'次',placement:'当前客户端不支持此动作，请刷新后恢复或切换手动记录。',instruction:'请刷新页面核对动作，不能用其他识别器代替。',breathing:'保持自然呼吸。',axes:['幅度','控制','姿态','协调']}
export const exerciseInfo = (value: string) => isCameraExercise(value)?CAMERA_EXERCISES[value]:unknownExercise
