import { useEffect, useRef, useState } from 'react';
import { ExerciseLibrary } from './Library';
import { request,useGymQuery,getErrorMessage } from './api';
export function useWorkoutPreferences(active:boolean,rest:number){
 const query=useGymQuery('/training-settings'),[deviceMessage,setDeviceMessage]=useState('');
 const audio=useRef<AudioContext|null>(null),previous=useRef(rest);
 useEffect(()=>{
  if(query.data?.sound&&previous.current>0&&rest===0&&active&&audio.current){const ctx=audio.current,o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);g.gain.value=.12;o.frequency.value=660;o.start();o.stop(ctx.currentTime+.25);}
  previous.current=rest;
 },[rest,active,query.data?.sound]);
 useEffect(()=>{
  if(!active||!query.data?.wakeLock)return;
  let alive=true,lock:any;const acquire=async()=>{if(document.visibilityState!=='visible')return;try{if(!(navigator as any).wakeLock)throw Error('unsupported');const next=await(navigator as any).wakeLock.request('screen');if(!alive)await next.release();else lock=next;setDeviceMessage('已申请屏幕常亮；锁屏后不保证声音提醒');}catch{setDeviceMessage('当前浏览器无法保持常亮，请保持页面在前台');}};
  void acquire();document.addEventListener('visibilitychange',acquire);return()=>{alive=false;void lock?.release();document.removeEventListener('visibilitychange',acquire);};
 },[active,query.data?.wakeLock]);
 return {prefs:query.data,deviceMessage,settings:<details className="gym-form"><summary>训练偏好与提醒</summary>{query.error&&<p className="gym-error">{query.error}</p>}{query.data&&<>
 {(['sound','wakeLock'] as const).map(k=><label className="gym-checkbox" key={k}><input type="checkbox" checked={query.data[k]} onChange={async e=>{if(k==='sound'&&e.target.checked){audio.current ||= new AudioContext();void audio.current.resume();}try{query.setData(await request('PUT','/training-settings',{[k]:e.target.checked}));}catch(e){setDeviceMessage(getErrorMessage(e));}}}/>{k==='sound'?'休息结束声音提醒（需本页开启）':'训练时保持屏幕常亮'}</label>)}
 <label>手动用力程度<select value={query.data.effort} onChange={async e=>{try{query.setData(await request('PUT','/training-settings',{effort:e.target.value}));}catch(e){setDeviceMessage(getErrorMessage(e));}}}><option value="off">关闭</option><option value="rpe">RPE · 主观用力 0–10</option><option value="rir">RIR · 预留次数 0–10</option></select></label><small>用力程度由本人填写，与摄像头评分独立，不影响 XP。离开训练释放常亮；锁屏不保证声音。</small></>}</details>};
}
export function WorkoutEditor({row,run,busy}:{row:any;run:(action:string,values:any)=>Promise<any>;busy:boolean}){
 const [pick,setPick]=useState<{kind:string,targetId?:string}|null>(null),[error,setError]=useState('');
 const edit=async(values:any)=>{try{await run('edit',{edit:values});setError('');setPick(null);}catch(e){setError(getErrorMessage(e));}};
 const allowed=!busy&&['ready','resting'].includes(row.phase);
 return <details className="gym-form"><summary>调整本次训练安排</summary><p className="gym-muted">只影响本次。当前组须先暂停并完成或跳过；已发生运动的组保留。</p>{error&&<p role="alert" className="gym-error">{error}</p>}
 <button className="secondary" disabled={!allowed} onClick={()=>setPick({kind:'add'})}>添加动作／组</button>
 {row.sets.map((s:any,i:number)=><div className="gym-list-row gym-edit-row" key={s.id}><span>{i+1}. {s.exercise.nameZh} · {s.targetReps} 次 · {s.status==='removed'?'已移除':s.status==='completed'?'已完成':s.status==='pending'?'未开始':'已记录'}</span><div className="gym-inline-actions">
 {s.status!=='removed'&&<button disabled={!allowed} onClick={()=>void edit({kind:'copy',targetId:s.id})}>复制组</button>}
 {s.status==='pending'&&<><button disabled={!allowed} onClick={()=>setPick({kind:'replace',targetId:s.id})}>换动作</button><button disabled={!allowed||!row.sets.slice(0,i).some((x:any)=>x.status==='pending')} onClick={()=>void edit({kind:'move',targetId:s.id,beforeId:row.sets.slice(0,i).filter((x:any)=>x.status==='pending').at(-1)?.id})}>上移</button><button disabled={!allowed} onClick={()=>void edit({kind:'remove',targetId:s.id})}>移除</button></>}
 {s.status==='removed'&&<button disabled={!allowed} onClick={()=>void edit({kind:'undo',targetId:s.id})}>撤销移除</button>}</div></div>)}
 {pick&&<div><button onClick={()=>setPick(null)}>收起动作选择</button><ExerciseLibrary onPick={e=>void edit({...pick,exerciseId:e.id})}/></div>}</details>;
}
export function SaveAsPlan({id}:{id:string}){
 const [name,setName]=useState('本次训练计划'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 return <details className="gym-form"><summary>另存为新计划</summary><label>计划名称<input maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label><button disabled={busy||!name.trim()} className="secondary" onClick={async()=>{setBusy(true);try{await request('POST','/workout-sessions/'+id+'/save-plan',{name});setMessage('已保存为新计划，可到“我的计划”编辑');}catch(e){setMessage(getErrorMessage(e));}finally{setBusy(false);}}}>确认另存</button>{message&&<p role="status">{message}</p>}</details>;
}
