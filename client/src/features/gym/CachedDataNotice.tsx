export function CachedDataNotice({data, reload, busy = false, label = "数据"}: {data: any; reload?: () => void; busy?: boolean; label?: string}) {
  if (!data?.__offline) return null;
  return <div className="gym-cache-notice" role="status">
    <p>{label}来自本机缓存 · 只读浏览，可能不是最新状态；联网核对后再进行正式操作。</p>
    {reload && <button className="secondary" disabled={busy} onClick={reload}>重新联网读取</button>}
  </div>;
}
