import {useState} from 'react';
import {Header} from './components/Header';
import {Icon} from './components/Icons';
import {useStore} from './lib/store';
import {SPORT_LABELS} from '../../types';
export default function History(){
 const {state}=useStore(),[filter,setFilter]=useState('all');
 const rows=state.history.filter((item:any)=>filter==='all'||(filter==='group'?Boolean(item.gameId):!item.gameId));
 return <div className="page history-page"><Header title="运动记录"/><div className="history-filters" aria-label="记录筛选">{[['all','全部记录'],['solo','个人训练'],['group','组局运动']].map(([id,label])=><button key={id} className={filter===id?'active':''} onClick={()=>setFilter(id)}>{label}</button>)}</div>
 {rows.length?rows.map((item:any)=><article className="card history-item" key={item.id}><div><h3>{SPORT_LABELS[item.sportType]||(item.sportType==='squat'?'深蹲训练':item.sportType)}</h3><time>{new Date(item.startTime).toLocaleString('zh-CN')}</time><p>{Math.floor(item.durationSeconds/60)} 分 {item.durationSeconds%60} 秒{item.sportType==='squat'?' · '+item.reps+' 次':''}<span className="history-source"> · {item.source==='demo'?'演示体验 · 不计 XP':item.gameId?'组局运动':'个人训练'}</span></p></div><strong className="history-xp">{item.source==='demo'?'0 XP':item.settled?'+'+item.xpEarned+' XP':'待结算'}</strong></article>):<div className="history-empty"><Icon name="clock" size={40}/><h3>这里记录每一次运动</h3><p>完成运动后，有效时长和成长会保存在这里。</p></div>}</div>;
}

