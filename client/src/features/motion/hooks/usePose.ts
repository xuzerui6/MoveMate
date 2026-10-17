import { useCallback, useEffect, useRef, useState } from 'react'
import type { NormalizedLandmark, PoseLandmarker } from '@mediapipe/tasks-vision'
import { ResourceScope } from '../lib/sessionRuntime'

export function usePose(active: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [landmarks, setLandmarks] = useState<NormalizedLandmark[] | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'denied' | 'error'>('idle')
  const model = useRef<PoseLandmarker | null>(null), raf = useRef(0)
  const scope = useRef(new ResourceScope()), mounted = useRef(true)
  const stop = useCallback(() => {
    scope.current.cancel(); cancelAnimationFrame(raf.current); model.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    if (mounted.current) { setLandmarks(null); setStatus('idle') }
  }, [])
  const start = useCallback(async () => {
    stop()
    const current = new ResourceScope(); scope.current = current
    setStatus('loading')
    try {
      const phone = window.matchMedia('(max-width: 699px)').matches
      const stream = await navigator.mediaDevices.getUserMedia({ video: phone ? { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 }, aspectRatio: { ideal: 3 / 4 } } : { facingMode: 'user', width: 720, height: 960 }, audio: false })
      if (!current.own(() => stream.getTracks().forEach(track => track.stop())) || !videoRef.current) { current.cancel(); return false }
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      if (current.cancelled) return false
      const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision')
      const vision = await FilesetResolver.forVisionTasks('/pose/wasm')
      if (current.cancelled) return false
      const options = { runningMode: 'VIDEO' as const, numPoses: 1, minPoseDetectionConfidence: .55, minTrackingConfidence: .55 }
      let instance: PoseLandmarker
      try { instance = await PoseLandmarker.createFromOptions(vision, { ...options, baseOptions: { modelAssetPath: '/pose/pose_landmarker_lite.task', delegate: 'GPU' } }) }
      catch {
        if (current.cancelled) return false
        instance = await PoseLandmarker.createFromOptions(vision, { ...options, baseOptions: { modelAssetPath: '/pose/pose_landmarker_lite.task', delegate: 'CPU' } })
      }
      if (!current.own(() => instance.close())) return false
      model.current = instance; setStatus('ready'); return true
    } catch (error) {
      const cancelled = current.cancelled; current.cancel()
      if (!mounted.current || scope.current !== current || cancelled) return false
      model.current = null; setLandmarks(null)
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
        try { const now=performance.now(); setLandmarks(model.current.detectForVideo(video, now).landmarks[0] || null); detectedAt=now; stalled=false }
        catch { scope.current.cancel(); model.current = null; setLandmarks(null); setStatus('error'); return }
      }
      else if(!stalled && performance.now()-detectedAt>1000){stalled=true;setLandmarks(null)}
      raf.current = requestAnimationFrame(loop)
    }
    loop(); return () => cancelAnimationFrame(raf.current)
  }, [active, status])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop() } }, [stop])
  return { videoRef, landmarks, status, start, stop }
}
