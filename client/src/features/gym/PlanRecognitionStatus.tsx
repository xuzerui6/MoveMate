import { RecognitionStatus } from '../motion/components/RecognitionStatus';
import type { RecognitionDiagnostics } from '../motion/lib/exerciseMetrics';
import type { PlanRecognitionType } from './usePlanRecognition';
import { isNewPlanProfile, PLAN_STAGE_COPY } from './planRecognition';
import {isNewExercise} from '../motion/lib/newExercises';
import {isLibraryRecognition,LIBRARY_RECOGNITION} from './libraryRecognition';
export function PlanRecognitionStatus({type,diagnostics,paused}:{type:PlanRecognitionType;diagnostics:RecognitionDiagnostics;paused:boolean}){
  if(!isLibraryRecognition(type)&&(isNewExercise(type)||!isNewPlanProfile(type)))return <RecognitionStatus type={type} diagnostics={diagnostics} paused={paused}/>;
  const stage=diagnostics.stage;
  const copy=isLibraryRecognition(type)?LIBRARY_RECOGNITION[type].stages:PLAN_STAGE_COPY[type];
  const label=paused?'已暂停':stage==='calibrating'?'起始姿势校准':stage==='tracking_lost'?'等待有效画面':stage==='complete'?'目标已完成':copy[stage==='ready'?0:stage==='moving'?1:stage==='peak'?2:3];
  return <div className="recognition-status"><p className="recognition-stage">当前阶段：{label}</p><details className="recognition-diagnostics"><summary>识别诊断（仅本机）</summary><dl><div><dt>识别帧率</dt><dd>{paused?'—':diagnostics.fps+' FPS'}</dd></div><div><dt>关键关节置信度</dt><dd>{paused?'—':Math.round(diagnostics.confidence*100)+'%'}</dd></div><div><dt>计数依据</dt><dd>{diagnostics.basis||'等待校准'}</dd></div><div><dt>动作幅度</dt><dd>{paused?'—':diagnostics.motion||'等待有效画面'}</dd></div><div><dt>最近重置原因</dt><dd>{diagnostics.lastResetReason||'暂无'}</dd></div></dl><p>识别在本地进行，关键点不上传、不落盘。新动作识别为试用，评分仅作为训练反馈。</p></details></div>;
}
