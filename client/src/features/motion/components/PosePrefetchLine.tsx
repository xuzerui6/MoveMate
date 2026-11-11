import type {PrepareSnapshot} from '../lib/posePrepare';

/** Design D quiet line: visible only while a background prepare download is
 * actually running; disappears when the set is cached. Never blocks anything. */
export function PosePrefetchLine({snapshot}: {snapshot: PrepareSnapshot}) {
  if (snapshot.phase !== 'checking' && snapshot.phase !== 'downloading') return null;
  const percent = snapshot.totalBytes > 0 ? Math.round(snapshot.fraction * 100) : null;
  return (
    <p className="pose-prefetch-line" role="status">
      <span>正在准备识别模型{percent !== null ? ` · ${percent}%` : ''}</span>
      <span className="pose-prefetch-bar" aria-hidden="true"><span style={{width: `${percent ?? 0}%`}}/></span>
    </p>
  );
}
