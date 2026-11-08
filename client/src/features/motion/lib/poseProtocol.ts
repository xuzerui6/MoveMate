import type {NormalizedLandmark as Point} from '@mediapipe/tasks-vision';
export type PoseModel='lite'|'full'|'heavy';
export type PoseMode='worker-gpu'|'worker-cpu'|'main-gpu'|'main-cpu';
export type PoseFrame={runId:number;frameId:number;capturedAt:number;receivedAt:number;width:number;height:number;landmarks:Point[]|null;worldLandmarks:Point[]|null;model:PoseModel;mode:PoseMode};
export type PoseTelemetry={model:PoseModel;mode:PoseMode|null;fps:number;latency:number;latency50:number;inference:number;experiment:PoseModel|null;recoveredFrom:PoseModel|null;reason:string;preparing:boolean;lowPerformance:boolean;rung:string|null;selection:string|null;events:string[]};
export class FrameOrder {
 private id=-1;private time=-1;private runId:number;
 constructor(runId:number){this.runId=runId;}
 /** Rebind to a new run when a ladder step-down swaps the pose model
  * mid-session: frame ids restart with the run, but the captured-at
  * high-water mark is kept, so a late frame from before the swap can never
  * be accepted after it. */
 rebind(runId:number){this.runId=runId;this.id=-1;}
 accept(f:PoseFrame){
  if(f.runId!==this.runId||!Number.isInteger(f.frameId)||f.frameId<=this.id||!Number.isFinite(f.capturedAt)||f.capturedAt<=this.time||!Number.isFinite(f.receivedAt)||f.receivedAt<f.capturedAt||f.receivedAt-f.capturedAt>250||!Number.isFinite(f.width)||!Number.isFinite(f.height)||f.width<=0||f.height<=0)return false;
  this.id=f.frameId;this.time=f.capturedAt;return true;
 }
}
export const percentile=(xs:number[],q:number)=>xs.length?[...xs].sort((a,b)=>a-b)[Math.max(0,Math.ceil(xs.length*q)-1)]:Infinity;
export const percentile95=(xs:number[])=>percentile(xs,.95);
export const percentile50=(xs:number[])=>percentile(xs,.5);
export function fullIsFast(times:number[],latencies:number[]){const elapsed=times[times.length-1]-times[0];return times.length>=2&&elapsed>=2000&&(times.length-1)*1000/elapsed>=15&&percentile95(latencies)<=200;}
/** Why a measured probe or a running path was rejected. Diagnostics must name the
 * criterion — a bare "未达标" hid cold-start and framing artefacts in the first
 * experiment round, so every rejection carries its reason from here on. */
export type ProbeFailureReason='fps'|'frame-age'|'stall'|'init-error'|'inference-error';
export type ProbeEvaluation={pass:boolean;reason:ProbeFailureReason|null;fps:number;latency95:number};
/** Judge one completed measurement window (warm-up frames are never passed in).
 * fps is checked before frame age: a path that cannot deliver frames at all is
 * reported as fps/stall, a path that delivers them too late as frame-age. */
export function evaluateProbe(times:number[],latencies:number[],windowMs=2000,minFps=15,maxLatency95=200):ProbeEvaluation{
 if(times.length<2)return {pass:false,reason:'stall',fps:0,latency95:Infinity};
 const elapsed=times[times.length-1]-times[0],fps=(times.length-1)*1000/Math.max(1,elapsed),latency95=percentile95(latencies);
 if(elapsed<windowMs)return {pass:false,reason:'stall',fps,latency95};
 if(fps<minFps)return {pass:false,reason:'fps',fps,latency95};
 if(latency95>maxLatency95)return {pass:false,reason:'frame-age',fps,latency95};
 return {pass:true,reason:null,fps,latency95};
}
/** Mid-session degradation judgement over the rolling window: same floors the
 * session always used (8 FPS) plus the probe's frame-age ceiling (200 ms P95). */
export function sustainedDegradation(fps:number,latency95:number):'fps'|'frame-age'|null{
 if(fps<8)return 'fps';
 if(latency95>200)return 'frame-age';
 return null;
}
export class TimeFilter {
 private points:Point[]|null=null;private derivatives:number[][]=[];private at=0;
 reset(){this.points=null;this.derivatives=[];this.at=0;}
 apply(raw:Point[],now:number){
  if(!this.points){this.points=raw.map(p=>({...p}));this.derivatives=raw.map(()=>[0,0,0]);this.at=now;return this.points;}
  const dt=Math.max(.001,(now-this.at)/1000),alpha=(cutoff:number)=>1/(1+1/(2*Math.PI*cutoff*dt));this.at=now;
  this.points=raw.map((p,i)=>{const q={...p};(['x','y','z'] as const).forEach((key,k)=>{const previous=this.points![i][key]||0,value=p[key]||0,d=this.derivatives[i][k]+alpha(1)*((value-previous)/dt-this.derivatives[i][k]);this.derivatives[i][k]=d;q[key]=previous+alpha(1.5+.03*Math.abs(d))*(value-previous);});return q;});return this.points;
 }
}
