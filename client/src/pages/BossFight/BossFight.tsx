import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getErrorMessage } from '../../api/client'
import * as gamesApi from '../../api/games'
import { Header } from '../../features/motion/components/Header'
import { Icon } from '../../features/motion/components/Icons'
import { PoseCanvas } from '../../features/motion/components/PoseCanvas'
import { useBossFight } from '../../features/motion/hooks/useBossFight'
import { useExerciseMetrics } from '../../features/motion/hooks/useExerciseMetrics'
import { usePose } from '../../features/motion/hooks/usePose'
import { usePosePrepare } from '../../features/motion/hooks/usePosePrepare'
import { useSessionClock } from '../../features/motion/hooks/useSessionClock'
import { useWorkoutSession } from '../../features/motion/hooks/useWorkoutSession'
import { loadRecognitionPreference, selectNewRecognitionStrategy } from '../../features/motion/lib/adaptiveRecognition'
import {
  FIGHT_DURATIONS, FIGHT_MOVEMENTS, PHASE1_BOSS_ID, bossInfo, estimateMaxHp,
} from '../../features/motion/lib/bossCatalog'
import {
  HP_STATE_NAME, estimateServerNow, formatClock, hpStateKey, nextLayout,
  publicParticipantView, recordLatencySample, remainingSeconds, teammateStatusLabel,
  INITIAL_LAYOUT, crossedRepMilestone, deriveFrameAlert, hpStageAnnouncement, FRAME_ALERT_WORD,
  type BossFightSnapshot, type BossHpState, type FightLayoutState, type FrameAlert,
} from '../../features/motion/lib/bossFightState'
import { announceCue, announceFrameAlert, announceRepMilestone, loadBossSoundOn, playHit, primeBossAudio, saveBossSoundOn } from '../../features/motion/lib/bossSounds'
import { exerciseInfo, type CameraExerciseType } from '../../features/motion/lib/exercises'
import { getOutfitAvatar } from '../../features/motion/lib/outfits'
import { useStore, type SportSession } from '../../features/motion/lib/store'
import { showToast } from '../../hooks/useAuth'
import { useAuthStore } from '../../stores/authStore'
import './BossFight.css'

const PRIVACY_LINE = '识别在你手机上完成，视频不会上传；队友只能看到你的次数和形象。镜头里可能拍到室友，架手机时留意一下。'

function AvatarWithFrame({ avatar, name }: { avatar: any; name: string }) {
  const img = avatar ? getOutfitAvatar(avatar.gender as any, avatar.outfit as any, 'front') : ''
  return (
    <span className={`bf-avatar frame-${avatar?.highest_rarity || 'N'}`} title={avatar ? `${name} · ${avatar.highest_rarity_name}` : name}>
      {img ? <img src={img} alt={`${name}的形象`} draggable={false} /> : <Icon name="user" size={22} />}
    </span>
  )
}

export default function BossFightPage() {
  const { id: gameId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const fight = useBossFight(gameId)
  const snapshot = fight.snapshot
  const { startSession, act, sessions, finishWorkout } = useStore()

  const [game, setGame] = useState<any>(null)
  useEffect(() => {
    if (!gameId) return
    void gamesApi.fetchGameDetail(gameId).then((res: any) => {
      const body = res.data || res
      setGame(body.game || body)
    }).catch(() => undefined)
  }, [gameId])
  const isHost = Boolean(game) && Number(game.host_id) === Number(user?.id)

  // ------------------------------------------------------------------
  // 声音
  // ------------------------------------------------------------------
  const [soundOn, setSoundOn] = useState(loadBossSoundOn)
  const soundOnRef = useRef(soundOn)
  soundOnRef.current = soundOn
  const toggleSound = () => {
    const next = !soundOn
    setSoundOn(next)
    saveBossSoundOn(next)
    if (next) primeBossAudio()
  }

  // ------------------------------------------------------------------
  // 布局（一键互换，方案 E）
  // ------------------------------------------------------------------
  const [layout, setLayout] = useState<FightLayoutState>(INITIAL_LAYOUT)
  const swapLayout = useCallback(() => setLayout((s) => nextLayout(s, { type: 'swap' })), [])

  // ------------------------------------------------------------------
  // 摄像头计数（独立场次，挂到本场打怪上；管线与训练页同一套）
  // ------------------------------------------------------------------
  const movement = (snapshot?.movement || 'squat') as CameraExerciseType
  const exercise = exerciseInfo(movement)
  const [preference] = useState(loadRecognitionPreference)
  const adaptive = snapshot ? selectNewRecognitionStrategy(movement, preference) === 'adaptive-v1' : false
  const posePrepare = usePosePrepare()
  const [camOn, setCamOn] = useState(false)
  const [camBusy, setCamBusy] = useState(false)
  const [camError, setCamError] = useState('')
  const [preparing, setPreparing] = useState(false)
  const [restoredMetrics, setRestoredMetrics] = useState<any>({})
  const [sessionId, setSessionId] = useState('')
  const sessionIdRef = useRef('')
  sessionIdRef.current = sessionId
  const finishedRef = useRef(false)
  const [sessionDone, setSessionDone] = useState<{ xp: number } | null>(null)
  const [finishing, setFinishing] = useState(false)

  const pose = usePose(camOn && !camBusy, {
    adaptive, type: movement, key: movement, target: 20, restored: restoredMetrics,
  })
  const aspect = pose.videoRef.current?.videoWidth && pose.videoRef.current?.videoHeight
    ? pose.videoRef.current.videoWidth / pose.videoRef.current.videoHeight : 1
  const { metrics } = useExerciseMetrics(
    movement, pose.landmarks, false, camOn, camBusy, aspect,
    restoredMetrics, 20, `bossfight:${sessionId || 'new'}`, pose.worldLandmarks, pose.engine,
  )
  const record = sessions.find((s) => s.id === sessionId)
  const seconds = useSessionClock(record, !camOn)
  const heartStub = useMemo(() => ({
    connected: false, currentBpm: null, currentZone: null, lastPacketAt: null, packetCount: 0, signalInterrupted: false,
  }), [])
  const workout = useWorkoutSession(metrics, heartStub as any, camOn, false, undefined, record?.effectiveSeconds || 0, movement, seconds, restoredMetrics)
  const progressRef = useRef<any>({})
  progressRef.current = { ...workout.session, ...metrics, recognitionStrategy: adaptive ? 'adaptive-v1' : 'legacy' }
  const metricsRef = useRef(metrics)
  metricsRef.current = metrics
  const snapshotRef = useRef<BossFightSnapshot | null>(null)
  snapshotRef.current = snapshot
  const camOnRef = useRef(camOn)
  camOnRef.current = camOn
  const landmarksRef = useRef(pose.landmarks)
  landmarksRef.current = pose.landmarks

  // 计数上报（带 clientTs，打怪伤害由服务端账本在这条上报里入账）
  const pendingTsRef = useRef<number | null>(null)
  const versionAtSendRef = useRef(0)
  const sendProgress = useCallback(() => {
    const sid = sessionIdRef.current
    if (!sid || !camOnRef.current || finishedRef.current) return
    const clientTs = Date.now()
    pendingTsRef.current = clientTs
    versionAtSendRef.current = snapshotRef.current?.version ?? 0
    void act(sid, 'progress', { ...progressRef.current, clientTs }).catch(() => undefined)
  }, [act])
  useEffect(() => {
    if (!camOn || !sessionId) return
    const timer = window.setTimeout(sendProgress, 400)
    return () => window.clearTimeout(timer)
  }, [metrics.reps, camOn, sessionId, sendProgress])

  // 延迟采样：我发出的上报 → 广播带着新版本回来，中间这段就是近似端到端延迟
  useEffect(() => {
    if (!fight.lastBroadcastAt) return
    const pending = pendingTsRef.current
    if (pending && (snapshotRef.current?.version ?? 0) > versionAtSendRef.current) {
      recordLatencySample(Date.now() - pending)
      pendingTsRef.current = null
    }
  }, [fight.lastBroadcastAt])

  // 离开页面时把计数暂停住（和训练页同款兜底，记录不会丢）
  const accountToken = useRef(localStorage.getItem('token'))
  useEffect(() => () => {
    const sid = sessionIdRef.current
    if (!sid || finishedRef.current || !accountToken.current) return
    void fetch('/api/v1/sport-sessions/' + sid + '/pause', {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', 'X-MoveMate-Recognition-Version': '6', Authorization: 'Bearer ' + accountToken.current },
      body: JSON.stringify(progressRef.current),
    }).catch(() => undefined)
  }, [])

  const startCamera = useCallback(async (resumeRow?: SportSession) => {
    if (camBusy || !snapshotRef.current) return
    primeBossAudio()
    setCamBusy(true)
    setCamError('')
    try {
      let forceLite = false
      if (adaptive && !posePrepare.ready) {
        setPreparing(true)
        const ok = await posePrepare.start()
        setPreparing(false)
        if (!ok) forceLite = true
      }
      if (!await pose.start(forceLite)) {
        setCamError('摄像头没能打开，检查一下权限，再点一次试试。')
        return
      }
      const strategy = adaptive && !forceLite ? 'adaptive-v1' : 'legacy'
      if (resumeRow) {
        setRestoredMetrics({ ...(resumeRow.metrics || {}), reps: resumeRow.reps })
        const row = await act(resumeRow.id, 'resume', { recognitionStrategy: strategy })
        setSessionId(row.id)
        await fight.linkSession(row.id)
      } else {
        setRestoredMetrics({})
        const row = await startSession(movement, 'camera', undefined, strategy)
        setSessionId(row.id)
        if (fight.isParticipant) await fight.linkSession(row.id)
        else await fight.join(row.id)
      }
      setCamOn(true)
    } catch (err) {
      setCamError(getErrorMessage(err))
    } finally {
      setCamBusy(false)
      setPreparing(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camBusy, adaptive, movement])

  // 之前挂过、还没结束的计数（比如中途退回组局页又进来），可以接着用
  const resumable = !sessionId && snapshot
    ? sessions.find((s) => s.source === 'camera' && s.sportType === snapshot.movement && (s.status === 'running' || s.status === 'paused'))
    : undefined

  // ------------------------------------------------------------------
  // 战斗状态机：开打基线、本机击中反馈、节点播报
  // ------------------------------------------------------------------
  const baselineRef = useRef(0)
  const prevStatusRef = useRef<string>('')
  const prevHpStateRef = useRef<BossHpState>('full')
  const prevMilestoneRef = useRef(0)
  const [floaters, setFloaters] = useState<Array<{ id: number; value: number }>>([])
  const floaterId = useRef(0)
  const prevRepsRef = useRef(0)
  // 远距离模式：出画状态（持续确认后才亮闪烁边框 + 播报，防抖）
  const [frameAlert, setFrameAlert] = useState<FrameAlert | null>(null)
  const alertTrackRef = useRef<{ kind: FrameAlert; since: number } | null>(null)
  const lastFrameVoiceRef = useRef(0)

  useEffect(() => {
    const status = snapshot?.status
    if (!status) return
    if (prevStatusRef.current !== status) {
      if (status === 'fighting') {
        baselineRef.current = metricsRef.current.reps
        prevHpStateRef.current = hpStateKey(snapshot.hp, snapshot.max_hp)
        prevMilestoneRef.current = 0
        setLayout((s) => nextLayout(s, { type: 'fight-started' }))
        announceCue('start', soundOnRef.current)
        sendProgress()
      }
      if (status === 'won') announceCue('win', soundOnRef.current)
      if (status === 'escaped') announceCue('escape', soundOnRef.current)
      prevStatusRef.current = status
    }
  }, [snapshot?.status, snapshot?.hp, snapshot?.max_hp, sendProgress])

  // 远距离模式语音：怪兽血量一掉档就喊（和画面换图同一档位：60% / 30%）
  useEffect(() => {
    if (!snapshot || snapshot.status !== 'fighting') return
    const st = hpStateKey(snapshot.hp, snapshot.max_hp)
    const prev = prevHpStateRef.current
    if (st === prev) return
    prevHpStateRef.current = st
    const ann = hpStageAnnouncement(prev, st)
    if (ann === 'mid') announceCue('stageMid', soundOnRef.current)
    if (ann === 'low') announceCue('low', soundOnRef.current)
  }, [snapshot?.hp, snapshot?.status, snapshot?.max_hp])

  useEffect(() => {
    const reps = metrics.reps
    if (snapshotRef.current?.status === 'fighting' && camOnRef.current && reps > prevRepsRef.current) {
      const gained = reps - prevRepsRef.current
      playHit(soundOnRef.current)
      const id = ++floaterId.current
      setFloaters((f) => [...f.slice(-4), { id, value: gained }])
      window.setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 950)
      // 远距离模式语音：本场次数每跨一个整十，喊一次现在的数
      const fightReps = Math.max(0, reps - baselineRef.current)
      const milestone = crossedRepMilestone(prevMilestoneRef.current, fightReps)
      if (milestone) announceRepMilestone(milestone, soundOnRef.current)
      prevMilestoneRef.current = fightReps
    }
    prevRepsRef.current = reps
  }, [metrics.reps])

  // 远距离模式：出画监测。追踪状态 300ms 探一次，同一种出画持续约 1 秒才
  // 亮闪烁边框；语音最密 6 秒一句，免得人刚走回画面又被念叨。还没找准人
  // （未校准）时不报，取景阶段的提示在集结画面里给。
  useEffect(() => {
    if (snapshot?.status !== 'fighting' || !camOn) {
      alertTrackRef.current = null
      setFrameAlert(null)
      return
    }
    const timer = window.setInterval(() => {
      if (!metricsRef.current.poseFeedback?.calibrated) return
      const raw = deriveFrameAlert(landmarksRef.current)
      const now = Date.now()
      if (!raw) {
        alertTrackRef.current = null
        setFrameAlert(null)
        return
      }
      if (alertTrackRef.current?.kind !== raw) {
        alertTrackRef.current = { kind: raw, since: now }
        return
      }
      if (now - alertTrackRef.current.since >= 900) {
        setFrameAlert(raw)
        if (now - lastFrameVoiceRef.current >= 6000) {
          lastFrameVoiceRef.current = now
          announceFrameAlert(raw, soundOnRef.current)
        }
      }
    }, 300)
    return () => window.clearInterval(timer)
  }, [snapshot?.status, camOn])

  // 倒计时（按服务端时钟推算）
  const [nowMs, setNowMs] = useState(Date.now())
  useEffect(() => {
    if (snapshot?.status !== 'fighting') return
    const timer = window.setInterval(() => setNowMs(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [snapshot?.status])
  const remain = snapshot?.status === 'fighting'
    ? remainingSeconds(snapshot.ends_at, estimateServerNow(snapshot.server_ts, fight.receivedAt, nowMs))
    : 0
  useEffect(() => {
    if (snapshot?.status !== 'fighting' || remain > 0) return
    const timer = window.setTimeout(() => void fight.refresh(), 1500)
    return () => window.clearTimeout(timer)
  }, [remain, snapshot?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const myFightReps = Math.max(0, metrics.reps - baselineRef.current)

  // ------------------------------------------------------------------
  // 动作
  // ------------------------------------------------------------------
  const [actionBusy, setActionBusy] = useState('')
  const runAction = async (name: string, fn: () => Promise<unknown>, okMsg?: string) => {
    if (actionBusy) return
    setActionBusy(name)
    try {
      await fn()
      if (okMsg) showToast(okMsg, 'success')
    } catch (err) {
      showToast(getErrorMessage(err), 'error')
    } finally {
      setActionBusy('')
    }
  }

  const finishSession = async () => {
    if (!sessionId || finishing || finishedRef.current) return
    setFinishing(true)
    try {
      const completed = workout.finish()
      if (!completed) return
      const row = await finishWorkout({
        ...completed, id: sessionId, source: 'camera',
        recognitionStrategy: adaptive ? 'adaptive-v1' : 'legacy',
        visionInsights: [], conversationTurnCount: 0,
      } as any)
      finishedRef.current = true
      setSessionDone({ xp: row.xpEarned || 0 })
      setCamOn(false)
      pose.stop()
      await fight.refresh()
    } catch (err) {
      showToast(getErrorMessage(err), 'error')
    } finally {
      setFinishing(false)
    }
  }

  const leaveFlow = async () => {
    try { await fight.leave() } catch { /* 退出失败也先回组局页，状态以服务端为准 */ }
    if (sessionId && !finishedRef.current) {
      try { await act(sessionId, 'pause', progressRef.current) } catch { /* 已有卸载兜底 */ }
    }
    navigate(`/game/${gameId}`)
  }

  const rebook = async () => {
    try {
      const res: any = await gamesApi.rebookGame(gameId!)
      const body = res.data || res
      const next = body.data || body
      showToast('下周的局已经约上了', 'success')
      navigate(`/game/${next.id}`)
    } catch (err) {
      showToast(getErrorMessage(err), 'error')
    }
  }

  // ------------------------------------------------------------------
  // 渲染
  // ------------------------------------------------------------------
  const boss = bossInfo(snapshot?.boss_id || PHASE1_BOSS_ID)
  const hpState = snapshot ? hpStateKey(snapshot.hp, snapshot.max_hp) : 'full'
  const bossImage = boss?.stateImages
    ? boss.stateImages[hpState]
    : boss?.image || ''
  const joined = snapshot?.participants.filter((p) => p.status === 'joined') || []
  const allReady = joined.length >= 2 && joined.every((p) => p.ready)
  const header = (
    <Header
      title="组队打怪"
      back={() => navigate(`/game/${gameId}`)}
      action={(
        <span className="bf-header-actions">
          <button type="button" className="bf-sound-btn" aria-pressed={soundOn} onClick={toggleSound}>
            <Icon name={soundOn ? 'volume' : 'volumeOff'} size={18} />{soundOn ? '声音开' : '已静音'}
          </button>
          <button type="button" className="bf-sound-btn" onClick={() => navigate('/boss-Atlas')}>图鉴</button>
        </span>
      )}
    />
  )

  if (fight.loading && !snapshot) {
    return <div className="bf-page">{header}<div className="motion-loading">正在看看这场打怪…</div></div>
  }
  if (fight.error && !snapshot) {
    return (
      <div className="bf-page">{header}
        <div className="empty-state"><Icon name="users" size={40} /><h3>暂时进不来</h3><p>{fight.error}</p>
          <button className="btn btn--primary" onClick={() => void fight.refresh()}>再试一次</button></div>
      </div>
    )
  }

  // 还没有打怪：发起人建场，其他人等
  if (!snapshot) {
    return (
      <div className="bf-page">{header}
        <CreatePanel
          isHost={isHost}
          gameReady={game?.status === 'in_progress'}
          busy={actionBusy === 'create'}
          onCreate={(movementId, durationSec) => void runAction('create', () => fight.create({ movement: movementId, bossId: PHASE1_BOSS_ID, durationSec }), '打怪发起啦，喊大家来集合')}
        />
        <p className="bf-privacy">{PRIVACY_LINE}</p>
      </div>
    )
  }

  // 终局：结算
  if (snapshot.status === 'won' || snapshot.status === 'escaped' || snapshot.status === 'aborted') {
    return (
      <div className="bf-page">{header}
        <SettlementPanel
          snapshot={snapshot}
          isHost={isHost}
          myReps={myFightReps}
          myDamage={fight.myDamage}
          hasSession={Boolean(sessionId)}
          sessionDone={sessionDone}
          finishing={finishing}
          onFinishSession={() => void finishSession()}
          onRebook={() => void rebook()}
          onBack={() => navigate(`/game/${gameId}`)}
        />
      </div>
    )
  }

  const fighting = snapshot.status === 'fighting'
  const myParticipant = fight.myParticipant

  return (
    <div className={`bf-page${fighting ? ' far' : ''}`}>{header}
      {/* 远距离模式：出画时全屏闪烁边框 + 大字方向，几米外也看得清 */}
      {fighting && frameAlert && (
        <>
          <div className="bf-frame-flash" aria-hidden="true" />
          <div className="bf-frame-word" role="alert">{FRAME_ALERT_WORD[frameAlert]}</div>
        </>
      )}
      {/* 血条与倒计时：全程最大字号 */}
      <section className="bf-hud" aria-label="怪兽血量">
        <div className="bf-hud-top">
          <b>{snapshot.boss_name} · {HP_STATE_NAME[hpState]}</b>
          {fighting && <span className="bf-countdown">还剩 {formatClock(remain)}</span>}
        </div>
        <div className="bf-hpbar" role="progressbar" aria-valuenow={snapshot.hp} aria-valuemin={0} aria-valuemax={snapshot.max_hp || 1}>
          <div className="bf-hpbar-fill" style={{ width: `${snapshot.max_hp ? Math.max(0, Math.min(100, (snapshot.hp / snapshot.max_hp) * 100)) : 100}%` }} />
        </div>
        <div className="bf-hud-sub">
          {fighting
            ? <span>还剩 <b>{snapshot.hp}</b> / {snapshot.max_hp}</span>
            : <span>血量会在开打时按人数算好（现在约 {estimateMaxHp(snapshot.movement, Math.max(2, joined.length), snapshot.duration_sec)}）</span>}
          <span>{exerciseInfo(snapshot.movement as CameraExerciseType).name} · {Math.round(snapshot.duration_sec / 60)} 分钟</span>
        </div>
      </section>

      {/* 舞台：布局 E，点小窗互换 */}
      <section className={`bf-stage mode-${layout.mode}`} aria-label="打怪画面">
        <div className="bf-boss-layer">
          <img src={bossImage} alt={`${snapshot.boss_name}（${HP_STATE_NAME[hpState]}）`} draggable={false} />
          <span className="bf-boss-tag">{snapshot.boss_name} · {HP_STATE_NAME[hpState]}</span>
          {layout.mode === 'self' && (
            <button type="button" className="bf-swap-cover" aria-label="切换画面：看怪兽" onClick={swapLayout} />
          )}
        </div>
        <div className={`bf-cam-layer${camOn ? '' : ' idle'}`}>
          {camOn ? (
            <>
              <PoseCanvas
                videoRef={pose.videoRef}
                landmarks={pose.landmarks}
                demo={false}
                phase={metrics.phase}
                fit="contain"
                keepVideoRendering={adaptive}
                frame={pose.frame}
              />
              <span className="bf-cam-chip">{metrics.poseFeedback.calibrated ? '识别中' : '正在找你 · 站到画面中间'}</span>
              <button type="button" className="bf-swap-cover" aria-label={`切换画面：${layout.mode === 'boss' ? '看自己' : '看怪兽'}`} onClick={swapLayout} />
            </>
          ) : (
            <div className="bf-cam-idle">
              <Icon name="camera" size={30} />
              <p>{exercise.placement}</p>
              {camError && <p className="bf-error" role="alert">{camError}</p>}
              {preparing && <p>正在准备识别，马上就好…</p>}
              <div className="bf-cam-idle-actions">
                <button type="button" className="btn btn--primary" disabled={camBusy} onClick={() => void startCamera()}>
                  {camBusy ? '正在开启…' : '开启摄像头计数'}
                </button>
                {resumable && (
                  <button type="button" className="btn btn--secondary" disabled={camBusy} onClick={() => void startCamera(resumable)}>
                    接着之前的计数（已 {resumable.reps} {exercise.unit}）
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 队伍一行：只有形象、名字和状态，没有任何人的伤害 */}
      <section className="bf-team" aria-label="队伍">
        {snapshot.participants.map((p) => {
          const pub = publicParticipantView(p)
          const mine = Number(p.user_id) === Number(user?.id)
          return (
            <div key={p.user_id} className={`bf-member${mine ? ' mine' : ''}`}>
              <AvatarWithFrame avatar={pub.avatar} name={pub.nickname} />
              <b>{pub.nickname}{mine ? '（我）' : ''}</b>
              {fighting ? (
                <span className={`bf-dot ${pub.status === 'joined' && pub.has_session ? 'on' : 'off'}`} role="img" aria-label={teammateStatusLabel(pub, 'fighting')} />
              ) : (
                <span className="bf-member-status">{mine ? (p.ready ? '已准备' : '还没准备') : teammateStatusLabel(pub, 'gathering')}</span>
              )}
              {!fighting && pub.avatar && <span className="bf-member-rarity">{pub.avatar.highest_rarity_name}</span>}
            </div>
          )
        })}
      </section>

      {!fighting && (
        <section className="bf-gather" aria-label="集结">
          {!fight.isParticipant ? (
            <>
              <p className="bf-note">加入队伍就能一起打。先开启上面的摄像头把计数挂上，开打后你做的每个{exercise.name}都会打到它。</p>
              <button type="button" className="btn btn--primary btn--block bf-big-btn" disabled={actionBusy === 'join'} onClick={() => void runAction('join', () => fight.join(), '已加入队伍')}>
                加入队伍
              </button>
            </>
          ) : (
            <>
              {myParticipant && !myParticipant.has_session && (
                <p className="bf-note">先开启上面的摄像头把计数挂上，不然开打了你的动作打不到它。</p>
              )}
              <button
                type="button"
                className={`btn btn--block bf-big-btn ${myParticipant?.ready ? 'btn--secondary' : 'btn--primary'}`}
                aria-pressed={Boolean(myParticipant?.ready)}
                disabled={actionBusy === 'ready'}
                onClick={() => void runAction('ready', () => fight.setReady(!myParticipant?.ready))}
              >
                {myParticipant?.ready ? `你已准备 · 等其他人（${joined.filter((p) => p.ready).length}/${joined.length}）` : '我准备好了'}
              </button>
              {allReady ? (
                <button type="button" className="btn btn--primary btn--block bf-big-btn" disabled={actionBusy === 'start'} onClick={() => void runAction('start', () => fight.start())}>
                  大家都准备好了，开打！
                </button>
              ) : (
                <p className="bf-note">{joined.length < 2 ? '至少 2 个人组队才能开打，再喊一个人来。' : `还有 ${joined.filter((p) => !p.ready).length} 个人没点准备好。`}</p>
              )}
              <button type="button" className="bf-text-btn" disabled={actionBusy === 'leave'} onClick={() => void runAction('leave', () => fight.leave(), '已退出队伍')}>
                退出队伍
              </button>
            </>
          )}
        </section>
      )}

      {fighting && (
        <section className="bf-fight-panel" aria-label="我的战况">
          <div className="bf-my-panel">
            <div className="bf-my-floaters" aria-hidden="true">
              {floaters.map((f) => <span key={f.id} className="bf-floater">+{f.value}</span>)}
            </div>
            <div><span>我的次数</span><b className="bf-reps-huge">{myFightReps}</b></div>
            <div className="bf-dmg-small"><span>我打出的伤害</span><b>{fight.myDamage ?? '…'}</b></div>
          </div>
          <button type="button" className="btn btn--secondary btn--block bf-big-btn" onClick={() => void leaveFlow()}>
            先歇一下
          </button>
        </section>
      )}

      {!fighting && <p className="bf-privacy">{PRIVACY_LINE}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 发起面板（还没有打怪时）
// ---------------------------------------------------------------------------

function CreatePanel(props: {
  isHost: boolean
  gameReady: boolean
  busy: boolean
  onCreate: (movement: string, durationSec: number) => void
}) {
  const [movement, setMovement] = useState<string>('squat')
  const [durationSec, setDurationSec] = useState<number>(300)
  const boss = bossInfo(PHASE1_BOSS_ID)
  if (!props.gameReady) {
    return (
      <section className="bf-create">
        <img className="bf-create-boss" src={boss?.image} alt={boss?.name} draggable={false} />
        <h2>{boss?.name}</h2>
        <p>活动开始以后，就能在这里发起打怪了。大家到场签到后，一起开摄像头打它。</p>
      </section>
    )
  }
  if (!props.isHost) {
    return (
      <section className="bf-create">
        <img className="bf-create-boss" src={boss?.image} alt={boss?.name} draggable={false} />
        <h2>{boss?.name} · {boss?.tier}</h2>
        <p>{boss?.blurb}</p>
        <p>打怪要由本局发起人发起，等他点一下就好。发起了你会收到通知，回来加入队伍就行。</p>
      </section>
    )
  }
  return (
    <section className="bf-create">
      <img className="bf-create-boss" src={boss?.image} alt={boss?.name} draggable={false} />
      <h2>{boss?.name} · {boss?.tier}</h2>
      <p>{boss?.blurb}</p>
      <h3>选动作 <small>全队一起练同一个</small></h3>
      <div className="bf-chips" role="radiogroup" aria-label="选动作">
        {FIGHT_MOVEMENTS.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={movement === m.id} className={movement === m.id ? 'active' : ''} onClick={() => setMovement(m.id)}>
            {m.name}
          </button>
        ))}
      </div>
      <h3>选时长</h3>
      <div className="bf-chips" role="radiogroup" aria-label="选时长">
        {FIGHT_DURATIONS.map((d) => (
          <button key={d.sec} type="button" role="radio" aria-checked={durationSec === d.sec} className={durationSec === d.sec ? 'active' : ''} onClick={() => setDurationSec(d.sec)}>
            {d.label}
          </button>
        ))}
      </div>
      <p className="bf-note">
        血量会在开打时按到场人数算好：两个人打约 {estimateMaxHp(movement, 2, durationSec)}，四个人约 {estimateMaxHp(movement, 4, durationSec)}。
        定得松，队里有人输出低一点也能打赢。
      </p>
      <button type="button" className="btn btn--primary btn--block bf-big-btn" disabled={props.busy} onClick={() => props.onCreate(movement, durationSec)}>
        {props.busy ? '正在发起…' : '发起打怪，喊大家集合'}
      </button>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 结算
// ---------------------------------------------------------------------------

function SettlementPanel(props: {
  snapshot: BossFightSnapshot
  isHost: boolean
  myReps: number
  myDamage: number | null
  hasSession: boolean
  sessionDone: { xp: number } | null
  finishing: boolean
  onFinishSession: () => void
  onRebook: () => void
  onBack: () => void
}) {
  const { snapshot } = props
  const boss = bossInfo(snapshot.boss_id)
  const reward = snapshot.my_reward
  const souvenirName = boss?.souvenirName || '首胜纪念章'
  const lineup = snapshot.participants.filter((p) => p.status === 'joined' || p.status === 'left')

  if (snapshot.status === 'aborted') {
    return (
      <section className="bf-settle">
        <h2>这一场没打成</h2>
        <p>活动结束或者取消，这场打怪就先散了。你自己练的部分照常算。</p>
        <button type="button" className="btn btn--primary btn--block bf-big-btn" onClick={props.onBack}>回组局</button>
      </section>
    )
  }

  const won = snapshot.status === 'won'
  return (
    <section className="bf-settle">
      <h2>{won ? '打赢啦！' : '它跑啦'}</h2>
      <p>{won ? `${snapshot.boss_name}被你们打趴下了。` : '就差一点，下次再收拾它。你练的都算数。'}</p>
      <img className="bf-settle-boss" src={won ? boss?.stateImages?.low || boss?.image : boss?.stateImages?.full || boss?.image} alt={snapshot.boss_name} draggable={false} />
      <div className="bf-lineup" aria-label="全队列队">
        {lineup.map((p) => (
          <div key={p.user_id} className="bf-member">
            <AvatarWithFrame avatar={p.avatar} name={p.nickname} />
            <b>{p.nickname}</b>
          </div>
        ))}
      </div>

      {won && reward && reward.status === 'granted' && (
        <div className="bf-souvenir">
          <span className="bf-souvenir-tag">新到手</span>
          {boss?.souvenirImage && <img src={boss.souvenirImage} alt={souvenirName} draggable={false} />}
          <b>{souvenirName}</b>
          <small>首胜纪念 · 全队人人有份</small>
        </div>
      )}
      {won && reward && reward.status === 'pending' && (
        <div className="bf-souvenir pending">
          {boss?.souvenirImage && <img src={boss.souvenirImage} alt={souvenirName} draggable={false} />}
          <b>{souvenirName}</b>
          <small>{props.sessionDone ? '纪念章马上就到，去衣柜里看看。' : '结束这次训练，纪念章就到手。'}</small>
        </div>
      )}

      <div className="bf-my-panel settle">
        <div><span>我的次数 · 只有我看得到</span><b>{props.myReps}</b></div>
        <div><span>我打出的伤害</span><b>{props.myDamage ?? 0}</b></div>
        <div>
          <span>训练经验</span>
          <b>{props.sessionDone ? `+${props.sessionDone.xp}` : props.hasSession ? '结束训练后到账' : '—'}</b>
        </div>
      </div>

      {props.hasSession && !props.sessionDone && (
        <button type="button" className="btn btn--primary btn--block bf-big-btn" disabled={props.finishing} onClick={props.onFinishSession}>
          {props.finishing ? '正在保存…' : '结束训练并保存'}
        </button>
      )}
      {props.isHost ? (
        <button type="button" className="btn btn--primary btn--block bf-big-btn" onClick={props.onRebook}>
          {won ? '约下次再战' : '再约一次打它'}
        </button>
      ) : (
        <p className="bf-note">想再打一场，等发起人约下一局就好。</p>
      )}
      <button type="button" className="btn btn--secondary btn--block bf-big-btn" onClick={props.onBack}>回组局</button>
      <p className="bf-note">这张纪念卡只在动伴里看得到。</p>
    </section>
  )
}
