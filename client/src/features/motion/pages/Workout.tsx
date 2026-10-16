import {getErrorMessage} from '../../../api/client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Header } from '../components/Header'
import { Icon } from '../components/Icons'
import { PoseCanvas } from '../components/PoseCanvas'
import { useXiaozhiCoach } from '../hooks/useXiaozhiCoach'
import { createCueState, pickCue } from '../lib/coachCues'
import { createCorrectionGateState, decideCorrectionCue, POSE_ISSUE_COPY } from '../lib/poseFeedback'
import { unlockAudio } from '../lib/tts'
import { useHeartRateMonitor } from '../hooks/useHeartRateMonitor'
import { usePose } from '../hooks/usePose'
import { useExerciseMetrics } from '../hooks/useExerciseMetrics'
import {exerciseInfo,type CameraExerciseType} from '../lib/exercises'
import { useWorkoutSession } from '../hooks/useWorkoutSession'
import { useStore } from '../lib/store'
import type { SportSession } from '../lib/store'
import type { WorkoutContext, WorkoutSession, XiaozhiState } from '../types'

const format = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

const VOICE_LABEL: Record<XiaozhiState, string> = {
  off: '本地文字陪练', idle: '语音陪练已连接 · 点击对话', activating: '正在配置语音设备',
  connecting: '正在连接动伴…', listening: '我在听，你接着说', thinking: '动伴在想…',
  speaking: '动伴正在用小智音色说话', reconnecting: '网络波动，正在恢复…', fallback: '小智语音离线 · 文字反馈中', failed: '语音暂不可用 · 点此重试',
}

const SOURCE_LABEL = { xiaozhi: '小智官方音色', compatible: '兼容模型 · 仅文字', local: '本地话术 · 仅文字' }
const POSE_STATUS = { stable: '姿势稳定', adjust: '建议调整', uncertain: '无法判断' }

export function Workout({ back, finish, existing, exerciseType }: { exerciseType:CameraExerciseType; back: () => void; finish: (session: WorkoutSession) => Promise<void>; existing?:SportSession }) {
  const exercise=exerciseInfo(exerciseType)
  const { state: appState, startSession, act } = useStore()
  const serverId = useRef<string>('')
  const closing=useRef(false)
  const accountToken=useRef(localStorage.getItem('token'))
  const [busy,setBusy]=useState(false)
  const [failure,setFailure]=useState('')
  const [syncFailed,setSyncFailed]=useState(false)
  const [active, setActive] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const testSlotValue = new URLSearchParams(window.location.search).get('voiceTestSlot')
  const testSlot = testSlotValue ? Number(testSlotValue) : undefined
  const [simulatedPose, setSimulatedPose] = useState(false)
  const [paused, setPaused] = useState(false)
  useEffect(()=>{if(active)document.querySelector('.motion-screen')?.scrollTo({top:0})},[active])
  const [visionConsent, setVisionConsent] = useState<boolean | null>(null)
  const pose = usePose(active && !simulatedPose)
  useEffect(()=>{if(active && !simulatedPose && pose.status==='idle')void pose.start()},[active,simulatedPose,pose.status])
  const heartRate = useHeartRateMonitor(appState.age)
  const {metrics,demoLandmarks} = useExerciseMetrics(exerciseType,pose.landmarks,simulatedPose,active,paused,pose.videoRef.current?.videoWidth && pose.videoRef.current.videoHeight ? pose.videoRef.current.videoWidth/pose.videoRef.current.videoHeight : 1,existing ? {...existing.metrics,reps:existing.reps} : {})
  const workout = useWorkoutSession(metrics, heartRate, active, paused, undefined,existing?.effectiveSeconds||0,exerciseType)
  const session = workout.session
  const progress=useRef<Record<string,unknown>>({})
  progress.current={...session,...metrics}
  useEffect(()=>{
    const flush=()=>{if(serverId.current && !closing.current && accountToken.current)void fetch('/api/v1/sport-sessions/'+serverId.current+'/progress',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+accountToken.current},body:JSON.stringify(progress.current),keepalive:true}).catch(()=>undefined)}
    window.addEventListener('pagehide',flush)
    return()=>{window.removeEventListener('pagehide',flush);flush()}
  },[])
  const leave=async()=>{if(!active){back();return}setBusy(true);try{await act(serverId.current,'pause',progress.current);back()}catch(err){setFailure(getErrorMessage(err))}finally{setBusy(false)}}

  const voiceContext: WorkoutContext = useMemo(() => ({
    exerciseType,countUnit:exercise.unit,reps: metrics.reps, targetReps: metrics.targetReps, phase: metrics.phase,
    durationSeconds: session?.durationSeconds || 0,
    bpm: heartRate.connected && !heartRate.signalInterrupted ? heartRate.currentBpm : null,
    active: active && !paused,
    poseStatus: metrics.poseFeedback.status,
    poseIssues: metrics.poseFeedback.issues,
    recentScore: metrics.formScore,
    lastRepAt: null,
    lastRepIssues: metrics.lastRepIssues,
    latestVisionInsight: null,
  }), [exerciseType,exercise.unit,metrics.reps, metrics.targetReps, metrics.phase, metrics.poseFeedback.status, metrics.poseFeedback.issues, metrics.formScore, session?.durationSeconds, heartRate.connected, heartRate.signalInterrupted, heartRate.currentBpm, active, paused])

  const voice = useXiaozhiCoach({ enabled: active && voiceEnabled, context: voiceContext, videoRef: pose.videoRef, visionConsent: visionConsent === true, testSlot })
  const voiceRef = useRef(voice)
  useEffect(() => { voiceRef.current = voice }, [voice])
  useEffect(() => { voice.sendWorkoutContext(voiceContext) }, [voiceContext])

  const personalBest = useMemo(
    () => appState.history.filter(item=>item.exerciseType===exerciseType && item.source!=='demo').reduce((best, item) => Math.max(best, item.reps || 0), 0),
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
    if (!active || paused || simulatedPose || visionConsent !== true || metrics.phase !== 'bottom') return
    if (capturedBottomRepRef.current === metrics.reps) return
    capturedBottomRepRef.current = metrics.reps
    voiceRef.current.captureRepFrame()
  }, [active, paused, simulatedPose, visionConsent, metrics.phase, metrics.reps])

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
    if (!active || paused) return
    const timer = window.setInterval(() => {
      if (voiceRef.current.inConversation) return
      const now = Date.now()
      const cue = pickCue({ ...cueInputRef.current, personalBest, sinceLastRepMs: now - lastRepAtRef.current, now }, cueStateRef.current)
      if (cue) voiceRef.current.say(cue.text, cue.kind === 'idle' ? 'low' : 'normal')
    }, 350)
    return () => clearInterval(timer)
  }, [active, paused, personalBest])

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
    const cue = decideCorrectionCue(metrics.lastRepIssues, Date.now(), correctionGateRef.current)
    if (cue) voiceRef.current.say(cue.text, 'high')
  }, [active, simulatedPose, metrics.reps, metrics.lastRepIssues])

  const begin = async (demo:boolean) => {
    if (!demo && visionConsent === null) return
    setBusy(true);setFailure('')
    try {const record=existing?await act(existing.id,'resume'):await startSession(exerciseType,demo?'demo':'camera');if(record.sportType!==exerciseType || record.source!==(demo?'demo':'camera'))throw new Error('现有运动的动作或来源不同，请返回训练入口恢复原记录');serverId.current=record.id;unlockAudio();setSimulatedPose(demo);setActive(true)} catch(err){setFailure(getErrorMessage(err))}finally{setBusy(false)}
  }
  const retrySync=async()=>{setBusy(true);try{await act(serverId.current,'progress',progress.current);setSyncFailed(false);setFailure('')}catch(err){setFailure(getErrorMessage(err))}finally{setBusy(false)}}
  const startRealPose=()=>void begin(false)
  const startDemo=()=>void begin(true)
  const togglePause=async()=>{setBusy(true);try{await act(serverId.current,paused?'resume':'pause',progress.current);setPaused(!paused);setFailure('');setSyncFailed(false)}catch(err){setFailure(getErrorMessage(err))}finally{setBusy(false)}}
  const done=async()=>{const completed=workout.finish();if(!completed)return;setBusy(true);closing.current=true;try{await finish({...completed,id:serverId.current,source:simulatedPose?'demo':'camera',visionInsights:[],conversationTurnCount:voice.conversationTurnCount})}catch(err){closing.current=false;setFailure(getErrorMessage(err))}finally{setBusy(false)}}
  const scoreLabel = metrics.formScore === 0 ? '待完成' : metrics.formScore >= 90 ? '优秀' : metrics.formScore >= 80 ? '良好' : '需调整'

  if (!active) return <div className="page workout-page setup">
    <Header title={`${exercise.name} ${exercise.english}`} back={()=>void leave()}/>{failure&&<p role="alert">{failure}</p>}
    <div className="setup-visual"><div className="scan-ring"><Icon name="spark" size={42}/></div><span className="eyebrow">准备训练</span><h2>{exercise.name} · 准备训练</h2><p>{exercise.placement}</p><p>{exercise.instruction}</p><p>姿态识别和实时矫正始终在浏览器本地运行；原始视频不会保存。</p></div>
    <div className="vision-consent" role="group" aria-label="关键帧复核选择">
      <b>开始前确认视觉范围</b>
      <p>允许后，每次完整动作最多上传一张动作关键阶段的压缩关键帧；你主动说“看看动作”时也可即时复核。图片不落盘、不写入训练历史。</p>
      <div>
        <button className={visionConsent === false ? 'selected' : ''} onClick={() => setVisionConsent(false)}>仅本地分析</button>
        <button className={visionConsent === true ? 'selected' : ''} onClick={() => setVisionConsent(true)}>允许智能复核</button>
      </div>
    </div>
    {existing&&<p>恢复记录：已完成 {existing.reps} {exercise.unit}，已计时 {existing.effectiveSeconds} 秒</p>}
    <button className="primary" disabled={busy || visionConsent === null || existing?.source==='demo'} onClick={startRealPose}><Icon name="camera"/> 开启 AI 摄像头识别</button>
    <button className="secondary" disabled={busy || existing?.source==='camera'} onClick={startDemo}><Icon name="play"/> 使用演示动作</button>
    <div className="voice-hint"><Icon name="mic" size={15}/><span><b>语音陪练 · 训练开始后按需开启</b><small>进入训练不会占用设备。点击“开启语音陪练”后连接；共享服务由管理员统一配置。云端实时处理语音，本站不保存完整录音。</small></span></div>
    <div className="ble-setup"><div><Icon name="bluetooth"/><span><b>{heartRate.deviceName || 'BLE 心率带'}</b><small>{heartRate.status === 'unsupported' ? '请使用桌面 Chrome 或 Edge' : heartRate.connected ? `${heartRate.currentBpm || '--'} BPM · Zone ${heartRate.currentZone || '--'}` : heartRate.errorMessage || '标准 0x180D / 0x2A37'}</small></span></div><button disabled={heartRate.status === 'connecting' || heartRate.status === 'unsupported' || heartRate.connected} onClick={heartRate.connect}>{heartRate.status === 'connecting' ? '正在连接…' : heartRate.connected ? '已连接' : '连接心率带'}</button></div>
  </div>

  return <div className="page workout-page live">
    <Header title={`${exercise.name} ${exercise.english}`} back={()=>void leave()} action={<span className="live-pill"><i/>{simulatedPose ? '演示 · 不计 XP' : 'AI 识别中'}</span>}/>
    {voice.state === 'activating' && voice.identityMode === 'personal' && <div className="activation-card"><span className="coach-face caring">AI</span><div><b>绑定小智账号</b><small>{voice.activationMessage}</small><strong>{voice.activationCode}</strong><a href="https://xiaozhi.me" target="_blank" rel="noreferrer">打开 xiaozhi.me 完成绑定</a></div></div>}
    <div className="workout-stats"><div><Icon name="flame"/><span><b>{format(session?.durationSeconds || 0)}</b><small>训练时长</small></span></div><div><Icon name="heart"/><span><b>{!heartRate.connected ? '未连接' : heartRate.signalInterrupted ? '信号中断' : heartRate.currentBpm ? `${heartRate.currentBpm} BPM` : '等待数据'}</b><small>{heartRate.currentZone ? `BLE · Zone ${heartRate.currentZone}` : 'BLE 心率设备'}</small></span></div></div>
    <div className="workout-actions"><button className="secondary" disabled={busy} onClick={()=>void togglePause()}><Icon name={paused ? 'play' : 'pause'}/>{paused ? '继续' : '暂停'}</button><button className="primary" disabled={busy} onClick={()=>void done()}><Icon name="check"/>完成本组</button></div>
    <div className="camera-card">
      <PoseCanvas videoRef={pose.videoRef} landmarks={simulatedPose?demoLandmarks:pose.landmarks} demo={simulatedPose} phase={metrics.phase} affectedJoints={metrics.poseFeedback.affectedJoints}/>
      <div className="camera-label"><i/>{simulatedPose ? 'DEMO 姿态模型' : pose.status === 'loading' ? '模型加载中' : pose.status === 'denied' ? '摄像头被拒绝' : pose.status === 'error' ? '姿态模型加载失败' : 'AI 骨骼追踪'}</div>
      <div className="phase-tag">{metrics.phase==='standing'?(exerciseType==='push_up'?'伸臂支撑':'起始位置'):metrics.phase==='bottom'?'动作关键阶段':'动作进行中'}</div>
      <div className={`pose-confidence ${metrics.poseFeedback.status}`}><b>{POSE_STATUS[metrics.poseFeedback.status]}</b><small>{metrics.poseFeedback.calibrated ? `${Math.round(metrics.poseFeedback.confidence * 100)}% 置信` : '起始姿势校准中'}</small></div>
    </div>
    <div className="count-score"><div className="rep-count"><b>{metrics.reps}</b><span>/ {metrics.targetReps} {exercise.unit}</span></div><div className="score-ring" style={{ '--score': `${metrics.formScore * 3.6}deg` } as React.CSSProperties}><div><b>{metrics.formScore || '--'}</b><small>分</small></div></div><div className="score-copy"><small>平均动作评分</small><b>{scoreLabel}</b></div></div>
    <div className={`feedback ${metrics.poseFeedback.status}`}><Icon name="spark"/><span><b>{metrics.poseFeedback.primaryIssue ? POSE_ISSUE_COPY[metrics.poseFeedback.primaryIssue].label : POSE_STATUS[metrics.poseFeedback.status]}</b><small>{metrics.feedback}</small></span></div>
    <div className="workout-actions"><button className="secondary" onClick={() => { if (!voiceEnabled) { voice.prepareAudio(); voice.retry() } setVoiceEnabled(!voiceEnabled) }}><Icon name="mic"/>{voiceEnabled ? '关闭语音陪练' : '开启语音陪练'}</button>{testSlot !== undefined && <small>管理员设备 {testSlot} 测试 · 不代表已公开开放</small>}</div>
    <div className={`coach-panel ${voice.state}`}>
      <span className={`coach-face ${voice.emotion}`} aria-label={`动伴表情：${voice.emotion}`}>{voice.emotion === 'celebrating' ? 'AI' : voice.emotion === 'concerned' ? 'AI' : voice.emotion === 'thinking' ? 'AI' : voice.emotion === 'listening' ? 'AI' : 'AI'}</span>
      <button className="voice-status" onClick={voiceEnabled && voice.state === 'idle' ? voice.wake : voice.state === 'failed' ? voice.retry : undefined} disabled={!voiceEnabled || !['idle', 'failed'].includes(voice.state)}>
        <span><b>{voice.source !== 'xiaozhi' && voice.state === 'listening' ? '正在识别语音 · 回复仅文字' : voice.source !== 'xiaozhi' && voice.state === 'thinking' ? '正在准备文字回复…' : VOICE_LABEL[voice.state]}</b><small>{voice.errorMessage || (voice.state === 'speaking' || voice.state === 'thinking' ? voice.reply || '…' : voice.transcript || voice.reply || (voiceEnabled ? '连接后点击对话，我会先听你说' : '训练照常进行，可随时开启语音'))}</small></span>
      </button>
      {voiceEnabled && voice.source !== 'xiaozhi' && <button className="interrupt-btn" onClick={voice.retry}>重试连接</button>}
      {(voice.state === 'speaking' || voice.state === 'thinking') && <button className="interrupt-btn" onClick={voice.interrupt}>打断</button>}
      {voice.source === 'xiaozhi' && <button className="voice-mute" onClick={voice.toggleMute} aria-label={voice.muted ? '打开声音' : '关闭声音'}><Icon name={voice.muted ? 'volumeOff' : 'volume'} size={15}/></button>}
      <em>{SOURCE_LABEL[voice.source]}{voice.xiaozhiVoiceReady ? ' · 声音就绪' : ''}{voice.visionAvailable && visionConsent ? ' · 视觉就绪' : ''}</em>
    </div>
    <div className="xiaozhi-sync" aria-live="polite">
      <span className={voice.dataSyncState.mcpReady ? 'ok' : ''}>{voice.source !== 'xiaozhi' ? '本地陪练 · 云端同步未启用' : voice.dataSyncState.mcpReady ? 'MCP 已连接' : 'MCP 等待中'}</span>
      {voice.dataSyncState.lastRepSynced > 0 && <span className="ok">第 {voice.dataSyncState.lastRepSynced} {exercise.unit}数据已同步</span>}
      {voice.dataSyncState.visionStatus !== 'idle' && <span className={voice.dataSyncState.visionStatus === 'failed' ? 'error' : voice.dataSyncState.visionStatus === 'reviewed' ? 'ok' : ''}>
        {voice.dataSyncState.visionRep ? `第 ${voice.dataSyncState.visionRep} ${exercise.unit}` : '当前'}关键帧{voice.dataSyncState.visionStatus === 'queued' ? '已排队' : voice.dataSyncState.visionStatus === 'reviewed' ? '已复核' : '复核失败'}
      </span>}
      {voice.dataSyncState.wakeDetected && <span className="heard">已听到唤醒词</span>}
    </div>
    <div className="zone-card"><div><Icon name="heart"/><span>当前心率<b>{!heartRate.connected ? '未连接' : heartRate.signalInterrupted ? '信号中断' : heartRate.currentBpm ? <>{heartRate.currentBpm} <small>BPM</small></> : '等待数据'}</b></span></div><div className="zones">{[1, 2, 3, 4, 5].map(zone => <span key={zone} className={heartRate.currentZone === zone ? 'current' : ''}><i/>Zone {zone}</span>)}</div></div>
    {!simulatedPose && ['denied','error'].includes(pose.status)&&<div className="motion-error" role="alert"><p>{pose.status==='denied'?'摄像头权限被拒绝，请允许访问后重试。':'摄像头或模型暂时不可用，请重试。'}当前不计动作次数。</p><button className="secondary" onClick={()=>void pose.start()}>重试摄像头</button></div>}
    {failure&&<div role="alert"><p>{failure}</p>{syncFailed&&<button className="secondary" disabled={busy} onClick={()=>void retrySync()}>重试同步</button>}</div>}
  </div>
}

