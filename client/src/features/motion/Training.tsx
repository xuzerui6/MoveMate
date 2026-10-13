import {Header} from './components/Header';
import {Icon} from './components/Icons';
import {lazy,Suspense,useEffect,useState} from 'react';
import {useNavigate,Link} from 'react-router-dom';
import SportTimer from './SportTimer';
import {useStore} from './lib/store';
import {SPORT_LABELS} from '../../types';
import type {WorkoutSession} from './types';
const Workout=lazy(()=>import('./pages/Workout').then(m=>({default:m.Workout})));
const Summary=lazy(()=>import('./pages/Summary').then(m=>({default:m.Summary})));
export default function Training(){
 const {finishWorkout,sessions}=useStore(),navigate=useNavigate();
 const [mode,setMode]=useState<'select'|'squat'|'summary'>('select'),[sport,setSport]=useState('running'),[result,setResult]=useState<WorkoutSession|null>(null),[error,setError]=useState('');
 useEffect(()=>{document.querySelector('.motion-screen')?.scrollTo({top:0});},[mode]);
 const active=sessions.find(s=>['running','paused'].includes(s.status));
 const finish=async(raw:WorkoutSession)=>{try{setResult(await finishWorkout(raw));setMode('summary');}catch(err){setError(err instanceof Error?err.message:'结算失败，请重试');}};
 return <Suspense fallback={<div className="motion-loading">正在载入训练…</div>}>
 {error&&<p role="alert" className="motion-error">{error}</p>}
 {mode==='squat'?<Workout back={()=>setMode('select')} finish={finish} existing={active&&!active.gameId&&active.source!=='timer'?active:undefined}/>:mode==='summary'&&result?<Summary result={result} avatar={()=>navigate('/avatar')} home={()=>navigate('/')}/>:<div className="page training-page">
 <h2 className="training-heading">{active?'继续你的运动':'今天，动起来'}</h2><p className="muted">和 AI 练动作，或记录自己的运动量。</p>
 <div className={active?'training-active':'training-columns'}>
 {!active&&<section className="training-feature"><Icon name="camera" size={32}/><h3>AI 深蹲训练</h3><p>摄像头识别动作 · 每次 2 XP</p><button className="primary" onClick={()=>setMode('squat')}>深蹲 · AI 动作识别<Icon name="arrow"/></button><small>也可体验演示动作，演示不计 XP。</small></section>}
 {active&&!active.gameId&&active.source!=='timer'?<button className="primary" onClick={()=>setMode('squat')}>恢复动作训练</button>:active?.gameId?<div className="card timer-link"><Link to={'/game/'+active.gameId}>返回活动，继续我的运动计时<Icon name="arrow"/></Link></div>:<section className="training-personal">
 {!active&&<div className="training-choice"><h3>个人运动计时</h3><p className="muted">选择运动，自己掌握开始、暂停和结束。</p><div className="sports-grid">{Object.entries(SPORT_LABELS).map(([id,label])=><button type="button" key={id} aria-pressed={sport===id} className={sport===id?'selected':''} onClick={()=>setSport(id)}><Icon name={id}/><span>{label}</span></button>)}</div><label className="sport-picker">选择运动<select aria-label="选择运动" value={sport} onChange={e=>setSport(e.target.value)}>{Object.entries(SPORT_LABELS).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label></div>}
 <SportTimer sportType={active?.sportType||sport}/></section>}
 </div><div className="card training-note"><b>你的记录属于你</b><p>计时和 XP 保存到当前账号，刷新后可恢复。摄像头深蹲每次 2 XP；演示动作仅体验，不发 XP。</p></div>
 </div>}
 </Suspense>;
}
