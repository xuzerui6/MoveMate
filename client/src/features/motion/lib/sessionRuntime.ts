// One transport queue per account. Controls are barriers between snapshots.
export class SessionQueue<T> {
  private jobs: Array<{ id: string; action: string; data: any; resolve: Array<(value: T) => void>; reject: Array<(error: unknown) => void> }> = []
  private running = false
  constructor(private send: (id: string, action: string, data: any) => Promise<T>) {}
  run(id: string, action: string, data: any = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const last = this.jobs[this.jobs.length - 1]
      if (action === 'progress' && last?.action === action && last.id === id) {
        last.data = { ...last.data, ...structuredClone(data) }
        last.resolve.push(resolve); last.reject.push(reject)
      } else this.jobs.push({ id, action, data: structuredClone(data), resolve: [resolve], reject: [reject] })
      void this.drain()
    })
  }
  private async drain() {
    if (this.running) return
    this.running = true
    while (this.jobs.length) {
      const job = this.jobs.shift()!
      try { const result = await this.send(job.id, job.action, job.data); job.resolve.forEach(done => done(result)) }
      catch (error) { job.reject.forEach(fail => fail(error)) }
    }
    this.running = false
  }
}
export type ClockSnapshot = { effectiveSeconds: number; status: string; receivedAt?: number }
export function sessionSeconds(row: ClockSnapshot | null | undefined, now: number) {
  if (!row) return 0
  return row.effectiveSeconds + (row.status === 'running' ? Math.max(0, Math.floor((now - (row.receivedAt ?? now)) / 1000)) : 0)
}
export function mutationConfirmed(row: { status: string; reps: number } | undefined, action: string, data: any) {
  if (!row) return false
  if (action === 'finish') return row.status === 'finished'
  if (action === 'pause') return row.status === 'paused' && row.reps >= (data.reps || 0)
  if (action === 'resume') return row.status === 'running'
  return action === 'progress' && row.reps >= (data.reps || 0)
}
export async function reconcileMutation<T extends { status: string; reps: number }>(
  uncertain: Set<string>, id: string, action: string, data: any,
  send: () => Promise<T>, lookup: () => Promise<T | undefined>,
) {
  const key = id + ':' + action
  if (uncertain.has(key)) {
    // An unknown outcome must be read before another write, particularly on finish.
    const row = await lookup()
    if (mutationConfirmed(row, action, data)) { uncertain.delete(key); return row! }
  }
  try { const row = await send(); uncertain.delete(key); return row }
  catch (error) {
    uncertain.add(key)
    try {
      const row = await lookup()
      if (mutationConfirmed(row, action, data)) { uncertain.delete(key); return row! }
    } catch { /* retain the outcome marker and original transport error */ }
    throw error
  }
}
// Browser device requests cannot be aborted; late resources still need disposal.
export class ResourceScope {
  cancelled = false
  private disposals: Array<() => void> = []
  own(dispose: () => void) {
    if (this.cancelled) { dispose(); return false }
    this.disposals.push(dispose); return true
  }
  cancel() {
    if (this.cancelled) return
    this.cancelled = true
    this.disposals.splice(0).reverse().forEach(dispose => { try { dispose() } catch { /* already closed */ } })
  }
}
