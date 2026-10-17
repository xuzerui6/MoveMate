import test from 'node:test'
import assert from 'node:assert/strict'
import { cameraFrame, cameraPoint } from '../src/features/motion/lib/cameraFrame'

test('landscape video uses the entire phone width without a second portrait letterbox', () => {
  const frame = cameraFrame(640, 480, 366, 506)
  assert.deepEqual(frame, { x: 0, y: 115.75, width: 366, height: 274.5 })
  assert.deepEqual(cameraPoint({ x: 0, y: 0 }, frame), { x: 366, y: 115.75 })
  assert.deepEqual(cameraPoint({ x: 1, y: 1 }, frame), { x: 0, y: 390.25 })
})
test('portrait camera and resized focused surface preserve video and joint alignment', () => {
  for (const [width, height] of [[366,506], [366,568], [320,350]]) {
    const frame = cameraFrame(720, 960, width, height)
    assert.ok(frame.width <= width && frame.height <= height)
    assert.deepEqual(cameraPoint({ x: .5, y: .5 }, frame), { x: width / 2, y: height / 2 })
    assert.equal(frame.width / frame.height, .75)
  }
})
test('explicit cover crops symmetrically while joints share the exact same mapping', () => {
  const frame = cameraFrame(640, 480, 366, 506, 'cover')
  assert.equal(frame.height, 506)
  assert.ok(frame.x < 0)
  assert.deepEqual(cameraPoint({ x: .5, y: .5 }, frame), { x: 183, y: 253 })
  assert.ok(cameraPoint({ x: 0, y: .5 }, frame).x > 366)
})
test('desktop legacy surface and missing metadata stay well defined', () => {
  assert.deepEqual(cameraFrame(640,480,360,410), { x:0,y:70,width:360,height:270 })
  for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(cameraFrame(invalid,480,366,506), { x:0,y:0,width:0,height:0 })
  }
})
