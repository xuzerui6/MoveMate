export function CachedDataNotice({data, reload, busy = false, label = "数据"}: {data: any; reload?: () => void; busy?: boolean; label?: string}) {
  if (!data?.__offline) return null;
  return <div className="gym-cache-notice" role="status">
    <p>{label}是之前存下来的，只能看，可能不是最新；联网对好之后再做正式操作。</p>
    {reload && <button className="secondary" disabled={busy} onClick={reload}>重新加载</button>}
  </div>;
}
