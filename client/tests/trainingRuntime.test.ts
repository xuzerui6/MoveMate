import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SessionQueue, sessionSeconds, ResourceScope, reconcileMutation } from '../src/features/motion/lib/sessionRuntime'

test('progress snapshots coalesce behind an in-flight request and controls remain ordered', async () => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const calls: any[] = []
  const queue = new SessionQueue(async (id, action, data) => {
    calls.push({ id, action, data }); if (calls.length === 1) await gate; return data
  })
  const first = queue.run('a', 'progress', { reps: 1 })
  const second = queue.run('a', 'progress', { reps: 2, averageBpm: 90 })
  const latest = queue.run('a', 'progress', { reps: 3, formScore: 88 })
  const pause = queue.run('a', 'pause', { reps: 3 })
  const finish = queue.run('a', 'finish', { reps: 3 })
  release(); await Promise.all([first, second, latest, pause, finish])
  assert.deepEqual(calls.map(call => [call.action, call.data.reps]), [['progress', 1], ['progress', 3], ['pause', 3], ['finish', 3]])
  assert.equal(calls[1].data.averageBpm, 90)
})
test('a failed operation does not strand the following operation or mix records', async () => {
  const calls: string[] = []
  const queue = new SessionQueue(async (id, action) => { calls.push(id + action); if (action === 'pause') throw Error('offline'); return id })
  const failed = assert.rejects(queue.run('a', 'pause'), /offline/)
  assert.equal(await queue.run('b', 'finish'), 'b'); await failed
  assert.deepEqual(calls, ['apause', 'bfinish'])
})
test('queued snapshots are immutable while a later UI frame changes', async () => {
  const input = { reps: 2, scoreAccumulator: { count: 2, total: 180 } }
  const queue = new SessionQueue(async (_id, _action, data) => data)
  const result = queue.run('a', 'finish', input); input.reps = 9; input.scoreAccumulator.total = 900
  assert.deepEqual(await result, { reps: 2, scoreAccumulator: { count: 2, total: 180 } })
})
test('wall-clock time survives background throttling, excludes pause and reanchors on server recovery', () => {
  const row = { effectiveSeconds: 17, receivedAt: 1000, status: 'running' }
  assert.equal(sessionSeconds(row, 126000), 142)
  assert.equal(sessionSeconds({ ...row, status: 'paused' }, 126000), 17)
  assert.equal(sessionSeconds({ effectiveSeconds: 142, receivedAt: 126000, status: 'running' }, 128000), 144)
  assert.equal(sessionSeconds(row, 0), 17)
})
test('lost finish response recovers committed result without duplicate reward write', async () => {
  let writes = 0
  const row = { status: 'finished', reps: 12, xpEarned: 24 }
  const result = await reconcileMutation(new Set(), 'a', 'finish', { reps: 12 }, async () => { writes++; throw Error('response lost') }, async () => row)
  assert.equal(result.xpEarned, 24); assert.equal(writes, 1)
})
test('unknown finish reads before retry; unavailable recovery cannot issue another write', async () => {
  const uncertain = new Set<string>(); let writes = 0
  const send = async () => { writes++; throw Error('offline') }
  const offline = async () => { throw Error('read offline') }
  await assert.rejects(reconcileMutation(uncertain, 'a', 'finish', {}, send, offline))
  await assert.rejects(reconcileMutation(uncertain, 'a', 'finish', {}, send, offline))
  assert.equal(writes, 1)
  const row = await reconcileMutation(uncertain, 'a', 'finish', {}, send, async () => ({ status: 'finished', reps: 0 }))
  assert.equal(row.status, 'finished'); assert.equal(writes, 1)
})
test('failed pause is retried after server says still running, with full statistics intact', async () => {
  const uncertain = new Set(['a:pause']); let writes = 0
  const data = { reps: 4, scoreAccumulator: { count: 4, total: 360 } }
  const row = await reconcileMutation(uncertain, 'a', 'pause', data, async () => { writes++; return { status: 'paused', reps: 4 } }, async () => ({ status: 'running', reps: 3 }))
  assert.equal(row.status, 'paused'); assert.equal(writes, 1); assert.equal(data.scoreAccumulator.count, 4)
})
test('cancelled camera preparation disposes late stream and late model once', () => {
  const scope = new ResourceScope(); let tracks = 0, models = 0
  scope.own(() => tracks++); scope.cancel(); scope.cancel()
  assert.equal(scope.own(() => models++), false)
  assert.equal(tracks, 1); assert.equal(models, 1)
})
test('account replacement prevents queued requests from using the new identity', async () => {
  let account = 1, release!: () => void; const sent: number[] = []
  const gate = new Promise<void>(resolve => { release = resolve })
  const queue = new SessionQueue(async () => { if (account !== 1) throw Error('account changed'); sent.push(account); await gate; return 1 })
  const first = queue.run('a', 'progress'); const second = assert.rejects(queue.run('a', 'finish'), /account changed/)
  account = 2; release(); await first; await second; assert.deepEqual(sent, [1])
})
