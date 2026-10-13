import { useEffect, useState } from 'react';
import { useStore } from './lib/store';
import { SPORT_LABELS } from '../../types';
import { getErrorMessage } from '../../api/client';
import Dialog from '../../components/Dialog';
const rate=(sport:string)=>['running','swimming'].includes(sport)?3:['basketball','badminton','soccer','volleyball','tennis','table_tennis'].includes(sport)?2:1;
export default function SportTimer({gameId,sportType='fitness',enabled=true}:{gameId?:number;sportType?:string;enabled?:boolean}) {
  const {sessions,startSession,act}=useStore();
  const row=gameId?sessions.find(s=>s.gameId===gameId):sessions.find(s=>!s.gameId&&['running','paused'].includes(s.status));
  const another=sessions.find(s=>['running','paused'].includes(s.status)&&s.id!==row?.id);
  const [now,setNow]=useState(Date.now()),[baseline,setBaseline]=useState(Date.now()),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<any>(null),[confirming,setConfirming]=useState(false);
  useEffect(()=>{setBaseline(Date.now());},[row]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(timer);},[]);
  const seconds=(row?.effectiveSeconds||0)+(row?.status==='running'?Math.max(0,Math.floor((now-baseline)/1000)):0);
  const action=async(name:string)=>{setBusy(true);setError('');try{const r=name==='start'?await startSession(sportType,'timer',gameId):await act(row!.id,name);if(name==='finish')setResult(r);}catch(err){setError(getErrorMessage(err));}finally{setBusy(false);}};
  const label=SPORT_LABELS[row?.sportType||sportType]||row?.sportType||sportType;
  return <div className="motion-view"><section className="sport-timer card" aria-label="个人运动计时">
    <div className="section-title"><b>{label+' · 个人计时'}</b><span>{row?.source==='camera'?'2 XP / 次':row?.source==='demo'?'演示 · 0 XP':`${rate(row?.sportType||sportType)} XP / 有效分钟`}</span></div>
    <strong className="timer-clock" data-testid="sport-clock">{String(Math.floor(seconds/60)).padStart(2,'0')}:{String(seconds%60).padStart(2,'0')}</strong>
    <p className={gameId&&row?.status==='running'?'sr-only':undefined}>{row?.settled?`已结算 · +${row.xpEarned} XP`:row?.status==='finished'?'运动已结束，等待活动结算':row?.status==='paused'?'已暂停，休息不计时':row?.status==='running'?'正在记录你的运动时长':'每人独立计时，开始后记录有效时长'}</p>
    {row?.source==='demo'&&<p>演示动作不增加 XP</p>}
    {error&&<p role="alert" className="motion-error">{error}</p>}
    {!row&&result&&<p role="status">本次 {result.effectiveSeconds} 秒 · +{result.xpEarned} XP，已保存</p>}
    <div className="timer-actions">
      {!row&&enabled&&!another&&<button className="primary" onClick={()=>void action('start')} disabled={busy}>开始运动</button>}
      {another&&<a href={another.gameId?'/game/'+another.gameId:'/train'}>你有另一项运动，点击恢复</a>}
      {row&&!row.settled&&enabled&&['running','paused'].includes(row.status)&&<>
        <button className="secondary" disabled={busy} onClick={()=>void action(row.status==='running'?'pause':'resume')}>{row.status==='running'?'暂停运动':'继续运动'}</button>
        {row.status!=='finished'&&<button className="primary" disabled={busy} onClick={()=>setConfirming(true)}>结束计时</button>}
      </>}
    </div>
    {confirming&&<Dialog title="结束这次运动？" onClose={()=>{if(!busy)setConfirming(false);}}><p className="dialog-copy">{gameId?'结束个人计时后等待活动结算。':'结束后保存本次运动，并按有效运动量结算 XP。'}</p><div className="dialog-actions"><button className="btn btn--secondary" disabled={busy} onClick={()=>setConfirming(false)}>继续运动</button><button className="btn btn--primary" disabled={busy} onClick={async()=>{await action('finish');setConfirming(false);}}>{busy?'正在结束…':'确认结束'}</button></div></Dialog>}
  </section><p className="timer-rule">暂停期间不计时。{gameId?'本场活动结束后，按确认到场成员的有效运动量结算。':'结束后按完整有效秒数结算，结果由服务器确认。'}</p></div>;
}
