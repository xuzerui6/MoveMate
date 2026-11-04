import type {PoseTelemetry} from '../lib/poseProtocol';
import type {RecognitionPreference} from '../lib/adaptiveRecognition';
export function RecognitionOverride({eligible,disabled,preference,onChange}:{eligible:boolean;disabled:boolean;preference:RecognitionPreference;onChange:(value:RecognitionPreference)=>void}){
 if(!eligible)return null;
 return <label className="training-recognition-choice">识别方式（新记录）<select aria-label="识别方式" value={preference} disabled={disabled} onChange={e=>onChange(e.target.value==='legacy'?'legacy':'auto')}><option value="auto">自动 · 新版自适应优先</option><option value="legacy">旧版</option></select><small>默认自动选择新版自适应；若在这台设备上识别不稳定，可改选旧版，对之后的新记录生效。已开始或已保存的训练仍用原策略。此选择只保存在本机。</small></label>;
}
const modes={'worker-gpu':'Worker GPU','worker-cpu':'Worker CPU','main-gpu':'主线程 GPU（降级）','main-cpu':'主线程 CPU（降级）'};
export function PoseDiagnostics({telemetry}:{telemetry:PoseTelemetry|null}){
 if(!telemetry)return null;
 return <section className="pose-runtime-diagnostics">{telemetry.preparing&&<p role="status">{telemetry.reason}</p>}<details><summary>模型与性能诊断（仅本机）</summary><dl><div><dt>模型／运行方式</dt><dd>{telemetry.model==='full'?'Full':'Lite'} · {telemetry.mode?modes[telemetry.mode]:'推理通道准备中'}</dd></div><div><dt>有效帧率</dt><dd>{telemetry.fps.toFixed(1)} FPS</dd></div><div><dt>结果延迟 P95</dt><dd>{Math.round(telemetry.latency)} ms</dd></div><div><dt>当前原因</dt><dd>{telemetry.reason}</dd></div></dl><p>帧率、延迟与关键点置信度均不是识别准确率。诊断不保存影像或关键点序列。</p></details></section>;
}
