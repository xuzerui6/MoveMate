import {repUnit} from './trainingPresentation';
export function PlanComparison({local,server,names}:{local:any;server:any;names:Record<string,any>}){
  return <div className="gym-draft-comparison">{[['本机草稿',local],['服务器版本',server]].map(([title,p]:any)=><section key={title}>
    <h3>{title}</h3><p><b>{p.name}</b> · 版本 {p.version}</p><p>{p.mode==='rotation'?'循环训练':'每周排课'}</p>
    {p.routines.map((r:any)=><details key={r.id} open><summary>{r.name} · {r.exercises.length} 个动作</summary>
      <p>{r.weekdays.length?r.weekdays.map((d:number)=>'周'+['日','一','二','三','四','五','六'][d]).join('、'):'未设周日程'}</p>
      {r.exercises.map((e:any,i:number)=><div key={i}><b>{names[e.exerciseId]?.nameZh || e.exerciseId}</b>{e.sets.map((s:any,n:number)=><p key={n}>第 {n+1} 组 · {s.seconds?s.seconds+' 秒':s.reps+' '+repUnit(names[e.exerciseId])} · {s.loadKg} kg · 休息 {s.restSec} 秒</p>)}</div>)}
    </details>)}
  </section>)}</div>;
}
