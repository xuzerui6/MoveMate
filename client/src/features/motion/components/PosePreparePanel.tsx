import {useState} from 'react';
import {formatMB, type PreparePhase} from '../lib/posePrepareCore';
import type {PrepareSnapshot} from '../lib/posePrepare';

export type PreparePanelPhase = 'download' | 'engine';

/** Design C waiting states, driven entirely by measured prepare progress.
 * C1: three steps with real bytes/rate/ETA. C2: the slow notice with a Lite
 * start. C3: retries exhausted. Nothing here invents a number. */
export function PosePreparePanel({
  snapshot,
  phase,
  failed = false,
  onCancel,
  onRetry,
  onLiteStart,
  onHome,
}: {
  snapshot: PrepareSnapshot;
  phase: PreparePanelPhase;
  failed?: boolean;
  onCancel?: () => void;
  onRetry?: () => void;
  onLiteStart?: () => void;
  onHome?: () => void;
}) {
  const [slowDismissed, setSlowDismissed] = useState(false);
  if (failed) {
    return (
      <div className="pose-prepare-panel" role="alert">
        <div className="pose-prepare-title"><b>模型没下下来</b></div>
        <p className="pose-prepare-copy">可能是网络刚断了一下。我已经自动重试了 3 次。</p>
        <div className="pose-prepare-actions">
          {onRetry && <button type="button" className="primary" onClick={onRetry}>再试一次</button>}
          {onHome && <button type="button" className="pose-prepare-text" onClick={onHome}>先回首页看看</button>}
        </div>
      </div>
    );
  }
  const step = phase === 'download' ? 1 : 2;
  const showSlow = snapshot.slow && phase === 'download' && !slowDismissed;
  const progressCaption = [
    snapshot.totalBytes > 0 ? `${formatMB(snapshot.loadedBytes)} / ${formatMB(snapshot.totalBytes)} MB` : '',
    snapshot.rateBps > 0 ? `${formatMB(snapshot.rateBps)} MB/s` : '',
    snapshot.etaSeconds !== null && snapshot.etaSeconds > 0 ? `约还剩 ${snapshot.etaSeconds} 秒` : '',
  ].filter(Boolean).join(' · ');
  return (
    <div className="pose-prepare-panel" role="status" aria-label="正在准备识别">
      <div className="pose-prepare-title">
        <span className="pose-prepare-spinner" aria-hidden="true"/>
        <b>正在准备识别</b>
        <span className="pose-prepare-step">第 {step} 步／共 3 步</span>
      </div>
      <ol className="pose-prepare-steps">
        <li className={phase === 'download' ? 'active' : 'done'}>
          <span className="pose-prepare-mark" aria-hidden="true">{phase === 'download' ? '' : '✓'}</span>
          <span className="pose-prepare-step-body">
            <span>下载识别模型</span>
            {phase === 'download' && (
              <>
                <span className="pose-prepare-bar"><span style={{width: `${Math.round(snapshot.fraction * 100)}%`}}/></span>
                {progressCaption && <small>{progressCaption}</small>}
              </>
            )}
          </span>
        </li>
        <li className={phase === 'engine' ? 'active' : ''}>
          <span className="pose-prepare-mark" aria-hidden="true"/>
          <span className="pose-prepare-step-body"><span>加载识别引擎</span></span>
        </li>
        <li>
          <span className="pose-prepare-mark" aria-hidden="true"/>
          <span className="pose-prepare-step-body"><span>打开摄像头</span></span>
        </li>
      </ol>
      <p className="pose-prepare-copy">第一次会久一点，之后每次打开都是秒开。</p>
      {showSlow && (
        <div className="pose-prepare-slow">
          <p>网络有点慢，我还在继续下。你也可以先用轻量模式开始练——完整模型会在后台下好，下次自动用完整的。</p>
          <div className="pose-prepare-actions">
            {onLiteStart && <button type="button" className="pose-prepare-lite" onClick={onLiteStart}>先用轻量模式开始</button>}
            <button type="button" className="pose-prepare-text" onClick={() => setSlowDismissed(true)}>继续等</button>
          </div>
        </div>
      )}
      {onCancel && <div className="pose-prepare-foot"><button type="button" className="pose-prepare-text" onClick={onCancel}>取消准备</button></div>}
    </div>
  );
}

export type {PreparePhase};
