import {useId, useState} from 'react';

/** Design B privacy row: one compact line showing the current 视觉范围 with a
 * 更换 › affordance; expanding shows the two choices. The choice itself never
 * gates the start button. */
export function PrivacyConsentRow({
  allowed,
  onChange,
  disabled = false,
}: {
  allowed: boolean;
  onChange: (allowed: boolean) => void;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const name = useId();
  if (!expanded) {
    return (
      <div className="privacy-consent">
        <button type="button" className="privacy-consent-row" disabled={disabled} aria-expanded={false} onClick={() => setExpanded(true)}>
          <span className={allowed ? 'privacy-dot privacy-dot-on' : 'privacy-dot'} aria-hidden="true"/>
          <span className="privacy-consent-text">{allowed ? '允许智能复核 · 陪练会看关键帧' : '仅本地分析 · 视频不上传'}</span>
          <span className="privacy-consent-change">更换 ›</span>
        </button>
      </div>
    );
  }
  return (
    <div className="privacy-consent">
      <div className="privacy-consent-options" role="radiogroup" aria-label="视觉范围">
        <label>
          <input type="radio" name={name} checked={!allowed} disabled={disabled} onChange={() => onChange(false)}/>
          <span><b>仅本地分析</b><small>视频不会上传，摄像头分析只保留在这台设备上。</small></span>
        </label>
        <label>
          <input type="radio" name={name} checked={allowed} disabled={disabled} onChange={() => onChange(true)}/>
          <span><b>允许智能复核</b><small>陪练不确定时会截取关键画面复核；本站不保存图片。</small></span>
        </label>
        <button type="button" className="privacy-consent-collapse" onClick={() => setExpanded(false)}>收起</button>
      </div>
    </div>
  );
}
