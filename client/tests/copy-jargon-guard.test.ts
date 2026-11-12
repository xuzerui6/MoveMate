import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (rel: string) =>
  fs.readFileSync(new URL(rel, import.meta.url), "utf8");

// Copy audit 2026-11-12 (owner: 「我们的产品减少专业术语，因为用户听不懂，我们要面向大众」).
// User-facing copy must use everyday words. These engineering phrases were
// rewritten into plain companion-tone Chinese; guard the swept sources so
// they do not quietly come back. Phrase-level checks only: single everyday
// words (缓存/结算 in status chips, 版本 in revision labels) stay allowed.
const FILES = [
  "../src/features/gym/FullTransfer.tsx",
  "../src/features/gym/GymTools.tsx",
  "../src/features/gym/PlanWorkout.tsx",
  "../src/features/gym/workoutSync.ts",
  "../src/features/gym/workoutRecoveryStorage.ts",
  "../src/features/gym/editingState.ts",
  "../src/features/gym/PlanEditor.tsx",
  "../src/features/gym/Schedule.tsx",
  "../src/features/gym/PlanDraft.tsx",
  "../src/features/gym/PlanComparison.tsx",
  "../src/features/gym/draftStorage.ts",
  "../src/features/gym/FreeWorkout.tsx",
  "../src/features/gym/InstallApp.tsx",
  "../src/features/gym/CachedDataNotice.tsx",
  "../src/features/gym/api.ts",
  "../src/features/gym/AnalysisExtras.tsx",
  "../src/features/gym/Library.tsx",
  "../src/features/gym/GroupPlan.tsx",
  "../src/features/gym/CameraCapability.tsx",
  "../src/features/gym/mediaLoader.ts",
  "../src/features/gym/exerciseGuidance.ts",
  "../src/features/gym/ExerciseMedia.tsx",
  "../src/features/motion/Training.tsx",
  "../src/features/motion/SportTimer.tsx",
  "../src/features/motion/pages/Summary.tsx",
  "../src/features/motion/hooks/useXiaozhiCoach.ts",
  "../src/features/motion/hooks/useCoachVoice.ts",
  "../src/features/motion/lib/exercises.ts",
  "../src/api/client.ts",
] as const;

const JARGON = [
  "服务端断点",
  "语音白名单",
  "逐批",
  "不补发",
  "补发 XP",
  "账号凭据",
  "HTTP 陪练",
  "未上传快照",
  "共用现有语音设备池",
  "当前只能读取缓存",
  "本地草稿存储不可用",
  "全部批次已由服务端确认",
  "数据许可",
  "未知动作",
  "服务器版本已变化",
  "核对服务器版本",
  "等待活动结算",
  "握手超时",
  "桥接异常",
  "挂代理",
  "正式计时",
  "Opus 初始化",
  "本地文字反馈",
  "动态示范未缓存",
] as const;

test("user-facing copy keeps engineering jargon out (2026-11-12 copy audit)", () => {
  for (const rel of FILES) {
    const source = read(rel);
    for (const phrase of JARGON) {
      assert.ok(
        !source.includes(phrase),
        `${rel} must not contain jargon phrase 「${phrase}」 — rewrite it in plain words`,
      );
    }
  }
});

test("analysis page does not expose the IANA timezone name to users", () => {
  const analysis = read("../src/features/gym/AnalysisExtras.tsx");
  assert.ok(
    !analysis.includes("Asia/Shanghai"),
    "AnalysisExtras must not print the raw timezone id in user copy",
  );
});
