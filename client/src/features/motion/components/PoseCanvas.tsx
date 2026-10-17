import { useEffect, useRef, useState } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { cameraFrame, cameraPoint, type CameraFit } from '../lib/cameraFrame'

const connections = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]]

export function PoseCanvas({ videoRef, landmarks, demo, phase, affectedJoints = [], fit = 'contain' }: { videoRef: React.RefObject<HTMLVideoElement>; landmarks: NormalizedLandmark[] | null; demo: boolean; phase: string; affectedJoints?: number[]; fit?: CameraFit }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [surface, setSurface] = useState({ width: 360, height: 410, dpr: 1, mobile: false })
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const phone = window.matchMedia('(max-width: 699px)')
    const measure = () => {
      const box = canvas.getBoundingClientRect()
      if (!box.width || !box.height) return
      // Preserve the desktop drawing surface and layout exactly as before.
      const next = phone.matches ? { width: box.width, height: box.height, dpr: Math.min(window.devicePixelRatio || 1, 2), mobile: true } : { width: 360, height: 410, dpr: 1, mobile: false }
      setSurface(previous => Object.keys(next).every(key => previous[key as keyof typeof previous] === next[key as keyof typeof next]) ? previous : next)
    }
    const observer = new ResizeObserver(measure); observer.observe(canvas)
    phone.addEventListener('change', measure); measure()
    return () => { observer.disconnect(); phone.removeEventListener('change', measure) }
  }, [])
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const pixelWidth = Math.round(surface.width * surface.dpr), pixelHeight = Math.round(surface.height * surface.dpr)
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight
    const ctx = canvas.getContext('2d'); if (!ctx) return
    ctx.setTransform(surface.dpr, 0, 0, surface.dpr, 0, 0)
    const draw = () => {
      const w = surface.width, h = surface.height; ctx.clearRect(0,0,w,h)
      const video=videoRef.current;
      const frame = !demo && video?.videoWidth && video.videoHeight ? cameraFrame(video.videoWidth, video.videoHeight, w, h, surface.mobile ? fit : 'contain') : surface.mobile ? cameraFrame(360,410,w,h) : { x:0,y:0,width:w,height:h };
      if (video && video.readyState >= 2 && video.videoWidth && !demo) { ctx.fillStyle='#f6f8f7';ctx.fillRect(0,0,w,h);ctx.save();ctx.translate(w,0);ctx.scale(-1,1);ctx.drawImage(video,frame.x,frame.y,frame.width,frame.height);ctx.restore() }
      else {
        const g = ctx.createLinearGradient(0,0,w,h); g.addColorStop(0,'#111814'); g.addColorStop(1,'#26332d'); ctx.fillStyle=g; ctx.fillRect(0,0,w,h)
        ctx.fillStyle='rgba(255,255,255,.04)'; for(let x=0;x<w;x+=28) for(let y=0;y<h;y+=28) ctx.fillRect(x,y,1,1)
      }
      let pts: {x:number;y:number}[] = []
      if (landmarks) pts = landmarks.map(p => cameraPoint(p, frame))
      else if(demo) {
        const down = phase === 'bottom'; const cx=w/2, hip=down?h*.60:h*.48, knee=down?h*.70:h*.67
        pts=Array.from({length:29},()=>({x:cx,y:h*.4})); Object.assign(pts[11],{x:cx-34,y:h*.3}); Object.assign(pts[12],{x:cx+34,y:h*.3}); Object.assign(pts[13],{x:cx-55,y:h*.43}); Object.assign(pts[14],{x:cx+55,y:h*.43}); Object.assign(pts[15],{x:cx-70,y:h*.35}); Object.assign(pts[16],{x:cx+70,y:h*.35}); Object.assign(pts[23],{x:cx-28,y:hip}); Object.assign(pts[24],{x:cx+28,y:hip}); Object.assign(pts[25],{x:cx-58,y:knee}); Object.assign(pts[26],{x:cx+58,y:knee}); Object.assign(pts[27],{x:cx-70,y:h*.88}); Object.assign(pts[28],{x:cx+70,y:h*.88})
      }
      ctx.save()
      if (surface.mobile) { ctx.beginPath(); ctx.rect(Math.max(0,frame.x),Math.max(0,frame.y),Math.min(w,frame.width),Math.min(h,frame.height)); ctx.clip() }
      ctx.strokeStyle='#21ed80'; ctx.lineWidth=5; ctx.lineCap='round'; ctx.shadowColor='#21ed80'; ctx.shadowBlur=8
      for (const [a,b] of connections) if (pts[a]&&pts[b]) { ctx.beginPath(); ctx.moveTo(pts[a].x,pts[a].y); ctx.lineTo(pts[b].x,pts[b].y); ctx.stroke() }
      ctx.shadowBlur=0; for (const i of [11,12,13,14,15,16,23,24,25,26,27,28]) if(pts[i]) {ctx.fillStyle=affectedJoints.includes(i)?'#ffbe3d':'#36f093';ctx.beginPath();ctx.arc(pts[i].x,pts[i].y,affectedJoints.includes(i)?8:6,0,Math.PI*2);ctx.fill()}
      ctx.restore()
    }
    draw()
  }, [landmarks, demo, phase, videoRef, affectedJoints, surface, fit])
  return <><video ref={videoRef} className="hidden-video" muted playsInline/><canvas ref={canvasRef} width={360} height={410} className="pose-canvas"/></>
}
