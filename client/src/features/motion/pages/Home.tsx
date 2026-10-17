import marker from '../assets/title-marker.png';
import { Link } from 'react-router-dom';
import { AvatarFigure } from '../components/AvatarFigure';
import { Icon } from '../components/Icons';
import { useStore } from '../lib/store';
import { localDateKey, requiredXp } from '../lib/rewards';
import { useHeartRateMonitor } from '../hooks/useHeartRateMonitor';
import ground from '../assets/avatar-ground.png';
const format=(s:number)=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
export function Home({start}:{start:()=>void}){
 const {state,sessions}=useStore(),heart=useHeartRateMonitor(state.age),today=localDateKey(new Date()),needed=requiredXp(state.level);
 const records=state.history.filter(s=>s.source!=='demo'&&localDateKey(new Date(s.startTime))===today);
 const seconds=records.reduce((n,s)=>n+s.durationSeconds,0),xp=records.filter(s=>s.settled).reduce((n,s)=>n+s.xpEarned,0);
 const active=sessions.find(s=>['running','paused'].includes(s.status));
 return <div className="home-redesign">
 <header className="home-top"><Link to="/" className="wordmark">动伴<span>·</span></Link><Link to="/profile" className="round-action" aria-label="打开我的资料"><Icon name="user" size={26}/></Link></header>
 <div className="home-intro"><p>很高兴见到你，<b>{state.nickname}</b></p><h1>每次运动，都算数<img className="title-marker" src={marker} alt=""/></h1></div>
 <section className="home-core" aria-label="我的成长"><div className="growth-stage"><img className="growth-ground" src={ground} alt=""/><span className="level-pill">Lv.{state.level}</span><AvatarFigure view="front"/><div className="growth-copy"><span>当前经验</span><p><b>{state.xp}</b> / {needed} XP</p><div className="progress" role="progressbar" aria-label="升级进度" aria-valuenow={state.xp} aria-valuemin={0} aria-valuemax={needed}><i style={{width:Math.min(100,state.xp/needed*100)+'%'}}/></div><small>再积累 {Math.max(0,needed-state.xp)} XP 升级</small></div></div>
 <div className="home-cta"><button className="primary" onClick={start}><Icon name="dumbbell"/>开始运动<Icon name="arrow"/></button><Link className="secondary" to="/groups"><Icon name="users"/>找搭子<Icon name="arrow"/></Link></div><p className="home-caption">和 AI 训练，也和搭子一起运动</p>
 {active&&<Link className="active-session-banner" to={active.workoutId?'/train/workout/'+active.workoutId:active.gameId?'/game/'+active.gameId:'/train'}><Icon name="clock"/><span><b>{active.status==='paused'?'还有一项暂停的运动':'你的运动正在记录中'}</b><small>返回继续，刷新不会丢失进度</small></span><Icon name="arrow"/></Link>}
 </section>
 <section className="today-section"><div className="section-title"><h2>今日运动</h2><time dateTime={today}>{new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'short'})}</time></div><div className="today-metrics"><div><Icon name="clock" size={29}/><span><small>有效运动时长</small><strong>{format(seconds)}</strong></span></div><div><Icon name="bolt" size={29}/><span><small>获得经验</small><strong>+{xp}<em> XP</em></strong></span></div></div></section>
 <div className="gym-links"><Link to="/train/plans">今日计划与训练安排 →</Link><Link to="/train/stats">查看训练进步 →</Link></div>
 <section className="home-support"><div><Icon name="flame"/><span><small>持续运动</small><b>连续 {state.streakDays} 天</b></span></div><button onClick={heart.connect} disabled={heart.connected||['unsupported','connecting'].includes(heart.status)}><Icon name="heart"/><span><small>心率设备</small><b>{heart.connected?(heart.currentBpm?heart.currentBpm+' BPM':'等待数据'):heart.status==='unsupported'?'浏览器不支持 BLE':heart.status==='connecting'?'正在连接…':'连接心率带'}</b></span></button></section>
 {heart.errorMessage&&<p className="form-error" role="alert">{heart.errorMessage}</p>}
 </div>;
}

