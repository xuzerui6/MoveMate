import {PlanEntry} from '../gym/PlanHub'
import { Icon } from './components/Icons'
import { lazy, Suspense, useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import SportTimer from './SportTimer'
import { useStore, type SportSession } from './lib/store'
import { SPORT_LABELS } from '../../types'
import { CAMERA_EXERCISES, exerciseInfo, isCameraExercise, type CameraExerciseType } from './lib/exercises'
import type { WorkoutSession } from './types'
const Workout = lazy(() => import('./pages/Workout').then(m => ({ default: m.Workout })))
const Summary = lazy(() => import('./pages/Summary').then(m => ({ default: m.Summary })))
export default function Training() {
  const { finishWorkout, sessions } = useStore(), navigate = useNavigate()
  const [mode, setMode] = useState<'select'|'workout'|'summary'>('select')
  const [choice, setChoice] = useState<'plan'|'camera'|'timer'>('plan')
  const [exercise, setExercise] = useState<CameraExerciseType>('squat'), [sport, setSport] = useState('running')
  const [result, setResult] = useState<WorkoutSession|null>(null)
  const active = sessions.find(s => ['running', 'paused'].includes(s.status))
  useEffect(() => { document.querySelector('.motion-screen')?.scrollTo({ top: 0 }) }, [mode])
  const finish = async (raw: WorkoutSession) => { setResult(await finishWorkout(raw)); setMode('summary') }
  const timerComplete = (row: SportSession) => {
    setResult({ id: row.id, exerciseType: row.sportType, source: 'timer', startTime: row.startTime, endTime: row.endTime, durationSeconds: row.effectiveSeconds, reps: 0, targetReps: 0, formScore: 0, perfectReps: 0, phase: 'standing', feedback: '', currentBpm: null, averageBpm: null, maxBpm: null, heartRateSource: null, zone1Seconds: 0, zone2Seconds: 0, zone3Seconds: 0, zone4Seconds: 0, zone5Seconds: 0, xpEarned: row.xpEarned, settled: row.settled, unlocked: [], formBreakdown: { depth: 0, stability: 0, trunk: 0, symmetry: 0 }, correctionCounts: {} as any, visionInsights: [], conversationTurnCount: 0 })
    setMode('summary')
  }
  const restore = () => { if (active && isCameraExercise(active.sportType)) setExercise(active.sportType); setMode('workout') }
  return <Suspense fallback={<div className="motion-loading">正在载入训练…</div>}>
    {mode === 'workout' ? <Workout key={exercise} exerciseType={exercise} back={() => setMode('select')} finish={finish} existing={active && !active.gameId && active.source !== 'timer' ? active : undefined}/> : mode === 'summary' && result ? <Summary result={result} avatar={() => navigate('/avatar')} home={() => { setMode('select'); setResult(null) }}/> : <div className="page training-page training-entry">
      <span className="eyebrow">每次运动，都算数</span><h2>今天，怎么动？</h2><p className="muted">跟着动作练，或记录自己的运动。</p>
      {active ? <section className="training-restore"><Icon name={active.source === 'timer' ? 'clock' : 'camera'} size={30}/><h3>继续你的运动</h3><p>{active.source === 'timer' ? SPORT_LABELS[active.sportType] || active.sportType : exerciseInfo(active.sportType).name} · {active.status === 'paused' ? '已暂停' : '进行中'}{active.source === 'demo' ? ' · 演示不计 XP' : ''}</p>{active.workoutId ? <Link className="primary" to={'/train/workout/'+active.workoutId}>恢复计划训练<Icon name="arrow"/></Link> : active.gameId ? <Link className="primary" to={'/game/' + active.gameId}>返回活动，继续计时<Icon name="arrow"/></Link> : active.source === 'timer' ? <SportTimer sportType={active.sportType} onComplete={timerComplete}/> : <><p>已完成 {active.reps} {exerciseInfo(active.sportType).unit} · 记录已保存</p><button className="primary" onClick={restore}>恢复训练<Icon name="arrow"/></button></>}</section> : <>
        <div className="training-mode-tabs" role="tablist" aria-label="训练方式" onKeyDown={event => { if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { event.preventDefault(); const modes=['plan','camera','timer'] as const;const next=event.key==='Home'?'plan':event.key==='End'?'timer':modes[(modes.indexOf(choice)+(event.key==='ArrowRight'?1:2))%3];setChoice(next);document.getElementById(next+'-mode')?.focus(); } }}><button role="tab" tabIndex={choice==='plan'?0:-1} aria-selected={choice==='plan'} aria-controls="training-choice-panel" id="plan-mode" onClick={()=>setChoice('plan')}><Icon name="dumbbell"/><b>计划训练</b><small>按组跟练与记录</small></button><button role="tab" tabIndex={choice==='camera'?0:-1} aria-selected={choice === 'camera'} aria-controls="training-choice-panel" id="camera-mode" onClick={() => setChoice('camera')}><Icon name="camera"/><b>AI 动作训练</b><small>识别动作与姿势</small></button><button role="tab" tabIndex={choice==='timer'?0:-1} aria-selected={choice === 'timer'} aria-controls="training-choice-panel" id="timer-mode" onClick={() => setChoice('timer')}><Icon name="clock"/><b>个人运动计时</b><small>记录有效运动量</small></button></div>
        <section className="training-choice-panel" role="tabpanel" id="training-choice-panel" aria-labelledby={choice+'-mode'}>
          {choice === 'plan' ? <PlanEntry/> : choice === 'camera' ? <><div className="training-section-title"><h3>选一个动作</h3><span>每组目标 20 次／组</span></div><div className="camera-exercise-grid" aria-label="选择摄像头动作">{Object.entries(CAMERA_EXERCISES).map(([id, item]) => <button key={id} aria-pressed={exercise === id} className={exercise === id ? 'selected' : ''} onClick={() => setExercise(id as CameraExerciseType)}><b>{item.name}</b><small>每{item.unit} 2 XP</small></button>)}</div><p className="training-action-copy">{exerciseInfo(exercise).instruction}</p><button className="primary" onClick={() => setMode('workout')}>准备{exerciseInfo(exercise).name}训练<Icon name="arrow"/></button><p className="training-caption">使用摄像头计数，也可选择不计 XP 的演示体验。</p></> : <><label className="training-sport-select">选择运动<select value={sport} onChange={event => setSport(event.target.value)}>{Object.entries(SPORT_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><SportTimer sportType={sport} onComplete={timerComplete}/></>}
        </section>
      </>}
      <div className="gym-links"><Link to="/train/plans">我的计划</Link><Link to="/train/records">逐组记录</Link><Link to="/train/stats">进步分析</Link></div><p className="training-account-note"><Icon name="lock" size={16}/>记录保存到当前账号，刷新后可恢复。</p>
    </div>}
  </Suspense>
}
