import { test } from 'node:test'
import assert from 'node:assert/strict'
import { XiaozhiAudio } from '../src/features/motion/lib/xiaozhiAudio'

function setup() {
  let grant!: (stream: any) => void, load!: () => void, requests = 0, stopped = 0
  const permission = new Promise<any>(resolve => { grant = resolve })
  const module = new Promise<void>(resolve => { load = resolve })
  class Context {
    state = 'running'; audioWorklet = { addModule: () => module }
    async close() { this.state = 'closed' }
  }
  Object.assign(globalThis, { window: { AudioEncoder: class {}, AudioDecoder: class {}, AudioData: class {}, EncodedAudioChunk: class {}, AudioWorkletNode: class {} }, AudioContext: Context })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: () => { requests++; return permission } } } })
  const stream = { getTracks: () => [{ stop: () => stopped++ }] }
  return { grant: () => grant(stream), load: () => load(), requests: () => requests, stopped: () => stopped }
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

test('closing voice while microphone permission is pending stops the late stream', async () => {
  const mock = setup(), audio = new XiaozhiAudio(() => assert.fail('must not send audio'), () => {})
  const capture = audio.startCapture(); const rejected = assert.rejects(capture, /语音已关闭/)
  await tick(); assert.equal(mock.requests(), 1)
  await audio.dispose(); mock.grant(); await rejected
  assert.equal(mock.stopped(), 1)
  await assert.rejects(audio.startCapture(), /语音已关闭/)
})

test('leaving while the audio worklet loads cannot recreate capture after disposal', async () => {
  const mock = setup(), audio = new XiaozhiAudio(() => assert.fail('must not send audio'), () => {})
  const capture = audio.startCapture(); const rejected = assert.rejects(capture, /语音已关闭/)
  await tick(); mock.grant(); await tick()
  await audio.dispose(); mock.load(); await rejected
  assert.equal(mock.stopped(), 1)
})

test('double wake uses one microphone request and cancellation stops its stream', async () => {
  const mock = setup(), audio = new XiaozhiAudio(() => {}, () => {})
  const first = audio.startCapture(), second = audio.startCapture()
  assert.equal(first, second)
  const rejected = assert.rejects(first, /语音已关闭/)
  await tick(); assert.equal(mock.requests(), 1)
  await audio.stopCapture(); mock.grant(); await rejected
  assert.equal(mock.stopped(), 1); await audio.dispose()
})
