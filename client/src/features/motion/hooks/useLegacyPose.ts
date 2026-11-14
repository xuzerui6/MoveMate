import { useCallback, useEffect, useRef, useState } from 'react'
import type { NormalizedLandmark, PoseLandmarker } from '@mediapipe/tasks-vision'
import { ResourceScope } from '../lib/sessionRuntime'
import { CDN_WASM_BASE, cdnAssetUrl } from '../lib/cdnAssets'

export function useLegacyPose(active: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const errorReason = useRef('')
  // Keep image and world coordinates from the same inference together.
  const [sample, setSample] = useState<{landmarks:NormalizedLandmark[]|null;worldLandmarks:NormalizedLandmark[]|null}>({landmarks:null,worldLandmarks:null})
  const clearSample=()=>setSample({landmarks:null,worldLandmarks:null})
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'denied' | 'error'>('idle')
  const model = useRef<PoseLandmarker | null>(null), raf = useRef(0)
  const scope = useRef(new ResourceScope()), mounted = useRef(true)
  const stop = useCallback(() => {
    scope.current.cancel(); cancelAnimationFrame(raf.current); model.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    if (mounted.current) { setSample({landmarks:null,worldLandmarks:null}); setStatus('idle') }
  }, [])
  const start = useCallback(async (externalStream?: MediaStream) => {
    stop()
    errorReason.current = ''
    let cameraOpened = false
    const current = new ResourceScope(); scope.current = current
    setStatus('loading')
    try {
      const phone = window.matchMedia('(max-width: 699px)').matches
      // 调用方可在用户手势内先行申请好流再交进来（打怪页）；接管后由本
      // hook 按既有 ResourceScope 规则负责停止，没交进来时保持原行为。
      const stream = externalStream ?? await navigator.mediaDevices.getUserMedia({ video: phone ? { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 }, aspectRatio: { ideal: 3 / 4 } } : { facingMode: 'user', width: 720, height: 960 }, audio: false })
      if (!current.own(() => stream.getTracks().forEach(track => track.stop()))) { current.cancel(); return false }
      if (!videoRef.current) {
        // 画面元素没挂载时绝不静默失败：给一个能区分于权限问题的原因，
        // 免得页面又把一切都写成「检查一下权限」（2026-11-14 事故教训）
        errorReason.current = '摄像头画面还没准备好，退出这一页再进来试一次。'
        current.cancel()
        if (mounted.current) setStatus('error')
        return false
      }
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      cameraOpened = true
      if (current.cancelled) return false
      const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision')
      const options = { runningMode: 'VIDEO' as const, numPoses: 1, minPoseDetectionConfidence: .55, minTrackingConfidence: .55 }
      // WASM + model load CDN-first (GPU, then CPU); if the CDN route fails
      // outright, the whole attempt repeats against the app origin.
      const attempt = async (wasmBase: string, assetPath: string) => {
        const vision = await FilesetResolver.forVisionTasks(wasmBase)
        if (current.cancelled) throw new Error('cancelled')
        try { return await PoseLandmarker.createFromOptions(vision, { ...options, baseOptions: { modelAssetPath: assetPath, delegate: 'GPU' } }) }
        catch {
          if (current.cancelled) throw new Error('cancelled')
          return PoseLandmarker.createFromOptions(vision, { ...options, baseOptions: { modelAssetPath: assetPath, delegate: 'CPU' } })
        }
      }
      let instance: PoseLandmarker
      try { instance = await attempt(CDN_WASM_BASE, cdnAssetUrl('/pose/pose_landmarker_lite.task')) }
      catch {
        if (current.cancelled) return false
        instance = await attempt('/pose/wasm', '/pose/pose_landmarker_lite.task')
      }
      if (!current.own(() => instance.close())) return false
      model.current = instance; setStatus('ready'); return true
    } catch (error) {
      const cancelled = current.cancelled; current.cancel()
      if (!mounted.current || scope.current !== current || cancelled) return false
      model.current = null; clearSample()
      errorReason.current = error instanceof DOMException && error.name === 'NotAllowedError' ? '摄像头权限被拒绝，请在浏览器允许摄像头后重试，或改为手动记录。' : error instanceof DOMException && error.name === 'NotFoundError' ? '未找到摄像头，请连接设备后重试，或改为手动记录。' : error instanceof DOMException && error.name === 'NotReadableError' ? '摄像头无法读取，可能被其他应用占用，请关闭占用后重试。' : cameraOpened ? '识别没能准备好，请检查网络后重试；摄像头已经关好，本组还没有开始。' : '无法启动摄像头，请检查设备和浏览器支持后重试，或改为手动记录。'
      setStatus(error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'error')
      return false
    }
  }, [stop])
  useEffect(() => {
    if (!active || status !== 'ready') return
    let last = -1, detectedAt = performance.now(), stalled = false
    const loop = () => {
      const video = videoRef.current
      if (video && video.readyState >= 2 && model.current && video.currentTime !== last) {
        last = video.currentTime
        try { const now=performance.now(),result=model.current.detectForVideo(video, now); setSample({landmarks:result.landmarks[0]||null,worldLandmarks:result.worldLandmarks?.[0]||null}); detectedAt=now; stalled=false }
        catch { scope.current.cancel(); model.current = null; clearSample(); setStatus('error'); return }
      }
      else if(!stalled && performance.now()-detectedAt>1000){stalled=true;clearSample()}
      raf.current = requestAnimationFrame(loop)
    }
    loop(); return () => cancelAnimationFrame(raf.current)
  }, [active, status])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop() } }, [stop])
  return { videoRef, ...sample, status, start, stop, errorReason }
}
