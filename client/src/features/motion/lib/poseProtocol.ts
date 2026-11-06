import type {NormalizedLandmark as Point} from '@mediapipe/tasks-vision';
export type PoseModel='lite'|'full'|'heavy';
export type PoseMode='worker-gpu'|'worker-cpu'|'main-gpu'|'main-cpu';
export type PoseFrame={runId:number;frameId:number;capturedAt:number;receivedAt:number;width:number;height:number;landmarks:Point[]|null;worldLandmarks:Point[]|null;model:PoseModel;mode:PoseMode};
export type PoseTelemetry={model:PoseModel;mode:PoseMode|null;fps:number;latency:number;latency50:number;inference:number;experiment:PoseModel|null;recoveredFrom:PoseModel|null;reason:string;preparing:boolean;lowPerformance:boolean};
export class FrameOrder {
 private id=-1;private time=-1;
 constructor(readonly runId:number){}
 accept(f:PoseFrame){
  if(f.runId!==this.runId||!Number.isInteger(f.frameId)||f.frameId<=this.id||!Number.isFinite(f.capturedAt)||f.capturedAt<=this.time||!Number.isFinite(f.receivedAt)||f.receivedAt<f.capturedAt||f.receivedAt-f.capturedAt>250||!Number.isFinite(f.width)||!Number.isFinite(f.height)||f.width<=0||f.height<=0)return false;
  this.id=f.frameId;this.time=f.capturedAt;return true;
 }
}
export const percentile=(xs:number[],q:number)=>xs.length?[...xs].sort((a,b)=>a-b)[Math.max(0,Math.ceil(xs.length*q)-1)]:Infinity;
export const percentile95=(xs:number[])=>percentile(xs,.95);
export const percentile50=(xs:number[])=>percentile(xs,.5);
export function fullIsFast(times:number[],latencies:number[]){const elapsed=times[times.length-1]-times[0];return times.length>=2&&elapsed>=2000&&(times.length-1)*1000/elapsed>=15&&percentile95(latencies)<=200;}
export class TimeFilter {
 private points:Point[]|null=null;private derivatives:number[][]=[];private at=0;
 reset(){this.points=null;this.derivatives=[];this.at=0;}
 apply(raw:Point[],now:number){
  if(!this.points){this.points=raw.map(p=>({...p}));this.derivatives=raw.map(()=>[0,0,0]);this.at=now;return this.points;}
  const dt=Math.max(.001,(now-this.at)/1000),alpha=(cutoff:number)=>1/(1+1/(2*Math.PI*cutoff*dt));this.at=now;
  this.points=raw.map((p,i)=>{const q={...p};(['x','y','z'] as const).forEach((key,k)=>{const previous=this.points![i][key]||0,value=p[key]||0,d=this.derivatives[i][k]+alpha(1)*((value-previous)/dt-this.derivatives[i][k]);this.derivatives[i][k]=d;q[key]=previous+alpha(1.5+.03*Math.abs(d))*(value-previous);});return q;});return this.points;
 }
}
