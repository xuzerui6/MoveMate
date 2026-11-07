import type {PoseTelemetry} from '../lib/poseProtocol';
import {poseModelLabel} from '../lib/poseTransport';
import type {RecognitionPreference} from '../lib/adaptiveRecognition';
import type {PoseModelPreference} from '../lib/poseCompatibility';
export function RecognitionOverride({eligible,disabled,preference,onChange}:{eligible:boolean;disabled:boolean;preference:RecognitionPreference;onChange:(value:RecognitionPreference)=>void}){
 if(!eligible)return null;
 return <label className="training-recognition-choice">识别方式（新记录）<select aria-label="识别方式" value={preference} disabled={disabled} onChange={e=>onChange(e.target.value==='legacy'?'legacy':'auto')}><option value="auto">自动 · 新版自适应优先</option><option value="legacy">旧版</option></select><small>默认自动选择新版自适应；若在这台设备上识别不稳定，可改选旧版，对之后的新记录生效。已开始或已保存的训练仍用原策略。此选择只保存在本机。</small></label>;
}
export function PoseModelExperimentSelect({eligible,disabled,value,onChange}:{eligible:boolean;disabled:boolean;value:PoseModelPreference;onChange:(value:PoseModelPreference)=>void}){
 if(!eligible)return null;
 const parse=(raw:string):PoseModelPreference=>raw==='lite'||raw==='full'||raw==='heavy'?raw:'auto';
 return <label className="training-recognition-choice">识别模型实验（本机）<select aria-label="识别模型实验" value={value} disabled={disabled} onChange={e=>onChange(parse(e.target.value))}><option value="auto">默认（自动）</option><option value="lite">Lite（现行 · 约 5.8 MB）</option><option value="full">Full（实验 · 约 9.4 MB）</option><option value="heavy">Heavy（实验 · 约 30.7 MB）</option></select><small>默认（自动）会按这台设备的实测速度选模型：先试更准的 Full（Worker／主线程），不达标自动降级到 Lite，结论保存在本机、下次先复核再用。手动选 Full / Heavy 是实验：首次选用需下载对应模型文件，若速度不达标会自动恢复 Lite，本组不会作废。切换后对新开始的训练生效；帧率与延迟见下方诊断。此选择只保存在本机。</small></label>;
}
const modes={'worker-gpu':'Worker GPU','worker-cpu':'Worker CPU','main-gpu':'主线程 GPU（降级）','main-cpu':'主线程 CPU（降级）'};
const selections:Record<string,string>={probe:'本次实测选择',cache:'本机缓存结论（已快速复核）',manual:'手动实验选择',forced:'手动 Lite'};
const rungName=(rung:string|null)=>{if(!rung)return null;const [model,path]=rung.split('-');const label=(poseModelLabel as Record<string,string>)[model]||model;return `${label} · ${path==='worker'?'Worker 通道':'主线程通道'}`;};
export function PoseDiagnostics({telemetry}:{telemetry:PoseTelemetry|null}){
 if(!telemetry)return null;
 return <section className="pose-runtime-diagnostics">{telemetry.preparing&&<p role="status">{telemetry.reason}</p>}<details><summary>识别详情 · 模型与性能（仅本机）</summary><dl><div><dt>模型／运行方式</dt><dd>{poseModelLabel[telemetry.model]} · {telemetry.mode?modes[telemetry.mode]:'推理通道准备中'}</dd></div>{rungName(telemetry.rung)&&<div><dt>选择路径</dt><dd>{rungName(telemetry.rung)}{telemetry.selection?`（${selections[telemetry.selection]||telemetry.selection}）`:''}</dd></div>}{telemetry.experiment&&<div><dt>实验选择</dt><dd>{poseModelLabel[telemetry.experiment]}（实验）</dd></div>}{telemetry.recoveredFrom&&telemetry.recoveredFrom!==telemetry.model&&<div><dt>实验恢复</dt><dd>{poseModelLabel[telemetry.recoveredFrom]} 未达标，已自动恢复 {poseModelLabel[telemetry.model]}</dd></div>}{telemetry.events.length>0&&<div><dt>模型选择记录</dt><dd>{telemetry.events.map((event,index)=><span key={index} style={{display:'block'}}>{event}</span>)}</dd></div>}<div><dt>有效帧率</dt><dd>{telemetry.fps.toFixed(1)} FPS</dd></div><div><dt>推理耗时 P95</dt><dd>{Math.round(telemetry.inference)} ms</dd></div><div><dt>帧龄 P50／P95</dt><dd>{Math.round(telemetry.latency50)} ms／{Math.round(telemetry.latency)} ms</dd></div><div><dt>当前原因</dt><dd>{telemetry.reason}</dd></div></dl><p>帧率、延迟与关键点置信度均不是识别准确率。诊断不保存影像或关键点序列。</p></details></section>;
}
