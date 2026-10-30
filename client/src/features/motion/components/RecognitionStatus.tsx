import type { CameraExerciseType } from '../lib/exercises'
import type { RecognitionDiagnostics } from '../lib/exerciseMetrics'
import './recognitionStatus.css'
import {isNewExercise,NEW_EXERCISES} from '../lib/newExercises'

const stages = {
  squat: {ready:'站立就绪',moving:'下蹲中',peak:'下蹲幅度确认',returning:'站起确认'},
  jumping_jack: {ready:'合拢就绪',moving:'手脚展开中',peak:'展开幅度确认',returning:'合拢确认'},
  high_knees: {ready:'落地就绪',moving:'抬腿中',peak:'抬腿幅度确认',returning:'落腿确认'},
  push_up: {ready:'伸臂支撑就绪',moving:'屈肘下降中',peak:'下降幅度确认',returning:'推起确认'},
}

export function RecognitionStatus({type,diagnostics,paused=false,demo=false}:{type:CameraExerciseType;diagnostics:RecognitionDiagnostics;paused?:boolean;demo?:boolean}) {
  const {stage}=diagnostics
  const label=paused?'已暂停':stage==='calibrating'?'起始姿势校准':stage==='tracking_lost'?'等待有效画面':stage==='complete'?'目标已完成':isNewExercise(type)?NEW_EXERCISES[type].stages[stage==='ready'?0:stage==='moving'?1:stage==='peak'?2:3]:stages[type][stage]
  return <div className="recognition-status">
    <p className="recognition-stage">当前阶段：{label}{!paused&&type==='high_knees'&&<> · 本对：左侧{diagnostics.pairedSides.includes('left')?'已完成':'待完成'}／右侧{diagnostics.pairedSides.includes('right')?'已完成':'待完成'}</>}</p>
    <details className="recognition-diagnostics"><summary>识别诊断（仅本机）</summary>
      <dl><div><dt>{demo?'回放':'识别'}帧率</dt><dd>{paused?'—':diagnostics.fps} FPS</dd></div>
        <div><dt>关键关节置信度</dt><dd>{paused?'—':Math.round(diagnostics.confidence*100)+'%'}</dd></div>
        {type==='push_up'&&<div><dt>跟踪侧</dt><dd>{diagnostics.side===null?'待选择':diagnostics.side==='left'?'左侧':'右侧'}</dd></div>}
        {(type==='push_up'||type==='squat')&&<div><dt>{type==='push_up'?'肘角':'膝角'}</dt><dd>{paused||diagnostics.angle===null?'—':Math.round(diagnostics.angle)+'°'}</dd></div>}
        {diagnostics.basis&&<div><dt>计数依据</dt><dd>{diagnostics.basis}</dd></div>}
        {diagnostics.motion&&<div><dt>动作幅度</dt><dd>{paused?'—':diagnostics.motion}</dd></div>}
        <div><dt>最近重置原因</dt><dd>{diagnostics.lastResetReason||'暂无'}</dd></div>
      </dl><p>诊断数据仅在当前页面内存中使用，不上传或保存。{demo?'当前是演示，不是摄像头识别结果。':''}</p>
    </details>
  </div>
}
