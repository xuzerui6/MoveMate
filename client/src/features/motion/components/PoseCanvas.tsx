import { useEffect, useRef, useState } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { usesMainThreadLite } from '../lib/poseCompatibility'
import { cameraFrame, cameraPoint, type CameraFit } from '../lib/cameraFrame'
import { DisplayPoseFilter, extrapolateDisplayPoints, type DisplayPoint, type DisplayVelocity } from '../lib/displayPose'
import type { PoseFrame } from '../lib/poseProtocol'

const connections = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]]

export function PoseCanvas({ videoRef, landmarks, demo, phase, affectedJoints = [], fit = 'contain', keepVideoRendering = false, frame = null }: { videoRef: React.RefObject<HTMLVideoElement>; landmarks: NormalizedLandmark[] | null; demo: boolean; phase: string; affectedJoints?: number[]; fit?: CameraFit; keepVideoRendering?: boolean; frame?: PoseFrame | null }) {
  const nativePreview = keepVideoRendering && !demo &&
    usesMainThreadLite(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [surface, setSurface] = useState({ width: 360, height: 410, dpr: 1, mobile: false })
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const phone = window.matchMedia('(max-width: 699px)')
    const measure = () => {
      const box = canvas.getBoundingClientRect()
      if (!box.width || !box.height) return
      // Preserve the desktop drawing surface and layout exactly as before.
      const next = phone.matches || nativePreview ? { width: box.width, height: box.height, dpr: Math.min(window.devicePixelRatio || 1, 2), mobile: true } : { width: 360, height: 410, dpr: 1, mobile: false }
      setSurface(previous => Object.keys(next).every(key => previous[key as keyof typeof previous] === next[key as keyof typeof next]) ? previous : next)
    }
    const observer = new ResizeObserver(measure); observer.observe(canvas)
    phone.addEventListener('change', measure); measure()
    return () => { observer.disconnect(); phone.removeEventListener('change', measure) }
  }, [nativePreview])
  // Display-only smoothing: the filter advances only when a new inference
  // sample arrives. The evaluator never sees this output — it keeps consuming
  // the raw frames exactly as before; this only changes what is drawn.
  const filterRef = useRef<DisplayPoseFilter | null>(null)
  const displayRef = useRef<{ points: DisplayPoint[]; velocities: DisplayVelocity[]; capturedAt: number } | null>(null)
  useEffect(() => {
    if (!landmarks || demo) { displayRef.current = null; filterRef.current?.reset(); return }
    const filter = (filterRef.current ??= new DisplayPoseFilter())
    const at = frame?.capturedAt ?? performance.now()
    const out = filter.update(landmarks, at)
    displayRef.current = { points: out.points, velocities: out.velocities, capturedAt: at }
  }, [landmarks, demo, frame])
  const drawPropsRef = useRef({ demo, phase, affectedJoints, fit })
  useEffect(() => { drawPropsRef.current = { demo, phase, affectedJoints, fit } })
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const pixelWidth = Math.round(surface.width * surface.dpr), pixelHeight = Math.round(surface.height * surface.dpr)
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight
    const ctx = canvas.getContext('2d'); if (!ctx) return
    ctx.setTransform(surface.dpr, 0, 0, surface.dpr, 0, 0)
    // Redraw on every animation frame, decoupled from the inference publish
    // rate: between results the smoothed points are extrapolated forward by
    // the measured pipeline age instead of freezing mid-motion.
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const { demo, phase, affectedJoints, fit } = drawPropsRef.current
      const w = surface.width, h = surface.height; ctx.clearRect(0,0,w,h)
      const video=videoRef.current;
      // Landmarks and video always share the caller's fit (F3: no contain fork).
      const frame = !demo && video?.videoWidth && video.videoHeight ? cameraFrame(video.videoWidth, video.videoHeight, w, h, fit) : surface.mobile ? cameraFrame(360,410,w,h) : { x:0,y:0,width:w,height:h };
      if (!nativePreview && video && video.readyState >= 2 && video.videoWidth && !demo) { ctx.fillStyle='#f6f8f7';ctx.fillRect(0,0,w,h);ctx.save();ctx.translate(w,0);ctx.scale(-1,1);ctx.drawImage(video,frame.x,frame.y,frame.width,frame.height);ctx.restore() }
      else if (!nativePreview) {
        const g = ctx.createLinearGradient(0,0,w,h); g.addColorStop(0,'#111814'); g.addColorStop(1,'#26332d'); ctx.fillStyle=g; ctx.fillRect(0,0,w,h)
        ctx.fillStyle='rgba(255,255,255,.04)'; for(let x=0;x<w;x+=28) for(let y=0;y<h;y+=28) ctx.fillRect(x,y,1,1)
      }
      let pts: {x:number;y:number}[] = []
      const display = displayRef.current
      if (!demo && display) pts = extrapolateDisplayPoints(display.points, display.velocities, performance.now() - display.capturedAt).map(p => cameraPoint(p, frame))
      else if(demo) {
        const down = phase === 'bottom'; const cx=w/2, hip=down?h*.60:h*.48, knee=down?h*.70:h*.67
        pts=Array.from({length:29},()=>({x:cx,y:h*.4})); Object.assign(pts[11],{x:cx-34,y:h*.3}); Object.assign(pts[12],{x:cx+34,y:h*.3}); Object.assign(pts[13],{x:cx-55,y:h*.43}); Object.assign(pts[14],{x:cx+55,y:h*.43}); Object.assign(pts[15],{x:cx-70,y:h*.35}); Object.assign(pts[16],{x:cx-70,y:h*.35}); Object.assign(pts[23],{x:cx-28,y:hip}); Object.assign(pts[24],{x:cx+28,y:hip}); Object.assign(pts[25],{x:cx-58,y:knee}); Object.assign(pts[26],{x:cx+58,y:knee}); Object.assign(pts[27],{x:cx-70,y:h*.88}); Object.assign(pts[28],{x:cx+70,y:h*.88})
      }
      ctx.save()
      if (surface.mobile) { ctx.beginPath(); ctx.rect(Math.max(0,frame.x),Math.max(0,frame.y),Math.min(w,frame.width),Math.min(h,frame.height)); ctx.clip() }
      ctx.strokeStyle='#21ed80'; ctx.lineWidth=5; ctx.lineCap='round'; ctx.shadowColor='#21ed80'; ctx.shadowBlur=8
      for (const [a,b] of connections) if (pts[a]&&pts[b]) { ctx.beginPath(); ctx.moveTo(pts[a].x,pts[a].y); ctx.lineTo(pts[b].x,pts[b].y); ctx.stroke() }
      ctx.shadowBlur=0; for (const i of [11,12,13,14,15,16,23,24,25,26,27,28]) if(pts[i]) {ctx.fillStyle=affectedJoints.includes(i)?'#ffbe3d':'#36f093';ctx.beginPath();ctx.arc(pts[i].x,pts[i].y,affectedJoints.includes(i)?8:6,0,Math.PI*2);ctx.fill()}
      ctx.restore()
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [videoRef, surface, nativePreview])
  const video = <video ref={videoRef} className={nativePreview ? 'pose-native-video' : keepVideoRendering ? 'hidden-video pose-source-live' : 'hidden-video'}
    style={nativePreview ? { objectFit: fit } : undefined} autoPlay={nativePreview} aria-hidden="true" tabIndex={-1} muted playsInline/>
  const canvas = <canvas ref={canvasRef} width={360} height={410} className="pose-canvas"/>
  // Keep the video element mounted when presentation changes.
  return <div className={nativePreview ? 'pose-native-preview' : 'pose-canvas-contents'}>{video}{canvas}</div>
}
