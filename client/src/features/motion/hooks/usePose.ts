import { useEffect, useRef, useState } from 'react'
import type { NormalizedLandmark, PoseLandmarker } from '@mediapipe/tasks-vision'

export function usePose(active: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [landmarks, setLandmarks] = useState<NormalizedLandmark[] | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'denied' | 'error'>('idle')
  const landmarker = useRef<PoseLandmarker | null>(null)
  const raf = useRef(0)
  const streamRef=useRef<MediaStream|null>(null)
  const mounted=useRef(true)

  const start = async () => {
    setStatus('loading')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 720, height: 960 }, audio: false })
      if (!mounted.current || !videoRef.current) {stream.getTracks().forEach(t=>t.stop());return}
      streamRef.current=stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision')
      const vision = await FilesetResolver.forVisionTasks('/pose/wasm')
      const options={runningMode:'VIDEO' as const,numPoses:1,minPoseDetectionConfidence:.55,minTrackingConfidence:.55}
      try {
        landmarker.current = await PoseLandmarker.createFromOptions(vision, {
          ...options,baseOptions:{modelAssetPath:'/pose/pose_landmarker_lite.task',delegate:'GPU'},
        })
      } catch {
        landmarker.current = await PoseLandmarker.createFromOptions(vision, {
          ...options,baseOptions:{modelAssetPath:'/pose/pose_landmarker_lite.task',delegate:'CPU'},
        })
      }
      if(!mounted.current){landmarker.current.close();stream.getTracks().forEach(t=>t.stop());return}
      setStatus('ready')
    } catch (e) {
      streamRef.current?.getTracks().forEach(t=>t.stop())
      setStatus(e instanceof DOMException && e.name === 'NotAllowedError' ? 'denied' : 'error')
    }
  }

  useEffect(() => {
    if (!active || status !== 'ready') return
    let last = -1
    const loop = () => {
      const video = videoRef.current
      if (video && video.readyState>=2 && landmarker.current && video.currentTime !== last) {
        last = video.currentTime
        try {
          const result = landmarker.current.detectForVideo(video, performance.now())
          setLandmarks(result.landmarks[0] || null)
        } catch {
          streamRef.current?.getTracks().forEach(t=>t.stop())
          setStatus('error')
          return
        }
      }
      raf.current = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf.current)
  }, [active, status])

  useEffect(() => {mounted.current=true;return () => {
    mounted.current=false
    cancelAnimationFrame(raf.current)
    const stream = streamRef.current
    stream?.getTracks().forEach(t => t.stop())
    landmarker.current?.close()
  }}, [])
  return { videoRef, landmarks, status, start }
}
