import { useEffect, useState } from 'react'
import { sessionSeconds, type ClockSnapshot } from '../lib/sessionRuntime'
export function useSessionClock(row: ClockSnapshot | null | undefined, frozen = false) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (frozen) return
    setNow(Date.now())
    const update = () => setNow(Date.now())
    const timer = window.setInterval(update, 250)
    document.addEventListener('visibilitychange', update)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update) }
  }, [frozen, row?.receivedAt])
  return sessionSeconds(row, now)
}
