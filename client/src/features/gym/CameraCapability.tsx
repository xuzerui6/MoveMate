import { exerciseInfo } from '../motion/lib/exercises';
export function CameraCapability({exercise}:{exercise:any}) {
  if(!exercise)return null;
  const capability=exercise.planCamera;
  if(!capability&&!exercise.cameraType)return <p className="gym-muted">本动作使用手动记录。</p>;
  const info=capability||exerciseInfo(exercise.cameraType);
  return <details className="gym-camera-preparation"><summary>摄像头自动记组{capability?' · 试用':''}</summary><p>{info.placement}</p><p>{info.instruction}</p>{capability&&<><p>需看清：{capability.joints}</p><p>{capability.limitations}</p><p>评分维度：{capability.axes.join('、')}</p></>}<small>次数组、双侧合计可用。计时组或仅单侧的组请手动记录。计划内仍按有效时长结算 XP。</small></details>;
}
