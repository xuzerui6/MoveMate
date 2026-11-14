/* Thunder 设备门测试页专用入口：把正式 App 的 AdaptiveRecognition（未改动）
 * 打包成一个独立脚本，供测试页的计数完整性检查调用——与正式 App 完全相同的
 * 锤式弯举计数器（createRecognitionTracker → ExtendedExerciseTracker 路径）。
 * 构建：esbuild 本文件 --bundle --format=iife --platform=browser
 *       --target=safari15 → client/public/pose/step5-tracker.js
 * 见 docs/thunder-gate-testpage-2026-11-09.md。 */
import { AdaptiveRecognition } from '../src/features/motion/lib/adaptiveRecognition';

interface TrackerHandle {
  update(frame: unknown): unknown;
  readonly reps: number;
  readonly ready: boolean;
}

(globalThis as unknown as { MoveMateTracker: unknown }).MoveMateTracker = {
  create(runId: number): TrackerHandle {
    const engine = new AdaptiveRecognition('hammer_curl', 20, {}, runId);
    return {
      update: (frame: unknown) => engine.update(frame as never, true),
      get reps() { return engine.metrics.reps; },
      get ready() { return engine.ready; },
    };
  },
};
