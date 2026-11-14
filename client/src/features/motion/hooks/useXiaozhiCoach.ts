import {exerciseInfo} from '../lib/exercises'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCoachVoice } from './useCoachVoice'
import { cancelAnnouncement } from '../lib/xiaozhiAnnounce'
import { WakeWordWindow } from '../lib/wakeWord'
import { XiaozhiAudio } from '../lib/xiaozhiAudio'
import { abortMessage, helloMessage, listenMessage, mapXiaozhiEmotion, mcpError, mcpNotification, mcpResult, mcpTextResult } from '../lib/xiaozhiProtocol'
import { ACOUSTIC_TAIL_MS, createEchoGate, echoGateDrained, echoGateRequeued, echoGateReset, echoGateResumed, echoGateShouldResume, echoGateTtsStart, echoGateTtsStop } from '../lib/echoGate'
import { conversationWindowExpired, extendConversationWindow, openConversationWindow, thinkingTimedOut, THINKING_RECOVERY_MS, type ConversationWindow } from '../lib/companionWindow'
import { admitSpeech, pendingSpeechExpired, type ChannelPhase, type PendingSpeech, type SpeechEvent } from '../lib/speechAdmission'
import { classifyVisionFreshness, createGuidanceGateState, enqueueVisionJob, observeVision } from '../lib/visionGuidance'
import { poseIssueCopy } from '../lib/poseFeedback'
import { COPY_OUT_OF_FRAME } from '../lib/companionCopy'
import type { MilestoneEvent } from '../lib/milestones'
import type { CoachEmotion, PoseIssue, VisionFrameJob, VisionInsight, WorkoutContext, XiaozhiDataSyncState, XiaozhiDeviceBootstrap, XiaozhiIdentityMode, XiaozhiState } from '../types'

type CoachSource = 'xiaozhi' | 'compatible' | 'local'
type CuePriority = 'low' | 'normal' | 'high'
const PRIORITY: Record<CuePriority, number> = { low: 1, normal: 2, high: 3 }
const RECONNECT_DELAYS = [1_000, 2_000, 4_000, 8_000, 15_000]
/** speaking 态最长容忍：服务端迟迟不发 stop 时按已排空处理 */
const SPEAKING_WATCHDOG_MS = 30_000
const XIAOZHI_ENABLED = (import.meta.env.VITE_XIAOZHI_ENABLED as string | undefined) !== 'false'

interface Options {
  enabled: boolean
  context: WorkoutContext
  videoRef: React.RefObject<HTMLVideoElement>
  testSlot?: number
}

const recognizerCtor = () => {
  if (typeof window === 'undefined') return null
  const scope = window as unknown as { SpeechRecognition?: { new (): MBRecognition }; webkitSpeechRecognition?: { new (): MBRecognition } }
  return scope.SpeechRecognition || scope.webkitSpeechRecognition || null
}

function frameDataUrl(video: HTMLVideoElement): string | null {
  if (!video.videoWidth || !video.videoHeight) return null
  const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  const context = canvas.getContext('2d')
  if (!context) return null
  context.translate(canvas.width, 0)
  context.scale(-1, 1)
  context.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', .78)
}

const resultText = (result: unknown): string => {
  if (typeof result === 'string') return result
  if (result && typeof result === 'object') {
    const data = result as { text?: unknown; message?: unknown; result?: unknown; response?: unknown }
    if (typeof data.text === 'string') return data.text
    if (typeof data.message === 'string') return data.message
    if (typeof data.result === 'string') return data.result
    if (typeof data.response === 'string') return data.response
  }
  return '复核完成啦，次数还是按刚才实时数的算。'
}

export function useXiaozhiCoach({ enabled, context, videoRef, testSlot }: Options) {
  const [state, setState] = useState<XiaozhiState>('off')
  const [transcript, setTranscript] = useState('')
  const [reply, setReply] = useState('')
  const [emotion, setEmotion] = useState<CoachEmotion>('neutral')
  const [activationCode, setActivationCode] = useState('')
  const [activationMessage, setActivationMessage] = useState('')
  const [identityMode, setIdentityMode] = useState<XiaozhiIdentityMode>('personal')
  const [errorMessage, setErrorMessage] = useState('')
  const [muted, setMuted] = useState(false)
  const [fallbackMode, setFallbackMode] = useState(!XIAOZHI_ENABLED)
  const [retryNonce, setRetryNonce] = useState(0)
  const [conversationTurnCount, setConversationTurnCount] = useState(0)
  const [visionInsights, setVisionInsights] = useState<VisionInsight[]>([])
  const [visionAvailable, setVisionAvailable] = useState(false)
  const [xiaozhiVoiceReady, setXiaozhiVoiceReady] = useState(false)
  const [dataSyncState, setDataSyncState] = useState<XiaozhiDataSyncState>({
    mcpReady: false, lastRepSynced: 0, visionRep: null, visionStatus: 'idle', wakeDetected: false,
  })

  const contextRef = useRef(context)
  const stateRef = useRef(state)
  const mutedRef = useRef(muted)
  const identityModeRef = useRef<XiaozhiIdentityMode>('personal')
  const socketRef = useRef<WebSocket | null>(null)
  const sessionIdRef = useRef('')
  const mcpReadyRef = useRef(false)
  const audioRef = useRef<XiaozhiAudio | null>(null)
  const wakeRecognitionRef = useRef<MBRecognition | null>(null)
  const wakeRunningRef = useRef(false)
  const queuedCueRef = useRef<{ text: string; priority: CuePriority } | null>(null)
  const visionAvailableRef = useRef(false)
  const visionPendingRef = useRef(new Map<string, VisionFrameJob>())
  const visionQueueRef = useRef<VisionFrameJob[]>([])
  const activeVisionJobsRef = useRef(0)
  const repFrameCandidateRef = useRef<string | null>(null)
  const latestVisionInsightRef = useRef<VisionInsight | null>(null)
  const lastRepAtRef = useRef<string | null>(null)
  const lastRepIssuesRef = useRef<PoseIssue[]>([])
  const pendingProgressRef = useRef<Array<Record<string, unknown>>>([])
  const pumpVisionQueueRef = useRef<() => void>(() => undefined)
  const wakeWindowRef = useRef(new WakeWordWindow())
  const wakeDetectedTimerRef = useRef(0)
  // Phase 1 陪伴策略（纯逻辑在各 lib 模块里，这里只持有状态）：
  const echoGateRef = useRef(createEchoGate())
  const windowRef = useRef<ConversationWindow | null>(null)
  const thinkingSinceRef = useRef(0)
  const speakingSinceRef = useRef(0)
  const pendingSpeechRef = useRef<PendingSpeech | null>(null)
  const guidanceRef = useRef(createGuidanceGateState())
  /** 我们刚注入了一个主动触发句；紧接着的 stt 是它的回声，不算用户发言 */
  const injectedTurnRef = useRef(0)
  /** 正在播/刚播完的回复是否来自主动投递（tracking 能否打断它看这个） */
  const playingAutoRef = useRef(false)
  const drainTimerRef = useRef(0)
  const repFrameCapturedAtRef = useRef(0)
  /** 断线未恢复：到下一个组间边界前不投递主动语音（见 noteSetBoundary） */
  const outageRef = useRef(false)
  const transportOkRef = useRef(false)
  const boundaryArmedRef = useRef(false)
  const hadSessionRef = useRef(false)
  const [voiceOutage, setVoiceOutage] = useState(false)

  useEffect(() => { contextRef.current = context }, [context])
  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { mutedRef.current = muted }, [muted])

  const fallbackContext = useMemo(() => ({
    exerciseType:context.exerciseType,countUnit:context.countUnit,plan:context.plan,
    reps: context.reps, targetReps: context.targetReps, phase: context.phase,
    durationSeconds: context.durationSeconds, bpm: context.bpm, active: context.active,
  }), [context])
  const localMode = !enabled || fallbackMode
  const fallback = useCoachVoice(false, fallbackContext, { audible: false })
  const source: CoachSource = localMode ? (fallback.hasModel ? 'compatible' : 'local') : 'xiaozhi'
  useEffect(() => { if (enabled) { setFallbackMode(!XIAOZHI_ENABLED); setErrorMessage('') } }, [enabled])

  const sendJson = useCallback((message: unknown) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false
    socketRef.current.send(JSON.stringify(message))
    return true
  }, [])

  const pumpVisionQueue = useCallback(() => {
    while (activeVisionJobsRef.current < 2 && visionQueueRef.current.length) {
      const job = visionQueueRef.current.shift()
      if (!job) break
      if (!sendJson({
        bridge: 'vision_frame', requestId: job.id, mcpId: job.mcpId, sessionId: job.sessionId,
        image: job.image, question: job.question,
      })) {
        visionQueueRef.current.unshift(job)
        break
      }
      activeVisionJobsRef.current += 1
      visionPendingRef.current.set(job.id, job)
    }
  }, [sendJson])
  useEffect(() => { pumpVisionQueueRef.current = pumpVisionQueue }, [pumpVisionQueue])

  const enqueueVision = useCallback((job: VisionFrameJob) => {
    // 排队纪律在 visionGuidance.enqueueVisionJob（纯函数）：自动只留最新，
    // 用户点名的插最前。在飞任务由 pumpVisionQueue 的并发上限（2）兜底。
    visionQueueRef.current = enqueueVisionJob(visionQueueRef.current, job)
    setDataSyncState(current => ({ ...current, visionRep: job.rep, visionStatus: 'queued' }))
    pumpVisionQueueRef.current()
    return true
  }, [])

  /** 当前训练状态快照（本地权威值；MCP 工具读的、进度同步推的都是它）。 */
  const buildWorkoutStatus = useCallback(() => ({
    ...contextRef.current,
    lastRepAt: lastRepAtRef.current,
    lastRepIssues: lastRepIssuesRef.current,
    latestVisionInsight: latestVisionInsightRef.current,
    updatedAt: new Date().toISOString(),
  }), [])

  /** 把最新状态同步进会话上下文。用户问「我做了几个」时，LLM 手里的
   * 上下文和它能调的工具都指向这份实时值，不许拿旧上下文回答。 */
  const syncWorkoutStatus = useCallback(() => {
    if (!mcpReadyRef.current || !sessionIdRef.current) return false
    if (!sendJson(mcpNotification('notifications/workout_progress', buildWorkoutStatus(), sessionIdRef.current))) return false
    setDataSyncState(current => ({ ...current, lastRepSynced: contextRef.current.reps }))
    return true
  }, [buildWorkoutStatus, sendJson])

  const channelPhase = useCallback((): ChannelPhase => {
    if (fallbackMode || outageRef.current) return 'offline'
    switch (stateRef.current) {
      case 'idle': return 'idle'
      case 'listening': return 'listening'
      case 'thinking': return 'thinking'
      case 'speaking': return 'speaking'
      default: return 'offline'
    }
  }, [fallbackMode])

  /** 真正把一句主动的话投递进对话通道（触发句是第一人称真实状态汇报）。 */
  const deliverSpeech = useCallback((event: SpeechEvent, interrupt = false) => {
    if (outageRef.current) return false
    if (socketRef.current?.readyState !== WebSocket.OPEN || !sessionIdRef.current) return false
    if (interrupt) {
      audioRef.current?.clearPlayback()
      echoGateReset(echoGateRef.current)
      sendJson(abortMessage('tracking_priority', sessionIdRef.current))
    }
    // 正在听（listen 模式）时先停听再发 detect —— detect 本来就是
    // 「不在听的时候」用的入口（唤醒路径同理），避免服务端忽略。
    if (stateRef.current === 'listening') sendJson(listenMessage('stop', sessionIdRef.current))
    injectedTurnRef.current = Date.now()
    playingAutoRef.current = true
    return sendJson(listenMessage('detect', sessionIdRef.current, event.prompt))
  }, [sendJson])

  /**
   * 主动发言入口：事实行先上屏（字幕），出声走优先级准入。
   * 忙时只攒一个最要紧的，过期作废；静音时只上屏不出声。
   */
  const offerSpeech = useCallback((event: SpeechEvent) => {
    setReply(event.text)
    if (mutedRef.current || fallbackMode) return
    const verdict = admitSpeech(event, channelPhase(), Date.now(), pendingSpeechRef.current, playingAutoRef.current)
    if (verdict.action === 'now') {
      pendingSpeechRef.current = null
      deliverSpeech(event, verdict.interrupt)
    } else if (verdict.action === 'hold') {
      pendingSpeechRef.current = verdict.pending
    }
  }, [channelPhase, deliverSpeech, fallbackMode])

  /** 通道空下来时，把攒着的那句（还没过期的话）递出去。 */
  const flushPendingSpeech = useCallback(() => {
    const pending = pendingSpeechRef.current
    if (!pending) return
    if (pendingSpeechExpired(pending, Date.now())) { pendingSpeechRef.current = null; return }
    const phase = channelPhase()
    if (phase !== 'idle' && phase !== 'listening') return
    pendingSpeechRef.current = null
    deliverSpeech(pending)
  }, [channelPhase, deliverSpeech])

  /**
   * 一段回复真正结束（服务端 stop + 本地排空 + 声学尾巴，见 echoGate）后
   * 才走这里：窗口还开着就恢复上行继续听；没窗口就关麦回 idle，
   * 不再像旧代码那样 stop 一到就立刻把麦打开。
   */
  const finishDrainResume = useCallback(() => {
    window.clearInterval(drainTimerRef.current)
    drainTimerRef.current = 0
    echoGateResumed(echoGateRef.current)
    playingAutoRef.current = false
    speakingSinceRef.current = 0
    const now = Date.now()
    const audio = audioRef.current
    if (windowRef.current && !conversationWindowExpired(windowRef.current, now) && audio?.capturing) {
      extendConversationWindow(windowRef.current, now)
      audio.setSending(true)
      setState('listening')
      setEmotion('listening')
      sendJson(listenMessage('start', sessionIdRef.current))
    } else {
      windowRef.current = null
      if (audio?.capturing) void audio.stopCapture()
      setState('idle')
      setEmotion('neutral')
    }
    flushPendingSpeech()
  }, [flushPendingSpeech, sendJson])

  /** 服务端 stop 后开始盯本地排空；排空 + 尾巴过了才 finishDrainResume。 */
  const startDrainWatch = useCallback(() => {
    window.clearInterval(drainTimerRef.current)
    drainTimerRef.current = window.setInterval(() => {
      const gate = echoGateRef.current
      if (gate.phase !== 'draining') {
        window.clearInterval(drainTimerRef.current)
        drainTimerRef.current = 0
        return
      }
      const audio = audioRef.current
      if (!audio || audio.playbackRemainingMs() <= 0) echoGateDrained(gate, Date.now())
      else echoGateRequeued(gate)
      if (echoGateShouldResume(gate, Date.now())) finishDrainResume()
    }, 100)
  }, [finishDrainResume])

  const stopWakeRecognition = useCallback(() => {
    try { wakeRecognitionRef.current?.stop() } catch { /* already stopped */ }
    wakeRunningRef.current = false
  }, [])

  const wake = useCallback(async () => {
    if (fallbackMode) return fallback.openConversation()
    if (socketRef.current?.readyState !== WebSocket.OPEN || stateRef.current === 'activating') return
    stopWakeRecognition()
    // 用户亲手重新进入对话 = 一个新的边界：断线未恢复状态就此解除。
    if (outageRef.current) {
      outageRef.current = false
      boundaryArmedRef.current = false
      setVoiceOutage(false)
    }
    let audio: XiaozhiAudio | null = null
    try {
      if (!audioRef.current) {
        audioRef.current = new XiaozhiAudio(
          packet => { if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(packet) },
          () => undefined,
        )
      }
      audio = audioRef.current
      await audio.startCapture()
      if (audioRef.current !== audio) { await audio.dispose(); return }
      setXiaozhiVoiceReady(true)
      // 回声门关着（正在播报）时不要抢先放行上行，等排空再由门放行。
      audioRef.current.setSending(echoGateRef.current.phase === 'open')
      playingAutoRef.current = false
      windowRef.current = openConversationWindow('followup', Date.now())
      syncWorkoutStatus()
      setEmotion('listening')
      setState('listening')
      sendJson(listenMessage('start', sessionIdRef.current))
    } catch (error) {
      if (audio && audioRef.current !== audio) return
      setErrorMessage(error instanceof Error ? error.message : '麦克风没能打开，请检查后重试')
      setFallbackMode(true)
      setState('fallback')
    }
  }, [fallbackMode, fallback.openConversation, sendJson, stopWakeRecognition, syncWorkoutStatus])

  const handleMcp = useCallback(async (payload: { id?: string | number; method?: string; params?: Record<string, unknown> }, incomingSessionId?: string) => {
    if (payload.id === undefined || !payload.method) return
    const sessionId = incomingSessionId || sessionIdRef.current
    if (payload.method === 'initialize') {
      mcpReadyRef.current = true
      setDataSyncState(current => ({ ...current, mcpReady: true }))
      sendJson(mcpResult(payload.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'motion-buddy-web', version: '1.1.0' } }, sessionId))
      const pendingProgress = pendingProgressRef.current.splice(0)
      let lastSynced = 0
      for (const progress of pendingProgress) {
        if (sendJson(mcpNotification('notifications/workout_progress', progress, sessionId))) {
          lastSynced = Number(progress.reps) || lastSynced
        }
      }
      if (lastSynced) setDataSyncState(current => ({ ...current, lastRepSynced: lastSynced }))
      return
    }
    if (payload.method === 'tools/list') {
      sendJson(mcpResult(payload.id, { tools: [
        {
          name: 'self.camera.take_photo',
          description: '用户明确要求看动作或画面时，获取当前关键帧并进行低频视觉解释。',
          inputSchema: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] },
        },
        {
          name: 'self.motion.get_workout_status',
          description: '读取当前训练的真实次数、阶段、时长、心率、姿势问题和评分。只读。',
          inputSchema: { type: 'object', properties: {} },
        },
      ] }, sessionId))
      return
    }
    if (payload.method !== 'tools/call') return sendJson(mcpError(payload.id, `不支持的方法：${payload.method}`, sessionId))
    const params = payload.params as { name?: string; arguments?: { question?: string } } | undefined
    if (params?.name === 'self.motion.get_workout_status') {
      // 工具读的是实时本地状态（contextRef 每次渲染都同步）——用户问
      // 「我做了几个」时答案以这个为准，不许用会话里的旧上下文。
      return sendJson(mcpTextResult(payload.id, buildWorkoutStatus(), sessionId))
    }
    if (params?.name !== 'self.camera.take_photo') return sendJson(mcpError(payload.id, '只允许读取训练状态和当前关键帧', sessionId))
    const image = videoRef.current ? frameDataUrl(videoRef.current) : null
    if (!image) return sendJson(mcpTextResult(payload.id, '当前摄像头画面不可用', sessionId, true))
    const requestId = crypto.randomUUID()
    enqueueVision({
      id: requestId, rep: contextRef.current.reps || null, capturedAt: Date.now(), image,
      question: params.arguments?.question || '请看看我的动作，并只说最值得调整的一点。',
      trigger: 'user', issue: contextRef.current.poseIssues[0] || null, retries: 0, priority: 'user',
      mcpId: payload.id, sessionId,
    })
  }, [buildWorkoutStatus, enqueueVision, sendJson, videoRef])

  useEffect(() => {
    if (!enabled || fallbackMode || !XIAOZHI_ENABLED) {
      if (!enabled) setState('off')
      return
    }
    let disposed = false
    let reconnectIndex = 0
    let reconnectTimer = 0
    let activationTimer = 0
    let handshakeTimer = 0
    let heartbeatTimer = 0
    let lastPong = Date.now()
    let leaseId = ''
    const clientId = crypto.randomUUID()
    const accountToken = localStorage.getItem('token')
    const releaseLease = (id: string) => {
      if (!id) return
      void fetch('/api/xiaozhi/release', { method: 'POST', credentials: 'include', keepalive: true,
        headers: { Authorization: 'Bearer ' + accountToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ leaseId: id }),
      }).catch(() => undefined)
    }
    const onPageHide = () => { socketRef.current?.close(1000, 'page hidden'); releaseLease(leaseId) }
    window.addEventListener('pagehide', onPageHide)

    const connect = () => {
      if (disposed) return
      setState(reconnectIndex ? 'reconnecting' : 'connecting')
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const socket = new WebSocket(`${protocol}//${location.host}/api/xiaozhi/socket`)
      socket.binaryType = 'arraybuffer'
      socketRef.current = socket
      lastPong = Date.now()
      clearInterval(heartbeatTimer)
      heartbeatTimer = window.setInterval(() => {
        if (socket.readyState !== WebSocket.OPEN) return
        if (Date.now() - lastPong > 45_000) { socket.close(4000, 'heartbeat timed out'); return }
        socket.send(JSON.stringify({ bridge: 'ping' }))
      }, 15_000)
      handshakeTimer = window.setTimeout(() => {
        setErrorMessage('小智语音连接超时，请稍后重试')
        socket.close(4000, 'voice handshake timeout')
      }, 20_000)
      socket.onmessage = event => {
        if (disposed) return
        if (event.data instanceof ArrayBuffer) {
          if (!mutedRef.current) audioRef.current?.decode(event.data)
          return
        }
        let message: any
        try { message = JSON.parse(String(event.data)) } catch { return }
        if (message.bridge === 'pong') { lastPong = Date.now(); return }
        if (message.bridge === 'ready') {
          sendJson(helloMessage())
          return
        }
        if (message.bridge === 'vision_available') {
          visionAvailableRef.current = true
          setVisionAvailable(true)
          return
        }
        if (message.bridge === 'error') return setErrorMessage(message.message || '小智连接出了点问题')
        if (message.bridge === 'vision_result') {
          const job = visionPendingRef.current.get(message.requestId)
          if (!job) return
          visionPendingRef.current.delete(message.requestId)
          activeVisionJobsRef.current = Math.max(0, activeVisionJobsRef.current - 1)
          if (message.error && message.retryable && job.retries < 1) {
            window.setTimeout(() => {
              if (disposed) return
              const retryJob = { ...job, retries: job.retries + 1 }
              visionQueueRef.current = enqueueVisionJob(visionQueueRef.current, retryJob)
              pumpVisionQueueRef.current()
            }, 1_500)
            pumpVisionQueueRef.current()
            return
          }
          if (message.error) {
            setErrorMessage(message.error)
            setDataSyncState(current => ({ ...current, visionRep: job.rep, visionStatus: 'failed' }))
            if (job.mcpId !== undefined) sendJson(mcpTextResult(job.mcpId, message.error, job.sessionId || sessionIdRef.current, true))
            pumpVisionQueueRef.current()
            return
          }
          const insight: VisionInsight = {
            id: message.requestId, createdAt: new Date().toISOString(),
            // 拍照时刻来自任务本身（入队时记的），不是结果到达时刻——
            // 旧代码拿到达时刻冒充，新鲜度判断会把旧画面当实时。
            capturedAt: new Date(job.capturedAt).toISOString(),
            trigger: job.trigger, issue: job.issue, rep: job.rep || undefined,
            summary: resultText(message.result).slice(0, 180),
          }
          latestVisionInsightRef.current = insight
          setVisionInsights(current => [...current, insight].slice(-6))
          setDataSyncState(current => ({ ...current, visionRep: job.rep, visionStatus: 'reviewed' }))
          if (job.mcpId !== undefined) sendJson(mcpTextResult(job.mcpId, {
            success: true, summary: insight.summary, rep: job.rep, capturedAt: insight.capturedAt,
            note: '逐次计数与实时矫姿以浏览器本地 MediaPipe 为准。',
          }, job.sessionId || sessionIdRef.current))
          // 自动复核的开口纪律：只有够新鲜的结果才有资格当实时指导；
          // 同一问题有佐证（多次看到）才升级开口，改善只确认一次。
          // 用户点名看的（mcpId）不走这里——用户问了就答。
          if (job.mcpId === undefined && job.priority === 'automatic'
            && classifyVisionFreshness(job.capturedAt, Date.now(), job.rep, contextRef.current.reps) === 'live') {
            const decision = observeVision(guidanceRef.current, { issue: job.issue, at: Date.now() })
            if (decision.type === 'cue') {
              const copy = poseIssueCopy(decision.issue, contextRef.current.exerciseType)
              offerSpeech({ kind: 'formCue', text: copy.action, prompt: `我这个动作老是${copy.label}，提醒我一下` })
            } else if (decision.type === 'improved') {
              offerSpeech({ kind: 'encouragement', text: '比刚才好啦，就保持这个感觉', prompt: '刚才那个问题好像好点了' })
            }
          }
          pumpVisionQueueRef.current()
          return
        }
        if (message.type === 'hello') {
          clearTimeout(handshakeTimer)
          reconnectIndex = 0
          setErrorMessage('')
          sessionIdRef.current = typeof message.session_id === 'string' ? message.session_id : ''
          const sampleRate = Number(message.audio_params?.sample_rate) || 24_000
          audioRef.current ||= new XiaozhiAudio(packet => socketRef.current?.send(packet), () => undefined)
          audioRef.current.configureDecoder(sampleRate)
          transportOkRef.current = true
          hadSessionRef.current = true
          echoGateReset(echoGateRef.current)
          // 断线恢复要在组间边界才算数（noteSetBoundary 已arm 时在此解除）；
          // 半路重连成功也先不投递主动语音，免得组中突然出声吓人。
          if (outageRef.current && boundaryArmedRef.current) {
            outageRef.current = false
            boundaryArmedRef.current = false
            setVoiceOutage(false)
          }
          setState('idle')
          setEmotion('neutral')
          return
        }
        if (message.type === 'stt') {
          setTranscript(message.text || '')
          // 我们主动投递的触发句会有 stt 回声：它不是用户发言，不计轮次、
          // 不顺延窗口（窗口顺延只认用户真的开口）。
          const injectedAt = injectedTurnRef.current
          const isInjectedEcho = injectedAt > 0 && Date.now() - injectedAt < 10_000
          if (isInjectedEcho) injectedTurnRef.current = 0
          if (!isInjectedEcho) {
            setConversationTurnCount(count => count + 1)
            if (windowRef.current) extendConversationWindow(windowRef.current, Date.now())
            // 趁回复组装前把最新状态同步过去（工具读实时值是硬保证，这里是双保险）。
            syncWorkoutStatus()
          }
          thinkingSinceRef.current = Date.now()
          setState('thinking')
          setEmotion('thinking')
          return
        }
        if (message.type === 'llm') return setEmotion(mapXiaozhiEmotion(message.emotion))
        if (message.type === 'tts') {
          if (message.state === 'sentence_start' && message.text) setReply(message.text)
          if (message.state === 'start') {
            echoGateTtsStart(echoGateRef.current)
            speakingSinceRef.current = Date.now()
            audioRef.current?.setSending(false)
            void audioRef.current?.ensurePlaybackReady().then(
              () => setXiaozhiVoiceReady(true),
              () => setXiaozhiVoiceReady(false),
            )
            setState('speaking')
          }
          if (message.state === 'stop') {
            // 不在这里恢复上行：服务端说完 ≠ 本地放完。回声门等本地
            // 排空 + 声学尾巴后才在 finishDrainResume 里放行。
            echoGateTtsStop(echoGateRef.current, Date.now())
            startDrainWatch()
          }
          return
        }
        if (message.type === 'mcp' && message.payload) void handleMcp(message.payload, message.session_id)
      }
      socket.onclose = event => {
        clearTimeout(handshakeTimer)
        clearInterval(heartbeatTimer)
        if (disposed) return
        socketRef.current = null
        sessionIdRef.current = ''
        mcpReadyRef.current = false
        setDataSyncState(current => ({ ...current, mcpReady: false }))
        // 连接一断，先把本地收干净：停麦上行、清掉没播完的旧音频、
        // 攒着的主动发言和没完成的视觉任务，不许重连后补播旧内容。
        transportOkRef.current = false
        void audioRef.current?.stopCapture()
        audioRef.current?.clearPlayback()
        echoGateReset(echoGateRef.current)
        window.clearInterval(drainTimerRef.current)
        drainTimerRef.current = 0
        windowRef.current = null
        pendingSpeechRef.current = null
        visionPendingRef.current.clear()
        visionQueueRef.current = []
        activeVisionJobsRef.current = 0
        // 真正建立过会话又断了 = 语音中断。页面会挂出「语音断开 · 计数
        // 继续」大信号；恢复要等组间边界（或用户亲手重新打开对话）。
        if (hadSessionRef.current) {
          outageRef.current = true
          setVoiceOutage(true)
        }
        if (event.code === 4001 && identityModeRef.current === 'shared') {
          setErrorMessage('语音已断开（有一阵没说话，或语音服务停了），点一下可以重新开启')
          setFallbackMode(true)
          setState('fallback')
          return
        }
        if (event.code === 4401) {
          if (identityModeRef.current === 'shared') {
            setErrorMessage('连接过期了，正在重新连')
            void initialize()
            return
          }
          setFallbackMode(true)
          setState('fallback')
          setErrorMessage('小智还没激活好，先用文字陪练')
          return
        }
        if (event.code === 4403) {
          setErrorMessage('语音没连上：本站的语音可能还没开通。先用文字陪练陪你。')
          setFallbackMode(true)
          setState('fallback')
          return
        }
        if (reconnectIndex >= RECONNECT_DELAYS.length) {
          setErrorMessage('小智语音试了几次都没连上，已切换到文字陪练，点重试可以再连。')
          setFallbackMode(true)
          setState('fallback')
          return
        }
        setState('reconnecting')
        const delay = RECONNECT_DELAYS[Math.min(reconnectIndex, RECONNECT_DELAYS.length - 1)]
        reconnectIndex += 1
        reconnectTimer = window.setTimeout(() => { if (identityModeRef.current === 'shared') void initialize(); else connect() }, delay)
      }
      socket.onerror = () => setErrorMessage('小智连接中断，正在尝试恢复')
    }

    const initialize = async () => {
      if(disposed) return
      setState('connecting')
      try {
        const statusResponse = await fetch('/ai/__status',{headers:{Authorization:'Bearer '+accountToken}})
        if (!statusResponse.ok) throw new Error(statusResponse.status === 401 ? '登录已过期，请重新登录后使用语音陪练。' : '语音设置没加载出来，请稍后重试')
        const status = await statusResponse.json()
        if(disposed) return
        if (status.xiaozhiMode === 'shared') { identityModeRef.current = 'shared'; setIdentityMode('shared') }
        if(!status.xiaozhiEnabled){setErrorMessage('语音还没开通，先用文字陪练。');setFallbackMode(true);setState('fallback');return}
        const response = await fetch('/api/xiaozhi/device', { method: 'POST', credentials: 'include',headers:{Authorization:'Bearer '+accountToken,'Content-Type':'application/json'},body:JSON.stringify({clientId,...(testSlot !== undefined ? {testSlot} : {})}) })
        const body = await response.json() as XiaozhiDeviceBootstrap & { error?: string }
        if (body.status === 'ready' && body.leaseId) leaseId = body.leaseId
        if(disposed) { releaseLease(leaseId); return }
        if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
        identityModeRef.current = body.mode
        setIdentityMode(body.mode)
        if (body.status === 'activating') {
          setActivationCode(body.code || '')
          setActivationMessage(body.message || '请在 xiaozhi.me 输入激活码')
          setState('activating')
          const poll = async () => {
            if (disposed || Date.now() >= Number(body.expiresAt || 0)) {
              setErrorMessage('激活码已过期，请重试')
              return setState('failed')
            }
            try {
              const result = await fetch('/api/xiaozhi/activate', { method: 'POST', credentials: 'include',headers:{Authorization:'Bearer '+accountToken} })
              if(disposed) return
              if (result.status === 200) {
                setActivationCode('')
                setErrorMessage('')
                return connect()
              }
              if (result.status !== 202) throw new Error((await result.json()).error || '激活失败')
            } catch (error) {
              if(disposed) return
              setErrorMessage(error instanceof Error ? error.message : '激活没等到结果，请重试')
            }
            activationTimer = window.setTimeout(poll, 5_000)
          }
          activationTimer = window.setTimeout(poll, 5_000)
          return
        }
        connect()
      } catch (error) {
        if(disposed) return
        setErrorMessage(error instanceof Error ? error.message : '小智服务不可用')
        setFallbackMode(true)
        setState('fallback')
      }
    }
    void initialize()
    return () => {
      disposed = true
      clearTimeout(reconnectTimer)
      clearTimeout(activationTimer)
      clearTimeout(handshakeTimer)
      clearInterval(heartbeatTimer)
      window.removeEventListener('pagehide', onPageHide)
      socketRef.current?.close(1000, 'workout ended')
      socketRef.current = null
      releaseLease(leaseId)
      sessionIdRef.current = ''
      mcpReadyRef.current = false
      window.clearInterval(drainTimerRef.current)
      drainTimerRef.current = 0
      windowRef.current = null
      pendingSpeechRef.current = null
      transportOkRef.current = false
      pendingProgressRef.current = []
      visionPendingRef.current.clear()
      visionQueueRef.current = []
      activeVisionJobsRef.current = 0
      repFrameCandidateRef.current = null
      latestVisionInsightRef.current = null
      visionAvailableRef.current = false
      setVisionAvailable(false)
      setTranscript(''); setReply(''); setVisionInsights([])
      setDataSyncState({ mcpReady:false,lastRepSynced:0,visionRep:null,visionStatus:'idle',wakeDetected:false })
      stopWakeRecognition()
      void audioRef.current?.dispose()
      audioRef.current = null
      setXiaozhiVoiceReady(false)
    }
  }, [enabled, fallbackMode, retryNonce, testSlot, handleMcp, sendJson, stopWakeRecognition, offerSpeech, startDrainWatch, syncWorkoutStatus])

  // 空闲时监听宽松唤醒词。Chrome 拆开的 final 结果会在六秒窗口中合并，
  // interim 连续命中两次才触发，final 命中则立即触发。
  useEffect(() => {
    if (!enabled || fallbackMode || state !== 'idle') return
    const Recognizer = recognizerCtor()
    if (!Recognizer) return
    const recognition = new Recognizer()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 3
    recognition.lang = 'zh-CN'
    recognition.onresult = event => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const alternatives = Array.from({ length: Math.min(result.length, 3) }, (_, alt) => result[alt]?.transcript || '').filter(Boolean)
        const detected = wakeWindowRef.current.push(alternatives, result.isFinal)
        if (detected.combined) setTranscript(detected.combined)
        if (detected.matched) {
          sendJson(listenMessage('detect', sessionIdRef.current, '你好动伴'))
          setDataSyncState(current => ({ ...current, wakeDetected: true }))
          clearTimeout(wakeDetectedTimerRef.current)
          wakeDetectedTimerRef.current = window.setTimeout(() => setDataSyncState(current => ({ ...current, wakeDetected: false })), 3_000)
          void wake()
          break
        }
      }
    }
    recognition.onerror = () => { wakeRunningRef.current = false }
    let stopped = false
    recognition.onend = () => {
      wakeRunningRef.current = false
      if (!stopped && stateRef.current === 'idle') window.setTimeout(() => { if (stopped) return; try { recognition.start(); wakeRunningRef.current = true } catch { /* ignore */ } }, 300)
    }
    wakeRecognitionRef.current = recognition
    try { recognition.start(); wakeRunningRef.current = true } catch { /* permission can be requested by click */ }
    return () => {
      stopped = true
      try { recognition.abort() } catch { /* ignore */ }
      wakeWindowRef.current.reset()
      wakeRunningRef.current = false
      if (wakeRecognitionRef.current === recognition) wakeRecognitionRef.current = null
    }
  }, [enabled, fallbackMode, state, wake, sendJson])

  // 窗口与超时巡查：三件事分开计——
  // 1) listening 的沉默超时看对话窗口（companionWindow），过期就关麦回 idle；
  // 2) thinking 有自己的超时：回复迟迟不来时回到 listening，而不是像旧
  //    代码那样被沉默计时连麦一起关掉（回复还在路上就被打回 idle）；
  // 3) speaking 看门狗：服务端迟迟不发 stop 时按已排空处理，别永久卡住。
  useEffect(() => {
    if (fallbackMode) return
    const timer = window.setInterval(() => {
      const now = Date.now()
      const current = stateRef.current
      if (current === 'thinking') {
        if (thinkingTimedOut(thinkingSinceRef.current, now)) {
          thinkingSinceRef.current = now
          if (windowRef.current) {
            windowRef.current.deadline = Math.max(windowRef.current.deadline, now + THINKING_RECOVERY_MS)
          }
          setState('listening')
          setEmotion('listening')
        }
        return
      }
      if (current === 'speaking') {
        if (speakingSinceRef.current > 0 && now - speakingSinceRef.current > SPEAKING_WATCHDOG_MS
          && echoGateRef.current.phase === 'gated') {
          echoGateTtsStop(echoGateRef.current, now)
          echoGateDrained(echoGateRef.current, now - ACOUSTIC_TAIL_MS - 100)
          if (echoGateShouldResume(echoGateRef.current, now)) finishDrainResume()
        }
        return
      }
      if (current !== 'listening') return
      if (!conversationWindowExpired(windowRef.current, now)) return
      windowRef.current = null
      sendJson(listenMessage('stop', sessionIdRef.current))
      void audioRef.current?.stopCapture()
      setState('idle')
      setEmotion('neutral')
    }, 500)
    return () => window.clearInterval(timer)
  }, [fallbackMode, sendJson, finishDrainResume])

  useEffect(() => () => {
    clearTimeout(wakeDetectedTimerRef.current)
    void audioRef.current?.dispose()
    audioRef.current = null
  }, [])

  const say = useCallback((text: string, priority: CuePriority = 'normal') => {
    if (!text || mutedRef.current) return
    if (fallbackMode) {
      setReply(text)
      return
    }
    if (stateRef.current === 'listening' || stateRef.current === 'thinking' || stateRef.current === 'speaking') {
      const queued = queuedCueRef.current
      if (!queued || PRIORITY[priority] > PRIORITY[queued.priority]) queuedCueRef.current = { text, priority }
      return
    }
    // 小智协议只把服务端下发的裸 Opus 作为官方音色。自动报数与矫姿先显示
    // 为实时字幕，不再混用浏览器或兼容 TTS；对话回复仍由小智有声播放。
    setReply(text)
    queuedCueRef.current = null
  }, [fallbackMode])

  useEffect(() => {
    if (fallbackMode || state !== 'idle' || !queuedCueRef.current) return
    const cue = queuedCueRef.current
    queuedCueRef.current = null
    say(cue.text, cue.priority)
  }, [fallbackMode, state, say])

  const interrupt = useCallback(() => {
    if (fallbackMode) return cancelAnnouncement()
    audioRef.current?.clearPlayback()
    echoGateReset(echoGateRef.current)
    window.clearInterval(drainTimerRef.current)
    drainTimerRef.current = 0
    speakingSinceRef.current = 0
    playingAutoRef.current = false
    pendingSpeechRef.current = null
    audioRef.current?.setSending(true)
    sendJson(abortMessage('user_interrupt', sessionIdRef.current))
    sendJson(listenMessage('start', sessionIdRef.current))
    if (windowRef.current) extendConversationWindow(windowRef.current, Date.now())
    else windowRef.current = openConversationWindow('followup', Date.now())
    setState('listening')
    setEmotion('listening')
  }, [fallbackMode, sendJson])

  const requestVision = useCallback((question: string, trigger: 'user' | 'repeated_issue', issue: PoseIssue | null) => {
    if (fallbackMode || !visionAvailableRef.current || !videoRef.current) return false
    const image = frameDataUrl(videoRef.current)
    if (!image) return false
    const requestId = crypto.randomUUID()
    return enqueueVision({
      id: requestId, rep: contextRef.current.reps || null, capturedAt: Date.now(), image, question, trigger, issue,
      retries: 0, priority: trigger === 'user' ? 'user' : 'automatic', sessionId: sessionIdRef.current,
    })
  }, [enqueueVision, fallbackMode, videoRef])

  const captureRepFrame = useCallback(() => {
    if (fallbackMode || !visionAvailableRef.current || !videoRef.current) return false
    const image = frameDataUrl(videoRef.current)
    if (!image) return false
    repFrameCandidateRef.current = image
    repFrameCapturedAtRef.current = Date.now()
    return true
  }, [fallbackMode, videoRef])

  const notifyCompletedRep = useCallback((rep: number, issues: PoseIssue[]) => {
    const completedAt = new Date().toISOString()
    lastRepAtRef.current = completedAt
    lastRepIssuesRef.current = [...issues]
    const status = {
      ...buildWorkoutStatus(), reps: rep, lastRepAt: completedAt, lastRepIssues: issues, updatedAt: completedAt,
    }
    if (mcpReadyRef.current && sessionIdRef.current && sendJson(mcpNotification('notifications/workout_progress', status, sessionIdRef.current))) {
      setDataSyncState(current => ({ ...current, lastRepSynced: rep }))
    } else {
      pendingProgressRef.current.push(status)
      pendingProgressRef.current = pendingProgressRef.current.slice(-Math.max(1, contextRef.current.targetReps))
    }
    // 动作边界：攒着的动作提示（视觉指导）只在这里递，不在动作做到一半时开口。
    flushPendingSpeech()

    if (fallbackMode || !visionAvailableRef.current) {
      repFrameCandidateRef.current = null
      repFrameCapturedAtRef.current = 0
      return false
    }
    const candidate = repFrameCandidateRef.current
    const image = candidate || (videoRef.current ? frameDataUrl(videoRef.current) : null)
    // 拍照时刻跟着帧走：候选帧是动作最低点抓的，就用那一刻；现抓的用现在。
    const capturedAt = candidate ? repFrameCapturedAtRef.current || Date.now() : Date.now()
    repFrameCandidateRef.current = null
    repFrameCapturedAtRef.current = 0
    if (!image) return false
    const issue = issues[0] || null
    return enqueueVision({
      id: crypto.randomUUID(), rep, capturedAt, image,
      question: `这是第 ${rep} ${contextRef.current.countUnit}完整${exerciseInfo(contextRef.current.exerciseType).name}在动作关键阶段的关键帧。本地检测问题：${issues.length ? issues.join('、') : '无明显问题'}。请简短复核最值得保持或调整的一点，不做医疗诊断，不推翻本地计数。`,
      trigger: 'completed_rep', issue, retries: 0, priority: 'automatic', sessionId: sessionIdRef.current,
    })
  }, [buildWorkoutStatus, enqueueVision, fallbackMode, flushPendingSpeech, sendJson, videoRef])

  /** 里程碑陪伴：事实行先上屏，出声按优先级准入（忙时攒着、过期作废）。 */
  const notifyMilestone = useCallback((event: MilestoneEvent) => {
    offerSpeech({ kind: 'milestone', text: event.text, prompt: event.prompt })
  }, [offerSpeech])

  /** 追踪丢失喊话（训练页自己的路径，900ms/6s 纪律在 trackingLoss 里）。 */
  const cueTrackingLoss = useCallback(() => {
    offerSpeech({ kind: 'tracking', text: COPY_OUT_OF_FRAME, prompt: '我好像没在画面里了' })
  }, [offerSpeech])

  /**
   * 组间休息窗：小智先开口（本组事实总结 + 鼓励 + 最多一个视觉要点），
   * 然后开窗听用户说话。只有用户开过语音陪练才会走到这里（enabled 门控
   * 在页面层），绝不自动开麦。正在聊/正在说时只开窗+同步，不抢话。
   */
  const openRestWindow = useCallback((input: { reachedTarget: boolean }) => {
    const ctx = contextRef.current
    const { reps, targetReps: target, countUnit: unit } = ctx
    setReply(input.reachedTarget
      ? `这一组 ${reps} ${unit}，目标完成了`
      : `先休息一下，已经做了 ${reps} ${unit}`)
    if (fallbackMode || outageRef.current) return
    if (socketRef.current?.readyState !== WebSocket.OPEN || !sessionIdRef.current) return
    windowRef.current = openConversationWindow('rest', Date.now())
    syncWorkoutStatus()
    const current = stateRef.current
    if (current === 'thinking' || current === 'speaking') return
    const visionPoint = latestVisionInsightRef.current ? '，也说说你看到的最值得注意的一点，一个就行' : ''
    const prompt = input.reachedTarget
      ? `这一组做完了，我一共做了 ${reps} ${unit}，目标是 ${target} ${unit}。帮我总结这一组，再鼓励我一下${visionPoint}`
      : `我先暂停休息一下，刚做了 ${reps} ${unit}，目标 ${target} ${unit}。跟我说说刚才这段，再鼓励我一下${visionPoint}`
    void (async () => {
      try {
        if (!audioRef.current) {
          audioRef.current = new XiaozhiAudio(
            packet => { if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(packet) },
            () => undefined,
          )
        }
        const audio = audioRef.current
        await audio.startCapture()
        if (audioRef.current !== audio) return
        setXiaozhiVoiceReady(true)
        audio.setSending(echoGateRef.current.phase === 'open')
      } catch { /* 麦打不开也先让它把总结说了；窗口到点会自己关 */ }
      if (socketRef.current?.readyState !== WebSocket.OPEN || !sessionIdRef.current) return
      if (stateRef.current === 'listening') sendJson(listenMessage('stop', sessionIdRef.current))
      injectedTurnRef.current = Date.now()
      playingAutoRef.current = true
      sendJson(listenMessage('detect', sessionIdRef.current, prompt))
    })()
  }, [fallbackMode, sendJson, syncWorkoutStatus])

  /** 休息结束回到组中：关掉休息窗（组中回到唤醒/点按才开口的纪律）。 */
  const closeRestWindow = useCallback(() => {
    if (windowRef.current?.kind !== 'rest') return
    windowRef.current = null
    if (stateRef.current === 'listening') {
      sendJson(listenMessage('stop', sessionIdRef.current))
      void audioRef.current?.stopCapture()
      setState('idle')
      setEmotion('neutral')
    }
  }, [sendJson])

  /**
   * 组间边界标记（暂停/继续/达成目标时由页面调用）：断线恢复要等边界
   * 才算恢复——半路重连成功也先不投递主动语音，免得组中突然出声。
   */
  const noteSetBoundary = useCallback(() => {
    boundaryArmedRef.current = true
    if (outageRef.current && transportOkRef.current) {
      outageRef.current = false
      boundaryArmedRef.current = false
      setVoiceOutage(false)
    }
  }, [])

  const retry = useCallback(() => {
    setErrorMessage('')
    setFallbackMode(!XIAOZHI_ENABLED)
    setRetryNonce(value => value + 1)
  }, [fallbackMode, fallback.state, fallback.rearm])

  const prepareAudio = useCallback(() => {
    if (fallbackMode || !XIAOZHI_ENABLED) return
    audioRef.current ||= new XiaozhiAudio(
      packet => { if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(packet) },
      () => undefined,
    )
    const audio = audioRef.current
    void audio.ensurePlaybackReady().then(
      () => { if (audioRef.current === audio) setXiaozhiVoiceReady(true) },
      error => {
        if (audioRef.current !== audio) return
        setXiaozhiVoiceReady(false)
        setErrorMessage(error instanceof Error ? error.message : '小智声音没准备好，请重试')
      },
    )
  }, [fallbackMode])

  const toggleMute = useCallback(() => {
    setMuted(current => {
      if (!current) {
        cancelAnnouncement()
        audioRef.current?.clearPlayback()
      }
      return !current
    })
  }, [])

  const sendWorkoutContext = useCallback((next: WorkoutContext) => { contextRef.current = next }, [])

  const publicState: XiaozhiState = !enabled ? 'off' : fallbackMode
    ? (fallback.state === 'thinking' ? 'thinking' : fallback.state === 'speaking' ? 'speaking' : fallback.state === 'active' ? 'listening' : fallback.state === 'failed' ? 'failed' : 'fallback')
    : state

  return {
    state: publicState,
    transcript: localMode ? fallback.transcript : transcript,
    reply: localMode ? reply || fallback.reply : reply,
    emotion: fallbackMode ? (fallback.state === 'thinking' ? 'thinking' : fallback.state === 'speaking' ? 'happy' : 'neutral') as CoachEmotion : emotion,
    source, wake, interrupt, retry, prepareAudio,
    sendWorkoutContext,
    say, requestVision, captureRepFrame, notifyCompletedRep, dataSyncState,
    notifyMilestone, cueTrackingLoss, openRestWindow, closeRestWindow, noteSetBoundary,
    outage: voiceOutage,
    activationCode, activationMessage, identityMode, errorMessage: [errorMessage, fallbackMode ? fallback.errorMessage : ''].filter(Boolean).join(' '),
    muted, toggleMute, supported: fallbackMode ? fallback.supported : Boolean(recognizerCtor()),
    inConversation: publicState === 'listening' || publicState === 'thinking' || publicState === 'speaking',
    hasModel: source !== 'local', neural: source === 'xiaozhi', xiaozhiVoiceReady: source === 'xiaozhi' && xiaozhiVoiceReady,
    visionAvailable, visionInsights, conversationTurnCount,
  }
}
