const visionConsentKey = 'movemate:vision-consent';

/** The 视觉范围 choice is a device-local preference: 仅本地分析 unless the user
 * previously chose 允许智能复核 on this device. */
export function loadVisionConsent(): boolean {
  try { return globalThis.localStorage?.getItem(visionConsentKey) === 'review'; } catch { return false; }
}
export function saveVisionConsent(allowed: boolean) {
  try { globalThis.localStorage?.setItem(visionConsentKey, allowed ? 'review' : 'local'); } catch { /* best-effort device preference */ }
}
