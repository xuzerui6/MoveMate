export function usesMainThreadLite(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

export function decodedFrameCount(standard?: number, webkit?: number): number | null {
  // Some camera streams expose the standard counter but never increment it.
  if (typeof standard === 'number' && standard > 0) return standard;
  if (typeof webkit === 'number' && webkit > 0) return webkit;
  return null;
}
