import {useEffect, useState} from 'react';

/** Heavy static assets — pose model files, the vision WASM set, exercise-library
 * imagery — are served CDN-first from the NODEPEND host, which origin-pulls the
 * app origin at identical paths (e.g. /pose/pose_landmarker_full.task exists on
 * both hosts). Every consumer falls back to the app origin on ANY CDN failure
 * (network error, non-200, integrity mismatch), so a CDN outage or an exhausted
 * CDN quota degrades to the previous behaviour — slower, never broken. Entry
 * HTML/JS/CSS, API calls and realtime traffic are deliberately NOT routed. */
export const CDN_ASSET_BASE = 'https://pose.xzrcloud.xyz';

/** Only origin-relative paths (single leading slash) take part in CDN routing;
 * absolute URLs, protocol-relative URLs and data: URIs pass through untouched. */
export function isCdnRoutable(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//');
}

/** CDN-first URL for an origin-relative asset path; anything else passes through. */
export function cdnAssetUrl(path: string): string {
  return isCdnRoutable(path) ? CDN_ASSET_BASE + path : path;
}

export const CDN_WASM_BASE = `${CDN_ASSET_BASE}/pose/wasm`;

/** Ordered FilesetResolver WASM bases: CDN first, the app origin last. The origin
 * entry keeps the caller's previous form (absolute for the worker transport,
 * relative for main-thread callers). */
export function wasmBaseCandidates(originBase: string): string[] {
  return [CDN_WASM_BASE, originBase];
}

/** React image routing: renders the CDN URL for an origin-relative path and, on
 * the first load error, swaps once to the origin URL. `onError` returns true when
 * it consumed the error as that route fallback — the caller should only treat a
 * false return (the origin copy failed too) as a real image failure. */
export function useCdnFirstImage(path: string | null | undefined): {src: string | undefined; onError: () => boolean} {
  const [fellBack, setFellBack] = useState(false);
  useEffect(() => { setFellBack(false); }, [path]);
  const routable = path != null && isCdnRoutable(path);
  const src = path == null ? undefined : fellBack || !routable ? path : cdnAssetUrl(path);
  const onError = () => {
    if (!fellBack && routable) { setFellBack(true); return true; }
    return false;
  };
  return {src, onError};
}
