import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (rel: string) =>
  fs.readFileSync(new URL(rel, import.meta.url), "utf8");

test("camera training has no local-only consent choice; smart review is always on", () => {
  // Product decision 2026-11-12: the local-only option was removed — smart
  // keyframe review is always on and prep carries one static info line.
  // Guard the sources (same pattern as the F7 reviewReason guard) so a
  // regression fails here instead of quietly re-shipping a consent gate.
  const workout = read("../src/features/motion/pages/Workout.tsx");
  const plan = read("../src/features/gym/PlanWorkout.tsx");
  const coach = read("../src/features/motion/hooks/useXiaozhiCoach.ts");
  for (const [name, source] of [
    ["Workout.tsx", workout],
    ["PlanWorkout.tsx", plan],
    ["useXiaozhiCoach.ts", coach],
  ] as const) {
    assert.ok(
      !source.includes("PrivacyConsentRow"),
      `${name} must not render the removed consent row`,
    );
    assert.ok(
      !source.includes("visionConsent"),
      `${name} must not plumb a vision consent flag`,
    );
    assert.ok(
      !source.includes("仅本地分析"),
      `${name} must not promise a local-only mode`,
    );
  }
  assert.ok(
    workout.includes("VisionReviewNote"),
    "standalone prep must show the static vision-review note",
  );
  assert.ok(
    plan.includes("VisionReviewNote"),
    "plan prep must show the static vision-review note",
  );
  const note = read(
    "../src/features/motion/components/VisionReviewNote.tsx",
  );
  assert.ok(
    note.includes("训练时陪练会看关键帧，帮你复核动作 · 本站不保存图片"),
    "the note must state both facts: keyframes are reviewed, images are not stored",
  );
  assert.ok(
    !fs.existsSync(
      new URL("../src/features/motion/lib/visionConsent.ts", import.meta.url),
    ),
    "the device-local vision consent preference must stay deleted",
  );
});
