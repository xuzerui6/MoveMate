import { getErrorMessage } from '../../../api/client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Header } from '../components/Header'
import { Icon } from '../components/Icons'
import { PoseCanvas } from '../components/PoseCanvas'
import { useXiaozhiCoach } from '../hooks/useXiaozhiCoach'
import { createCueState, pickCue } from '../lib/coachCues'
import { createCorrectionGateState, decideCorrectionCue, POSE_ISSUE_COPY } from '../lib/poseFeedback'
import { useHeartRateMonitor } from '../hooks/useHeartRateMonitor'
import { usePose } from '../hooks/usePose'
import { useExerciseMetrics } from '../hooks/useExerciseMetrics'
import { exerciseInfo, type CameraExerciseType } from '../lib/exercises'
import {isNewExercise,NEW_EXERCISES} from '../lib/newExercises'
import { useWorkoutSession } from '../hooks/useWorkoutSession'
import { useSessionClock } from '../hooks/useSessionClock'
import type { CameraFit } from '../lib/cameraFrame'
import { useStore, type SportSession } from '../lib/store'
import type { WorkoutContext, WorkoutSession, XiaozhiState } from '../types'
import { PrepDemoHero } from '../components/PrepDemoHero'
import { VisionReviewNote } from '../components/VisionReviewNote'
import { PosePreparePanel } from '../components/PosePreparePanel'
import { usePosePrepare } from '../hooks/usePosePrepare'
import { sessionStartMs } from '../lib/pickerExercises'

import {COPY_CALIBRATED,COPY_PREPARE,framingCopyFor,milestoneLine} from '../lib/companionCopy'
import {createDwellState,dwellPush} from '../lib/statusDwell'
import {loadRecognitionPreference,selectNewRecognitionStrategy,selectRecognitionStrategy,type RecognitionPreference} from '../lib/adaptiveRecognition'

const format = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
const VOICE_LABEL: Record<XiaozhiState, string> = {
  off: '语音陪练', idle: '已连接 · 点击对话', activating: '正在准备语音', connecting: '正在连接…',
  listening: '我在听', thinking: '正在思考…', speaking: '正在回复', reconnecting: '连接中断，正在恢复…',
  fallback: '语音离线 · 文字反馈可用', failed: '语音暂不可用',
}

export function Workout({ back, finish, existing, exerciseType }: { exerciseType: CameraExerciseType; back: () => void; finish: (session: WorkoutSession) => Promise<void>; existing?: SportSession }) {
  const exercise = exerciseInfo(exerciseType)
  const { state: appState, startSession, act, sessions, lookupSession } = useStore()
  const restored = useRef(existing).current
  const serverId = useRef(restored?.id || ''), closing = useRef(false)
  const accountToken = useRef(localStorage.getItem('token')), alive = useRef(true), attempt = useRef(0), locked = useRef(false)
  const [busy, setBusy] = useState(false), [preparing, setPreparing] = useState(false), [creating, setCreating] = useState(false)
  const [failure, setFailure] = useState(''), [syncFailed, setSyncFailed] = useState(false)
  const [active, setActive] = useState(false), [voiceEnabled, setVoiceEnabled] = useState(false)
  const [simulatedPose, setSimulatedPose] = useState(restored?.source === 'demo'), [paused, setPaused] = useState(false)
  const [pendingAction, setPendingAction] = useState<'pause'|'resume'|null>(null)
  const frozenFinish = useRef<WorkoutSession | null>(null)
  const [ending, setEnding] = useState(false)
  const [cameraExpanded, setCameraExpanded] = useState(false), [cameraFit, setCameraFit] = useState<CameraFit>('contain')
  const cameraExpandButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!cameraExpanded) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setCameraExpanded(false); cameraExpandButton.current?.focus() } }
    const desktop = window.matchMedia('(min-width: 700px)')
    const resized = () => { if (desktop.matches) setCameraExpanded(false) }
    window.addEventListener('keydown', close); desktop.addEventListener('change', resized)
    return () => { window.removeEventListener('keydown', close); desktop.removeEventListener('change', resized) }
  }, [cameraExpanded])
  const testSlotValue = new URLSearchParams(window.location.search).get('voiceTestSlot')
  const testSlot = testSlotValue ? Number(testSlotValue) : undefined
  const [preference]=useState<RecognitionPreference>(()=>loadRecognitionPreference())
  const posePrepare = usePosePrepare()
  const [prepPhase, setPrepPhase] = useState<'download' | 'engine' | null>(null)
  const [downloadFailed, setDownloadFailed] = useState(false)
  const prepChoiceRef = useRef<((choice: 'ready' | 'lite' | 'failed' | 'cancelled') => void) | null>(null)
  const waitForPrepare = () => new Promise<'ready' | 'lite' | 'failed' | 'cancelled'>(resolve => {
    let settled = false
    const finish = (choice: 'ready' | 'lite' | 'failed' | 'cancelled') => { if (settled) return; settled = true; if (prepChoiceRef.current === finish) prepChoiceRef.current = null; resolve(choice) }
    prepChoiceRef.current = finish
    void posePrepare.start().then(ok => finish(ok ? 'ready' : 'failed'))
  })
  const adaptive = (restored
    ? selectRecognitionStrategy(exerciseType, restored.metrics?.recognitionStrategy ?? 'legacy')
    : selectNewRecognitionStrategy(exerciseType, preference)) === 'adaptive-v1'
  const pose = usePose(active && !simulatedPose && !paused && !busy && !ending,{adaptive:adaptive&&!simulatedPose,warmWhenPaused:active&&paused&&!ending&&!pendingAction,type:exerciseType,key:exerciseType,target:20,restored:{...(sessions.find(s=>s.id===serverId.current)?.metrics||restored?.metrics),reps:sessions.find(s=>s.id===serverId.current)?.reps||restored?.reps||0}})
  const heartRate = useHeartRateMonitor(appState.age)
  const heartRef = useRef(heartRate); heartRef.current = heartRate
  useEffect(() => () => heartRef.current.disconnect(), [])
  const record = sessions.find(item => item.id === serverId.current) || restored
  const { metrics, diagnostics, demoLandmarks } = useExerciseMetrics(exerciseType, pose.landmarks, simulatedPose, active, paused || busy || ending,
    pose.videoRef.current?.videoWidth && pose.videoRef.current.videoHeight ? pose.videoRef.current.videoWidth / pose.videoRef.current.videoHeight : 1,
    restored ? { ...restored.metrics, reps: restored.reps } : {},20,'standalone',pose.worldLandmarks,pose.engine)
  // The session clock does not run before the first completed calibration: until the
  // tracker has latched its start pose the user is still setting up, and a ticking
  // timer over a 0 count reads as if the set had already started (2026-11-07 front-
  // raise retest). The latch is once per page mount — a later recalibration after a
  // tracking loss keeps the clock running, exactly like resuming from pause does.
  const calibratedOnce = useRef(false)
  if (metrics.poseFeedback.calibrated) calibratedOnce.current = true
  const seconds = useSessionClock(record, paused || busy || ending || !calibratedOnce.current)
  const workout = useWorkoutSession(metrics, heartRate, active, paused || busy || ending, undefined, restored?.effectiveSeconds || 0, exerciseType, seconds, restored?.metrics)
  const session = workout.session
  const progress = useRef<Record<string, unknown>>({})
  progress.current = { ...session, ...metrics }
  const activeRef = useRef(false); activeRef.current = active
  useEffect(() => {
    alive.current = true
    const flush = (action = 'progress') => {
      if (!serverId.current || closing.current || !activeRef.current || !accountToken.current) return
      void fetch('/api/v1/sport-sessions/' + serverId.current + '/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-MoveMate-Recognition-Version': '6', Authorization: 'Bearer ' + accountToken.current }, body: JSON.stringify(progress.current), keepalive: true }).catch(() => undefined)
    }
    const hide = () => flush()
    window.addEventListener('pagehide', hide)
    return () => { alive.current = false; attempt.current++; window.removeEventListener('pagehide', hide); flush('pause') }
  }, [])
  useEffect(() => { document.querySelector('.motion-screen')?.scrollTo({ top: 0 }) }, [active])
  useEffect(()=>{
    if(!preparing||!adaptive||!window.matchMedia('(max-width: 699px)').matches)return;
    const frame=requestAnimationFrame(()=>document.querySelector('.training-workout .training-camera')?.scrollIntoView({block:'start'}));
    return()=>cancelAnimationFrame(frame);
  },[preparing,adaptive])
  const voiceContext: WorkoutContext = useMemo(() => ({
    exerciseType, countUnit: exercise.unit, reps: metrics.reps, targetReps: metrics.targetReps, phase: metrics.phase,
    durationSeconds: seconds, bpm: heartRate.connected && !heartRate.signalInterrupted ? heartRate.currentBpm : null,
    active: active && !paused && !busy && !ending, poseStatus: metrics.poseFeedback.status, poseIssues: metrics.poseFeedback.issues,
    recentScore: metrics.formScore, lastRepAt: null, lastRepIssues: metrics.lastRepIssues, latestVisionInsight: null,
  }), [exerciseType, exercise.unit, metrics, seconds, heartRate.connected, heartRate.signalInterrupted, heartRate.currentBpm, active, paused, busy, ending])
  const voice = useXiaozhiCoach({ enabled: active && voiceEnabled && !ending, context: voiceContext, videoRef: pose.videoRef, testSlot })
  const conversationCount = Number(restored?.metrics?.conversationTurnCount || 0) + voice.conversationTurnCount
  progress.current = { ...session, ...metrics, conversationTurnCount: conversationCount,recognitionStrategy:adaptive&&!simulatedPose?'adaptive-v1':'legacy' }
  const voiceRef = useRef(voice)
  useEffect(() => { voiceRef.current = voice }, [voice])
  useEffect(() => { voice.sendWorkoutContext(voiceContext) }, [voiceContext])
  const personalBest = useMemo(
    () => appState.history.filter(item=>item.exerciseType===exerciseType && item.source!=='demo').reduce((best, item) => Math.max(best, item.reps || 0), 0),
    [appState.history,exerciseType],
  )
  const lastSession = useMemo(
    () => appState.history.filter(item=>item.exerciseType===exerciseType && item.source!=='demo').sort((a, b) => sessionStartMs(b.startTime) - sessionStartMs(a.startTime))[0],
    [appState.history,exerciseType],
  )
  const cueStateRef = useRef(createCueState())
  const correctionGateRef = useRef(createCorrectionGateState())
  const lastRepAtRef = useRef(Date.now())
  const cueInputRef = useRef({ reps: 0, targetReps: 0, feedback: '', phase: 'standing', demo: false, countUnit:exercise.unit, exerciseType })

  useEffect(() => {
    cueInputRef.current = {
      reps: metrics.reps, targetReps: metrics.targetReps, feedback: metrics.feedback,
      phase: metrics.phase, demo: true, countUnit:exercise.unit, exerciseType, // 逐帧提示只显示；语音由完整动作门控器决定。
    }
  }, [metrics.reps, metrics.targetReps, metrics.feedback, metrics.phase])
  useEffect(() => { lastRepAtRef.current = Date.now() }, [metrics.reps])
  useEffect(() => {
    if (active) return
    cueStateRef.current = createCueState()
    correctionGateRef.current = createCorrectionGateState()
  }, [active])

  // 每次动作首次到达最低点时保留候选帧，只存在内存；动作完整完成后才上传。
  const capturedBottomRepRef = useRef(-1)
  useEffect(() => {
    if (!active || paused || busy || simulatedPose || metrics.phase !== 'bottom') return
    if (capturedBottomRepRef.current === metrics.reps) return
    capturedBottomRepRef.current = metrics.reps
    voiceRef.current.captureRepFrame()
  }, [active, paused, simulatedPose, metrics.phase, metrics.reps])

  useEffect(()=>{if(paused || !metrics.poseFeedback.calibrated)capturedBottomRepRef.current=-1},[paused,metrics.poseFeedback.calibrated])
  const syncedRepRef = useRef(existing?.reps||0)
  useEffect(() => {
    if (!active || metrics.reps <= syncedRepRef.current) return
    syncedRepRef.current = metrics.reps
    voiceRef.current.notifyCompletedRep(metrics.reps, metrics.lastRepIssues)
  }, [active, metrics.reps, metrics.lastRepIssues])
  useEffect(() => {
    if (active) return
    syncedRepRef.current = existing?.reps||0
    capturedBottomRepRef.current = -1
  }, [active])

  useEffect(() => {
    if (!active || paused || busy) return
    const timer = window.setInterval(() => {
      if (voiceRef.current.inConversation) return
      const now = Date.now()
      const cue = pickCue({ ...cueInputRef.current, personalBest, sinceLastRepMs: now - lastRepAtRef.current, now }, cueStateRef.current)
      if (cue) voiceRef.current.say(cue.text, cue.kind === 'idle' ? 'low' : 'normal')
    }, 350)
    return () => clearInterval(timer)
  }, [active, paused, busy, personalBest])

  // 矫姿语音只在一次完整动作结束后决策；连续问题才提醒，改善则优先确认。
  const correctedRepRef = useRef(existing?.reps||0)
  useEffect(()=>{
    if(!active || closing.current || !serverId.current || metrics.reps===0) return
    const timer=setTimeout(()=>{!closing.current && void act(serverId.current,'progress',progress.current).then(()=>{setSyncFailed(false);setFailure('')}).catch(err=>{setSyncFailed(true);setFailure(getErrorMessage(err))})},400)
    return()=>clearTimeout(timer)
  },[active,metrics.reps])
  useEffect(() => {
    if (!active || simulatedPose || metrics.reps <= correctedRepRef.current) return
    correctedRepRef.current = metrics.reps
    const cue = decideCorrectionCue(metrics.lastRepIssues, Date.now(), correctionGateRef.current, exerciseType)
    if (cue) voiceRef.current.say(cue.text, 'high')
  }, [active, simulatedPose, metrics.reps, metrics.lastRepIssues])

  const cancelPrepare = () => { prepChoiceRef.current?.('cancelled'); attempt.current++; pose.stop(); setPreparing(false); setBusy(false); locked.current = false; setPrepPhase(null) }
  const begin = async (demo: boolean, forceLite = false) => {
    if (locked.current) return
    locked.current = true; const current = ++attempt.current
    setBusy(true); setFailure(''); setSimulatedPose(demo); setPreparing(!demo)
    try {
      if (!demo && adaptive && !posePrepare.ready) {
        setDownloadFailed(false); setPrepPhase('download')
        const outcome = await waitForPrepare()
        if (!alive.current || current !== attempt.current) return
        if (outcome !== 'ready' && outcome !== 'lite') {
          if (outcome === 'failed') setDownloadFailed(true)
          setPrepPhase(null); setPreparing(false)
          return
        }
        if (outcome === 'lite') forceLite = true
        setPrepPhase('engine')
      }
      if (!demo && !await pose.start(forceLite)) return
      if (!alive.current || current !== attempt.current) return
      setCreating(true)
      const row = restored ? await act(restored.id, 'resume',{recognitionStrategy:adaptive&&!demo?'adaptive-v1':'legacy'}) : await startSession(exerciseType, demo ? 'demo' : 'camera',undefined,adaptive&&!demo?'adaptive-v1':'legacy')
      if (!alive.current || current !== attempt.current) {
        if (accountToken.current) void fetch('/api/v1/sport-sessions/' + row.id + '/pause', { method: 'POST', headers: { Authorization: 'Bearer ' + accountToken.current, 'Content-Type': 'application/json' }, body: '{}', keepalive: true }).catch(() => undefined)
        return
      }
      if (row.sportType !== exerciseType || row.source !== (demo ? 'demo' : 'camera')) throw new Error('请返回入口，恢复原动作和来源的记录')
      serverId.current = row.id; setPaused(false); setActive(true)
    } catch (error) { if (alive.current) { pose.stop(); setFailure(getErrorMessage(error)) } }
    finally { if (alive.current && current === attempt.current) { setBusy(false); setPreparing(false); setCreating(false); locked.current = false; setPrepPhase(null) } }
  }
  const togglePause = async (leaveAfter = false) => {
    if (locked.current || ending) return
    const action = leaveAfter ? 'pause' : pendingAction || (paused ? 'resume' : 'pause')
    locked.current = true; setBusy(true); setPaused(true); setFailure('')
    try {
      if(action==='resume'&&adaptive&&!simulatedPose&&!await pose.start())throw new Error(pose.errorReason.current||'请重试摄像头后继续')
      const row = await act(serverId.current, action, progress.current)
      setPendingAction(null); setSyncFailed(false); setPaused(row.status !== 'running')
      if (leaveAfter) { closing.current = true; setVoiceEnabled(false); pose.stop(); back() }
    } catch (error) { setPendingAction(action); setFailure(getErrorMessage(error)) }
    finally { if (alive.current) setBusy(false); locked.current = false }
  }
  const leave = () => {
    if (creating) return
    if (!active) { cancelPrepare(); back(); return }
    if (!ending) void togglePause(true)
  }
  const retrySync = async () => {
    if (locked.current) return
    locked.current = true; setBusy(true)
    try { await act(serverId.current, 'progress', progress.current); setSyncFailed(false); setFailure('') }
    catch (error) { setFailure(getErrorMessage(error)) }
    finally { setBusy(false); locked.current = false }
  }
  const done = async () => {
    if (locked.current) return
    const recovered: WorkoutSession | null = restored ? {
      id: restored.id, exerciseType, source: restored.source as 'camera'|'demo', startTime: restored.startTime, endTime: null,
      durationSeconds: restored.effectiveSeconds, reps: restored.reps, targetReps: 20, formScore: 0, perfectReps: 0, phase: 'standing', feedback: '',
      currentBpm: null, averageBpm: null, maxBpm: null, heartRateSource: null, zone1Seconds: 0, zone2Seconds: 0, zone3Seconds: 0, zone4Seconds: 0, zone5Seconds: 0,
      xpEarned: 0, unlocked: [], formBreakdown: { depth: 0, stability: 0, trunk: 0, symmetry: 0 }, correctionCounts: {} as any, visionInsights: [], conversationTurnCount: 0,
      ...restored.metrics,
    } : null
    const completed = frozenFinish.current || workout.finish() || recovered
    if (!completed) return
    if (!frozenFinish.current) frozenFinish.current = structuredClone({ ...completed, id: serverId.current, source: simulatedPose ? 'demo' : 'camera', recognitionStrategy:adaptive&&!simulatedPose?'adaptive-v1':'legacy', visionInsights: [], conversationTurnCount: active ? conversationCount : completed.conversationTurnCount })
    locked.current = true; closing.current = true; setEnding(true); setPaused(true); setBusy(true); setVoiceEnabled(false); setFailure(''); pose.stop(); heartRate.disconnect()
    try { await finish(frozenFinish.current) }
    catch (error) { if (alive.current) setFailure(getErrorMessage(error)) }
    finally { locked.current = false; if (alive.current) setBusy(false) }
  }
  useEffect(() => {
    if (active && !simulatedPose && ['denied', 'error'].includes(pose.status) && !paused && !locked.current) void togglePause()
  }, [active, simulatedPose, pose.status, paused])
  useEffect(() => {
    if (active && record?.status === 'finished' && !closing.current) void done()
  }, [record?.status, active])
  const retryCamera = async () => { setFailure(''); await pose.start() }
  const toggleVoice = () => { if (!voiceEnabled) { voice.prepareAudio(); voice.retry() } setVoiceEnabled(!voiceEnabled) }
  const poseFailed = !simulatedPose && ['denied', 'error'].includes(pose.status)
  const poseFailureTitles = {
    camera: '摄像头未就绪',
    model: '识别没准备好',
    framing: '动作所需关节未清晰入镜',
    performance: '画面跟不上啦',
    inference: '识别断了一下',
  }
  const poseFailureTitle = pose.status === 'denied'
    ? '摄像头权限未开启'
    : pose.failurePhase ? poseFailureTitles[pose.failurePhase] : '摄像头或识别没准备好'
  useEffect(() => {
    if (failure || poseFailed) document.querySelector('.training-workout .training-error')?.scrollIntoView({ block: 'center' })
  }, [failure, poseFailed])
  // Live status text passes through a display dwell (2026-11-09 walking
  // test): in marginal visibility the calibrated flag can flip several
  // times a second, and rendering every flip strobes the header state,
  // the capsule and the HUD panel. Counts, the clock and event lines are
  // never dwelled; paused/ending states bypass it entirely.
  const statusDwell = useRef(createDwellState())
  const liveStatus = dwellPush(statusDwell.current, metrics.poseFeedback.calibrated ? '识别中' : '正在找你', Date.now())
  const statusLabel = ending ? '正在确认结束' : pendingAction ? '状态待确认' : paused ? '已暂停' : simulatedPose ? '演示 · 不计 XP' : liveStatus
  const preparedToResume=pose.engine?.diagnostics.stage==='ready'&&pose.engine.metrics.poseFeedback.calibrated&&(pose.telemetry?.fps||0)>=8;
  const hint = ending ? '这一组就到这里，正在帮你保存。' : pendingAction ? '本地识别先停住，正在和服务器对一下状态。' : paused ? adaptive?(preparedToResume?'休息不计时，起始姿势已准备好，可直接继续。':'休息不计时，继续后识别下一个完整动作。'): '休息不计时，继续时先回到起始姿势。' : metrics.reps >= metrics.targetReps ? '目标完成啦，可以结束这一组了。' : metrics.feedback
  // 陪伴句（识别页 v2）：同一时刻只留一句。事件句（校准完成、里程碑）短暂优先，
  // 其次是最要紧的一条姿势提示（poseFeedback 主问题），其余时候用引擎反馈。
  const [coachEvent, setCoachEvent] = useState<{ text: string; at: number } | null>(null)
  const wasCalibrated = useRef(false)
  const everCalibrated = useRef(false)
  const uncalibratedSince = useRef<number | null>(null)
  useEffect(() => {
    if (!active || paused || busy || ending) return
    if (metrics.poseFeedback.calibrated) {
      // 「找到你啦」 fires on the first latch, and again only after the
      // subject was genuinely gone for a while — a sub-second dropout in
      // marginal light must not replay the celebration on every re-latch
      // (the walking recording flapped it about once a second).
      const awayLong = uncalibratedSince.current !== null && Date.now() - uncalibratedSince.current >= 2500
      if (!wasCalibrated.current && (!everCalibrated.current || awayLong)) setCoachEvent({ text: COPY_CALIBRATED, at: Date.now() })
      wasCalibrated.current = true; everCalibrated.current = true; uncalibratedSince.current = null
    } else {
      if (uncalibratedSince.current === null) uncalibratedSince.current = Date.now()
      wasCalibrated.current = false
    }
  }, [active, paused, busy, ending, metrics.poseFeedback.calibrated])
  const prevReps = useRef(metrics.reps)
  useEffect(() => {
    const before = prevReps.current; prevReps.current = metrics.reps
    if (!active || paused || busy || ending || simulatedPose || metrics.reps <= before) return
    const line = milestoneLine(metrics.reps, metrics.targetReps)
    if (line) setCoachEvent({ text: line, at: Date.now() })
  }, [active, paused, busy, ending, simulatedPose, metrics.reps, metrics.targetReps])
  const unclear = active && !paused && metrics.poseFeedback.calibrated && (diagnostics.stage === 'tracking_lost' || diagnostics.stage === 'cannot_assess' || metrics.poseFeedback.status === 'uncertain')
  const eventLine = coachEvent && Date.now() - coachEvent.at < 3000 ? coachEvent.text : null
  // The capsule, the HUD panel choice and the coach line's engine-feedback
  // fallback pass through the same display dwell as the header state, so a
  // flapping tracker cannot strobe them. Event lines and the primary-issue
  // message stay immediate, as do the rep count and the session clock.
  const capsuleDwell = useRef(createDwellState())
  const coachDwell = useRef(createDwellState())
  const panelDwell = useRef(createDwellState())
  const liveCapsule = dwellPush(capsuleDwell.current, !metrics.poseFeedback.calibrated ? '正在找你 · 站好就行' : unclear ? '我有点看不清' : `陪你练 · ${exercise.name}`, Date.now())
  const liveCoach = dwellPush(coachDwell.current, metrics.feedback, Date.now(), 1200, 350)
  const coachLine = paused || ending || pendingAction ? hint : eventLine || (metrics.poseFeedback.primaryIssue ? metrics.poseFeedback.message : liveCoach)
  const capsuleText = ending ? '正在确认结束' : paused ? '已暂停 · 休息不计时' : liveCapsule
  const hudCalibrated = dwellPush(panelDwell.current, metrics.poseFeedback.calibrated ? 'cal' : 'find', Date.now()) === 'cal'
  return <div className={`page workout-page training-workout ${active ? 'live' : 'setup'}${cameraExpanded ? ' camera-expanded' : ''}`}>
    <Header title={exercise.name + '训练'} back={leave} action={active ? <span className={'training-status' + (paused ? ' paused' : '')}>{statusLabel}</span> : <span className="muted">目标 20 {exercise.unit}</span>}/>
    {!active && <section className="training-prep">
      <h2>{restored ? '继续上次训练' : '准备好，就开始'}</h2>
      <PrepDemoHero exercise={isNewExercise(exerciseType)?{id:NEW_EXERCISES[exerciseType].exerciseIds[0],nameZh:exercise.name,form:exercise.instruction}:{id:'motion:'+exerciseType,nameZh:exercise.name,target:exerciseType==='push_up'?'pectorals':exerciseType==='jumping_jack'?'full body':'quadriceps',secondaryMuscles:[]}} suspended={preparing||busy}/>
      <p className="prep-placement">{exercise.placement}</p>
      {restored && <p className="restore-copy">已完成 {restored.reps} {exercise.unit} · 有效时长 {format(restored.effectiveSeconds)} · {restored.source === 'demo' ? '演示，不计 XP' : '真实动作训练'}</p>}
      <div className="prep-chips">
        {lastSession && !restored && <span>上次 {lastSession.reps} {exercise.unit === '次' ? '个' : exercise.unit}</span>}
        <span>每{exercise.unit} 2 XP</span>
        <span>目标 20 {exercise.unit}</span>
      </div>
      <p>{exercise.instruction}</p>
      {restored?.source !== 'demo' && <VisionReviewNote/>}
      {isNewExercise(exerciseType)&&<p className="prep-privacy">新动作识别还在试用，可能不太稳。按标准形式练就好；重量和握法我这边没法确认。</p>}
      {downloadFailed || prepPhase ? <PosePreparePanel snapshot={posePrepare.snapshot} phase={prepPhase ?? 'download'} failed={downloadFailed} onCancel={cancelPrepare} onRetry={() => { setDownloadFailed(false); void begin(false) }} onLiteStart={() => prepChoiceRef.current?.('lite')} onHome={back}/> : <>
      <div className="prep-actions">
        {restored?.source !== 'demo' && <button className="primary" disabled={busy || ending} onClick={() => void begin(false)}><Icon name="camera"/>{busy ? simulatedPose ? '正在开始演示…' : creating ? restored ? '正在恢复训练…' : '正在开始训练…' : '摄像头与模型准备中…' : restored ? '开启摄像头并继续' : '开启摄像头并开始'}</button>}
        {restored?.source !== 'camera' && <button className="secondary" disabled={busy || ending} onClick={() => void begin(true)}><Icon name="play"/>{busy && simulatedPose ? '正在开始演示…' : restored ? '继续演示' : '体验演示 · 不计 XP'}</button>}
        {restored && <button className="text-btn" disabled={busy} onClick={() => void done()}>{busy && ending ? '正在保存…' : ending ? '重试结束' : '结束并保存已有记录'}</button>}
        {preparing && !creating && !adaptive && <button className="text-btn" onClick={cancelPrepare}>取消准备</button>}
      </div>
      {adaptive && posePrepare.ready && restored?.source !== 'demo' && <p className="pose-ready-pill">✓ 识别模型已准备好</p>}
      </>}
      <div className="prep-companion"><span className="prep-companion-avatar" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="white"><rect x="3.5" y="9" width="2.6" height="6" rx="1.3"/><rect x="8.2" y="5.5" width="2.6" height="13" rx="1.3"/><rect x="12.9" y="8" width="2.6" height="8" rx="1.3"/><rect x="17.6" y="10" width="2.6" height="4" rx="1.3"/></svg></span><p>{restored?.source === 'demo' ? '演示不访问摄像头，不增加 XP。' : COPY_PREPARE + '。'}</p></div>
      <p className="prep-privacy">语音陪练在训练中按需开启。</p>
      <details className="training-accessory"><summary><Icon name="heart"/>心率设备（可选）</summary><p>{heartRate.connected ? `${heartRate.deviceName} · ${heartRate.currentBpm || '等待'} BPM` : heartRate.errorMessage || '不连接设备也能正常训练。支持标准蓝牙心率带。'}</p><button className="secondary" disabled={heartRate.connected || ['connecting', 'unsupported'].includes(heartRate.status)} onClick={heartRate.connect}>{heartRate.status === 'unsupported' ? '请在 Chrome 或 Edge 连接' : heartRate.connected ? '已连接' : '连接心率带'}</button></details>
    </section>}
    <div className="training-live-grid">
      <div className="camera-card training-camera" hidden={!active && !preparing}>
        <PoseCanvas keepVideoRendering={adaptive} videoRef={pose.videoRef} landmarks={simulatedPose ? demoLandmarks : pose.landmarks} demo={simulatedPose} phase={metrics.phase} fit={cameraFit} affectedJoints={paused ? [] : metrics.poseFeedback.affectedJoints} frame={simulatedPose ? null : pose.frame}/>
        {active&&!paused&&!ending&&!pendingAction&&<div className="training-hud" aria-live="polite">
          <div className={`training-hud-capsule${capsuleText==='我有点看不清'?' amber':''}`}><span className="training-hud-dot"/><span className="training-hud-capsule-text">{capsuleText}</span></div>
          {!simulatedPose&&<button type="button" className="training-hud-voice" aria-pressed={voiceEnabled} onClick={toggleVoice}>语音陪练 · {voiceEnabled?'开':'关'}</button>}
          <div className="training-hud-bottom">
            {!hudCalibrated?<div className="training-hud-calib">
              <svg className="training-hud-ring" viewBox="0 0 64 64" aria-hidden="true"><circle className="ring-bg" cx="32" cy="32" r="26"/><circle className="ring-fg" cx="32" cy="32" r="26" strokeDasharray="163.4" strokeDashoffset={163.4*(1-Math.min(1,Math.max(0,diagnostics.calibrationProgress)))}/><text x="32" y="37" textAnchor="middle">找你</text></svg>
              {/* The clock semantics are the page's own (see calibratedOnce):
                once the set has latched, 有效时长 keeps running through a
                tracking loss exactly like a resume from pause — so the
                subline may only claim the timer has not started before the
                FIRST latch. After it, say what is true instead. */}
              <div><b>{metrics.feedback}</b><span>{calibratedOnce.current?'计时在走 · 站回来，我接着数':'计时还没开始 · 计数也是'}</span></div>
            </div>:<><div className="training-hud-count"><strong key={metrics.reps} className="motion-rep-num">{metrics.reps}</strong><span>/ {metrics.targetReps} {exercise.unit}<br/>这一组的目标</span></div>
            <p className={`training-hud-coach${unclear?' amber':''}`}><span>陪练说</span>{coachLine}</p></>}
          </div>
        </div>}
        {paused && <div className="camera-paused"><Icon name="pause" size={30}/><b>{ending ? '正在保存' : pendingAction ? '等待状态确认' : '已暂停'}</b><span>已完成 {metrics.reps} {exercise.unit}</span>{adaptive&&!ending&&!pendingAction&&<small>{preparedToResume?'起始姿势已准备好，可直接继续':'休息不计数、不计时'}</small>}</div>}
        {preparing && !adaptive && <div className="camera-paused"><Icon name="camera"/><b>正在准备摄像头与模型</b><span>此时尚未开始新记录</span></div>}
        {active && <div className="training-camera-tools"><button ref={cameraExpandButton} type="button" aria-pressed={cameraExpanded} onClick={() => setCameraExpanded(value => !value)}><Icon name={cameraExpanded ? 'collapse' : 'expand'} size={18}/>{cameraExpanded ? '收起画面' : '放大画面'}</button>
          {!simulatedPose && <button type="button" aria-pressed={cameraFit === 'cover'} onClick={() => setCameraFit(value => value === 'contain' ? 'cover' : 'contain')}>{cameraFit === 'contain' ? '铺满画面' : '显示全身'}</button>}
        </div>}
        {active && !simulatedPose && cameraFit === 'cover' && <span className="training-camera-crop-note">画面已裁切 · 请确认全身可见</span>}
      </div>
      {preparing&&adaptive&&prepPhase!=='download'&&!downloadFailed&&<section className="training-calibration-guidance" role="status"><b>{framingCopyFor(exerciseType)}</b><p>{pose.telemetry?.reason}</p>{!creating&&<button type="button" className="secondary" onClick={cancelPrepare}>取消准备</button>}</section>}
      {active && <section className="training-live-info" aria-label="本组训练数据">
        <div className="training-numbers"><div className={"training-reps"+(metrics.reps>0&&metrics.reps>=metrics.targetReps?" motion-set-done":"")}><strong key={metrics.reps} className="motion-rep-num">{metrics.reps}</strong><span>/ {metrics.targetReps} {exercise.unit}</span></div>{calibratedOnce.current&&<div><strong>{format(seconds)}</strong><span>有效时长</span></div>}</div>
        <p className="training-coach" role="status"><span>{paused ? '已暂停' : '陪练说'}</span>{coachLine}</p>
        {['standing_leg_curl','one_arm_row','mountain_climber','split_squat'].includes(exerciseType)&&<p className="recognition-side-count">左侧 {metrics.scoreAccumulator.leftReps||0} 次 · 右侧 {metrics.scoreAccumulator.rightReps||0} 次 · 左右合计</p>}
        <div className="training-voice"><Icon name="mic" size={26}/><span><b>{voiceEnabled ? VOICE_LABEL[voice.state] : '语音陪练'}</b><small>{voiceEnabled ? voice.errorMessage || (voice.state === 'speaking' ? voice.reply : voice.transcript) || '连接后点击对话' : '语音指导你的动作节奏与要点'}</small></span>
          <button className="secondary" disabled={ending} onClick={!voiceEnabled ? toggleVoice : voice.state === 'idle' ? voice.wake : ['failed', 'fallback'].includes(voice.state) ? voice.retry : voice.inConversation ? voice.interrupt : toggleVoice}>{!voiceEnabled ? '开启' : voice.state === 'idle' ? '对话' : ['failed', 'fallback'].includes(voice.state) ? '重试' : voice.inConversation ? '打断' : '关闭'}</button>
        </div>
        <details className="training-details"><summary>连接与设备详情</summary><p>{voiceEnabled ? voice.errorMessage || VOICE_LABEL[voice.state] : '语音尚未开启，不占用设备。'} 本站不保存完整录音。</p>{voiceEnabled && <div className="training-detail-actions"><button className="secondary" onClick={toggleVoice}>关闭语音</button>{voice.source === 'xiaozhi' && <button className="secondary" onClick={voice.toggleMute}>{voice.muted ? '打开声音' : '静音'}</button>}</div>}
          {voice.state === 'activating' && voice.identityMode === 'personal' && <p>本机个人模式绑定码：<strong>{voice.activationCode}</strong>。<a href="https://xiaozhi.me" target="_blank" rel="noreferrer">前往小智绑定</a></p>}
          {voiceEnabled && <p>{voice.source === 'xiaozhi' ? '云端语音已连接' : '当前使用本地文字反馈'}{voice.dataSyncState.lastRepSynced ? ` · 已同步第 ${voice.dataSyncState.lastRepSynced} ${exercise.unit}` : ''}{voice.visionAvailable ? ' · 关键帧复核可用' : ''}</p>}
          {voiceEnabled && voice.transcript && <p>你：{voice.transcript}</p>}{voiceEnabled && voice.reply && <p>陪练：{voice.reply}</p>}
          {testSlot !== undefined && <p>管理员测试设备 {testSlot}</p>}
          <p>{heartRate.connected ? `心率 ${heartRate.signalInterrupted ? '信号中断' : heartRate.currentBpm || '等待数据'} BPM` : '未连接心率设备'}</p>
        </details>
      </section>}
    </div>
    {poseFailed && <div className="training-error" role="alert"><b>{poseFailureTitle}</b><p>{pose.errorReason.current || (active ? '识别已停止，请检查设备后重试。' : '尚未创建新训练记录，请允许摄像头或重新加载模型。')}</p>{!active&&<p>本次尚未开始计时，也未创建新的训练记录。</p>}{active && <button className="secondary" disabled={busy} onClick={() => void retryCamera()}>重试摄像头</button>}</div>}
    {adaptive&&poseFailed&&!active&&<button className="secondary" disabled={busy} onClick={()=>void begin(false,true)}>换个更稳的方式再试一次</button>}
    {adaptive&&paused&&<button className="secondary" disabled={busy} onClick={()=>void pose.start(true)}>换个更稳的方式重新准备</button>}
    {failure && <div className="training-error" role="alert"><p>{failure}</p>{ending ? <p>统计已保留，请重试结束，系统会先核对已保存记录。</p> : syncFailed && <button className="secondary" disabled={busy} onClick={() => void retrySync()}>重试同步</button>}</div>}
    {active && <div className="training-controls"><button className="secondary" disabled={busy || ending || poseFailed} onClick={() => void togglePause()}><Icon name={paused ? 'play' : 'pause'}/>{pendingAction ? '重试确认' : paused ? '继续' : '暂停'}</button><button className="primary" disabled={busy} onClick={() => void done()}><Icon name="stop" weight="fill"/>{busy && ending ? '正在保存…' : ending ? '重试结束' : '结束训练'}</button></div>}
  </div>
}
