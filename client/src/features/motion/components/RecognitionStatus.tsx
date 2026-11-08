import type { CameraExerciseType } from '../lib/exercises'
import type { RecognitionDiagnostics } from '../lib/exerciseMetrics'
import './recognitionStatus.css'
import {isNewExercise,NEW_EXERCISES} from '../lib/newExercises'

const stages = {
  squat: {ready:'站好啦，开始下蹲',moving:'再往下一点点，你可以的',peak:'到位啦——慢慢站起来',returning:'好，站稳，我确认一下'},
  jumping_jack: {ready:'合拢站好，我们开始',moving:'一起展开，双手抬过肩',peak:'展开到位——合拢回来',returning:'好，合拢站稳，我确认一下'},
  high_knees: {ready:'站好啦，交替抬腿',moving:'再抬高一点点，你可以的',peak:'到位——落下，换另一侧',returning:'好，落稳，我确认一下'},
  push_up: {ready:'支撑好啦，开始下降',moving:'再往下一点点，你可以的',peak:'到位啦——推起来，回到支撑',returning:'好，撑稳，我确认一下'},
}

/**
 * 识别详情（原「识别诊断」）：识别页 v2 把阶段读数与全部诊断字段收进这个
 * 默认折叠的次级层——画面上只留状态胶囊、计次与一句陪伴句（见设计方案
 * §01/§05），字段一条不删，展开即可见。
 */
export function RecognitionStatus({type,diagnostics,paused=false,demo=false}:{type:CameraExerciseType;diagnostics:RecognitionDiagnostics;paused?:boolean;demo?:boolean}) {
  const {stage}=diagnostics
  const label=paused?'已暂停':stage==='calibrating'?'校准中':stage==='tracking_lost'?'看不清':stage==='cannot_assess'?'这个角度评不了':stage==='complete'?'目标完成':isNewExercise(type)?NEW_EXERCISES[type].stages[stage==='ready'?0:stage==='moving'?1:stage==='peak'?2:3]:stages[type][stage]
  return <div className="recognition-status">
    <details className="recognition-diagnostics"><summary>识别详情（仅本机）</summary>
      <dl><div><dt>当前阶段</dt><dd>{label}{!paused&&type==='high_knees'&&<> · 本对：左侧{diagnostics.pairedSides.includes('left')?'已完成':'待完成'}／右侧{diagnostics.pairedSides.includes('right')?'已完成':'待完成'}</>}</dd></div>
        <div><dt>{demo?'回放':'识别'}帧率</dt><dd>{paused?'—':diagnostics.fps} FPS</dd></div>
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
