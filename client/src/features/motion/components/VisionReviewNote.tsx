/** Smart keyframe review is always on for camera training (product decision
 * 2026-11-12 — the local-only choice was removed): prep shows one static
 * informational line instead of a consent control. No choice, no gate. */
export function VisionReviewNote() {
  return (
    <p className="vision-review-note">
      <span className="privacy-dot" aria-hidden="true"/>
      <span>训练时陪练会看关键帧，帮你复核动作 · 本站不保存图片</span>
    </p>
  );
}
