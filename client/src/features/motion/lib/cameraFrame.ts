export type CameraFit = 'contain' | 'cover'

// Use the same rectangle for video pixels and landmarks. Never fit the result twice.
export function cameraFrame(sourceWidth: number, sourceHeight: number, width: number, height: number, fit: CameraFit = 'contain') {
  if (![sourceWidth, sourceHeight, width, height].every(value => Number.isFinite(value) && value > 0)) return { x: 0, y: 0, width: 0, height: 0 }
  const scale = (fit === 'cover' ? Math.max : Math.min)(width / sourceWidth, height / sourceHeight)
  const frameWidth = sourceWidth * scale, frameHeight = sourceHeight * scale
  return { x: (width - frameWidth) / 2, y: (height - frameHeight) / 2, width: frameWidth, height: frameHeight }
}

export function cameraPoint(point: { x: number; y: number }, frame: ReturnType<typeof cameraFrame>) {
  return { x: frame.x + (1 - point.x) * frame.width, y: frame.y + point.y * frame.height }
}
