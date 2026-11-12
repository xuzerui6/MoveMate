import {PlanEntry} from '../gym/PlanHub'
import { Icon } from './components/Icons'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import SportTimer from './SportTimer'
import { useStore, type SportSession } from './lib/store'
import { SPORT_LABELS } from '../../types'
import { exerciseInfo, isCameraExercise, type CameraExerciseType } from './lib/exercises'
import type { WorkoutSession } from './types'
import {
  PICKER_CHIPS,
  filterPickerMovements,
  groupPickerMovements,
  pickerMovements,
  recentPickerMovements,
  type PickerChip,
  type PickerMovement,
} from './lib/pickerExercises'
import { usePosePrefetchLine } from './hooks/usePosePrepare'
import { PosePrefetchLine } from './components/PosePrefetchLine'
import { useCdnFirstImage } from './lib/cdnAssets'
function PickerThumb({ movement }: { movement: PickerMovement }) {
  const image = useCdnFirstImage(movement.thumb)
  return <span className="camera-picker-thumb">{movement.thumb ? <img src={image.src} onError={() => { image.onError() }} alt="" loading="lazy" decoding="async"/> : <span>示范待补</span>}</span>
}
const Workout = lazy(() => import('./pages/Workout').then(m => ({ default: m.Workout })))
const Summary = lazy(() => import('./pages/Summary').then(m => ({ default: m.Summary })))
export default function Training() {
  const { finishWorkout, sessions, source, loading, refresh, state } = useStore(), navigate = useNavigate()
  const [mode, setMode] = useState<'select'|'workout'|'summary'>('select')
  const [choice, setChoice] = useState<'plan'|'camera'|'timer'>('plan')
  const [pickerChip, setPickerChip] = useState<PickerChip>('全部')
  const [pickerQuery, setPickerQuery] = useState('')
  const [exercise, setExercise] = useState<CameraExerciseType>('squat'), [sport, setSport] = useState('running')
  const [result, setResult] = useState<WorkoutSession|null>(null)
  const active = sessions.find(s => ['running', 'paused'].includes(s.status))
  const prefetchSnapshot = usePosePrefetchLine()
  const movements = useMemo(pickerMovements, [])
  const pickerSections = useMemo(() => groupPickerMovements(filterPickerMovements(movements, pickerChip, pickerQuery)), [movements, pickerChip, pickerQuery])
  const recentEntries = useMemo(() => pickerChip === '全部' && !pickerQuery.trim() ? recentPickerMovements(state.history, movements) : [], [state.history, movements, pickerChip, pickerQuery])
  useEffect(() => { document.querySelector('.motion-screen')?.scrollTo({ top: 0 }) }, [mode])
  const pickerRow = (movement: PickerMovement, meta?: string) => (
    <button key={movement.type} type="button" aria-pressed={exercise === movement.type} className={`camera-picker-row${exercise === movement.type ? ' selected' : ''}`} onClick={() => setExercise(movement.type as CameraExerciseType)}>
      <PickerThumb movement={movement}/>
      <span className="camera-picker-name">{movement.name}{movement.trial && <span className="trial-pill">试用</span>}</span>
      <span className="camera-picker-meta">{meta ?? `每${movement.unit} 2 XP`}</span>
    </button>
  )
  const finish = async (raw: WorkoutSession) => { setResult(await finishWorkout(raw)); setMode('summary') }
  const timerComplete = (row: SportSession) => {
    setResult({ id: row.id, exerciseType: row.sportType, source: 'timer', startTime: row.startTime, endTime: row.endTime, durationSeconds: row.effectiveSeconds, reps: 0, targetReps: 0, formScore: 0, perfectReps: 0, phase: 'standing', feedback: '', currentBpm: null, averageBpm: null, maxBpm: null, heartRateSource: null, zone1Seconds: 0, zone2Seconds: 0, zone3Seconds: 0, zone4Seconds: 0, zone5Seconds: 0, xpEarned: row.xpEarned, settled: row.settled, unlocked: [], formBreakdown: { depth: 0, stability: 0, trunk: 0, symmetry: 0 }, correctionCounts: {} as any, visionInsights: [], conversationTurnCount: 0 })
    setMode('summary')
  }
  const restore = () => { if (active && isCameraExercise(active.sportType)) {setExercise(active.sportType);setMode('workout')} }
  if(source!=='server' && mode==='select')return <div className="page training-page training-entry"><h2>今天，怎么动？</h2><div className="gym-cache-notice" role="status"><p>{source==='cache'?'当前只能读取缓存，未确认最新运动状态。':'运动状态尚未读取，暂不能开始独立摄像头训练或个人计时。'}</p><button className="secondary" disabled={loading} onClick={()=>void refresh()}>{loading?'正在核对…':'重试运动状态'}</button></div><p>可以先查看动作库、整理计划；计划训练会通过自己的服务器接口核对。</p><nav className="gym-mini-tiles"><Link to="/train/library"><Icon name="dumbbell" size={26}/>查看动作库</Link><Link to="/train/plans"><Icon name="clipboard" size={26}/>管理计划</Link><Link to="/train/settings"><Icon name="sliders" size={26}/>训练设置</Link></nav></div>;
  return <Suspense fallback={<div className="motion-loading">正在载入训练…</div>}>
    {mode === 'workout' ? <Workout key={exercise} exerciseType={exercise} back={() => setMode('select')} finish={finish} existing={active && !active.gameId && active.source !== 'timer' ? active : undefined}/> : mode === 'summary' && result ? <Summary result={result} avatar={() => navigate('/avatar')} home={() => { setMode('select'); setResult(null) }}/> : <div className="page training-page training-entry">
      <span className="eyebrow">每次运动，都算数</span><h2>今天，怎么动？</h2><p className="muted">跟着动作练，或记录自己的运动。</p>
      {active ? <section className="training-restore"><Icon name={active.source === 'timer' ? 'clock' : 'camera'} size={30}/><h3>继续你的运动</h3><p>{active.source === 'timer' ? SPORT_LABELS[active.sportType] || active.sportType : exerciseInfo(active.sportType).name} · {active.status === 'paused' ? '已暂停' : '进行中'}{active.source === 'demo' ? ' · 演示不计 XP' : ''}</p>{active.workoutId ? <Link className="primary" to={'/train/workout/'+active.workoutId}>恢复计划训练<Icon name="arrow"/></Link> : active.gameId ? <Link className="primary" to={'/game/' + active.gameId}>返回活动，继续计时<Icon name="arrow"/></Link> : active.source === 'timer' ? <SportTimer sportType={active.sportType} onComplete={timerComplete}/> : <><p>已完成 {active.reps} {exerciseInfo(active.sportType).unit} · 记录已保存</p><button className="primary" disabled={!isCameraExercise(active.sportType)} onClick={restore}>恢复训练<Icon name="arrow"/></button></>}</section> : <>
        <div className="training-mode-tabs" role="tablist" aria-label="训练方式" onKeyDown={event => { if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { event.preventDefault(); const modes=['plan','camera','timer'] as const;const next=event.key==='Home'?'plan':event.key==='End'?'timer':modes[(modes.indexOf(choice)+(event.key==='ArrowRight'?1:2))%3];setChoice(next);document.getElementById(next+'-mode')?.focus(); } }}><button role="tab" tabIndex={choice==='plan'?0:-1} aria-selected={choice==='plan'} aria-controls="training-choice-panel" id="plan-mode" onClick={()=>setChoice('plan')}><Icon name="dumbbell"/><b>计划训练</b><small>按组跟练与记录</small></button><button role="tab" tabIndex={choice==='camera'?0:-1} aria-selected={choice === 'camera'} aria-controls="training-choice-panel" id="camera-mode" onClick={() => setChoice('camera')}><Icon name="camera"/><b>AI 动作训练</b><small>识别动作与姿势</small></button><button role="tab" tabIndex={choice==='timer'?0:-1} aria-selected={choice === 'timer'} aria-controls="training-choice-panel" id="timer-mode" onClick={() => setChoice('timer')}><Icon name="clock"/><b>个人运动计时</b><small>记录有效运动量</small></button></div>
        <section className="training-choice-panel" role="tabpanel" id="training-choice-panel" aria-labelledby={choice+'-mode'}>
          {choice === 'plan' ? <PlanEntry/> : choice === 'camera' ? <><div className="training-section-title"><h3>选一个动作</h3><span>每组目标 20 次／组</span></div><label className="camera-picker-search"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20.5 20.5 16.6 16.6"/></svg><input type="search" value={pickerQuery} onChange={event => setPickerQuery(event.target.value)} placeholder="搜索动作名，如：弯举" aria-label="搜索动作名"/></label><div className="camera-picker-chips" role="group" aria-label="按部位或器械筛选">{PICKER_CHIPS.map(chip => <button key={chip} type="button" className={pickerChip === chip ? 'active' : ''} aria-pressed={pickerChip === chip} onClick={() => setPickerChip(chip)}>{chip}</button>)}</div>{recentEntries.length > 0 && <div className="camera-picker-section"><h4>最近练过</h4><div className="camera-picker-rows">{recentEntries.map(({movement, lastReps}) => pickerRow(movement, `上次 ${lastReps} ${movement.unit === '次' ? '个' : movement.unit}`))}</div></div>}{pickerSections.map(section => <div className="camera-picker-section" key={section.title}><h4>{section.title}</h4><div className="camera-picker-rows">{section.movements.map(movement => pickerRow(movement))}</div></div>)}{pickerSections.length === 0 && <p className="camera-picker-empty">没有找到这个动作，换个名字试试。</p>}<p className="training-action-copy">{exerciseInfo(exercise).instruction}</p><button className="primary" onClick={() => setMode('workout')}>准备{exerciseInfo(exercise).name}训练<Icon name="arrow"/></button><p className="training-caption">使用摄像头计数，也可选择不计 XP 的演示体验。</p><PosePrefetchLine snapshot={prefetchSnapshot}/></> : <><label className="training-sport-select">选择运动<select value={sport} onChange={event => setSport(event.target.value)}>{Object.entries(SPORT_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><SportTimer sportType={sport} onComplete={timerComplete}/></>}
        </section>
      </>}
      <nav className="gym-mini-tiles"><Link to="/train/plans"><Icon name="clipboard" size={26}/>我的计划</Link><Link to="/train/records"><Icon name="list" size={26}/>逐组记录</Link><Link to="/train/stats"><Icon name="chart" size={26}/>进步分析</Link></nav><p className="training-account-note"><Icon name="lock" size={16}/>记录保存到当前账号，刷新后可恢复。</p>
    </div>}
  </Suspense>
}
