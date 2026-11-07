import { CARD_HEIGHT, CARD_WIDTH } from './cardSvg'

/**
 * 分享卡导出：SVG 字符串 → Canvas → PNG Blob，全程设备本地生成，不上传服务器。
 * 分享顺序以设计板为准：系统分享（Web Share with files）优先，不支持则下载 PNG 兜底。
 */

export function svgToPngBlob(svg: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = CARD_WIDTH
        canvas.height = CARD_HEIGHT
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('当前浏览器无法生成图片')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
        ctx.drawImage(img, 0, 0, CARD_WIDTH, CARD_HEIGHT)
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(svgUrl)
          if (blob) resolve(blob)
          else reject(new Error('图片生成失败，请重试'))
        }, 'image/png')
      } catch (error) {
        URL.revokeObjectURL(svgUrl)
        reject(error instanceof Error ? error : new Error('图片生成失败，请重试'))
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl)
      reject(new Error('图片生成失败，请重试'))
    }
    img.src = svgUrl
  })
}

export function pngFile(blob: Blob, fileName: string): File {
  return new File([blob], fileName, { type: 'image/png' })
}

export function canSharePng(blob: Blob, fileName: string): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false
  try {
    return navigator.canShare({ files: [pngFile(blob, fileName)] })
  } catch {
    return false
  }
}

export type ShareOutcome = 'shared' | 'cancelled' | 'unsupported'

export async function sharePng(blob: Blob, fileName: string, title: string): Promise<ShareOutcome> {
  if (!canSharePng(blob, fileName) || !navigator.share) return 'unsupported'
  try {
    await navigator.share({ files: [pngFile(blob, fileName)], title })
    return 'shared'
  } catch (error) {
    // 用户在系统面板里取消，不算失败。
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    return 'unsupported'
  }
}

export function downloadPng(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
