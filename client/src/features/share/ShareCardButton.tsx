import { useEffect, useRef, useState } from 'react'
import Dialog from '../../components/Dialog'
import { canSharePng, downloadPng, sharePng, svgToPngBlob } from './exportCard'
import './share-card.css'

export interface ShareCardSpec {
  svg: string
  fileName: string
  title: string
}

interface Preview {
  url: string
  blob: Blob
  spec: ShareCardSpec
  shareable: boolean
}

/**
 * 分享卡触发按钮：用户主动点击才生成卡片（不自动弹窗、不强制分享）。
 * 生成后先预览：支持系统分享的环境以「分享」为主按钮，
 * 其余环境走「保存图片」下载 PNG 兜底（设计板导出规格）。
 */
export default function ShareCardButton({
  label,
  className = 'secondary',
  makeCard,
}: {
  label: string
  className?: string
  makeCard: () => ShareCardSpec | null
}) {
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const previewRef = useRef<Preview | null>(null)
  previewRef.current = preview

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current.url)
    },
    [],
  )

  const close = () => {
    if (preview) URL.revokeObjectURL(preview.url)
    setPreview(null)
    setNote('')
    setError('')
  }

  const open = async () => {
    if (busy) return
    const spec = makeCard()
    if (!spec) return
    setBusy(true)
    setError('')
    try {
      const blob = await svgToPngBlob(spec.svg)
      setPreview({ url: URL.createObjectURL(blob), blob, spec, shareable: canSharePng(blob, spec.fileName) })
    } catch (e) {
      setError(e instanceof Error ? e.message : '图片生成失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  const doShare = async () => {
    if (!preview) return
    const outcome = await sharePng(preview.blob, preview.spec.fileName, preview.spec.title)
    if (outcome === 'shared') {
      setNote('已打开系统分享。')
      setError('')
    } else if (outcome === 'cancelled') {
      setNote('')
    } else {
      // 系统分享临场不可用时直接落到下载兜底，不让用户卡住。
      downloadPng(preview.blob, preview.spec.fileName)
      setNote('当前环境不支持系统分享，已改为保存图片。')
      setError('')
    }
  }

  return (
    <>
      <button type="button" className={className} disabled={busy} onClick={() => void open()}>
        {busy ? '正在生成…' : label}
      </button>
      {error && !preview && (
        <span className="share-card-error" role="alert">
          {error}
        </span>
      )}
      {preview && (
        <Dialog title="分享卡片" onClose={close}>
          <img className="share-card-preview" src={preview.url} alt="分享卡片预览" />
          <div className="share-card-actions">
            {preview.shareable && (
              <button type="button" className="primary" onClick={() => void doShare()}>
                分享
              </button>
            )}
            <button
              type="button"
              className={preview.shareable ? 'secondary' : 'primary'}
              onClick={() => {
                downloadPng(preview.blob, preview.spec.fileName)
                setNote('图片已保存，去相册或下载目录查看。')
                setError('')
              }}
            >
              保存图片
            </button>
          </div>
          {note && (
            <p className="share-card-note" role="status">
              {note}
            </p>
          )}
          {error && (
            <p className="share-card-error" role="alert">
              {error}
            </p>
          )}
        </Dialog>
      )}
    </>
  )
}
